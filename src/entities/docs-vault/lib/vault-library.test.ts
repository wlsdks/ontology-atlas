import { describe, expect, it } from 'vitest';

import {
  buildLibraryModel,
  collectWikiCitations,
  deriveSourceState,
  formatSourceBytes,
  isWikiPage,
  selectWikiPages,
} from './vault-library';
import type { VaultDoc, VaultSourceFile } from '../model/types';

function doc(slug: string, frontmatter: Record<string, unknown>): VaultDoc {
  return {
    slug,
    path: `${slug}.md`,
    title: slug.split('/').pop() ?? slug,
    tags: [],
    frontmatter,
    headings: [],
    excerpt: '',
    wordCount: 0,
    updatedAt: '2026-09-05T00:00:00.000Z',
    linksOut: [],
  };
}

function source(path: string, over: Partial<VaultSourceFile> = {}): VaultSourceFile {
  return {
    path,
    name: path.split('/').pop() ?? path,
    format: 'pdf',
    bytes: 1024,
    mtime: 1_757_000_000_000,
    ...over,
  };
}

const HASH = '3b1f0a'.padEnd(64, '0');
const OTHER_HASH = 'ffffff'.padEnd(64, '0');

describe('a wiki page is Markdown under wiki/ with no kind:', () => {
  it('accepts a page with no kind', () => {
    expect(isWikiPage(doc('wiki/quarter-plan', { created_by: 'agent:claude' }))).toBe(true);
  });

  it('refuses a document outside wiki/', () => {
    expect(isWikiPage(doc('notes/quarter-plan', {}))).toBe(false);
  });

  it('refuses a file under wiki/ that grew a kind:, because that belongs to the graph', () => {
    expect(isWikiPage(doc('wiki/mis-filed', { kind: 'capability' }))).toBe(false);
  });

  it('treats an empty kind: as no kind at all', () => {
    expect(isWikiPage(doc('wiki/blank', { kind: '   ' }))).toBe(true);
  });
});

describe('citations are read from sources + source_hash', () => {
  it('groups every citing page under the source path it names', () => {
    const citations = collectWikiCitations([
      doc('wiki/a', {
        sources: ['sources/plan.pdf', 'sources/budget.xlsx'],
        source_hash: { 'sources/plan.pdf': HASH },
      }),
      doc('wiki/b', { sources: ['sources/plan.pdf'], source_hash: { 'sources/plan.pdf': OTHER_HASH } }),
      doc('capabilities/mcp-server', { kind: 'capability', sources: ['sources/plan.pdf'] }),
    ]);
    expect(citations.get('sources/plan.pdf')?.map((c) => c.wikiSlug)).toEqual(['wiki/a', 'wiki/b']);
    expect(citations.get('sources/budget.xlsx')?.[0]?.sourceHash).toBeNull();
  });

  it('ignores an ontology node that happens to carry a sources: key', () => {
    const citations = collectWikiCitations([
      doc('capabilities/mcp-server', { kind: 'capability', sources: ['sources/plan.pdf'] }),
    ]);
    expect(citations.size).toBe(0);
  });

  it('reads a single citation written as a scalar', () => {
    const citations = collectWikiCitations([doc('wiki/a', { sources: 'sources/plan.pdf' })]);
    expect(citations.get('sources/plan.pdf')).toHaveLength(1);
  });

  it('reads created_by and compiled_at as written', () => {
    expect(
      selectWikiPages([
        doc('wiki/a', { created_by: 'agent:claude', compiled_at: '2026-09-05T10:00:00Z' }),
      ])[0],
    ).toMatchObject({ createdBy: 'agent:claude', compiledAt: '2026-09-05T10:00:00Z' });
  });
});

