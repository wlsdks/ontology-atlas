import { describe, expect, it } from 'vitest';
import { manifestToFreshnessIndex } from './use-vault-doc-freshness';
import type { VaultManifest } from '@/entities/docs-vault';

function manifest(docs: Array<{ slug: string; updatedAt: string }>): VaultManifest {
  return {
    version: '1',
    generatedAt: '2026-07-18T00:00:00.000Z',
    docs: docs.map((d) => ({
      slug: d.slug,
      path: `${d.slug}.md`,
      title: d.slug,
      tags: [],
      frontmatter: {},
      headings: [],
      excerpt: '',
      wordCount: 0,
      updatedAt: d.updatedAt,
      linksOut: [],
    })),
    backlinksDetail: {},
    tags: {},
    tree: { name: 'root', path: '', type: 'dir' },
  };
}

describe('manifestToFreshnessIndex', () => {
  it('maps each doc slug to its real updatedAt', () => {
    const index = manifestToFreshnessIndex(
      manifest([
        { slug: 'capabilities/mcp-server', updatedAt: '2026-07-01T00:00:00.000Z' },
        { slug: 'domains/views', updatedAt: '2026-06-15T00:00:00.000Z' },
      ]),
    );
    expect(index.get('capabilities/mcp-server')).toBe('2026-07-01T00:00:00.000Z');
    expect(index.get('domains/views')).toBe('2026-06-15T00:00:00.000Z');
    expect(index.size).toBe(2);
  });

  it('returns an empty map for an empty manifest', () => {
    expect(manifestToFreshnessIndex(manifest([])).size).toBe(0);
  });
});
