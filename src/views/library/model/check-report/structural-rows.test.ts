import { describe, expect, it } from "vitest";

import type { WikiProblemWords } from "@/features/library";

import { pageName, pageSlug, placeSuffix, sentenceShape, sharedRule, type StructuralRow } from "./structural-rows";

function words(overrides: Partial<WikiProblemWords> = {}): WikiProblemWords {
  return {
    code: "uncited-fact",
    sentence: "A fact has no citation.",
    action: "Cite it.",
    where: null,
    targets: [],
    segments: [{ kind: "text", text: "A fact has no citation." }],
    short: false,
    ...overrides,
  } as WikiProblemWords;
}

function row(overrides: Partial<WikiProblemWords> = {}): StructuralRow {
  return { row: {} as StructuralRow["row"], words: words(overrides), places: [] };
}

describe("sentenceShape", () => {
  it("is equal for two sentences that differ only in the named page, and apart when the words differ", () => {
    const named = (id: string) =>
      words({ segments: [{ kind: "text", text: "See " }, { kind: "target", target: { kind: "page", id } }] } as never);
    expect(sentenceShape(named("wiki/a"))).not.toBe(sentenceShape(named("wiki/b")));
    expect(sentenceShape(named("wiki/a"))).toBe(sentenceShape(named("wiki/a")));
    expect(sentenceShape(words({ segments: [{ kind: "text", text: "x" }, { kind: "where" }] } as never))).toBe("tx␟w");
  });
});

describe("sharedRule", () => {
  it("has no rule for no rows", () => {
    expect(sharedRule([])).toEqual({ sentence: null, action: null });
  });

  it("shares the sentence and the action when every row reads alike", () => {
    const rows = [row(), row()];
    expect(sharedRule(rows)).toEqual({ sentence: rows[0], action: "Cite it." });
  });

  it("keeps each row's sentence when a place differs, but still shares one action", () => {
    const rows = [row({ where: { label: "Facts" } as never }), row({ where: { label: "Summary" } as never })];
    expect(sharedRule(rows)).toEqual({ sentence: null, action: "Cite it." });
  });

  it("prints no shared action when one code carries two repairs", () => {
    expect(sharedRule([row(), row({ action: "Add the file." })]).action).toBeNull();
    expect(sharedRule([row({ action: null }), row({ action: null })]).action).toBeNull();
  });
});

describe("placeSuffix", () => {
  it("prefers the line label over the section label", () => {
    expect(placeSuffix({ label: "Facts", lineLabel: "line 12" } as never)).toBe("line 12");
    expect(placeSuffix({ label: "Facts" } as never)).toBe("Facts");
  });
});

describe("page names", () => {
  it("drops the wiki folder for a door and the extension for the reader's slug", () => {
    expect(pageName("wiki/answers/x")).toBe("answers/x");
    expect(pageSlug("wiki/answers/x.md")).toBe("wiki/answers/x");
  });
});
