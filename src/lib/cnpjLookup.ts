/**
 * CNPJ lookup with retry and multiple API fallbacks.
 */

export interface CnpjData {
  razao_social: string | null;
  nome_fantasia: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  ddd_telefone_1: string | null;
  email: string | null;
  inscricao_estadual: string | null;
}

/** Extrai a IE ativa do retorno do cnpj.ws (preferindo a do estado do estabelecimento). */
function extractIeFromCnpjWs(data: any): string | null {
  const lista: any[] = data?.estabelecimento?.inscricoes_estaduais ?? [];
  const ativas = lista.filter((i) => i?.ativo && i?.inscricao_estadual);
  if (ativas.length === 0) return null;
  const uf = data?.estabelecimento?.estado?.sigla;
  const match = ativas.find((i) => i?.estado?.sigla === uf) ?? ativas[0];
  return String(match.inscricao_estadual).replace(/\D/g, "") || null;
}

/** Busca apenas a IE no cnpj.ws (BrasilAPI não retorna IE). Melhor esforço: falhas retornam null. */
async function fetchIeOnly(rawCnpj: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`https://publica.cnpj.ws/cnpj/${rawCnpj}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return extractIeFromCnpjWs(await res.json());
  } catch {
    return null;
  }
}

const maskCnpj = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

/** IE já conhecida no sistema (cadastros, empresas ou CT-es anteriores) — usada quando a consulta pública não traz. */
async function findKnownIe(c: string): Promise<string | null> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const docs = [c, maskCnpj(c)];
    const clean = (v: any) => {
      const s = String(v || "").trim();
      return s && !/^isento$/i.test(s) ? s.replace(/\D/g, "") || null : null;
    };
    const { data: p } = await supabase.from("profiles").select("inscricao_estadual").in("cnpj", docs).not("inscricao_estadual", "is", null).limit(5);
    for (const r of (p as any[]) || []) { const v = clean(r.inscricao_estadual); if (v) return v; }
    const { data: e } = await supabase.from("fiscal_establishments").select("inscricao_estadual").in("cnpj", docs).limit(1);
    const ev = clean((e as any)?.[0]?.inscricao_estadual); if (ev) return ev;
    for (const r of ["tomador", "remetente", "destinatario", "expedidor", "recebedor"]) {
      const { data } = await (supabase.from("ctes") as any).select(`${r}_ie`).in(`${r}_cnpj`, docs).not(`${r}_ie`, "is", null).order("created_at", { ascending: false }).limit(3);
      for (const row of (data as any[]) || []) { const v = clean(row[`${r}_ie`]); if (v) return v; }
    }
  } catch { /* melhor esforço */ }
  return null;
}

async function getJson(url: string, ms = 6000): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data?.status === "ERROR") throw new Error(data?.message || "CNPJ não encontrado");
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

type Provider = (cnpj: string) => Promise<Omit<CnpjData, "inscricao_estadual"> & { inscricao_estadual?: string | null }>;

const cnpja: Provider = async (c) => {
  const d = await getJson(`https://open.cnpja.com/office/${c}`);
  const a = d.address || {};
  const ph = d.phones?.[0];
  return {
    razao_social: d.company?.name ?? null,
    nome_fantasia: d.alias ?? null,
    logradouro: a.street ?? null,
    numero: a.number ?? null,
    complemento: a.details ?? null,
    bairro: a.district ?? null,
    municipio: a.city ?? null,
    uf: a.state ?? null,
    cep: a.zip ?? null,
    ddd_telefone_1: ph ? `${ph.area}${ph.number}` : null,
    email: d.emails?.[0]?.address ?? null,
  };
};

const cnpjws: Provider = async (c) => {
  const data = await getJson(`https://publica.cnpj.ws/cnpj/${c}`);
  const e = data.estabelecimento || {};
  return {
    razao_social: data.razao_social ?? null,
    nome_fantasia: e.nome_fantasia ?? null,
    logradouro: e.logradouro ?? null,
    numero: e.numero ?? null,
    complemento: e.complemento ?? null,
    bairro: e.bairro ?? null,
    municipio: e.cidade?.nome ?? null,
    uf: e.estado?.sigla ?? null,
    cep: e.cep ?? null,
    ddd_telefone_1: e.ddd1 && e.telefone1 ? `${e.ddd1}${e.telefone1}` : null,
    email: e.email ?? null,
    inscricao_estadual: extractIeFromCnpjWs(data),
  };
};


