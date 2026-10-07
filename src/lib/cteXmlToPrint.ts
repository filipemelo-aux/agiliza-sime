// Converte o XML autorizado (cteProc) guardado no sistema em campos do modelo padrão do DACTE.
// Usado para CT-es importados por XML: o PDF é gerado localmente, sem consultar a Focus.
type Dict = Record<string, any>;

const first = (root: Element | Document | null | undefined, tag: string): Element | null =>
  (root ? (root.getElementsByTagNameNS("*", tag)[0] as Element | undefined) : undefined) ?? null;
const all = (root: Element | Document | null | undefined, tag: string): Element[] =>
  root ? Array.from(root.getElementsByTagNameNS("*", tag)) : [];
const txt = (root: Element | Document | null | undefined, tag: string) => first(root, tag)?.textContent?.trim() || "";
const nz = (v: string) => (v ? Number(v) : undefined);

function actor(el: Element | null, prefix: string, out: Dict) {
  if (!el) return;
  const ender = Array.from(el.children).find((c) => c.localName.startsWith("ender")) || null;
  const doc = txt(el, "CNPJ") || txt(el, "CPF");
  const set = (k: string, v: unknown) => { if (v !== "" && v != null) out[`${prefix}_${k}`] = v; };
  set("nome", txt(el, "xNome"));
  set("cnpj", doc);
  set("ie", txt(el, "IE"));
  set("telefone", txt(el, "fone"));
  if (ender) {
    set("endereco", [txt(ender, "xLgr"), txt(ender, "nro"), txt(ender, "xCpl"), txt(ender, "xBairro")].filter(Boolean).join(", "));
    set("municipio_nome", txt(ender, "xMun"));
    set("municipio_ibge", txt(ender, "cMun"));
    set("uf", txt(ender, "UF"));
    set("cep", txt(ender, "CEP"));
  }
}

export function cteXmlToPrintFields(xml?: string | null): Dict | null {
  if (!xml || !xml.includes("infCte")) return null;
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.getElementsByTagName("parsererror").length) return null;
  const inf = first(doc, "infCte");
  if (!inf) return null;
  const ide = first(inf, "ide");
  const out: Dict = {};
  const set = (k: string, v: unknown) => { if (v !== "" && v != null && !(typeof v === "number" && isNaN(v))) out[k] = v; };

  set("chave_acesso", (inf.getAttribute("Id") || "").replace(/^CTe/, ""));
  set("numero", nz(txt(ide, "nCT")));
  set("serie", nz(txt(ide, "serie")));
  set("cfop", txt(ide, "CFOP"));
  set("natureza_operacao", txt(ide, "natOp"));
  set("data_emissao", txt(ide, "dhEmi"));
  set("tp_cte", nz(txt(ide, "tpCTe")));
  set("tp_serv", nz(txt(ide, "tpServ")));
  set("municipio_origem_nome", txt(ide, "xMunIni"));
  set("municipio_origem_ibge", txt(ide, "cMunIni"));
  set("uf_origem", txt(ide, "UFIni"));
  set("municipio_destino_nome", txt(ide, "xMunFim"));
  set("municipio_destino_ibge", txt(ide, "cMunFim"));
  set("uf_destino", txt(ide, "UFFim"));

  const compl = first(inf, "compl");
  set("caracteristicas_adicionais_carga", txt(compl, "xCaracAd"));
  set("observacoes", txt(compl, "xObs"));
  const fisco = all(compl, "ObsFisco").map((o) => `${txt(o, "xCampo")}: ${txt(o, "xTexto")}`);
  if (fisco.length) set("informacoes_fisco", fisco.join(" | "));

  actor(first(inf, "rem"), "remetente", out);
  actor(first(inf, "dest"), "destinatario", out);
  actor(first(inf, "exped"), "expedidor", out);
  actor(first(inf, "receb"), "recebedor", out);
  const toma4 = first(ide, "toma4");
  if (toma4) actor(toma4, "tomador", out);
  else {
    const t = txt(ide, "toma");
    const map: Record<string, string> = { "0": "remetente", "1": "expedidor", "2": "recebedor", "3": "destinatario" };
    const src = map[t];
    if (src) for (const k of ["nome", "cnpj", "ie", "telefone", "endereco", "municipio_nome", "municipio_ibge", "uf", "cep"]) {
      if (out[`${src}_${k}`] != null) out[`tomador_${k}`] = out[`${src}_${k}`];
    }
  }

  const vPrest = first(inf, "vPrest");
  set("valor_frete", nz(txt(vPrest, "vTPrest")));
  set("valor_receber", nz(txt(vPrest, "vRec")));
  const comps = all(vPrest, "Comp").map((c) => ({ xNome: txt(c, "xNome"), vComp: Number(txt(c, "vComp") || 0) }));
  if (comps.length) out.componentes_frete = comps;

  const icms = first(first(inf, "imp"), "ICMS");
  const icmsEl = icms ? (Array.from(icms.children)[0] as Element | undefined) : undefined;
  if (icmsEl) {
    set("cst_icms", txt(icmsEl, "CST") || (icmsEl.localName === "ICMSSN" ? "90" : ""));
    set("base_calculo_icms", nz(txt(icmsEl, "vBC")));
    set("aliquota_icms", nz(txt(icmsEl, "pICMS")));
    set("valor_icms", nz(txt(icmsEl, "vICMS")));
    set("percentual_reducao_bc", nz(txt(icmsEl, "pRedBC")));
  }
  set("valor_total_tributos", nz(txt(first(inf, "imp"), "vTotTrib")));

  const carga = first(inf, "infCarga");
  set("valor_carga", nz(txt(carga, "vCarga")));
  set("produto_predominante", txt(carga, "proPred"));
  const qts = all(carga, "infQ").map((q) => ({ cUnid: txt(q, "cUnid"), tpMed: txt(q, "tpMed"), qCarga: Number(txt(q, "qCarga") || 0) }));
  if (qts.length) {
    out.info_quantidade = qts;
    const kg = qts.find((q) => q.cUnid === "01");
    if (kg) out.peso_bruto = kg.qCarga;
  }
  const nfes = all(inf, "infNFe").map((n) => {
    const chave = txt(n, "chave");
    return { chave, numero: chave ? String(Number(chave.slice(25, 34))) : "", serie: chave ? String(Number(chave.slice(22, 25))) : "" };
  }).filter((n) => n.chave);
  if (nfes.length) {
    out.nfe_detalhes = nfes;
    out.chaves_nfe_ref = nfes.map((n) => n.chave);
  }

  const rodo = first(inf, "rodo");
  set("rntrc", txt(rodo, "RNTRC"));
  const veic = first(rodo, "veic");
  if (veic) set("placa_veiculo", txt(veic, "placa"));

  const prot = first(doc, "infProt");
  if (prot) {
    set("protocolo_autorizacao", txt(prot, "nProt"));
    set("data_autorizacao", txt(prot, "dhRecbto"));
  }
  return out;
}
