import { describe, expect, it } from "vitest";

import type { WikiIndexEntry, WikiIndexItem } from "../../lib/wiki/wiki-index";
import { arrivalStep, groupLabel, itemKey, wikiRowText } from "./wiki-index-rows";

const t = Object.assign(
  (key: string, values?: Record<string, unknown>) => (values ? `${key}${JSON.stringify(values)}` : key),
  { has: (key: string) => key === "report.rule.uncited-fact" },
) as unknown as Parameters<typeof groupLabel>[1];

function entry(overrides: Partial<WikiIndexEntry> & { sourcePaths?: string[]; summary?: string } = {}): WikiIndexEntry {
  const { sourcePaths = [], summary, ...rest } = overrides;
  return {
    page: { slug: "wiki/a", title: "Alpha", sourcePaths, createdBy: null, compiledAt: null, summary },
    title: "Alpha",
    writtenAtMs: Number.NaN,
    home: "one",
    reasons: [],
    ...rest,
  } as WikiIndexEntry;
}

describe("groupLabel", () => {
  it("shows a folder group as its folder and any other group by its catalogue name", () => {
    expect(groupLabel("folder:notes/2026", t)).toBe("notes/2026/");
    expect(groupLabel("attention", t)).toBe("wikiIndex.group.attention");
  });
});

describe("wikiRowText", () => {
  const input = { nowMs: 0, locale: "en", t };

  it("names the source file of a page with one source, a count for several, and none when it has none", () => {
    expect(wikiRowText({ ...input, group: "one", entry: entry({ sourcePaths: ["docs/plan.pdf"] }) }).detail).toBe("plan.pdf");
    expect(wikiRowText({ ...input, group: "several", entry: entry({ sourcePaths: ["a", "b"] }) }).detail).toBe('wikiIndex.row.sources{"count":2}');
    expect(wikiRowText({ ...input, group: "none", entry: entry() }).detail).toBe("wikiIndex.row.noSource");
  });

  it("leads an attention row with its first reason and counts the rest", () => {
    const reasons = [{ kind: "stale" }, { kind: "rule", code: "uncited-fact" }, { kind: "rule", code: "made-up" }] as const;
    const text = wikiRowText({ ...input, group: "attention", entry: entry({ reasons }) });
    expect(text.needsLook).toBe(true);
    expect(text.detail).toBe('wikiIndex.row.moreReasons{"reason":"wikiIndex.reason.stale","count":2}');
    expect(text.label).toContain("report.rule.uncited-fact, made-up");
  });

  it("gives a page nobody needs to look at no attention mark, and its label drops empty parts", () => {
    const text = wikiRowText({ ...input, group: "one", entry: entry({ sourcePaths: ["x/y.md"], summary: "About y" }) });
    expect(text.needsLook).toBe(false);
    expect(text.label).toBe("Alpha · About y · y.md");
    expect(text.date).toBeNull();
  });
});

describe("itemKey", () => {
  it("keys a row by its page and the others by kind and group, so one page in two groups stays two keys", () => {
    const row = (group: WikiIndexItem["group"]): WikiIndexItem => ({ type: "row", group, entry: entry() });
    expect(itemKey(row("attention"))).not.toBe(itemKey(row("one")));
    expect(itemKey({ type: "heading", group: "one", count: 1 })).not.toBe(itemKey({ type: "more", group: "one", count: 1 }));
  });
});

describe("arrivalStep", () => {
  it("orders attention, answers, folders and the rest", () => {
    expect(["attention", "answers", "folder:x", "several"].map((group) => arrivalStep(group as never))).toEqual([0, 1, 2, 3]);
  });
});