const brasilapi: Provider = async (c) => {
  const d = await getJson(`https://brasilapi.com.br/api/cnpj/v1/${c}`);
  return {
    razao_social: d.razao_social ?? null,
    nome_fantasia: d.nome_fantasia ?? null,
    logradouro: d.logradouro ?? null,
    numero: d.numero ?? null,
    complemento: d.complemento ?? null,
    bairro: d.bairro ?? null,
    municipio: d.municipio ?? null,
    uf: d.uf ?? null,
    cep: d.cep ?? null,
    ddd_telefone_1: d.ddd_telefone_1 ?? null,
    email: d.email ?? null,
  };
};

/** Busca completa no próprio sistema (pessoas e empresas já cadastradas) — instantânea, sem serviço externo. */
async function findLocalData(c: string): Promise<CnpjData | null> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const docs = [c, maskCnpj(c)];
    const clean = (v: any) => {
      const s = String(v || "").trim();
      return s || null;
    };
    const { data: p } = await supabase
      .from("profiles")
      .select("razao_social, nome_fantasia, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, address_zip, phone, email, inscricao_estadual")
      .in("cnpj", docs)
      .not("razao_social", "is", null)
      .limit(1);
    const r = (p as any[])?.[0];
    if (r?.razao_social) {
      return {
        razao_social: clean(r.razao_social),
        nome_fantasia: clean(r.nome_fantasia),
        logradouro: clean(r.address_street),
        numero: clean(r.address_number),
        complemento: clean(r.address_complement),
        bairro: clean(r.address_neighborhood),
        municipio: clean(r.address_city),
        uf: clean(r.address_state),
        cep: clean(r.address_zip),
        ddd_telefone_1: clean(r.phone),
        email: clean(r.email),
        inscricao_estadual: clean(r.inscricao_estadual),
      };
    }
    const { data: e } = await supabase
      .from("fiscal_establishments")
      .select("razao_social, nome_fantasia, endereco_logradouro, endereco_numero, endereco_bairro, endereco_municipio, endereco_uf, endereco_cep, inscricao_estadual")
      .in("cnpj", docs)
      .limit(1);
    const f = (e as any[])?.[0];
    if (f?.razao_social) {
      return {
        razao_social: clean(f.razao_social),
        nome_fantasia: clean(f.nome_fantasia),
        logradouro: clean(f.endereco_logradouro),
        numero: clean(f.endereco_numero),
        complemento: null,
        bairro: clean(f.endereco_bairro),
        municipio: clean(f.endereco_municipio),
        uf: clean(f.endereco_uf),
        cep: clean(f.endereco_cep),
        ddd_telefone_1: null,
        email: null,
        inscricao_estadual: clean(f.inscricao_estadual),
      };
    }
  } catch { /* melhor esforço */ }
  return null;
}

/**
 * Ordem de consulta:
 * 1) Cadastros do próprio sistema (instantâneo);
 * 2) cnpj.ws — único serviço gratuito que retorna a IE;
 * 3) CNPJá / BrasilAPI — último recurso (sem IE; a IE é buscada em paralelo no cnpj.ws e nos cadastros).
 */
export async function lookupCnpj(rawCnpj: string, onProgress?: (step: string) => void): Promise<CnpjData> {
  const c = rawCnpj.replace(/\D/g, "");

  onProgress?.("Buscando nos cadastros do sistema…");
  const local = await findLocalData(c);
  if (local) return local;

  onProgress?.("Consultando cnpj.ws (com Inscrição Estadual)…");
  const iePromise = fetchIeOnly(c).then(async (ie) => ie || (await findKnownIe(c)));
  const providers: [Provider, string][] = [
    [cnpjws, "Consultando cnpj.ws (com Inscrição Estadual)…"],
    [cnpja, "cnpj.ws sem resposta — tentando CNPJá…"],
    [brasilapi, "CNPJá sem resposta — tentando BrasilAPI…"],
  ];
  let lastError: Error | null = null;
  let first = true;
  for (const [p, label] of providers) {
    if (!first) onProgress?.(label);
    first = false;
    try {
      const data = await p(c);
      if (!data.razao_social) throw new Error("Sem dados");
      onProgress?.("Buscando Inscrição Estadual…");
      const ie = data.inscricao_estadual !== undefined ? data.inscricao_estadual : await iePromise;
      return { ...data, inscricao_estadual: ie ?? null };
    } catch (err: any) {
      lastError = err;
    }
  }
  throw new Error(
    lastError?.name === "AbortError"
      ? "Os serviços de consulta de CNPJ não responderam a tempo. Tente novamente em instantes."
      : "Não foi possível consultar o CNPJ agora. Confira o número ou preencha os dados manualmente.",
  );
}
