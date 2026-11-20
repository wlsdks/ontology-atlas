import { describe, expect, it } from "vitest";

import type { VaultDoc } from "@/entities/docs-vault";
import { changedSinceWritten, citedSources, pageNeighbours, readerLinkTargets, recordedSourceHashes } from "./wiki-reader-facts";

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

  it("says a source changed only when the page recorded a hash and the bytes now hash to another", () => {
    const written = "a".repeat(64);
    const recorded = recordedSourceHashes({
      source_hash: { "sources/a.md": written, "sources/b.md": "unmeasured", "sources/한.md": written.toUpperCase() },
    });
    expect([...recorded.keys()]).toEqual(["sources/a.md", "sources/한.md"]);
    // No recorded hash: nothing observed, whatever the file is now.
    expect(changedSinceWritten(recorded.get("sources/b.md"), "b".repeat(64))).toBe(false);
    expect(changedSinceWritten(null, "b".repeat(64))).toBe(false);
    // Recorded and equal.
    expect(changedSinceWritten(recorded.get("sources/a.md"), written)).toBe(false);
    // Recorded and different; unmeasured bytes observe nothing.
    expect(changedSinceWritten(recorded.get("sources/a.md"), "b".repeat(64))).toBe(true);
    expect(changedSinceWritten(recorded.get("sources/a.md"), null)).toBe(false);
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
