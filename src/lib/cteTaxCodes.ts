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
  { value: "200", label: "200 – Alíquota reduzida", isento: false, hint: "Informe as alíquotas reduzidas e a classificação." },
  { value: "400", label: "400 – Isenção", isento: true, hint: "Isento: alíquotas zeradas." },
  { value: "410", label: "410 – Imunidade e não incidência", isento: true, hint: "Imune / não incide: alíquotas zeradas." },
  { value: "510", label: "510 – Diferimento", isento: true, hint: "Diferido: alíquotas zeradas." },
  { value: "550", label: "550 – Suspensão", isento: true, hint: "Suspenso: alíquotas zeradas." },
];

export const ibsCbsIsento = (cst: string) =>
  IBS_CBS_CST_OPTIONS.find((o) => o.value === cst)?.isento ?? false;

/** Alíquotas padrão 2026 (fase de teste da reforma). */
export const IBS_CBS_DEFAULT = { ibs_uf: 0.1, ibs_mun: 0, cbs: 0.9 };
