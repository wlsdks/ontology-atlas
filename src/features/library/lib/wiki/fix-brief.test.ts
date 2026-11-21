import { describe, expect, it } from "vitest";

import { buildFixBrief } from "./fix-brief";

describe("buildFixBrief", () => {
  const finding = { code: "disagreement" as const, pages: ["wiki/charter", "wiki/risk-register"], summary: "Budget 240,000 vs 210,000." };

  it("names the pages and holds the writer to both values with both citations", () => {
    const brief = buildFixBrief({ finding, locale: "en", vaultRoot: "/v/atlas" });
    expect(brief).toContain("Pages to fix: wiki/charter.md, wiki/risk-register.md");
    expect(brief).toContain("two pages disagree on a value. Budget 240,000 vs 210,000.");
    expect(brief).toContain("do not pick a side");
    expect(brief).toContain("Touch no file outside those pages.");
  });

  it("speaks the screen's language and adapts the instruction to the code", () => {
    const brief = buildFixBrief({ finding: { code: "missing-link", pages: ["wiki/a", "wiki/b"], summary: "같은 자료" }, locale: "ko", vaultRoot: "/v" });
    expect(brief).toContain("서로 링크가 없습니다");
    expect(brief).toContain("[[wiki/<슬러그>]]");
  });
});
