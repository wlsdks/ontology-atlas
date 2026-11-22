import { describe, expect, it } from 'vitest';
import type { VaultDoc } from '@/entities/docs-vault';
import { buildBodyEntry, type DocsBodyEntry } from './body-index';
import { searchDocs } from './search';

/** Reads of a body's original text, which the phrase match and each snippet take. */
const rawReads = { count: 0 };

function counted(entry: DocsBodyEntry): DocsBodyEntry {
  return new Proxy(entry, {
    get(target, key, receiver) {
      if (key === 'raw') rawReads.count += 1;
      return Reflect.get(target, key, receiver);
    },
  });
}

function rawReadsOf(run: () => void): number {
  rawReads.count = 0;
  run();
  return rawReads.count;
}

describe('document search work', () => {
  it('returns the same top 15 without materializing every body match', () => {
    const docs: VaultDoc[] = Array.from({ length: 5000 }, (_, i) => ({
      slug: `documents/doc-${i}`, path: `documents/doc-${i}.md`, title: `Document ${i}`,
      excerpt: 'needle phrase', tags: [], frontmatter: {}, headings: [], wordCount: 100,
      updatedAt: '2026-01-01', linksOut: [],
    }));
    const bodies = new Map(docs.map((d, i) => [d.slug,
      counted(buildBodyEntry(`${' \n\t'.repeat(i % 50)}needle\nphrase${' \n\t'.repeat(50)}`, d.slug)),
    ]));
    // The first search caches each body's excerpt, one read a body.
    searchDocs('needle phrase', docs, 15, bodies);
    let limited: ReturnType<typeof searchDocs> = [];
    let full: ReturnType<typeof searchDocs> = [];
    const limitedReads = rawReadsOf(() => { limited = searchDocs('needle phrase', docs, 15, bodies); });
    const fullReads = rawReadsOf(() => { full = searchDocs('needle phrase', docs, Infinity, bodies); });
    expect(full).toHaveLength(docs.length);
    expect(limited).toHaveLength(15);
    expect(limited).toEqual(full.slice(0, 15));
    expect(limited[0].bodyHit?.text).toContain('needle phrase');
    // Measured 2026-11-23: 5,015 reads for 15 results and 10,000 for all: one a body to match it, one a snippet.
    expect(fullReads - limitedReads, `${limitedReads} reads for 15 results, ${fullReads} for all`).toBeGreaterThanOrEqual(docs.length - 15);
  });
});
