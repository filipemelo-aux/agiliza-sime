import { describe, expect, it, vi } from "vitest";
import { fetchAllRows } from "./fetchAllRows";

describe("complete payable reads", () => {
  it("reads records beyond the first 1000 without losing them", async () => {
    const rows = Array.from({ length: 1146 }, (_, id) => ({ id }));
    const fetchPage = vi.fn(async (from: number, to: number) => ({
      data: rows.slice(from, to + 1), error: null,
    }));
    const result = await fetchAllRows(fetchPage);
    expect(result.data).toEqual(rows);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 1000, 1999);
  });

  it("surfaces a query failure instead of returning no expenses", async () => {
    await expect(fetchAllRows(async () => ({ data: null, error: { message: "Connection failed" } })))
      .rejects.toThrow("Connection failed");
  });
});
import { describe as d2, it as i2, expect as e2 } from "vitest";
import { fetchAllRows as far } from "./fetchAllRows";
d2("fetchAllRows paralelo", () => {
  i2("mantém todas as 2500 linhas na ordem", async () => {
    const all = Array.from({ length: 2500 }, (_, i) => i);
    const { data } = await far(async (from, to) => ({ data: all.slice(from, to + 1), error: null }));
    e2(data).toEqual(all);
  });
});
