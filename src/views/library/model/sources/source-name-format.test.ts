import { describe, expect, it } from "vitest";

import { nameCarriesFormat } from "./source-name-format";

describe("nameCarriesFormat", () => {
  it("is true when the name already ends in the extension, whatever its case", () => {
    expect(nameCarriesFormat("Plan.PDF", "pdf")).toBe(true);
    expect(nameCarriesFormat("plan.pdf", "PDF")).toBe(true);
  });

  it("is false for another ending, a name with no extension, or an empty format", () => {
    expect(nameCarriesFormat("plan.docx", "pdf")).toBe(false);
    expect(nameCarriesFormat("pdf", "pdf")).toBe(false);
    expect(nameCarriesFormat("README", "")).toBe(false);
  });
});
