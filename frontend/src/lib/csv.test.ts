import { describe, expect, it } from "vitest";

import { guessColumn, normaliseDate, parseCsv } from "./csv";

describe("parseCsv", () => {
  it("parses simple rows and trims empty lines", () => {
    expect(parseCsv("date,dish,qty\n2026-10-01,Dosa,42\n\n2026-10-02,Dosa,40\n")).toEqual([
      ["date", "dish", "qty"],
      ["2026-10-01", "Dosa", "42"],
      ["2026-10-02", "Dosa", "40"],
    ]);
  });
  it("handles quoted commas, escaped quotes and CRLF", () => {
    expect(parseCsv('a,b\r\n"Paneer, Butter","He said ""hi"""\r\n')).toEqual([
      ["a", "b"],
      ["Paneer, Butter", 'He said "hi"'],
    ]);
  });
  it("keeps empty cells in the middle of a row", () => {
    expect(parseCsv("a,,c")).toEqual([["a", "", "c"]]);
  });
});

describe("normaliseDate", () => {
  it("accepts ISO and dd/mm/yyyy", () => {
    expect(normaliseDate("2026-10-5")).toBe("2026-10-05");
    expect(normaliseDate("05/10/2026")).toBe("2026-10-05");
    expect(normaliseDate("5-10-2026")).toBe("2026-10-05");
  });
  it("rejects garbage", () => {
    expect(normaliseDate("not a date")).toBeNull();
    expect(normaliseDate("")).toBeNull();
  });
});

describe("guessColumn", () => {
  it("finds the best header case-insensitively", () => {
    const headers = ["Order Date", "Item Name", "Qty Sold", "Unit Price"];
    expect(guessColumn(headers, ["date"])).toBe("Order Date");
    expect(guessColumn(headers, ["dish", "item"])).toBe("Item Name");
    expect(guessColumn(headers, ["qty", "quantity"])).toBe("Qty Sold");
    expect(guessColumn(headers, ["shift"])).toBe("");
  });
});
