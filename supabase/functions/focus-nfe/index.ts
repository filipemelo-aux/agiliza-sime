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

  // Tokens Focus: os da empresa (tenant_secrets) têm prioridade; sem eles, usa os padrões do servidor.
  let tenantTok: { focus_nfe_token_production?: string | null; focus_nfe_token_homologation?: string | null } | null = null;
  {
    const { data: tid } = await supabase.rpc("current_tenant_id");
    if (tid) {
      const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data } = await svc.from("tenant_secrets").select("focus_nfe_token_production, focus_nfe_token_homologation").eq("tenant_id", tid).maybeSingle();
      tenantTok = data;
    }
  }
  const tok = (prod: boolean) => (prod ? tenantTok?.focus_nfe_token_production || Deno.env.get("FOCUS_NFE_TOKEN_PRODUCAO") : tenantTok?.focus_nfe_token_homologation || Deno.env.get("FOCUS_NFE_TOKEN_HOMOLOGACAO"));

  // Token próprio do estabelecimento (matriz/filial, definido no SuperAdmin) tem prioridade sobre o da empresa.
  const estTok = async (estId: string | null | undefined, prod: boolean) => {
    if (estId) {
      const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data } = await svc.from("establishment_secrets").select("focus_nfe_token_production, focus_nfe_token_homologation").eq("establishment_id", estId).maybeSingle();
      const t = prod ? data?.focus_nfe_token_production : data?.focus_nfe_token_homologation;
      if (t) return t;
    }
    return tok(prod);
  };

  let body: { action?: string; cnpj?: string; versao?: number; ref?: string; cte?: Record<string, unknown>; cte_id?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = body.action ?? "ping";
  const cnpj = (body.cnpj ?? "").replace(/\D/g, "");
  if (cnpj && cnpj.length !== 14) return json({ error: "CNPJ inválido" }, 400);

  // Consultas de documentos recebidos usam produção (somente leitura). Emissão segue em homologação.
  const isQuery = action === "ping" || action === "nfes_recebidas" || action === "ctes_recebidas" || action === "nfe_por_chave" || action === "cte_por_chave" || action === "nfe_pdf_por_chave";
  const ambiente = isQuery && tok(true) ? "producao" : "homologacao";
  const token = tok(ambiente === "producao");
  if (!token && isQuery) return json({ error: "Token Focus NFe não configurado" }, 500);
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
      const { data: estSync } = await supabase.from("fiscal_establishments").select("ambiente").eq("id", cte.establishment_id).maybeSingle();
      const syncAmb = String(estSync?.ambiente) === "producao" ? "producao" : "homologacao";
      const syncToken = (await estTok(cte.establishment_id, syncAmb === "producao")) || token;
      const syncRes = await fetch(`${BASES[syncAmb]}/v2/cte/cte-${cteId}?completa=1`, {
        headers: { Authorization: "Basic " + btoa(syncToken + ":") },
      });
      let sync: any = null;
      try { sync = await syncRes.json(); } catch { /* ignore */ }
      const st = sync?.status;
      if (st === "autorizado") {
        await supabase.from("ctes").update({
          status: "autorizado", chave_acesso: sync?.chave_cte || sync?.chave_acesso || cte.chave_acesso,
          protocolo_autorizacao: sync?.protocolo || cte.protocolo_autorizacao,
          data_autorizacao: new Date().toISOString(), motivo_rejeicao: null,
          data_emissao: new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) + "T12:00:00",
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

    // Ambiente da emissão segue o cadastro do estabelecimento emitente (matriz=produção, filial=homologação).
    const emitAmb: keyof typeof BASES = String(est.ambiente) === "producao" ? "producao" : "homologacao";
    const emitToken = await estTok(cte.establishment_id, emitAmb === "producao");
    if (!emitToken) return json({ error: `Token de ${emitAmb === "producao" ? "produção" : "homologação"} não configurado no backend` }, 500);
    const emitBase = BASES[emitAmb];

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
      ibs_cbs_situacao_tributaria: cte.ibs_cbs_cst || "000", ibs_cbs_classificacao_tributaria: (() => { const cst = String(cte.ibs_cbs_cst || "000"); const ct = String(cte.ibs_cbs_class_trib || ""); return ct.length === 6 && ct.startsWith(cst) ? ct : `${cst}001`; })(),
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
    const emitResponse = await fetch(`${emitBase}/v2/cte?ref=${emissionRef}`, {
      method: "POST", body: JSON.stringify(ctePayload),
      headers: { Authorization: "Basic " + btoa(emitToken + ":"), "Content-Type": "application/json" },
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
      const check = await fetch(`${emitBase}/v2/cte/${emissionRef}?completa=1`, {
        headers: { Authorization: "Basic " + btoa(emitToken + ":") },
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
      ...(authorized ? { data_emissao: new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) + "T12:00:00" } : {}),
      motivo_rejeicao: authorized ? null : reason,
    }).eq("id", cteId);
    return json({
      success: authorized || ["processando_autorizacao", "processando"].includes(focusData?.status), status: focusData?.status,
      chave_acesso: focusData?.chave_cte || focusData?.chave_acesso, protocolo: focusData?.protocolo,
      motivo_rejeicao: authorized ? undefined : reason, dacte_url: focusData?.caminho_dacte, xml_url: focusData?.caminho_xml,
    });
  }

  // ===================== MDF-e (Focus NFe) =====================
  if (["emitir_mdfe_salvo", "consultar_mdfe_salvo", "encerrar_mdfe_salvo", "cancelar_mdfe_salvo", "damdfe_mdfe_salvo", "xml_mdfe_salvo"].includes(action)) {
    const b = body as any;
    const mdfeId = String(b.mdfe_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(mdfeId)) return json({ error: "MDF-e inválido" }, 400);
    const { data: m, error: mErr } = await supabase.from("mdfe").select("*").eq("id", mdfeId).single();
    if (mErr || !m) return json({ error: "MDF-e não encontrado" }, 404);
    if (!m.establishment_id) return json({ error: "MDF-e sem empresa emitente. Edite e selecione o emitente." }, 422);
    const { data: est } = await supabase.from("fiscal_establishments").select("*").eq("id", m.establishment_id).single();
    if (!est) return json({ error: "Emitente fiscal não encontrado" }, 422);
    const amb: keyof typeof BASES = String(est.ambiente) === "producao" ? "producao" : "homologacao";
    const mTok = await estTok(m.establishment_id, amb === "producao");
    if (!mTok) return json({ error: `Token de ${amb === "producao" ? "produção" : "homologação"} não configurado para este emitente` }, 500);
    const mBase = BASES[amb];
    const hdr = { Authorization: "Basic " + btoa(mTok + ":"), "Content-Type": "application/json" };
    const ref = `mdfe-${mdfeId}`;
    const url = `${mBase}/v2/mdfe/${ref}`;
    const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
    const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const sefazMsg = (d: any) => {
      const code = d?.status_sefaz ? `Rejeição ${d.status_sefaz}: ` : "";
      const errs = Array.isArray(d?.erros) ? d.erros.map((x: any) => x?.mensagem || x).join("; ") : "";
      return `${code}${d?.mensagem_sefaz || d?.mensagem || errs || d?.status || "Sem retorno da SEFAZ"}`;
    };
    const applyResult = async (d: any) => {
      const st = d?.status;
      const patch: Record<string, unknown> = {};
      if (st === "autorizado") Object.assign(patch, {
        status: "autorizado", chave_acesso: d?.chave || d?.chave_mdfe || m.chave_acesso, protocolo_autorizacao: d?.protocolo || m.protocolo_autorizacao,
        data_autorizacao: m.data_autorizacao || new Date().toISOString(), motivo_rejeicao: null,
      });
      else if (st === "encerrado") Object.assign(patch, { status: "encerrado", motivo_rejeicao: null, data_encerramento: m.data_encerramento || new Date().toISOString() });
      else if (st === "cancelado") Object.assign(patch, { status: "cancelado" });
      else if (st === "erro_autorizacao" || st === "denegado") Object.assign(patch, { status: "rejeitado", motivo_rejeicao: sefazMsg(d) });
      else if (["processando_autorizacao", "processando"].includes(st)) Object.assign(patch, { status: "processando" });
      if (Object.keys(patch).length) await supabase.from("mdfe").update(patch).eq("id", mdfeId);
      return st;
    };
    const fetchFile = async (path: string) => fetch(path.startsWith("http") ? path : mBase + path, { headers: hdr });

    if (action === "consultar_mdfe_salvo") {
      const r = await fetch(`${url}?completa=1`, { headers: hdr });
      const d: any = await r.json().catch(() => ({}));
      if (r.status === 404) return json({ success: false, status: "nao_enviado", mensagem: "Este MDF-e ainda não foi enviado à SEFAZ." });
      const st = await applyResult(d);
      return json({ success: true, status: st, mensagem: sefazMsg(d), chave: d?.chave, protocolo: d?.protocolo });
    }
    if (action === "damdfe_mdfe_salvo" || action === "xml_mdfe_salvo") {
      const r = await fetch(`${url}?completa=1`, { headers: hdr });
      const d: any = await r.json().catch(() => ({}));
      const path = action === "damdfe_mdfe_salvo" ? d?.caminho_damdfe : d?.caminho_xml_manifesto || d?.caminho_xml;
      if (!path) return json({ error: action === "damdfe_mdfe_salvo" ? "DAMDFE ainda não disponível — o MDF-e precisa estar autorizado." : "XML ainda não disponível." }, 404);
      const f = await fetchFile(path);
      if (!f.ok) return json({ error: `Arquivo indisponível (${f.status})` }, 502);
      if (action === "xml_mdfe_salvo") return json({ success: true, xml: await f.text() });
      const bytes = new Uint8Array(await f.arrayBuffer());
      let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return json({ success: true, pdf_base64: btoa(bin) });
    }
    if (action === "cancelar_mdfe_salvo") {
      const just = String(b.justificativa ?? "").trim();
      if (just.length < 15 || just.length > 255) return json({ error: "A justificativa deve ter entre 15 e 255 caracteres" }, 400);
      if (m.status !== "autorizado") return json({ error: "Só é possível cancelar MDF-e autorizado e não encerrado" }, 409);
      const r = await fetch(url, { method: "DELETE", headers: hdr, body: JSON.stringify({ justificativa: just }) });
      const d: any = await r.json().catch(() => ({}));
      if (d?.status === "cancelado") {
        await supabase.from("mdfe").update({ status: "cancelado", motivo_rejeicao: `Cancelado: ${just}` }).eq("id", mdfeId);
        return json({ success: true, status: "cancelado" });
      }
      return json({ success: false, motivo: sefazMsg(d) });
    }
    if (action === "encerrar_mdfe_salvo") {
      if (m.status !== "autorizado") return json({ error: "Só é possível encerrar MDF-e autorizado" }, 409);
      const uf = String(b.uf || m.uf_descarregamento || "");
      const cod = digits(b.codigo_municipio || m.municipio_descarregamento_ibge);
      if (!uf || cod.length !== 7) return json({ error: "Informe o município de encerramento (código IBGE) do descarregamento" }, 400);
      const r = await fetch(`${url}/encerrar`, { method: "POST", headers: hdr, body: JSON.stringify({ data: String(b.data || today()), sigla_uf: uf, codigo_municipio: cod, nome_municipio: b.nome_municipio || m.municipio_descarregamento_nome }) });
      const d: any = await r.json().catch(() => ({}));
      if (d?.status === "encerrado" || (r.ok && !d?.status_sefaz)) {
        await supabase.from("mdfe").update({ status: "encerrado", data_encerramento: new Date().toISOString(), protocolo_encerramento: d?.protocolo || null, motivo_rejeicao: null }).eq("id", mdfeId);
        return json({ success: true, status: "encerrado", protocolo: d?.protocolo });
      }
      return json({ success: false, motivo: sefazMsg(d) });
    }

    // ---------- Emissão ----------
    if (!["rascunho", "rejeitado", "processando"].includes(m.status)) return json({ error: `MDF-e não elegível para emissão (situação: ${m.status})` }, 409);
    if (m.status === "processando") {
      const r = await fetch(`${url}?completa=1`, { headers: hdr });
      if (r.status !== 404) {
        const d: any = await r.json().catch(() => ({}));
        const st = await applyResult(d);
        if (st === "autorizado") return json({ success: true, status: st, chave_acesso: d?.chave, protocolo: d?.protocolo });
        if (["processando_autorizacao", "processando"].includes(st)) return json({ success: true, status: st, motivo_rejeicao: "A SEFAZ ainda está processando este MDF-e. Tente novamente em instantes." });
        if (st === "erro_autorizacao") return json({ success: false, status: st, motivo_rejeicao: `${sefazMsg(d)}. Corrija, salve e transmita novamente.` });
      } else await r.text();
    }

    // Validações antes do envio
    const chaves = [...new Set((m.lista_ctes || []).map(digits).filter((c: string) => c.length === 44))];
    const pend: string[] = [];
    if (!chaves.length) pend.push("ao menos um CT-e autorizado (com chave de acesso)");
    if (!digits(m.municipio_carregamento_ibge)) pend.push("município de carregamento");
    if (!digits(m.municipio_descarregamento_ibge)) pend.push("município de descarregamento");
    if (!m.placa_veiculo) pend.push("placa do veículo");
    if (!m.motorista_nome) pend.push("motorista");
    if (!Number(m.peso_total)) pend.push("peso total");
    if (pend.length) return json({ success: false, status: "validacao", motivo_rejeicao: `Faltando: ${pend.join(", ")}.` });

    // Motorista: CPF do manifesto ou do cadastro
    let cpf = digits(m.motorista_cpf);
    if (cpf.length !== 11 && m.motorista_id) {
      const { data: p } = await supabase.from("profiles").select("cnpj").eq("id", m.motorista_id).maybeSingle();
      cpf = digits((p as any)?.cnpj);
    }
    if (cpf.length !== 11) return json({ success: false, status: "validacao", motivo_rejeicao: "CPF do motorista não encontrado. Informe-o no cadastro do motorista." });
    const condutores: { nome: string; cpf: string }[] = [{ nome: String(m.motorista_nome).slice(0, 60), cpf }];
    const extras = Array.isArray(m.condutores_extras) ? m.condutores_extras : [];
    if (extras.length) {
      const { data: ps } = await supabase.from("profiles").select("id,full_name,cnpj").in("id", extras.map((c: any) => c.id).filter(Boolean));
      for (const p of (ps || []) as any[]) { const c = digits(p.cnpj); if (c.length === 11 && c !== cpf) condutores.push({ nome: String(p.full_name).slice(0, 60), cpf: c }); }
    }

    // Veículo: tipo de rodado/carroceria a partir do cadastro
    const plate = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    let vType = "";
    { const { data: v } = await supabase.from("vehicles").select("vehicle_type").eq("plate", plate(m.placa_veiculo)).maybeSingle(); vType = String(v?.vehicle_type || ""); }
    const reboques = [m.reboque1_placa, m.reboque2_placa].map(plate).filter(Boolean);
    const isCavalo = reboques.length > 0 || ["carreta", "carreta_ls", "rodotrem", "bitrem", "treminhao"].includes(vType);
    const tipoRodado = isCavalo ? "03" : vType === "utilitario" ? "05" : vType === "truck" || vType === "bitruck" ? "01" : "06";
    const ufLic = est.endereco_uf;

    let numero = m.numero;
    if (!numero) {
      const { data: next, error: nErr } = await supabase.rpc("next_mdfe_number", { _establishment_id: m.establishment_id });
      if (nErr || !next) return json({ error: `Não foi possível reservar o número do MDF-e: ${nErr?.message ?? "sem numeração"}` }, 422);
      numero = next;
      await supabase.from("mdfe").update({ numero }).eq("id", mdfeId);
    }
    const ufsPercurso = (m.ufs_percurso || []).filter((u: string) => u && u !== m.uf_carregamento && u !== m.uf_descarregamento);
    const payload: Record<string, unknown> = {
      emitente: 1, serie: m.serie || est.serie_mdfe || 1, numero,
      data_emissao: new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T") + "-03:00",
      uf_inicio: m.uf_carregamento, uf_fim: m.uf_descarregamento,
      cnpj_emitente: digits(est.cnpj), inscricao_estadual_emitente: digits(est.inscricao_estadual), nome_emitente: est.razao_social,
      nome_fantasia_emitente: est.nome_fantasia || est.razao_social, logradouro_emitente: est.endereco_logradouro || "NAO INFORMADO",
      numero_emitente: est.endereco_numero || "S/N", bairro_emitente: est.endereco_bairro || "NAO INFORMADO",
      codigo_municipio_emitente: digits(est.codigo_municipio_ibge), municipio_emitente: est.endereco_municipio, uf_emitente: est.endereco_uf, cep_emitente: digits(est.endereco_cep),
      municipios_carregamento: [{ codigo: digits(m.municipio_carregamento_ibge), nome: m.municipio_carregamento_nome }],
      ...(ufsPercurso.length ? { percursos: ufsPercurso.map((u: string) => ({ uf_percurso: u })) } : {}),
      municipios_descarregamento: [{ codigo: digits(m.municipio_descarregamento_ibge), nome: m.municipio_descarregamento_nome, conhecimentos_transporte: chaves.map((c) => ({ chave_cte: c })) }],
      quantidade_total_cte: chaves.length, valor_total_carga: Number(m.valor_total || 0).toFixed(2),
      codigo_unidade_medida_peso_bruto: "01", peso_bruto: Number(m.peso_total || 0).toFixed(4),
      modal_rodoviario: {
        registro_nacional_transporte: normRntrc(m.rntrc || est.rntrc),
        ...(digits(m.contratado_documento).length >= 11 && digits(m.contratado_documento) !== digits(est.cnpj) ? { contratantes: [digits(m.contratado_documento).length === 14 ? { cnpj: digits(m.contratado_documento) } : { cpf: digits(m.contratado_documento) }] } : {}),
        ...(m.ciot_numero ? { ciot: [{ ciot: digits(m.ciot_numero), ...(digits(m.ciot_documento).length === 14 ? { cnpj_responsavel: digits(m.ciot_documento) } : digits(m.ciot_documento).length === 11 ? { cpf_responsavel: digits(m.ciot_documento) } : {}) }] } : {}),
        placa_veiculo: plate(m.placa_veiculo), tara_veiculo: isCavalo ? 9000 : 7000, tipo_rodado_veiculo: tipoRodado, tipo_carroceria_veiculo: isCavalo ? "00" : "02", uf_licenciamento_veiculo: ufLic, condutores,
        ...(reboques.length ? { veiculos_reboque: reboques.map((p) => ({ placa: p, tara: 7000, capacidade_kg: 35000, tipo_carroceria: "02", uf_licenciamento: ufLic })) } : {}),
      },
      ...(m.produto_predominante ? { tipo_carga: String(m.tipo_carga || "05").padStart(2, "0").slice(0, 2), descricao_produto: String(m.produto_predominante).slice(0, 120), ...(digits(m.ncm).length === 8 ? { codigo_ncm_produto: digits(m.ncm) } : {}) } : {}),
      ...(m.seguradora_nome && m.apolice_numero ? { seguros_carga: [{ responsavel_seguro: 1, nome_seguradora: m.seguradora_nome, ...(digits(m.seguradora_cnpj).length === 14 ? { cnpj_seguradora: digits(m.seguradora_cnpj) } : {}), numero_apolice: m.apolice_numero, ...(m.averbacao_numero ? { numero_averbacao: m.averbacao_numero } : {}) }] } : {}),
      ...(m.observacoes ? { informacao_complementar: String(m.observacoes).slice(0, 2000) } : {}),
    };

    const r = await fetch(`${mBase}/v2/mdfe?ref=${ref}`, { method: "POST", headers: hdr, body: JSON.stringify(payload) });
    let d: any; try { d = await r.json(); } catch { d = {}; }
    if (!r.ok && d?.codigo !== "already_processed") {
      const why = sefazMsg(d);
      await supabase.from("mdfe").update({ status: "rejeitado", motivo_rejeicao: why }).eq("id", mdfeId);
      return json({ success: false, status: "erro_autorizacao", motivo_rejeicao: why });
    }
    await supabase.from("mdfe").update({ status: "processando", data_emissao: new Date().toISOString() }).eq("id", mdfeId);
    // MDF-e é assíncrono na Focus: consulta até obter retorno.
    for (let i = 0; i < 15; i++) {
      await new Promise((res) => setTimeout(res, 1500));
      const c = await fetch(`${url}?completa=1`, { headers: hdr });
      d = await c.json().catch(() => d);
      if (!["processando_autorizacao", "processando"].includes(d?.status)) break;
    }
    const st = await applyResult(d);
    await supabase.from("fiscal_logs").insert({ user_id: uid, entity_type: "mdfe", entity_id: mdfeId, action: st === "autorizado" ? "autorizado" : st === "erro_autorizacao" ? "rejeitado" : "processando", establishment_id: m.establishment_id, cnpj_emissor: digits(est.cnpj), details: { numero, ambiente: amb, chave: d?.chave, protocolo: d?.protocolo, mensagem: sefazMsg(d) } } as any).then(() => {}, () => {});
    return json({
      success: st === "autorizado" || ["processando_autorizacao", "processando"].includes(st), status: st, numero,
      chave_acesso: d?.chave, protocolo: d?.protocolo, ambiente: amb,
      motivo_rejeicao: st === "autorizado" ? undefined : ["processando_autorizacao", "processando"].includes(st) ? "A SEFAZ ainda está processando. Use \"Consultar\" em instantes." : sefazMsg(d),
    });
  }

  // Operações SEFAZ sobre um CT-e já emitido pelo sistema (mesmo ambiente da emissão).
  if (["cancelar_cte_salvo", "cce_cte_salvo", "consultar_cte_salvo", "xml_cte_salvo"].includes(action)) {
    const cteId = String(body.cte_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(cteId)) return json({ error: "CT-e inválido" }, 400);
    const { data: cte } = await supabase.from("ctes").select("id,status,establishment_id").eq("id", cteId).maybeSingle();
    if (!cte) return json({ error: "CT-e não encontrado" }, 404);
    const { data: estOp } = await supabase.from("fiscal_establishments").select("ambiente").eq("id", cte.establishment_id).maybeSingle();
    const opAmb: keyof typeof BASES = String(estOp?.ambiente) === "producao" ? "producao" : "homologacao";
    const opToken = (await estTok(cte.establishment_id, opAmb === "producao")) || token;
    const opBase = BASES[opAmb];
    const hdr = { Authorization: "Basic " + btoa(opToken + ":"), "Content-Type": "application/json" };
    const url = `${opBase}/v2/cte/cte-${cteId}`;
    const b = body as any;
    if (action === "cancelar_cte_salvo") {
      const just = String(b.justificativa ?? "").trim();
      if (just.length < 15 || just.length > 255) return json({ error: "A justificativa deve ter entre 15 e 255 caracteres" }, 400);
      if (cte.status !== "autorizado") return json({ error: "Só é possível cancelar CT-e autorizado" }, 409);
      const r = await fetch(url, { method: "DELETE", headers: hdr, body: JSON.stringify({ justificativa: just }) });
      const d: any = await r.json().catch(() => ({}));
      if (d?.status === "cancelado") {
        await supabase.from("ctes").update({ status: "cancelado", motivo_rejeicao: `Cancelado: ${just}` }).eq("id", cteId);
        return json({ success: true, status: "cancelado", protocolo: d?.protocolo_cancelamento });
      }
      return json({ success: false, motivo: d?.mensagem_sefaz || d?.mensagem || "Cancelamento não aceito pela SEFAZ" });
    }
    if (action === "cce_cte_salvo") {
      if (cte.status !== "autorizado") return json({ error: "Carta de correção exige CT-e autorizado" }, 409);
      const payloadCce = { campo_corrigido: b.campo_corrigido, valor_corrigido: b.valor_corrigido, grupo_corrigido: b.grupo_corrigido };
      if (!payloadCce.campo_corrigido || !payloadCce.valor_corrigido || !payloadCce.grupo_corrigido) return json({ error: "Informe grupo, campo e novo valor" }, 400);
      const r = await fetch(`${url}/carta_correcao`, { method: "POST", headers: hdr, body: JSON.stringify(payloadCce) });
      const d: any = await r.json().catch(() => ({}));
      const ok = d?.status === "autorizado";
      return json({ success: ok, motivo: ok ? undefined : d?.mensagem_sefaz || d?.mensagem || "Carta de correção não aceita" });
    }
    const r = await fetch(`${url}?completa=1`, { headers: hdr });
    const d: any = await r.json().catch(() => ({}));
    if (action === "xml_cte_salvo") {
      const path = d?.caminho_xml || d?.caminho_xml_nota_fiscal;
      if (!path) return json({ error: "XML ainda não disponível na SEFAZ" }, 404);
      const x = await fetch(path.startsWith("http") ? path : opBase + path, { headers: hdr });
      return json({ success: true, xml: await x.text() });
    }
    return json({ success: true, status: d?.status, mensagem: d?.mensagem_sefaz || d?.mensagem, protocolo: d?.protocolo, chave: d?.chave_cte });
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
    case "nfe_pdf_por_chave": {
      const chave = String((body as any).chave ?? "").replace(/\D/g, "");
      if (chave.length !== 44) return json({ error: "Chave de NF-e inválida" }, 400);
      const r = await fetch(`${base}/v2/nfes_recebidas/${chave}.pdf`, { headers: { Authorization: "Basic " + btoa(token + ":") } });
      if (!r.ok) return json({ ok: false, status: r.status, data: { mensagem: r.status === 404 ? "DANFE ainda não disponível para esta nota." : await r.text() } }, 200);
      const bytes = new Uint8Array(await r.arrayBuffer());
      let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return json({ ok: true, status: 200, data: { pdf_base64: btoa(bin) } }, 200);
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
