import { describe, expect, it } from "vitest";

import type { LibraryWikiPage, LibraryWriteUpLink } from "@/entities/docs-vault";

import { WikiIndexBuilder, type WikiIndexFacts } from "./wiki-index";

const COUNT = 50_000;
const NOW = Date.parse("2026-11-21T12:00:00Z");
const HOUR = 3_600_000;
/** Measured 2026-11-21 on an M-series Mac: 23 ms CPU to place; a re-sweep of rebuilt, unchanged facts costs 0.3 of that. */
const PLACE_BUDGET_MS = 100;
const RESWEEP_SHARE_OF_PLACE = 0.5;

const SHARED_SOURCE = "sources/team/handbook.pdf";

/** 50,000 pages over 13 sub-folders and the top, 1 to 4 sources one of them shared by all, 500 `compiled_at` values. */
function pages(): LibraryWikiPage[] {
  return Array.from({ length: COUNT }, (_, i) => ({
    slug: i % 7 === 0 ? `wiki/folder-${i % 13}/page-${i}` : `wiki/page-${i}`,
    title: `Page ${i}`,
    sourcePaths: [SHARED_SOURCE, ...Array.from({ length: i % 4 }, (_, k) => `sources/team/document-${i}-${k}.pdf`)],
    createdBy: null,
    compiledAt: new Date(NOW - (i % 500) * HOUR).toISOString(),
  }));
}

/** Rebuilt per batch as the library model rebuilds them: fresh maps and fresh verdict objects. */
function factsFor(all: readonly LibraryWikiPage[]): WikiIndexFacts {
  const shared: LibraryWriteUpLink[] = all.map((page, i) => ({ slug: page.slug, title: page.title, freshness: i % 9 === 0 ? "behind" : "current" }));
  return {
    verdicts: new Map(all.map((page) => [page.slug, { problems: [] }])),
    writeUpsBySource: new Map([[SHARED_SOURCE, shared]]),
    findings: [],
    nowMs: NOW,
  };
}

function cpuMedianMs(run: () => void): number {
  for (let warm = 0; warm < 3; warm += 1) run();
  const runs: number[] = [];
  for (let i = 0; i < 5; i += 1) {
    const started = process.cpuUsage();
    run();
    const used = process.cpuUsage(started);
    runs.push((used.user + used.system) / 1000);
  }
  return [...runs].sort((a, b) => a - b)[2]!;
}

describe("the wiki index at 50,000 pages", () => {
  const all = pages();
  const facts = factsFor(all);

  it("places every page within its budget", () => {
    const median = cpuMedianMs(() => {
      const index = new WikiIndexBuilder("en");
      index.retarget(all, facts);
      index.advance();
      index.groups();
    });
    console.info(`wiki index place: ${median.toFixed(1)} ms CPU for ${COUNT} pages`);
    expect(median).toBeLessThan(PLACE_BUDGET_MS);
  });

  it("re-sweeps fresh but unchanged pages and facts for under half of what placing them costs", () => {
    const place = cpuMedianMs(() => {
      const index = new WikiIndexBuilder("en");
      index.retarget(all, facts);
      index.advance();
    });
    const index = new WikiIndexBuilder("en");
    index.retarget(all, facts);
    index.advance();
    const rebuilt = all.map((page) => ({ ...page }));
    // One fresh set per run, built outside the timed region: the model pays for these, not the index.
    const batches = Array.from({ length: 8 }, () => factsFor(rebuilt));
    const resweep = cpuMedianMs(() => {
      index.retarget(rebuilt, batches.pop()!);
      index.advance();
    });
    console.info(`wiki index re-sweep: ${resweep.toFixed(1)} ms CPU against ${place.toFixed(1)} ms to place`);
    expect(resweep / place).toBeLessThan(RESWEEP_SHARE_OF_PLACE);
  });
});
