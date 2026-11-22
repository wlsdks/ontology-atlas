import { describe, expect, it } from "vitest";

import type { LintFinding } from "@/features/library";

import { findingKey, findingKindKey, reportOutline } from "./check-report-outline";

const t = Object.assign((key: string) => key, { has: () => false }) as unknown as Parameters<typeof reportOutline>[3];
const finding = (code: LintFinding["code"]) => ({ code, pages: ["wiki/a", "wiki/b"], summary: "s" }) as LintFinding;

describe("reportOutline", () => {
  it("lists only the agent's ledger when there is no structural half", () => {
    expect(reportOutline(null, [], 0, t).map((entry) => [entry.slug, entry.depth])).toEqual([["report-semantic", 1]]);
  });

  it("counts each kind of finding and the names under the agent's head", () => {
    const outline = reportOutline(null, [finding("superseded"), finding("superseded")], 3, t);
    expect(outline.map((entry) => entry.slug)).toEqual(["report-semantic", "report-superseded", "report-names"]);
    expect(outline[1]!.text).toBe("wiki.findingKind.superseded 2");
    expect(outline[2]!.text).toBe("report.namesTitle 3");
  });
});

describe("findingKey", () => {
  it("joins the kind, the pages and the sentence, and tells two sentences apart", () => {
    expect(findingKey(finding("disagreement"))).toBe("disagreement␟wiki/a,wiki/b␟s");
    expect(findingKey({ ...finding("disagreement"), summary: "other" })).not.toBe(findingKey(finding("disagreement")));
  });
});

describe("findingKindKey", () => {
  it("camel-cases only the missing link", () => {
    expect(findingKindKey("missing-link")).toBe("missingLink");
    expect(findingKindKey("superseded")).toBe("superseded");
  });
});
