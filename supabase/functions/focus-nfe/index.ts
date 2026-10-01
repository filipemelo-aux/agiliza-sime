import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
const normRntrc = (v: unknown) => { const d = String(v ?? '').replace(/\D/g, ''); if (!d) return 'ISENTO'; return d.slice(-8).padStart(8, '0'); };
import { createClient } from "npm:@supabase/supabase-js@2";

// Focus NFe connector (homologação by default). Admin/moderator only.
const BASES = {
  homologacao: "https://homologacao.focusnfe.com.br",
  producao: "https://api.focusnfe.com.br",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "Não autenticado" }, 401);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: claims, error: authErr } = await supabase.auth.getClaims(auth.replace("Bearer ", ""));
  if (authErr || !claims?.claims?.sub) return json({ error: "Não autenticado" }, 401);
  const uid = claims.claims.sub;
  const [{ data: isAdmin }, { data: isMod }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: uid, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: uid, _role: "moderator" }),
  ]);
  if (!isAdmin && !isMod) return json({ error: "Sem permissão" }, 403);

  let body: { action?: string; cnpj?: string; versao?: number; ref?: string; cte?: Record<string, unknown>; cte_id?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = body.action ?? "ping";
  const cnpj = (body.cnpj ?? "").replace(/\D/g, "");
  if (cnpj && cnpj.length !== 14) return json({ error: "CNPJ inválido" }, 400);

  // Consultas de documentos recebidos usam produção (somente leitura). Emissão segue em homologação.
  const isQuery = action === "ping" || action === "nfes_recebidas" || action === "ctes_recebidas" || action === "nfe_por_chave" || action === "cte_por_chave";
  const ambiente = isQuery && Deno.env.get("FOCUS_NFE_TOKEN_PRODUCAO") ? "producao" : "homologacao";
  const token = Deno.env.get(ambiente === "producao" ? "FOCUS_NFE_TOKEN_PRODUCAO" : "FOCUS_NFE_TOKEN_HOMOLOGACAO");
  if (!token) return json({ error: "Token Focus NFe não configurado" }, 500);
  const base = BASES[ambiente];

  let path: string;
  let method = "GET";
  let payload: string | undefined;
  const ref = (body.ref ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  if (action === "emitir_cte_salvo") {
    const cteId = String(body.cte_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(cteId)) return json({ error: "CT-e inválido" }, 400);

    const [{ data: cte, error: cteError }, { data: settings }] = await Promise.all([
      supabase.from("ctes").select("*").eq("id", cteId).single(),
      supabase.from("fiscal_settings").select("*").limit(1).maybeSingle(),
    ]);
    if (cteError || !cte) return json({ error: "CT-e não encontrado" }, 404);
    if (cte.tipo_talao === "servico" || !["rascunho", "rejeitado", "processando"].includes(cte.status)) {
      return json({ error: `CT-e não elegível para emissão (status: ${cte.status})` }, 409);
    }

    // CT-e parado em "processando": consulta a situação real antes de qualquer reenvio.
    if (cte.status === "processando") {
      const syncRes = await fetch(`${BASES.homologacao}/v2/cte/cte-${cteId}?completa=1`, {
        headers: { Authorization: "Basic " + btoa(token + ":") },
      });
      let sync: any = null;
      try { sync = await syncRes.json(); } catch { /* ignore */ }
      const st = sync?.status;
      if (st === "autorizado") {
        await supabase.from("ctes").update({
          status: "autorizado", chave_acesso: sync?.chave_cte || sync?.chave_acesso || cte.chave_acesso,
          protocolo_autorizacao: sync?.protocolo || cte.protocolo_autorizacao,
          data_autorizacao: new Date().toISOString(), motivo_rejeicao: null,
        }).eq("id", cteId);
        return json({ success: true, status: "autorizado", chave_acesso: sync?.chave_cte || sync?.chave_acesso, protocolo: sync?.protocolo });
      }
      if (["processando_autorizacao", "processando"].includes(st)) {
        return json({ success: true, status: st, motivo_rejeicao: "A SEFAZ ainda está processando este CT-e. Tente novamente em alguns instantes." });
      }
      if (st === "erro_autorizacao" || st === "cancelado" || st === "denegado") {
        const msg = sync?.mensagem_sefaz || sync?.mensagem || st;
        const code = sync?.status_sefaz ? `Rejeição ${sync.status_sefaz}: ` : "";
        await supabase.from("ctes").update({ status: "rejeitado", motivo_rejeicao: `${code}${msg}` }).eq("id", cteId);
        return json({ success: false, status: "erro_autorizacao", motivo_rejeicao: `${code}${msg}. Corrija os dados, salve e transmita novamente.` });
      }
      // Não encontrado no serviço: segue para novo envio.
    }
    const { data: est, error: estError } = await supabase.from("fiscal_establishments").select("*").eq("id", cte.establishment_id).single();
    if (estError || !est) return json({ error: "Emitente fiscal não encontrado" }, 422);

    let numero = cte.numero;
    if (!numero) {
      const { data: next, error: nextError } = await supabase.rpc("next_cte_number", { _establishment_id: cte.establishment_id });
      if (nextError || !next) return json({ error: `Não foi possível reservar o número do CT-e: ${nextError?.message ?? "sem numeração"}` }, 422);
      numero = next;
    }

    const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
    const money = (value: unknown) => Number(value ?? 0).toFixed(2);
    const decimal = (value: unknown, places = 4) => Number(value ?? 0).toFixed(places);
    const splitAddress = (value: unknown) => {
      const parts = String(value ?? "").split(",").map((part) => part.trim()).filter(Boolean);
      return { logradouro: parts[0] || "NAO INFORMADO", numero: parts[1] || "S/N", bairro: parts.slice(2).join(", ") || "NAO INFORMADO" };
    };
    const actor = (prefix: string, cityName: string | null) => {
      const doc = digits(cte[`${prefix}_cnpj`]);
      const address = splitAddress(cte[`${prefix}_endereco`]);
      const result: Record<string, unknown> = {
        [`nome_${prefix}`]: cte[`${prefix}_nome`],
        [`logradouro_${prefix}`]: address.logradouro,
        [`numero_${prefix}`]: address.numero,
        [`bairro_${prefix}`]: address.bairro,
        [`codigo_municipio_${prefix}`]: digits(cte[`${prefix}_municipio_ibge`]),
        [`municipio_${prefix}`]: cityName || "NAO INFORMADO",
        [`uf_${prefix}`]: cte[`${prefix}_uf`],
      };
      if (doc.length === 14) result[`cnpj_${prefix}`] = doc;
      if (doc.length === 11) result[`cpf_${prefix}`] = doc;
      if (cte[`${prefix}_ie`]) result[`inscricao_estadual_${prefix}`] = cte[`${prefix}_ie`];
      return result;
    };
    const routeOrigin = cte.municipio_origem_nome || "NAO INFORMADO";
    const routeDestination = cte.municipio_destino_nome || "NAO INFORMADO";
    const emissionCity = cte.municipio_envio_nome || est.endereco_municipio || routeOrigin;
    const estAddress = {
      logradouro: est.endereco_logradouro || "NAO INFORMADO",
      numero: est.endereco_numero || "S/N",
      bairro: est.endereco_bairro || "NAO INFORMADO",
    };
    const components = Array.isArray(cte.componentes_frete)
      ? cte.componentes_frete.map((item: any) => ({ nome: String(item.xNome || item.nome || "FRETE").slice(0, 15), valor: money(item.vComp ?? item.valor) }))
      : [];
    const quantities = Array.isArray(cte.info_quantidade)
      ? cte.info_quantidade.map((item: any) => ({ codigo_unidade_medida: String(item.cUnid || "01"), tipo_medida: String(item.tpMed || "PESO BRUTO"), quantidade: decimal(item.qCarga) }))
      : [{ codigo_unidade_medida: "01", tipo_medida: "PESO BRUTO", quantidade: decimal(cte.peso_bruto) }];
    const ctePayload: Record<string, unknown> = {
      cfop: String(cte.cfop), natureza_operacao: cte.natureza_operacao, numero, serie: cte.serie || est.serie_cte || 1,
      data_emissao: new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T") + "-03:00",
      tipo_documento: Number(cte.tp_cte || 0), modal: "01", tipo_servico: Number(cte.tp_serv || 0),
      codigo_municipio_envio: digits(cte.municipio_envio_ibge || est.codigo_municipio_ibge), municipio_envio: emissionCity, uf_envio: cte.uf_envio || est.endereco_uf,
      codigo_municipio_inicio: digits(cte.municipio_origem_ibge), municipio_inicio: routeOrigin, uf_inicio: cte.uf_origem,
      codigo_municipio_fim: digits(cte.municipio_destino_ibge), municipio_fim: routeDestination, uf_fim: cte.uf_destino,
      retirar_mercadoria: Number(cte.retira ?? 1), indicador_inscricao_estadual_tomador: Number(cte.ind_ie_toma || 9), tomador: Number(cte.tomador_tipo || 0),
      cnpj_emitente: digits(est.cnpj), inscricao_estadual_emitente: est.inscricao_estadual, nome_emitente: est.razao_social,
      nome_fantasia_emitente: est.nome_fantasia || est.razao_social, logradouro_emitente: estAddress.logradouro,
      numero_emitente: estAddress.numero, bairro_emitente: estAddress.bairro, codigo_municipio_emitente: digits(est.codigo_municipio_ibge),
      municipio_emitente: est.endereco_municipio || emissionCity, uf_emitente: est.endereco_uf, cep_emitente: digits(est.endereco_cep),
      ...actor("remetente", cte.expedidor_nome ? routeOrigin : routeOrigin),
      ...actor("destinatario", cte.recebedor_nome ? routeDestination : routeDestination),
      valor_total: money(cte.valor_frete), valor_receber: money(cte.valor_receber ?? cte.valor_frete),
      componentes_valor: components, icms_situacao_tributaria: cte.cst_icms, icms_base_calculo: money(cte.base_calculo_icms),
      icms_aliquota: money(cte.aliquota_icms), icms_valor: money(cte.valor_icms), valor_total_carga: money(cte.valor_carga),
      valor_carga_averbacao: money(cte.valor_carga_averb || cte.valor_carga), produto_predominante: cte.produto_predominante,
      quantidades: quantities, nfes: (cte.chaves_nfe_ref || []).map((chave: string) => ({ chave_nfe: digits(chave) })),
      modal_rodoviario: { rntrc: normRntrc(cte.rntrc || est.rntrc) }, observacao: cte.observacoes || undefined,
      ibs_cbs_situacao_tributaria: cte.ibs_cbs_cst || "000", ibs_cbs_classificacao_tributaria: cte.ibs_cbs_class_trib || "000001",
      ibs_cbs_base_calculo: money(cte.ibs_cbs_base_calculo || cte.valor_frete), ibs_uf_aliquota: money(cte.ibs_uf_aliquota),
      ibs_uf_valor: money(cte.ibs_uf_valor), ibs_mun_aliquota: money(cte.ibs_mun_aliquota), ibs_mun_valor: money(cte.ibs_mun_valor),
      ibs_valor_total: money(Number(cte.ibs_uf_valor || 0) + Number(cte.ibs_mun_valor || 0)), cbs_aliquota: money(cte.cbs_aliquota),
      cbs_valor: money(cte.cbs_valor), valor_total_dfe: money(cte.valor_frete),
    };
    if (cte.expedidor_nome) Object.assign(ctePayload, actor("expedidor", routeOrigin));
    if (cte.recebedor_nome) Object.assign(ctePayload, actor("recebedor", routeDestination));
    if (Number(cte.tomador_tipo) === 4) Object.assign(ctePayload, actor("tomador", cte.tomador_uf === cte.uf_origem ? routeOrigin : routeDestination));
    // Subcontratação/Redespacho: SEFAZ exige o documento de transporte anterior (docAnt/emiDocAnt/idDocAntEle).
    const chaveAnt = digits(cte.chave_cte_subcontratacao);
    if ([1, 2, 3].includes(Number(cte.tp_serv)) && chaveAnt.length === 44) {
      const UF_BY_CODE: Record<string, string> = { "11":"RO","12":"AC","13":"AM","14":"RR","15":"PA","16":"AP","17":"TO","21":"MA","22":"PI","23":"CE","24":"RN","25":"PB","26":"PE","27":"AL","28":"SE","29":"BA","31":"MG","32":"ES","33":"RJ","35":"SP","41":"PR","42":"SC","43":"RS","50":"MS","51":"MT","52":"GO","53":"DF" };
      const cnpjAnt = chaveAnt.slice(6, 20);
      let razao = "";
      let ieAnt = "";
      const { data: localAnt } = await supabase.from("ctes").select("*").eq("chave_acesso", chaveAnt).maybeSingle();
      if (localAnt) {
        const { data: estAnt } = await supabase.from("fiscal_establishments").select("razao_social, inscricao_estadual").eq("id", localAnt.establishment_id).maybeSingle();
        razao = estAnt?.razao_social || ""; ieAnt = estAnt?.inscricao_estadual || "";
      }
      if (!razao) {
        try {
          const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjAnt}`);
          if (r.ok) razao = (await r.json())?.razao_social || "";
        } catch { /* ignore */ }
      }
      // Schema emiDocAnt: CNPJ, (IE, UF) opcionais em par, xNome. UF sem IE é inválido.
      const emissor: Record<string, unknown> = {
        cnpj: cnpjAnt,
        razao_social: String(razao || "NAO INFORMADO").slice(0, 60),
        identificacoes_documentos: [{ documentos_eletronicos: [{ chave_cte: chaveAnt }] }],
      };
      if (digits(ieAnt)) {
        emissor.inscricao_estadual = digits(ieAnt);
        emissor.uf = UF_BY_CODE[chaveAnt.slice(0, 2)] || cte.uf_origem;
      }
      ctePayload.emissores_documento_transporte_anterior = [emissor];
    }
    if (Number(cte.tp_cte) === 3 && chaveAnt.length === 44) ctePayload.chave_cte_original_sub = chaveAnt;

    const emissionRef = `cte-${cteId}`;
    const emitResponse = await fetch(`${BASES.homologacao}/v2/cte?ref=${emissionRef}`, {
      method: "POST", body: JSON.stringify(ctePayload),
      headers: { Authorization: "Basic " + btoa(token + ":"), "Content-Type": "application/json" },
    });
    let focusData: any;
    try { focusData = await emitResponse.json(); } catch { focusData = { mensagem: await emitResponse.text() }; }
    if (!emitResponse.ok) {
      const reason = focusData?.mensagem || focusData?.message || focusData?.erros?.join?.("; ") || JSON.stringify(focusData);
      await supabase.from("ctes").update({ status: "rejeitado", numero, motivo_rejeicao: reason }).eq("id", cteId);
      return json({ success: false, status: "erro_autorizacao", motivo_rejeicao: reason }, 200);
    }

    for (let attempt = 0; attempt < 12 && ["processando_autorizacao", "processando"].includes(focusData?.status); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const check = await fetch(`${BASES.homologacao}/v2/cte/${emissionRef}?completa=1`, {
        headers: { Authorization: "Basic " + btoa(token + ":") },
      });
      focusData = await check.json();
    }
    const authorized = focusData?.status === "autorizado";
    const reason = focusData?.mensagem_sefaz || focusData?.mensagem || focusData?.status || "Aguardando retorno da SEFAZ";
    await supabase.from("ctes").update({
      numero, status: authorized ? "autorizado" : focusData?.status === "erro_autorizacao" ? "rejeitado" : "processando",
      chave_acesso: focusData?.chave_cte || focusData?.chave_acesso || cte.chave_acesso,
      protocolo_autorizacao: focusData?.protocolo || cte.protocolo_autorizacao,
      data_autorizacao: authorized ? new Date().toISOString() : cte.data_autorizacao,
      motivo_rejeicao: authorized ? null : reason,
    }).eq("id", cteId);
    return json({
      success: authorized || ["processando_autorizacao", "processando"].includes(focusData?.status), status: focusData?.status,
      chave_acesso: focusData?.chave_cte || focusData?.chave_acesso, protocolo: focusData?.protocolo,
      motivo_rejeicao: authorized ? undefined : reason, dacte_url: focusData?.caminho_dacte, xml_url: focusData?.caminho_xml,
    });
  }

  switch (action) {
    case "ping":
    case "nfes_recebidas":
      if (!cnpj) return json({ error: "Informe o CNPJ" }, 400);
      path = `/v2/nfes_recebidas?cnpj=${cnpj}${body.versao ? `&versao=${Number(body.versao)}` : ""}`;
      break;
    case "ctes_recebidas":
      if (!cnpj) return json({ error: "Informe o CNPJ" }, 400);
      path = `/v2/ctes_recebidas?cnpj=${cnpj}${body.versao ? `&versao=${Number(body.versao)}` : ""}`;
      break;
    case "cte_por_chave": {
      const chave = String((body as any).chave ?? "").replace(/\D/g, "");
      if (chave.length !== 44) return json({ error: "Chave de CT-e inválida" }, 400);
      path = `/v2/ctes_recebidas/${chave}.xml`;
      break;
    }
    case "nfe_por_chave": {
      const chave = String((body as any).chave ?? "").replace(/\D/g, "");
      if (chave.length !== 44) return json({ error: "Chave de NF-e inválida" }, 400);
      path = `/v2/nfes_recebidas/${chave}.xml`;
      break;
    }
    case "emitir_cte":
      if (!ref || !body.cte) return json({ error: "Informe ref e cte" }, 400);
      path = `/v2/cte?ref=${ref}`; method = "POST"; payload = JSON.stringify(body.cte);
      break;
    case "consultar_cte":
      if (!ref) return json({ error: "Informe ref" }, 400);
      path = `/v2/cte/${ref}?completa=1`;
      break;
    default:
      return json({ error: "Ação inválida" }, 400);
  }

  const res = await fetch(base + path, {
    method, body: payload,
    headers: { Authorization: "Basic " + btoa(token + ":"), "Content-Type": "application/json" },
  });
  const text = await res.text();
  let data: unknown = text;
  try { data = JSON.parse(text); } catch { /* keep text */ }
  return json({
    ok: res.ok,
    status: res.status,
    ambiente,
    total: res.headers.get("X-Total-Count"),
    max_version: res.headers.get("X-Max-Version"),
    data,
  }, 200);
});
