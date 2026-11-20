import { describe, expect, it } from "vitest";

import type { VaultDoc } from "@/entities/docs-vault";
import { rewriteWikilinks } from "@/shared/lib/library/source-citation";
import { citationCounts, citedSources, pageNeighbours, readerLinkTargets } from "./wiki-reader-facts";

function doc(slug: string, title: string, extra: Partial<VaultDoc> = {}): VaultDoc {
  return {
    slug, path: `${slug}.md`, title, tags: [], frontmatter: {}, headings: [], excerpt: "",
    wordCount: 0, updatedAt: "2026-11-20", linksOut: [], ...extra,
  };
}

describe("the Wiki reader's facts", () => {
  const docs = [
    doc("wiki/returns", "Return policy", {
      linksOut: ["wiki/settlement", "capabilities/refunds", "wiki/returns"],
      frontmatter: { describes: ["domains/payments"] },
    }),
    doc("wiki/settlement", "Settlement check", { linksOut: ["wiki/returns"] }),
    doc("wiki/archive", "Archive", { linksOut: ["wiki/settlement"] }),
    doc("capabilities/refunds", "Refunds", { frontmatter: { kind: "capability", display_ko: "환불" } }),
    doc("domains/payments", "Payments", { frontmatter: { kind: "domain" } }),
    doc("capabilities/unrelated", "Unrelated", { frontmatter: { kind: "capability" }, linksOut: ["wiki/returns"] }),
  ];

  it("names every document from the listing, a concept as the map names it in the locale", () => {
    const targets = readerLinkTargets(docs, "ko");
    expect(targets.get("wiki/settlement")).toEqual({ title: "Settlement check", kind: null });
    expect(targets.get("capabilities/refunds")).toEqual({ title: "환불", kind: "capability" });
  });

  it("finds the pages linking here and the concepts named, never the page itself or a concept linking in", () => {
    const { linkedFrom, concepts } = pageNeighbours("wiki/returns", docs, readerLinkTargets(docs, "en"));
    expect(linkedFrom.map((link) => link.slug)).toEqual(["wiki/settlement"]);
    expect(concepts.map((link) => [link.slug, link.kind])).toEqual([
      ["domains/payments", "domain"],
      ["capabilities/refunds", "capability"],
    ]);
  });

  it("counts citations per file from the body the viewer painted", () => {
    const painted = rewriteWikilinks([
      "- A. [[src:sources/a.md#l2]] [[src:sources/a.md#l3|the third line]]",
      "- B. [[src:sources/%ED%95%9C.md#l1]] and [[wiki/settlement]]",
    ].join("\n"));
    expect(citationCounts(painted)).toEqual(new Map([["sources/a.md", 2], ["sources/한.md", 1]]));
  });

  it("lists the frontmatter's sources first, then any the body cites beyond them, with their counts", () => {
    const rows = citedSources(
      [{ path: "sources/a.md", name: "a.md", state: "compiled" }, { path: "sources/gone.md", name: "gone.md", state: null }],
      new Map([["sources/a.md", 2], ["sources/b.md", 1]]),
      (path) => path === "sources/b.md",
    );
    expect(rows).toEqual([
      { path: "sources/a.md", name: "a.md", count: 2, present: true },
      { path: "sources/gone.md", name: "gone.md", count: 0, present: false },
      { path: "sources/b.md", name: "b.md", count: 1, present: true },
    ]);
  });
});
