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
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`https://publica.cnpj.ws/cnpj/${rawCnpj}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return extractIeFromCnpjWs(await res.json());
  } catch {
    return null;
  }
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

/**
 * Consulta em vários serviços públicos (o primeiro que responder vence).
 * A IE é buscada em paralelo no cnpj.ws (único que a retorna gratuitamente).
 */
export async function lookupCnpj(rawCnpj: string): Promise<CnpjData> {
  const c = rawCnpj.replace(/\D/g, "");
  const iePromise = fetchIeOnly(c);
  const providers = [cnpja, brasilapi, cnpjws];
  let lastError: Error | null = null;
  for (const p of providers) {
    try {
      const data = await p(c);
      if (!data.razao_social) throw new Error("Sem dados");
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