describe('a source state says whether the write-up still matches the file', () => {
  it('is not compiled when nothing cites it', () => {
    expect(deriveSourceState(undefined, undefined)).toBe('not-compiled');
    expect(deriveSourceState([], HASH)).toBe('not-compiled');
  });

  it('is checking while a cited file has not been hashed yet', () => {
    expect(
      deriveSourceState([{ wikiSlug: 'wiki/a', sourcePath: 'sources/p.pdf', sourceHash: HASH }], undefined),
    ).toBe('checking');
  });

  it('is compiled when a citing page names the file own hash', () => {
    expect(
      deriveSourceState([{ wikiSlug: 'wiki/a', sourcePath: 'sources/p.pdf', sourceHash: HASH }], HASH),
    ).toBe('compiled');
  });

  it('is compiled when any one of several citing pages still matches', () => {
    expect(
      deriveSourceState(
        [
          { wikiSlug: 'wiki/a', sourcePath: 'sources/p.pdf', sourceHash: OTHER_HASH },
          { wikiSlug: 'wiki/b', sourcePath: 'sources/p.pdf', sourceHash: HASH },
        ],
        HASH,
      ),
    ).toBe('compiled');
  });

  it('is stale when the file changed under the page', () => {
    expect(
      deriveSourceState([{ wikiSlug: 'wiki/a', sourcePath: 'sources/p.pdf', sourceHash: OTHER_HASH }], HASH),
    ).toBe('stale');
  });

  it('is stale when a page cites the file without recording a hash — coverage it cannot prove', () => {
    expect(
      deriveSourceState([{ wikiSlug: 'wiki/a', sourcePath: 'sources/p.pdf', sourceHash: null }], HASH),
    ).toBe('stale');
  });

  it('compares hashes case-insensitively', () => {
    expect(
      deriveSourceState(
        [{ wikiSlug: 'wiki/a', sourcePath: 'sources/p.pdf', sourceHash: HASH }],
        HASH.toUpperCase(),
      ),
    ).toBe('compiled');
  });
});

describe('the library model', () => {
  const docs = [
    doc('wiki/plan', { sources: ['sources/plan.pdf'], source_hash: { 'sources/plan.pdf': HASH } }),
    doc('capabilities/mcp-server', { kind: 'capability' }),
  ];
  const sources = [source('sources/plan.pdf'), source('sources/budget.xlsx', { format: 'xlsx' })];

  it('asks for a hash only for a cited source', () => {
    const model = buildLibraryModel({ sources, docs, hashes: new Map() });
    expect(model.pathsNeedingHash).toEqual(['sources/plan.pdf']);
  });

  it('counts what Compile would act on, and never a compiled row', () => {
    const model = buildLibraryModel({
      sources,
      docs,
      hashes: new Map([['sources/plan.pdf', HASH]]),
    });
    expect(model.sources.map((row) => [row.path, row.state])).toEqual([
      ['sources/plan.pdf', 'compiled'],
      ['sources/budget.xlsx', 'not-compiled'],
    ]);
    expect(model.needsCompileCount).toBe(1);
  });

  it('names the pages citing a source', () => {
    const model = buildLibraryModel({ sources, docs, hashes: new Map() });
    expect(model.sources.find((row) => row.path === 'sources/plan.pdf')?.citedBy).toEqual([
      'wiki/plan',
    ]);
  });

  it('holds no sources and no wiki pages for a folder that has neither', () => {
    const model = buildLibraryModel({ sources: undefined, docs: [], hashes: new Map() });
    expect(model).toMatchObject({ sources: [], wikiPages: [], needsCompileCount: 0 });
  });
});

describe('sizes read as sizes', () => {
  it('uses bytes below a kilobyte and one decimal above it', () => {
    expect(formatSourceBytes(0)).toBe('0 B');
    expect(formatSourceBytes(999)).toBe('999 B');
    expect(formatSourceBytes(1500)).toBe('1.5 KB');
    expect(formatSourceBytes(2_400_000)).toBe('2.4 MB');
    expect(formatSourceBytes(150_000)).toBe('150 KB');
  });
});
