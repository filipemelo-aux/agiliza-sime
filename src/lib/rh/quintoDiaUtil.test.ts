import { describe, it, expect } from "vitest";
import { limiteValesAcerto, quintoDiaUtilMesSeguinte } from "./quintoDiaUtil";
describe("vales antes do 5º dia útil", () => {
  it("5º dia útil de novembro/2026 é 06/11", () => expect(quintoDiaUtilMesSeguinte("2026-10-31")).toBe("2026-11-06"));
  it("competência outubro inclui vale de 03/11", () => expect(limiteValesAcerto("2026-10-01", "2026-10-31") >= "2026-11-03").toBe(true));
  it("vale no 5º dia útil não entra", () => expect(limiteValesAcerto("2026-10-01", "2026-10-31")).toBe("2026-11-05"));
  it("quinzena de motorista não estende", () => expect(limiteValesAcerto("2026-10-16", "2026-10-31")).toBe("2026-10-31"));
});
