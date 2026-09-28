import { describe, expect, it } from "vitest";

import { zipFile } from "../../../tests/fixtures/source-passage-cases.mjs";
import { sourceUnits } from "./source-passage";

const FILE_BYTES = 256 * 1024;
// Measured 2026-09-27: at most 60 ms per case, fastest of three.
const BUDGET_MS = 1000;

const workbook = { name: "xl/workbook.xml", text: '<sheet name="a" r:id="r1"/>' };
const encoded = (text: string) => new TextEncoder().encode(text);

describe("hostile document sources cost time linear in their size", () => {
  it("splits a source of each hostile shape within the budget", () => {
    const cases: Array<[string, string, Uint8Array]> = [
      ["DOCX of unclosed paragraphs", "sources/a.docx", zipFile([{ name: "word/document.xml", text: "<w:p>".repeat(FILE_BYTES / 5) }])],
      ["XLSX of unclosed shared strings", "sources/a.xlsx", zipFile([workbook, { name: "xl/sharedStrings.xml", text: "<si>".repeat(FILE_BYTES / 4) }])],
      ["XLSX of unclosed rows", "sources/a.xlsx", zipFile([workbook, { name: "xl/worksheets/sheet1.xml", text: '<row r="1">'.repeat(FILE_BYTES / 11) }])],
      ["XLSX of unclosed cells", "sources/a.xlsx", zipFile([workbook, { name: "xl/worksheets/sheet1.xml", text: `<row r="1">${'<c r="A1">'.repeat(FILE_BYTES / 10)}</row>` }])],
      ["HTML of unclosed scripts", "sources/a.html", encoded("<script".repeat(FILE_BYTES / 7))],
      ["HTML of bare angle brackets", "sources/a.html", encoded("<".repeat(FILE_BYTES))],
    ];
    for (const [name, path, bytes] of cases) {
      let fastest = Infinity;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const started = performance.now();
        sourceUnits(bytes, path);
        fastest = Math.min(fastest, performance.now() - started);
        if (fastest < BUDGET_MS || fastest > BUDGET_MS * 10) break;
      }
      expect(fastest, `${name} took ${fastest.toFixed(0)} ms`).toBeLessThan(BUDGET_MS);
    }
  });

  it("refuses a workbook whose sheets share one entry's data instead of unpacking it once per name", () => {
    const bytes = zipFile([
      { name: "xl/workbook.xml", text: '<sheet name="a" r:id="r1"/><sheet name="b" r:id="r2"/><sheet name="c" r:id="r3"/>' },
      { name: "xl/worksheets/sheet1.xml", text: '<row r="1"></row>'.repeat(4096), store: true },
      { name: "xl/worksheets/sheet2.xml", aliasOf: "xl/worksheets/sheet1.xml" },
      { name: "xl/worksheets/sheet3.xml", aliasOf: "xl/worksheets/sheet1.xml" },
    ]);
    expect(() => sourceUnits(bytes, "sources/a.xlsx")).toThrow(/overlaps an entry already read/);
  });
});
