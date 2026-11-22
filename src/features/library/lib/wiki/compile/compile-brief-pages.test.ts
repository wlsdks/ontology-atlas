import { describe, expect, it } from "vitest";

import type { LibraryWikiPage, LibrarySourceRow } from "@/entities/docs-vault";

import { isLocallyReadableWikiSlug, oneLine, selectBriefPages } from "./compile-brief-pages";

const page = (slug: string, compiledAt: string | null, sourcePaths: string[] = []): LibraryWikiPage => ({
  slug,
  title: slug,
  sourcePaths,
  createdBy: null,
  compiledAt,
});
const target = (path: string, reviewPages: string[] = []) => ({ path, reviewPages }) as unknown as LibrarySourceRow;
const NOW = Date.parse("2026-11-22T00:00:00Z");
const BIG_BUDGET = 1_000_000;

describe("oneLine", () => {
  it("turns line breaks, control characters and bidirectional overrides into spaces", () => {
    expect(oneLine("a\nb\r\nc‮d\u0007e")).toBe("a b c d e");
  });

  it("keeps ordinary text, including Hangul, as it is", () => {
    expect(oneLine("위키 page")).toBe("위키 page");
  });
});

describe("isLocallyReadableWikiSlug", () => {
  it("accepts a plain page under wiki/", () => {
    expect(isLocallyReadableWikiSlug("wiki/pricing")).toBe(true);
    expect(isLocallyReadableWikiSlug("wiki/team/hiring")).toBe(true);
  });

  it("refuses an address the reader would not open: outside wiki/, hidden, furniture, odd characters", () => {
    for (const slug of ["notes/pricing", "wiki/.hidden", "wiki/_log", "wiki/a//b", "wiki/a#b", "wiki/a?b", "wiki/a\\b", "wiki/a\u0001b"]) {
      expect(isLocallyReadableWikiSlug(slug), slug).toBe(false);
    }
  });

  it("refuses the answers folder and every retained answer inside it", () => {
    expect(isLocallyReadableWikiSlug("wiki/answers")).toBe(false);
    expect(isLocallyReadableWikiSlug("wiki/answers/why-two-clocks")).toBe(false);
  });
});

describe("selectBriefPages", () => {
  it("lists pages citing a requested source or due for review first, then the newest, undated and future-dated last", () => {
    const pages = [
      page("wiki/old", "2026-01-01T00:00:00Z"),
      page("wiki/cites", "2025-01-01T00:00:00Z", ["sources/a.md"]),
      page("wiki/new", "2026-11-01T00:00:00Z"),
      page("wiki/undated", null),
      page("wiki/future", "2027-01-01T00:00:00Z"),
      page("wiki/review", "2025-06-01T00:00:00Z"),
    ];
    const { listed, omitted } = selectBriefPages(pages, [target("sources/a.md", ["wiki/review"])], NOW, BIG_BUDGET);
    expect(listed.map((entry) => entry.page.slug).slice(0, 4)).toEqual(["wiki/cites", "wiki/review", "wiki/new", "wiki/old"]);
    expect(omitted).toBe(0);
  });

  it("stops at the byte budget and counts what it left out", () => {
    const pages = [page("wiki/a", "2026-11-01T00:00:00Z"), page("wiki/b", "2026-10-01T00:00:00Z"), page("wiki/c", "2026-09-01T00:00:00Z")];
    const lineBytes = new TextEncoder().encode(selectBriefPages(pages, [], NOW, BIG_BUDGET).listed[0]!.line).length + 1;
    const { listed, omitted } = selectBriefPages(pages, [], NOW, lineBytes * 2);
    expect(listed.map((entry) => entry.page.slug)).toEqual(["wiki/a", "wiki/b"]);
    expect(omitted).toBe(1);
  });

  it("shows the request's own sources first on a page's line, and how many more it cites", () => {
    const pages = [page("wiki/x", "2026-11-01T00:00:00Z", ["sources/z.md", "sources/m.md", "sources/a.md"])];
    const [line] = selectBriefPages(pages, [target("sources/a.md")], NOW, BIG_BUDGET).listed.map((entry) => entry.line);
    expect(line).toBe("- wiki/x.md — wiki/x — sources/a.md, sources/z.md (+1)");
  });
});
