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