import { describe, expect, it } from 'vitest';

import { WIKI_PAGE_CASES } from '../../../../tests/fixtures/wiki-page-cases.mjs';
import { validateWikiFolder as validateFolderMcp } from '../../../../mcp/src/wiki-schema.mjs';
import { validateWikiFolder as validateFolderTs, validateWikiPage as validateTs } from './wiki-page-schema';

describe('validation stays linear as a folder grows', () => {
  /**
   * The budget is far above the expected time: it catches a change of shape (a validator that reads
   * the folder or rescans quadratically), not a few milliseconds across machines.
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

  /** Four pages per source: quadratic growth is 16x, near-linear about 4x. */
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
    const small = folder(1000);
    const large = folder(4000);
    for (const validate of [validateFolderTs, validateFolderMcp]) {
      const time = (pages: Array<{ path: string; raw: string }>, calls: number) => {
        const started = performance.now();
        for (let call = 0; call < calls; call += 1) validate(pages);
        return (performance.now() - started) / calls;
      };
      time(small, 8);
      time(large, 2);
      let smallBest = Infinity;
      let largeBest = Infinity;
      for (let round = 0; round < 5; round += 1) {
        smallBest = Math.min(smallBest, time(small, 8));
        largeBest = Math.min(largeBest, time(large, 2));
      }
      expect(largeBest / smallBest).toBeLessThan(8);
    }
  });
});
