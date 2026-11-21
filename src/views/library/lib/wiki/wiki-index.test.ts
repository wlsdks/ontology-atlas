import { describe, expect, it } from "vitest";

import type { LibraryWikiPage, LibraryWriteUpLink } from "@/entities/docs-vault";
import type { LintFinding } from "@/features/library";

import {
  WIKI_INDEX_FULL_LIMIT,
  WikiIndexBuilder,
  parseWrittenAt,
  wikiIndexDay,
  wikiIndexItems,
  type WikiIndexFacts,
  type WikiIndexGroupView,
} from "./wiki-index";

const NOW = new Date(2026, 10, 21, 15, 0, 0).getTime();
const HOUR = 3_600_000;

function page(slug: string, sources: number, hoursAgo: number | null, title = slug.slice(slug.lastIndexOf("/") + 1)): LibraryWikiPage {
  return {
    slug,
    title,
    sourcePaths: Array.from({ length: sources }, (_, i) => `sources/${slug}-${i}.md`),
    createdBy: null,
    compiledAt: hoursAgo === null ? null : new Date(NOW - hoursAgo * HOUR).toISOString(),
  };
}

function facts(over: Partial<WikiIndexFacts> = {}): WikiIndexFacts {
  return { verdicts: new Map(), writeUpsBySource: new Map(), findings: [], nowMs: NOW, ...over };
}

function build(pages: readonly LibraryWikiPage[], given: WikiIndexFacts = facts()): WikiIndexBuilder {
  const index = new WikiIndexBuilder("en");
  index.retarget(pages, given);
  index.advance();
  return index;
}

const shape = (groups: readonly WikiIndexGroupView[]) =>
  groups.map((group) => [group.key, group.entries.map((entry) => entry.page.slug)]);

describe("the wiki index's groups", () => {
  it("puts pages that need a look first, then answers, sub-folders A to Z, and pages by source count", () => {
    const pages = [
      page("wiki/none", 0, 1),
      page("wiki/one", 1, 1),
      page("wiki/several", 3, 1),
      page("wiki/meetings/standup", 1, 1),
      page("wiki/answers/refund-window", 2, 1),
      page("wiki/contracts/acme", 1, 1),
      page("wiki/contracts/deep/older", 1, 1),
      page("wiki/stale", 1, 2),
    ];
    const stale: LibraryWriteUpLink[] = [{ slug: "wiki/stale", title: "stale", freshness: "behind" }];
    const index = build(pages, facts({ writeUpsBySource: new Map([["sources/wiki/stale-0.md", stale]]) }));

    expect(shape(index.groups())).toEqual([
      ["attention", ["wiki/stale"]],
      ["answers", ["wiki/answers/refund-window"]],
      ["folder:contracts", ["wiki/contracts/acme", "wiki/contracts/deep/older"]],
      ["folder:meetings", ["wiki/meetings/standup"]],
      ["several", ["wiki/several"]],
      ["one", ["wiki/one", "wiki/stale"]],
      ["none", ["wiki/none"]],
    ]);
  });

  it("gives each page that needs a look its plain reasons, most serious first, and leaves advisory codes out", () => {
    const pages = [page("wiki/carrier-terms", 2, 1), page("wiki/lonely", 1, 1)];
    const verdicts = new Map([
      ["wiki/carrier-terms", { problems: [{ code: "dangling-wikilink" }, { code: "missing-field:title" }, { code: "uncited-fact" }, { code: "missing-field:summary" }] }],
      ["wiki/lonely", { problems: [{ code: "orphan-page" }, { code: "shared-source-unlinked" }] }],
    ]);
    const findings: LintFinding[] = [
      { code: "missing-link", pages: ["wiki/carrier-terms"], summary: "x" },
      { code: "superseded", pages: ["carrier-terms"], summary: "y" },
      { code: "disagreement", pages: ["wiki/carrier-terms", "wiki/other"], summary: "z" },
    ];
    const stale: LibraryWriteUpLink[] = [{ slug: "wiki/carrier-terms", title: "", freshness: "behind" }];
    const index = build(pages, facts({ verdicts, findings, writeUpsBySource: new Map([["sources/wiki/carrier-terms-1.md", stale]]) }));

    const attention = index.groups()[0]!;
    expect(attention.key).toBe("attention");
    expect(attention.entries.map((entry) => entry.page.slug)).toEqual(["wiki/carrier-terms"]);
    expect(attention.entries[0]!.reasons).toEqual([
      { kind: "disagreement" },
      { kind: "superseded" },
      { kind: "stale" },
      { kind: "rule", code: "uncited-fact" },
      { kind: "rule", code: "missing-field" },
      { kind: "rule", code: "dangling-wikilink" },
      { kind: "missingLink" },
    ]);
  });

  it("orders a group newest first, undated and future pages last, then by title with NFD and NFC Hangul as one", () => {
    const decomposed = "가격 정책".normalize("NFD");
    const pages = [
      page("wiki/old", 1, 48, "Old"),
      page("wiki/undated", 1, null, "Undated"),
      page("wiki/future", 1, -48, "Future"),
      page("wiki/nfd", 1, 5, decomposed),
      page("wiki/new", 1, 5, "Alpha"),
      page("wiki/nfc", 1, 5, "가나"),
    ];
    const [one] = build(pages).groups();
    expect(one!.entries.map((entry) => entry.page.slug)).toEqual(["wiki/new", "wiki/nfd", "wiki/nfc", "wiki/old", "wiki/future", "wiki/undated"]);
    expect(one!.entries.find((entry) => entry.page.slug === "wiki/nfd")!.title).toBe("가격 정책".normalize("NFC"));
  });
});

