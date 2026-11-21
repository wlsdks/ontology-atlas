import { describe, expect, it } from "vitest";

import type { LibrarySourceRow } from "@/entities/docs-vault";

import { overviewNextBatch } from "./overview-next-batch";

function row(i: number, state: LibrarySourceRow["state"] = "not-compiled"): LibrarySourceRow {
  return { path: `sources/f-${i}.md`, name: `f-${i}.md`, format: "md", bytes: 1, mtime: 0, state, citedBy: [] };
}

const sources = Array.from({ length: 30 }, (_, i) => row(i));
const batch = (next: readonly LibrarySourceRow[], running: readonly LibrarySourceRow[], rest: number) => ({
  next, running: new Set(running.map((source) => source.path)), rest, returned: 0, start: () => {},
});

describe("overviewNextBatch", () => {
  it("is the band's batch while nothing is being written", () => {
    const idle = batch(sources.slice(0, 10), [], 20);
    expect(overviewNextBatch(sources, idle)).toBe(idle);
  });

  it("lists the files still being written first, then the next press, ten in all", () => {
    const shown = overviewNextBatch(sources, batch(sources.slice(10, 20), sources.slice(0, 10), 20));
    expect(shown.next.map((source) => source.path)).toEqual(sources.slice(0, 10).map((source) => source.path));
    expect(shown.rest).toBe(20);
  });

  it("drops a file once its page lands, and the next one joins at the bottom", () => {
    const landed = sources.map((source, i) => (i === 0 ? { ...source, state: "compiled" as const } : source));
    const shown = overviewNextBatch(landed, batch(landed.slice(10, 20), landed.slice(0, 10), 20));
    expect(shown.next[0]!.path).toBe("sources/f-1.md");
    expect(shown.next.at(-1)!.path).toBe("sources/f-10.md");
    expect(shown.rest).toBe(19);
  });
});
