import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LibrarySourceRow } from "@/entities/docs-vault";

import { useLibraryGraphCards } from "./use-library-graph-cards";

type Args = Parameters<typeof useLibraryGraphCards>[0];

function row(name: string, state: LibrarySourceRow["state"]): LibrarySourceRow {
  return { path: `sources/${name}`, name, format: "md", bytes: 1, mtime: 1, state, citedBy: [] };
}

/* Twelve waiting sources come first in list order; the page cites two others, one of them changed. */
const SOURCES = [
  ...Array.from({ length: 12 }, (_, index) => row(`waiting-${index}.md`, "not-compiled")),
  row("changed.md", "stale"),
  row("current.md", "compiled"),
];

function setup(compileSources: Args["compileSources"]) {
  const model = {
    sources: SOURCES,
    wikiPages: [{ slug: "wiki/notes", title: "Notes", sourcePaths: ["sources/changed.md", "sources/current.md"] }],
    pageFacts: new Map(),
    pairing: {
      writeUpsBySource: new Map(),
      originalsByWiki: new Map([
        ["wiki/notes", [
          { path: "sources/changed.md", name: "changed.md", state: "stale" },
          { path: "sources/current.md", name: "current.md", state: "compiled" },
        ]],
      ]),
    },
  } as unknown as Args["model"];
  return renderHook(() =>
    useLibraryGraphCards({
      localVault: { sourceHandles: new Map() } as unknown as Args["localVault"],
      nativeVaultRootPath: "/vault",
      docs: [],
      model,
      agent: { route: "agent" } as unknown as Args["agent"],
      compileSources,
      sources: { handleOpenSource: () => {} } as unknown as Args["sources"],
      turns: { compileBlocked: null, agentOnlyReason: "" } as unknown as Args["turns"],
    }),
  );
}

describe("useLibraryGraphCards", () => {
  it("a stale page's refresh sends the original that changed, not the next waiting batch", () => {
    const compileSources = vi.fn();
    const { result } = setup(compileSources);
    const facts = result.current.cardFacts({ id: "page:wiki/notes", kind: "page", label: "Notes", ref: "wiki/notes", href: null });
    facts?.refresh?.onRequest?.();
    expect(compileSources).toHaveBeenCalledTimes(1);
    expect(compileSources.mock.calls[0]![0].map((source: LibrarySourceRow) => source.path)).toEqual(["sources/changed.md"]);
  });
});
