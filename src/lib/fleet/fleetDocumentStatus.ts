export type FleetDocTipo = "IPVA" | "Licenciamento" | "Multa" | "Seguro";
export type FleetSituacao = "vencido" | "a_vencer" | "em_dia" | "sem_registro";

export interface FleetDocLike {
  tipo_documento: FleetDocTipo;
  data_vencimento: string;
  status_pagamento: "A Vencer" | "Vencido" | "Pago";
  valor_total: number | string;
}

/** Dias de antecedência para destacar um documento como "a vencer". */
export const JANELA_A_VENCER_DIAS = 30;

function diffDias(dateIso: string, hojeIso: string) {
  const a = new Date(`${dateIso}T12:00:00`).getTime();
  const b = new Date(`${hojeIso}T12:00:00`).getTime();
  return Math.round((a - b) / 86_400_000);
}

/** Situação real de um documento: o vencimento manda, mesmo que o status gravado esteja desatualizado. */
export function situacaoDocumento(doc: FleetDocLike, hojeIso: string): FleetSituacao {
  if (doc.status_pagamento === "Pago") return "em_dia";
  const d = diffDias(doc.data_vencimento, hojeIso);
  if (d < 0) return "vencido";
  if (d <= JANELA_A_VENCER_DIAS) return "a_vencer";
  return "em_dia";
}

const PESO: Record<FleetSituacao, number> = { vencido: 3, a_vencer: 2, em_dia: 1, sem_registro: 0 };

export interface ResumoTipo {
  situacao: FleetSituacao;
  /** Próximo vencimento em aberto (o mais antigo), ou o último pago. */
  vencimento: string | null;
  abertos: number;
  valorAberto: number;
}

export function resumoPorTipo(docs: FleetDocLike[], tipo: FleetDocTipo, hojeIso: string): ResumoTipo {
  const doTipo = docs.filter((d) => d.tipo_documento === tipo);
  if (doTipo.length === 0) return { situacao: "sem_registro", vencimento: null, abertos: 0, valorAberto: 0 };
  const abertos = doTipo.filter((d) => d.status_pagamento !== "Pago")
    .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));
  let situacao: FleetSituacao = "em_dia";
  for (const d of doTipo) {
    const s = situacaoDocumento(d, hojeIso);
    if (PESO[s] > PESO[situacao]) situacao = s;
  }
  const ultimoPago = doTipo.filter((d) => d.status_pagamento === "Pago")
    .sort((a, b) => b.data_vencimento.localeCompare(a.data_vencimento))[0];
  return {
    situacao,
    vencimento: abertos[0]?.data_vencimento ?? ultimoPago?.data_vencimento ?? null,
    abertos: abertos.length,
    valorAberto: Math.round(abertos.reduce((s, d) => s + Number(d.valor_total || 0), 0) * 100) / 100,
  };
}

/** Situação geral do veículo = a pior entre os documentos. Sem nenhum registro = sem_registro. */
export function situacaoVeiculo(resumos: ResumoTipo[]): FleetSituacao {
  let pior: FleetSituacao = "sem_registro";
  for (const r of resumos) if (PESO[r.situacao] > PESO[pior]) pior = r.situacao;
  return pior;
}

/**
 * Ajusta a situação com o resultado da última consulta ao Detran:
 * consulta concluída sem débitos em aberto e sem documentos registrados = em dia (linha verde).
 */
export function situacaoComConsulta(situacao: FleetSituacao, consultaSemDebitos: boolean): FleetSituacao {
  if (situacao === "sem_registro" && consultaSemDebitos) return "em_dia";
  return situacao;
}

/** Primeiro ano exibido nas colunas de valores em aberto por ano. */
export const ANO_INICIAL_ABERTOS = 2022;

/** Bucket for historical exercises; original consultation years stay stored for audit. */
export const ANO_EXERCICIO_ANTERIORES = 2024;
export const EXERCICIOS_DOCUMENTO = [2026, 2025, ANO_EXERCICIO_ANTERIORES] as const;

export function agruparExercicio(ano: number): number {
  return ano <= ANO_EXERCICIO_ANTERIORES ? ANO_EXERCICIO_ANTERIORES : ano;
}

export function rotuloExercicio(ano: number): string {
  return ano <= ANO_EXERCICIO_ANTERIORES ? "Anos anteriores" : String(ano);
}

/**
 * Soma dos valores não pagos por ano (exercício; sem exercício, ano do vencimento).
 * Todos os exercícios até 2024 entram em Anos anteriores, inclusive antes de 2022.
 */
export function abertoPorAno(
  docs: (FleetDocLike & { ano_exercicio?: number | null })[],
  tipo?: FleetDocTipo,
): Record<number, number> {
  const out: Record<number, number> = {};
  for (const d of docs) {
    if (d.status_pagamento === "Pago") continue;
    if (tipo && d.tipo_documento !== tipo) continue;
    const ano = d.ano_exercicio || Number(String(d.data_vencimento || "").slice(0, 4));
    if (!ano) continue;
    const grupo = agruparExercicio(ano);
    out[grupo] = Math.round(((out[grupo] || 0) + (Number(d.valor_total) || 0)) * 100) / 100;
  }
  return out;
}
