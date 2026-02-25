/**
 * Utilitário para busca automática de código IBGE de municípios via BrasilAPI.
 * Usado internamente para preencher campos obrigatórios de documentos fiscais.
 */

interface MunicipioIBGE {
  nome: string;
  codigo_ibge: string;
}

// Cache em memória para evitar chamadas repetidas
const ibgeCache = new Map<string, string>();

/**
 * Busca o código IBGE de um município pela UF e nome.
 * Retorna o código de 7 dígitos ou undefined se não encontrado.
 */
export async function buscarCodigoIbgePorMunicipio(
  uf: string,
  nomeMunicipio: string
): Promise<string | undefined> {
  if (!uf || !nomeMunicipio) return undefined;

  const cacheKey = `${uf.toUpperCase()}-${nomeMunicipio.toUpperCase().trim()}`;
  if (ibgeCache.has(cacheKey)) return ibgeCache.get(cacheKey);

  try {
    const res = await fetch(
      `https://brasilapi.com.br/api/ibge/municipios/v1/${uf.toUpperCase()}?providers=dados-abertos-br,gov,wikipedia`
    );
    if (!res.ok) return undefined;

    const municipios: MunicipioIBGE[] = await res.json();

    // Normaliza para comparação
    const normalizar = (s: string) =>
      s
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

    const nomeNorm = normalizar(nomeMunicipio);

    // Busca exata primeiro
    let found = municipios.find((m) => normalizar(m.nome) === nomeNorm);

    // Fallback: busca parcial
    if (!found) {
      found = municipios.find(
        (m) =>
          normalizar(m.nome).includes(nomeNorm) ||
          nomeNorm.includes(normalizar(m.nome))
      );
    }

    if (found) {
      const codigo = String(found.codigo_ibge);
      ibgeCache.set(cacheKey, codigo);
      return codigo;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Busca o código IBGE a partir do CEP via BrasilAPI.
 * Retorna o código IBGE ou undefined.
 */
export async function buscarCodigoIbgePorCep(cep: string): Promise<string | undefined> {
  const raw = cep.replace(/\D/g, "");
  if (raw.length !== 8) return undefined;

  try {
    const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${raw}`);
    if (!res.ok) return undefined;
    const data = await res.json();
    return data.city_ibge ? String(data.city_ibge) : undefined;
  } catch {
    return undefined;
  }
}
