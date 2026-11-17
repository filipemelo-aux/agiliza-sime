import { describe, it, expect } from "vitest";
import { abertoPorAno } from "./fleetDocumentStatus";

describe("abertoPorAno", () => {
  it("soma só não pagos a partir de 2022, pelo exercício ou ano do vencimento", () => {
    const r = abertoPorAno([
      { tipo_documento: "IPVA", data_vencimento: "2023-03-10", status_pagamento: "Vencido", valor_total: 100.1, ano_exercicio: 2022 },
      { tipo_documento: "Multa", data_vencimento: "2022-05-01", status_pagamento: "A Vencer", valor_total: "50.2" },
      { tipo_documento: "Multa", data_vencimento: "2024-05-01", status_pagamento: "Pago", valor_total: 80 },
      { tipo_documento: "Multa", data_vencimento: "2021-05-01", status_pagamento: "Vencido", valor_total: 30 },
    ]);
    expect(r).toEqual({ 2022: 150.3 });
  });
});
