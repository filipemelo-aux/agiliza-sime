import { describe, it, expect } from "vitest";
import { abertoPorAno, agruparExercicio, EXERCICIOS_DOCUMENTO } from "./fleetDocumentStatus";

describe("abertoPorAno", () => {
  it("agrupa todos os débitos anteriores a 2025, sem descartar anos antigos", () => {
    const r = abertoPorAno([
      { tipo_documento: "IPVA", data_vencimento: "2023-03-10", status_pagamento: "Vencido", valor_total: 100.1, ano_exercicio: 2022 },
      { tipo_documento: "Multa", data_vencimento: "2022-05-01", status_pagamento: "A Vencer", valor_total: "50.2" },
      { tipo_documento: "Multa", data_vencimento: "2024-05-01", status_pagamento: "Pago", valor_total: 80 },
      { tipo_documento: "Multa", data_vencimento: "2021-05-01", status_pagamento: "Vencido", valor_total: 30 },
    ]);
    expect(r).toEqual({ 2024: 180.3 });
  });
  it("oferece somente 2026, 2025 e o grupo de anos anteriores no lançamento", () => {
    expect(EXERCICIOS_DOCUMENTO).toEqual([2026, 2025, 2024]);
    expect([2022, 2023, 2024, 2025, 2026].map(agruparExercicio)).toEqual([2024, 2024, 2024, 2025, 2026]);
  });
  it("filtra por tipo", () => {
    const docs = [
      { tipo_documento: "IPVA" as const, data_vencimento: "2026-03-10", status_pagamento: "Vencido" as const, valor_total: 900 },
      { tipo_documento: "Licenciamento" as const, data_vencimento: "2026-08-10", status_pagamento: "Vencido" as const, valor_total: 150 },
    ];
    expect(abertoPorAno(docs, "IPVA")).toEqual({ 2026: 900 });
    expect(abertoPorAno(docs, "Licenciamento")).toEqual({ 2026: 150 });
  });
});
