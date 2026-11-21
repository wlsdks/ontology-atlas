import { describe, expect, it } from "vitest";

import type { LibraryWikiPage } from "@/entities/docs-vault";

import { selectRecentPages } from "./recent-pages";

const UTC = () => 0;
const day = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

function page(slug: string, compiledAt: string | null): LibraryWikiPage {
  return { slug, title: slug, sourcePaths: [`sources/${slug}.md`], createdBy: null, compiledAt };
}

describe("selectRecentPages", () => {
  it("keeps the five newest believed pages, newest first, and no undated or future page", () => {
    const pages = [
      page("a", "2026-11-01"),
      page("b", "2026-11-20T09:00:00Z"),
      page("c", "2026-11-20T18:00:00Z"),
      page("future", "2026-12-25"),
      page("undated", null),
      page("garbled", "last week"),
      page("d", "2026-10-02"),
      page("e", "2026-11-19"),
      page("f", "2026-11-18"),
    ];
    const recent = selectRecentPages(pages, day("2026-11-21"), UTC);
    expect(recent.pages.map((entry) => entry.page.slug)).toEqual(["c", "b", "e", "f", "a"]);
    expect(recent.anyPage).toBe(true);
  });

  it("is empty but knows pages exist when none is dated", () => {
    expect(selectRecentPages([page("x", null)], day("2026-11-21"), UTC)).toEqual({ pages: [], anyPage: true });
  });
});
