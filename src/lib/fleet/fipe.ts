// Tabela FIPE via API pública Parallelum (gratuita, sem chave). Caminhões e utilitários.
const BASE = "https://parallelum.com.br/fipe/api/v1";
export type FipeTipo = "caminhoes" | "carros";
export interface FipeItem { codigo: string; nome: string }
export interface FipePreco { Valor: string; Marca: string; Modelo: string; AnoModelo: number; CodigoFipe: string; MesReferencia: string }

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(r.status === 429 ? "Limite de consultas FIPE atingido, tente em alguns minutos" : `FIPE respondeu ${r.status}`);
  return r.json();
}
export const fipeMarcas = (t: FipeTipo) => get<FipeItem[]>(`/${t}/marcas`);
export const fipeModelos = async (t: FipeTipo, marca: string) => (await get<{ modelos: { codigo: number; nome: string }[] }>(`/${t}/marcas/${marca}/modelos`)).modelos.map((m) => ({ codigo: String(m.codigo), nome: m.nome }));
export const fipeAnos = (t: FipeTipo, marca: string, modelo: string) => get<FipeItem[]>(`/${t}/marcas/${marca}/modelos/${modelo}/anos`);
export const fipePreco = (t: FipeTipo, marca: string, modelo: string, ano: string) => get<FipePreco>(`/${t}/marcas/${marca}/modelos/${modelo}/anos/${ano}`);

/** "R$ 512.345,00" -> 512345 */
export function parseValorFipe(v: string): number {
  return Number(String(v).replace(/[^\d,]/g, "").replace(",", ".")) || 0;
}
const norm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
/** Marca FIPE que melhor casa com a marca do cadastro (ex.: "M.BENZ" -> "MERCEDES-BENZ"). */
export function acharMarca(marcas: FipeItem[], brand: string): FipeItem | undefined {
  const b = norm(brand).replace(/^MBENZ$|^MB$/, "MERCEDESBENZ");
  if (!b) return;
  return marcas.find((m) => norm(m.nome) === b) || marcas.find((m) => norm(m.nome).startsWith(b) || b.startsWith(norm(m.nome)));
}