describe("the index's caps", () => {
  it(`lists every row at ${WIKI_INDEX_FULL_LIMIT} pages, and above that each group's five newest and its count`, () => {
    const full = Array.from({ length: WIKI_INDEX_FULL_LIMIT }, (_, i) => page(`wiki/p${i}`, 1, i + 1));
    expect(build(full).groups()[0]!.entries).toHaveLength(WIKI_INDEX_FULL_LIMIT);

    const over = [...full, page("wiki/newest", 1, 0.5)];
    const [one] = build(over).groups();
    expect(one!.count).toBe(WIKI_INDEX_FULL_LIMIT + 1);
    expect(one!.entries.map((entry) => entry.page.slug)).toEqual(["wiki/newest", "wiki/p0", "wiki/p1", "wiki/p2", "wiki/p3"]);
    expect(wikiIndexItems([one!]).map((item) => item.type)).toEqual(["heading", "row", "row", "row", "row", "row", "more"]);
  });

  it("opens a capped group whole, newest first", () => {
    const pages = Array.from({ length: WIKI_INDEX_FULL_LIMIT + 10 }, (_, i) => page(`wiki/p${i}`, 1, i));
    const whole = build(pages).group("one")!;
    expect(whole.entries).toHaveLength(WIKI_INDEX_FULL_LIMIT + 10);
    expect(whole.entries[whole.entries.length - 1]!.page.slug).toBe(`wiki/p${WIKI_INDEX_FULL_LIMIT + 9}`);
  });

  it("refills the five newest when one of them leaves the folder", () => {
    const pages = Array.from({ length: WIKI_INDEX_FULL_LIMIT + 10 }, (_, i) => page(`wiki/p${i}`, 1, i));
    const index = build(pages);
    index.retarget(pages.slice(1), facts());
    index.advance();
    expect(index.groups()[0]!.entries.map((entry) => entry.page.slug)).toEqual(["wiki/p1", "wiki/p2", "wiki/p3", "wiki/p4", "wiki/p5"]);
  });
});

describe("the index's updates", () => {
  it("reads only the new batch: unchanged pages keep their entries", () => {
    const first = Array.from({ length: 300 }, (_, i) => page(`wiki/p${i}`, 1, i + 1));
    const index = build(first);
    const before = index.group("one")!.entries;
    const keptEntry = before.find((entry) => entry.page.slug === "wiki/p7")!;

    // A fresh array of fresh objects, as each walk batch rebuilds the model.
    const next = [...first.map((p) => ({ ...p })), page("wiki/written-now", 1, 0)];
    index.retarget(next, facts());
    index.advance();

    const after = index.group("one")!.entries;
    expect(after[0]!.page.slug).toBe("wiki/written-now");
    expect(after.find((entry) => entry.page.slug === "wiki/p7")).toBe(keptEntry);
    expect(index.group("one")!.count).toBe(301);
  });

  it("moves a page into Needs a look when its check result arrives, and keeps it in its own group", () => {
    const pages = [page("wiki/a", 1, 1), page("wiki/b", 1, 2)];
    const index = build(pages);
    expect(index.group("attention")).toBeNull();
    index.retarget(pages, facts({ verdicts: new Map([["wiki/b", { problems: [{ code: "uncited-fact" }] }]]) }));
    index.advance();
    expect(shape(index.groups())).toEqual([["attention", ["wiki/b"]], ["one", ["wiki/a", "wiki/b"]]]);
  });

  it("stops at its deadline and resumes where it stopped", () => {
    const pages = Array.from({ length: 1000 }, (_, i) => page(`wiki/p${i}`, 1, i));
    const index = new WikiIndexBuilder("en");
    index.retarget(pages, facts());
    const first = index.advance(() => true);
    expect(first.done).toBe(false);
    expect(first.cursor).toBeLessThan(pages.length);
    expect(index.size).toBe(first.cursor);
    expect(index.advance().done).toBe(true);
    expect(index.size).toBe(1000);
  });
});

describe("a row's date", () => {
  it("reads as just now, today, yesterday, days ago, then a date", () => {
    expect(wikiIndexDay(NOW - 60_000, NOW)).toEqual({ kind: "now" });
    expect(wikiIndexDay(NOW - 2 * HOUR, NOW)).toEqual({ kind: "today" });
    expect(wikiIndexDay(NOW - 24 * HOUR, NOW)).toEqual({ kind: "yesterday" });
    expect(wikiIndexDay(NOW - 6 * 24 * HOUR, NOW)).toEqual({ kind: "ago", days: 6 });
    expect(wikiIndexDay(NOW - 7 * 24 * HOUR, NOW)).toMatchObject({ kind: "date", otherYear: false });
    expect(wikiIndexDay(Number.NaN, NOW)).toBeNull();
  });

  it("treats a bare date as that local day and a future or broken one as undated", () => {
    expect(wikiIndexDay(parseWrittenAt("2026-11-21", NOW), NOW)).toEqual({ kind: "today" });
    expect(parseWrittenAt("2026-12-30", NOW)).toBeNaN();
    expect(parseWrittenAt("someday", NOW)).toBeNaN();
  });
});
