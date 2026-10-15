// Códigos de situação tributária usados na emissão do CT-e.

export type IcmsCstMode = "integral" | "reducao" | "isento" | "st" | "outros";

export const ICMS_CST_OPTIONS: { value: string; label: string; mode: IcmsCstMode; hint: string }[] = [
  { value: "00", label: "00 – Tributação normal do ICMS", mode: "integral", hint: "ICMS sobre o valor total da prestação." },
  { value: "20", label: "20 – Tributação com redução de base de cálculo", mode: "reducao", hint: "Informe o % de redução da base de cálculo." },
  { value: "40", label: "40 – Isenta do ICMS", mode: "isento", hint: "Prestação isenta: base, alíquota e valor ficam zerados." },
  { value: "41", label: "41 – Não tributada pelo ICMS", mode: "isento", hint: "Prestação não tributada: base, alíquota e valor ficam zerados." },
  { value: "51", label: "51 – ICMS diferido", mode: "isento", hint: "Imposto diferido: base, alíquota e valor ficam zerados." },
  { value: "60", label: "60 – ICMS cobrado por substituição tributária", mode: "st", hint: "ICMS retido pelo tomador (substituição tributária)." },
  { value: "90", label: "90 – ICMS outros", mode: "outros", hint: "Outras situações (ex.: ICMS devido a outra UF). Redução opcional." },
];

export const icmsCstMode = (cst: string): IcmsCstMode =>
  ICMS_CST_OPTIONS.find((o) => o.value === cst)?.mode ?? "integral";

export const IBS_CBS_CST_OPTIONS: { value: string; label: string; isento: boolean; classTrib?: string; hint: string }[] = [
  { value: "000", label: "000 – Tributação integral", isento: false, classTrib: "000001", hint: "IBS e CBS calculados sobre o valor do frete." },
  { value: "200", label: "200 – Alíquota reduzida", isento: false, classTrib: "200001", hint: "Informe as alíquotas reduzidas e a classificação." },
  { value: "400", label: "400 – Isenção", isento: true, classTrib: "400001", hint: "Isento: alíquotas zeradas." },
  { value: "410", label: "410 – Imunidade e não incidência", isento: true, classTrib: "410001", hint: "Imune / não incide: alíquotas zeradas." },
  { value: "510", label: "510 – Diferimento", isento: true, classTrib: "510001", hint: "Diferido: alíquotas zeradas." },
  { value: "550", label: "550 – Suspensão", isento: true, classTrib: "550001", hint: "Suspenso: alíquotas zeradas." },
];

export const ibsCbsIsento = (cst: string) =>
  IBS_CBS_CST_OPTIONS.find((o) => o.value === cst)?.isento ?? false;

/** Alíquotas padrão 2026 (fase de teste da reforma). */
export const IBS_CBS_DEFAULT = { ibs_uf: 0.1, ibs_mun: 0, cbs: 0.9 };

// Alíquotas internas de ICMS por UF (padrão geral 2026; editável no CT-e).
const ICMS_INTERNA: Record<string, number> = {
  AC: 19, AL: 20, AM: 20, AP: 18, BA: 20.5, CE: 20, DF: 20, ES: 17, GO: 19, MA: 23, MG: 18, MS: 17, MT: 17,
  PA: 19, PB: 20, PE: 20.5, PI: 22.5, PR: 19.5, RJ: 22, RN: 20, RO: 19.5, RR: 20, RS: 17, SC: 17, SE: 20,
  SP: 18, TO: 20,
};
const SUL_SUDESTE_SEM_ES = ["SP", "RJ", "MG", "PR", "SC", "RS"];

/** Alíquota padrão do ICMS para a rota: interna da UF ou interestadual 12%/7% (Res. Senado 22/89). */
export function icmsAliquotaRota(ufOrigem?: string, ufDestino?: string): number {
  const o = (ufOrigem || "").toUpperCase();
  const d = (ufDestino || "").toUpperCase();
  if (!o || !d) return 12;
  if (o === d) return ICMS_INTERNA[o] ?? 18;
  if (SUL_SUDESTE_SEM_ES.includes(o) && !SUL_SUDESTE_SEM_ES.includes(d)) return 7;
  return 12;
}

/** CST padrão: interno = 40 (isento); interestadual = 00 (tributação normal). */
export const icmsCstPadraoRota = (ufOrigem?: string, ufDestino?: string) =>
  ufOrigem && ufDestino && ufOrigem.toUpperCase() === ufDestino.toUpperCase() ? "40" : "00";

/** Valores padrão (alíquota e % de redução) aplicados ao escolher um CST. */
export function icmsPadraoCst(cst: string, ufOrigem?: string, ufDestino?: string) {
  const mode = icmsCstMode(cst);
  const aliq = icmsAliquotaRota(ufOrigem, ufDestino);
  if (mode === "isento") return { aliquota_icms: 0, percentual_reducao_bc: 0 };
  if (mode === "reducao") return { aliquota_icms: aliq, percentual_reducao_bc: 20 };
  return { aliquota_icms: aliq, percentual_reducao_bc: 0 };
}
