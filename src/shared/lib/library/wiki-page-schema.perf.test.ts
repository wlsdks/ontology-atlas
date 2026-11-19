import { describe, expect, it } from 'vitest';

import { WIKI_PAGE_CASES } from '../../../../tests/fixtures/wiki-page-cases.mjs';
import {
  validateWikiFolder as validateFolderMcp,
  validateWikiPage as validatePageMcp,
} from '../../../../mcp/src/library/wiki-schema.mjs';
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

  /**
   * Openings that never close: each match attempt used to scan to the end of the line or
   * body, so a 320 KB page took 4 s (2026-11-19). Both twins now stop at the next `[`. Measured 2026-11-19 on an M-series Mac: 0-3 ms at the largest size; the budget is
   * far above that and catches a return of the quadratic shape, not machine speed.
   */
  const head = ['---', 'title: t', 'created_by: human', 'compiled_at: 2026-01-01T00:00:00Z', 'sources: []',
    'source_hash: {}', 'status: draft', 'summary: s.', '---', '', '## Summary', '', ''].join('\n');
  const tail = '\n\n## Facts\n\n## Decisions\n\n## Open questions\n\n## Not in sources\n';
  const unclosed = {
    'repeated [[src: on one line': (n: number) => '[[src:'.repeat(n),
    'repeated [[src:sources/ lines': (n: number) => '[[src:sources/a\n'.repeat(n),
    'repeated [[ link openings': (n: number) => '[[a'.repeat(n),
  };
  const judge = (raw: string) => {
    const folder = [{ path: 'wiki/a.md', raw }, { path: 'wiki/b.md', raw: head + tail }];
    validatePageMcp(raw, { knownSources: new Set<string>() });
    validateFolderMcp(folder);
    validateTs(raw, { knownSources: new Set<string>() });
    validateFolderTs(folder);
  };
  const best = (raw: string) => {
    let fastest = Infinity;
    for (let run = 0; run < 5; run += 1) {
      const started = performance.now();
      judge(raw);
      fastest = Math.min(fastest, performance.now() - started);
    }
    return fastest;
  };

  for (const [name, make] of Object.entries(unclosed)) {
    it(`judges a 320 KB page of ${name} well under 500 ms, growing near-linearly`, () => {
      const small = head + make(5000) + tail;
      const large = head + make(20000) + tail;
      const largeMs = best(large);
      // Quadratic growth is 16x for 4x the text, linear about 4x; a floor keeps
      // sub-millisecond timer noise out of the ratio.
      const ratio = largeMs / Math.max(best(small), 0.5);
      console.log(`[wiki-schema perf] ${name}: ${large.length} bytes in ${largeMs.toFixed(1)} ms, ratio ${ratio.toFixed(1)}`);
      expect(largeMs).toBeLessThan(500);
      expect(ratio).toBeLessThan(8);
    });
  }

  /**
   * Every page written from one source: naming every partner was k² findings, 11.8 s and 5.5 GB
   * for 4,000 pages (2026-11-19). Each page now names ten and counts the rest. Measured
   * 2026-11-19: 41 ms for 4,000 pages (MCP); the budget catches the quadratic shape returning.
   * No growth ratio: at tens of milliseconds GC noise swings it from 5 to 12 on one machine.
   */
  it('one source shared by thousands of pages stays linear in both twins', () => {
    const folder = (size: number) =>
      Array.from({ length: size }, (_, index) => ({
        path: `wiki/p-${index}.md`,
        raw: `---\ntitle: p${index}\nsources: [sources/one.pdf]\n---\n\n## Summary\n\nAbout [[wiki/hub]].\n`,
      }));
    const large = folder(4000);
    for (const validate of [validateFolderTs, validateFolderMcp]) {
      validate(large);
      const time = (pages: Array<{ path: string; raw: string }>) => {
        let fastest = Infinity;
        for (let run = 0; run < 5; run += 1) {
          const started = performance.now();
          validate(pages);
          fastest = Math.min(fastest, performance.now() - started);
        }
        return fastest;
      };
      const largeMs = time(large);
      console.log(`[wiki-schema perf] one shared source: 4,000 pages in ${largeMs.toFixed(1)} ms`);
      expect(largeMs).toBeLessThan(1500);
      expect(validate(large)[0]!.problems.length).toBeLessThan(20);
    }
  });
});
