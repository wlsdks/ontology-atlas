import { describe, expect, it } from "vitest";

import type { LibraryWikiPage } from "@/entities/docs-vault";

import { WikiIndexBuilder, type WikiIndexFacts } from "./wiki-index";

const COUNT = 50_000;
const NOW = Date.parse("2026-11-21T12:00:00Z");
const HOUR = 3_600_000;
/** Measured 2026-11-21 on an M-series Mac: 16 ms CPU to place; a re-sweep of unchanged pages costs a third of that. */
const PLACE_BUDGET_MS = 100;
const RESWEEP_SHARE_OF_PLACE = 0.5;

/** 50,000 pages over 13 sub-folders and the top, 0 to 3 sources, 500 distinct `compiled_at` values. */
function pages(): LibraryWikiPage[] {
  return Array.from({ length: COUNT }, (_, i) => ({
    slug: i % 7 === 0 ? `wiki/folder-${i % 13}/page-${i}` : `wiki/page-${i}`,
    title: `Page ${i}`,
    sourcePaths: Array.from({ length: i % 4 }, (_, k) => `sources/team/document-${i}-${k}.pdf`),
    createdBy: null,
    compiledAt: new Date(NOW - (i % 500) * HOUR).toISOString(),
  }));
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
  const facts: WikiIndexFacts = { verdicts: new Map(), writeUpsBySource: new Map(), findings: [], nowMs: NOW };
  const all = pages();

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

  it("re-sweeps fresh but unchanged page objects for under half of what placing them costs", () => {
    const place = cpuMedianMs(() => {
      const index = new WikiIndexBuilder("en");
      index.retarget(all, facts);
      index.advance();
    });
    const index = new WikiIndexBuilder("en");
    index.retarget(all, facts);
    index.advance();
    const rebuilt = all.map((page) => ({ ...page }));
    const resweep = cpuMedianMs(() => {
      index.retarget(rebuilt, { ...facts });
      index.advance();
    });
    console.info(`wiki index re-sweep: ${resweep.toFixed(1)} ms CPU against ${place.toFixed(1)} ms to place`);
    expect(resweep / place).toBeLessThan(RESWEEP_SHARE_OF_PLACE);
  });
});
