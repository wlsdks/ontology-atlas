import { describe, expect, it } from "vitest";

import { stripConventionalPrefix } from "./step-title";

describe("stripConventionalPrefix", () => {
  it("drops the filing code and opens the sentence with a capital", () => {
    expect(stripConventionalPrefix("feat: record the settlement boundary")).toBe("Record the settlement boundary");
    expect(stripConventionalPrefix("fix(settlement)!: invoice numbering follows the ledger")).toBe(
      "Invoice numbering follows the ledger",
    );
  });

  it("keeps a subject written without the code exactly as its author wrote it", () => {
    expect(stripConventionalPrefix("note: keep lower case")).toBe("note: keep lower case");
    expect(stripConventionalPrefix("tidy the order domain")).toBe("tidy the order domain");
  });

  it("leaves a sentence in a script without case alone", () => {
    expect(stripConventionalPrefix("docs: 주문 도메인 설명")).toBe("주문 도메인 설명");
  });
});
