import { describe, expect, it } from 'vitest';

import { WIKI_PAGE_CASES } from '../../../tests/fixtures/wiki-page-cases.mjs';
import { validateWikiFolder, validateWikiPage as validateTs } from './wiki-page-schema';

/*
 * Moved from `tests/contract/wiki-page-schema.contract.test.ts` (2026-09-27): a clock read
 * belongs in the `perf` project, one file at a time on its own runner, not in the sharded sweep.
 */
describe('validation stays linear as a folder grows', () => {
  /**
   * The standing perf gates in this repository are set at 1,000 and 5,000 nodes, and a
   * library grows the same way — one page per document somebody brings in. Validation
   * has to stay something a list can do while it draws, so this measures the whole
   * thousand at once and the Docs sidebar then does it one row at a time, cached by
   * mtime.
   *
   * Measured 2026-09-05 on the development machine: **1,000 pages in 34 ms** through this
   * suite (median of three runs; the MCP twin run directly under node measured 10 ms)
   * against this 1.5 s budget. The budget is deliberately ~40× the measured number — it
   * exists to catch a change of *shape*, such as a validator that starts reading the
   * folder or re-scanning quadratically, not to police a few milliseconds across
   * machines.
   */
  it('validates 1,000 pages well under 1.5 s', () => {
    const complete = WIKI_PAGE_CASES.find((c) => c.expectedOk)!;
    const pages = Array.from({ length: 1000 }, (_, index) =>
      complete.input.replace('title: Quarter plan', `title: Quarter plan ${index}`),
    );
    const runs: number[] = [];
    for (let run = 0; run < 3; run += 1) {
      const started = performance.now();
      for (const page of pages) validateTs(page);
      runs.push(performance.now() - started);
    }
    const median = runs.sort((a, b) => a - b)[1]!;
    expect(median).toBeLessThan(1500);
  });

  /**
   * The folder check pairs pages by shared primary source. It used to compare every
   * pair (O(P²)); indexed by source it is O(P + Σ kₛ²), where kₛ is the number of
   * pages listing source s. Four pages per source here, as a Library grows: a
   * quadratic check makes 4× the pages cost 16× the time; a near-linear one about 4×.
   * A ratio in one run, so a loaded machine slows both sizes alike.
   */
  it('folder check grows near-linearly', () => {
    const folder = (size: number) =>
      Array.from({ length: size }, (_, index) => {
        const name = `page-${index}`;
        const source = `sources/doc-${Math.floor(index / 4)}.pdf`;
        const next = `wiki/page-${(index + 1) % size}`;
        const raw = [
          '---',
          `title: ${name}`,
          'created_by: agent:claude',
          'compiled_at: 2026-09-06T10:00:00Z',
          'sources:',
          `  - ${source}`,
          'source_hash:',
          `  ${source}: 3b1f0a00000000000000000000000000000000000000000000000000000000ab`,
          'status: draft',
          `summary: About ${name}.`,
          '---',
          '',
          '## Summary',
          '',
          `${name}. See [[${next}]].`,
          '',
          '## Facts',
          '',
          `- A fact. [[src:${source}#p2]]`,
          '',
          '## Decisions',
          '',
          '## Open questions',
          '',
          '## Not in sources',
          '',
        ].join('\n');
        return { path: `wiki/${name}.md`, raw };
      });
    // Per-call time over a sample of several calls, so one sample lasts long enough
    // that a scheduler slice or a collection pause is a small part of it.
    const time = (pages: Array<{ path: string; raw: string }>, calls: number) => {
      const started = performance.now();
      for (let call = 0; call < calls; call += 1) validateWikiFolder(pages);
      return (performance.now() - started) / calls;
    };
    const small = folder(1000);
    const large = folder(4000);
    time(small, 8);
    time(large, 2);
    // Interleaved, fastest sample of each: both sizes see the same machine load, and
    // the fastest sample is the one it disturbed least.
    let smallBest = Infinity;
    let largeBest = Infinity;
    for (let round = 0; round < 5; round += 1) {
      smallBest = Math.min(smallBest, time(small, 8));
      largeBest = Math.min(largeBest, time(large, 2));
    }
    const ratio = largeBest / smallBest;
    expect(ratio).toBeLessThan(8);
  });
});
