import { describe, expect, it } from 'vitest';
import { manifestToFreshnessIndex, pendingDocPaths, resolveDocChangeDates } from './use-vault-doc-freshness';
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

/*
 * The defect this answers (measured 2026-09-25 through the app's bridge): a vault built by
 * `git archive` and committed with dates one to four days back carries today's date on every
 * file, and the lens read 98 of 98 concepts as changed in the last day. Git said one uncommitted
 * edit and one commit from yesterday.
 */
describe('resolveDocChangeDates', () => {
  const landedToday = '2026-09-26T00:30:00.000Z';
  const docs = manifest([
    { slug: 'capabilities/vault-git-history', updatedAt: landedToday },
    { slug: 'capabilities/library-workspace', updatedAt: landedToday },
    { slug: 'domains/human-workbench', updatedAt: landedToday },
    { slug: 'capabilities/brand-new', updatedAt: landedToday },
  ]).docs;
  const git = {
    committedAt: new Map<string, string | null>([
      ['capabilities/vault-git-history.md', '2026-09-24T11:15:00+09:00'],
      ['capabilities/library-workspace.md', '2026-09-22T10:05:00+09:00'],
      ['domains/human-workbench.md', '2026-09-25T16:40:00+09:00'],
      ['capabilities/brand-new.md', null],
    ]),
    pending: new Set(['capabilities/library-workspace.md', 'capabilities/brand-new.md']),
  };

  it('dates a document Git shows untouched by its last commit, not by the file', () => {
    const dates = resolveDocChangeDates(docs, git);
    expect(dates.get('capabilities/vault-git-history')).toBe('2026-09-24T11:15:00+09:00');
    expect(dates.get('domains/human-workbench')).toBe('2026-09-25T16:40:00+09:00');
  });

  it('dates a document changed since its last commit, or never committed, by its file', () => {
    const dates = resolveDocChangeDates(docs, git);
    expect(dates.get('capabilities/library-workspace')).toBe(landedToday);
    expect(dates.get('capabilities/brand-new')).toBe(landedToday);
  });

  it('keeps the file date for a document the walk never reached', () => {
    const dates = resolveDocChangeDates(docs, { committedAt: new Map(), pending: new Set() });
    expect(dates.get('capabilities/vault-git-history')).toBe(landedToday);
  });
});

describe('pendingDocPaths', () => {
  const docPaths = ['capabilities/a.md', 'capabilities/x/a.md', 'domains/d.md', 'README.md'];

  it('matches the paths Git names from the repository root to the vault documents', () => {
    expect(pendingDocPaths(['capabilities/a.md', 'domains/d.md'], docPaths)).toEqual(new Set(['capabilities/a.md', 'domains/d.md']));
    // A vault inside a repository (`<project>/atlas`).
    expect(pendingDocPaths(['atlas/capabilities/a.md', 'atlas/sources/notes.txt'], docPaths)).toEqual(new Set(['capabilities/a.md']));
  });

  it('matches whole trailing segments, the longest document path first', () => {
    expect(pendingDocPaths(['atlas/capabilities/x/a.md'], docPaths)).toEqual(new Set(['capabilities/x/a.md']));
    expect(pendingDocPaths(['atlas/xcapabilities/a.md'], docPaths)).toEqual(new Set());
  });
});
