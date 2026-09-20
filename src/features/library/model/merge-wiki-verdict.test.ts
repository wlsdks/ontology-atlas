import { describe, expect, it } from "vitest";

import { mergeWikiVerdict, type WikiVerdictLike } from "./merge-wiki-verdict";

const fits: WikiVerdictLike = { ok: true, firstProblem: null, firstProblemMessage: null, problemCount: 0, problems: [] };
const problem = (code: string) => ({ code, message: `${code} message` });

describe("mergeWikiVerdict", () => {
  it("keeps an unlinked page on template: an orphan is a shape of the wiki, not of the page", () => {
    const merged = mergeWikiVerdict(fits, [problem("orphan-page")]);
    expect(merged.ok).toBe(true);
    expect(merged.firstProblem).toBe("orphan-page");
    expect(merged.problemCount).toBe(1);
  });

  it("counts a broken link against the page that wrote it", () => {
    expect(mergeWikiVerdict(fits, [problem("dangling-wikilink")]).ok).toBe(false);
  });

  it("names the page's own problem first, before any folder finding", () => {
    const own: WikiVerdictLike = { ...fits, ok: false, firstProblem: "section-order", firstProblemMessage: "m", problemCount: 1, problems: [problem("section-order")] };
    const merged = mergeWikiVerdict(own, [problem("shared-source-unlinked")]);
    expect(merged.ok).toBe(false);
    expect(merged.problems.map((p) => p.code)).toEqual(["section-order", "shared-source-unlinked"]);
  });
});
