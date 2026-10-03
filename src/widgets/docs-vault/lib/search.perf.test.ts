import { describe, expect, it } from 'vitest';
import type { VaultDoc } from '@/entities/docs-vault';
import { buildBodyEntry } from './body-index';
import { searchDocs } from './search';

describe('document search performance', () => {
  it('returns the same top 15 without materializing every body match', () => {
    const docs: VaultDoc[] = Array.from({ length: 5000 }, (_, i) => ({
      slug: `documents/doc-${i}`, path: `documents/doc-${i}.md`, title: `Document ${i}`,
      excerpt: 'needle phrase', tags: [], frontmatter: {}, headings: [], wordCount: 100,
      updatedAt: '2026-01-01', linksOut: [],
    }));
    const bodies = new Map(docs.map((d, i) => [d.slug,
      buildBodyEntry(`${' \n\t'.repeat(i % 50)}needle\nphrase${' \n\t'.repeat(50)}`, d.slug),
    ]));
    searchDocs('needle phrase', docs, 15, bodies);
    searchDocs('needle phrase', docs, Infinity, bodies);
    let bestLimited = Infinity;
    let bestFull = Infinity;
    for (let run = 0; run < 3; run += 1) {
      let start = performance.now();
      const limited = searchDocs('needle phrase', docs, 15, bodies);
      bestLimited = Math.min(bestLimited, performance.now() - start);
      start = performance.now();
      const full = searchDocs('needle phrase', docs, Infinity, bodies);
      bestFull = Math.min(bestFull, performance.now() - start);
      expect(full).toHaveLength(docs.length);
      expect(limited).toHaveLength(15);
      expect(limited).toEqual(full.slice(0, 15));
      expect(limited[0].bodyHit?.text).toContain('needle phrase');
    }
    const ratio = bestFull / bestLimited;
    console.info(`[docs-search] limited=${bestLimited.toFixed(2)}ms exhaustive=${bestFull.toFixed(2)}ms ratio=${ratio.toFixed(2)}`);
    expect(ratio, 'A 15-result search should avoid constructing all 5000 body snippets').toBeGreaterThan(1.4);
  });
});
