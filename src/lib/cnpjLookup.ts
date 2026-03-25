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
}

async function tryFetch(url: string, signal?: AbortSignal): Promise<Response> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

export async function lookupCnpj(rawCnpj: string): Promise<CnpjData> {
  const urls = [
    `https://brasilapi.com.br/api/cnpj/v1/${rawCnpj}`,
    `https://publica.cnpj.ws/cnpj/${rawCnpj}`,
  ];

  let lastError: Error | null = null;

  for (const url of urls) {
    // Try each URL up to 2 times
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await tryFetch(url, controller.signal);
        clearTimeout(timeout);
        const data = await res.json();

        // cnpj.ws has a different response shape
        if (url.includes("cnpj.ws")) {
          return {
            razao_social: data.razao_social ?? null,
            nome_fantasia: data.estabelecimento?.nome_fantasia ?? null,
            logradouro: data.estabelecimento?.logradouro ?? null,
            numero: data.estabelecimento?.numero ?? null,
            complemento: data.estabelecimento?.complemento ?? null,
            bairro: data.estabelecimento?.bairro ?? null,
            municipio: data.estabelecimento?.cidade?.nome ?? null,
            uf: data.estabelecimento?.estado?.sigla ?? null,
            cep: data.estabelecimento?.cep ?? null,
            ddd_telefone_1: data.estabelecimento?.ddd1 && data.estabelecimento?.telefone1
              ? `${data.estabelecimento.ddd1}${data.estabelecimento.telefone1}`
              : null,
            email: data.estabelecimento?.email ?? null,
          };
        }

        // BrasilAPI shape (default)
        return {
          razao_social: data.razao_social ?? null,
          nome_fantasia: data.nome_fantasia ?? null,
          logradouro: data.logradouro ?? null,
          numero: data.numero ?? null,
          complemento: data.complemento ?? null,
          bairro: data.bairro ?? null,
          municipio: data.municipio ?? null,
          uf: data.uf ?? null,
          cep: data.cep ?? null,
          ddd_telefone_1: data.ddd_telefone_1 ?? null,
          email: data.email ?? null,
        };
      } catch (err: any) {
        lastError = err;
        // Small delay before retry
        if (attempt === 0) await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  throw lastError || new Error("Falha ao consultar CNPJ");
}
