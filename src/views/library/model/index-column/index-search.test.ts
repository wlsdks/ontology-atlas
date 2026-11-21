import { describe, expect, it } from "vitest";

import type { LibrarySourceRow } from "@/entities/docs-vault";

import { narrowSources, pagesMatching, sourcesMatching, type SourceSearchEvidence } from "./index-search";

function source(path: string, state: LibrarySourceRow["state"] = "not-compiled"): LibrarySourceRow {
  return { path, name: path.split("/").pop()!, state, citedBy: [] } as unknown as LibrarySourceRow;
}

const idle: SourceSearchEvidence = { phase: "idle", hits: new Map(), read: new Set() };

describe("sourcesMatching", () => {
  const sources = [source("notes/plan.pdf"), source("notes/memo.docx"), source("readme.md")];

  it("hands back the same array without a needle", () => {
    expect(sourcesMatching(sources, "", idle, null)).toBe(sources);
  });

  it("matches a path, a read hit and an index hit", () => {
    const evidence: SourceSearchEvidence = { ...idle, hits: new Map([["notes/memo.docx", {} as never]]) };
    expect(sourcesMatching(sources, "plan", idle, null).map((row) => row.path)).toEqual(["notes/plan.pdf"]);
    expect(sourcesMatching(sources, "zzz", evidence, null).map((row) => row.path)).toEqual(["notes/memo.docx"]);
    expect(sourcesMatching(sources, "zzz", idle, new Set(["readme.md"])).map((row) => row.path)).toEqual(["readme.md"]);
  });

  it("keeps a file nobody has read yet while the reading phase runs, but never a Markdown one", () => {
    const reading: SourceSearchEvidence = { phase: "reading", hits: new Map(), read: new Set(["notes/memo.docx"]) };
    expect(sourcesMatching(sources, "zzz", reading, null).map((row) => row.path)).toEqual(["notes/plan.pdf"]);
  });
});

describe("pagesMatching", () => {
  const pages = [
    { slug: "wiki/a", title: "Alpha", summary: "about rivers", tags: ["water"] },
    { slug: "wiki/b", title: "Beta" },
  ];

  it("hands back the same array without a needle", () => {
    expect(pagesMatching(pages, "", null)).toBe(pages);
  });

  it("matches title, summary, tag and the app index", () => {
    expect(pagesMatching(pages, "alp", null)).toEqual([pages[0]]);
    expect(pagesMatching(pages, "river", null)).toEqual([pages[0]]);
    expect(pagesMatching(pages, "wat", null)).toEqual([pages[0]]);
    expect(pagesMatching(pages, "zzz", new Set(["wiki/b.md"]))).toEqual([pages[1]]);
  });
});

describe("narrowSources", () => {
  const sources = [source("a.md", "compiled"), source("b.md", "stale"), source("c.md", "stale")];

  it("hands back the same array when nothing narrows it", () => {
    expect(narrowSources(sources, null, null)).toBe(sources);
  });

  it("applies the state and the group together", () => {
    const group = { includes: (row: LibrarySourceRow) => row.path !== "c.md" };
    expect(narrowSources(sources, "stale", null).map((row) => row.path)).toEqual(["b.md", "c.md"]);
    expect(narrowSources(sources, "stale", group).map((row) => row.path)).toEqual(["b.md"]);
    expect(narrowSources(sources, null, group).map((row) => row.path)).toEqual(["a.md", "b.md"]);
  });
});
