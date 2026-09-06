import { describe, expect, it } from 'vitest';

import {
  buildLibraryModel,
  countSourceFormats,
  newestWikiPage,
  selectWikiPages,
} from './vault-library';
import type { VaultDoc, VaultSourceFile } from '../model/types';

/**
 * The pairing is reached through `buildLibraryModel`, the way every screen reaches it.
 * Testing the derivation directly would pin an internal name and let the wiring between
 * it and the model break silently, which is the one failure a screen would actually show.
 */
const buildLibraryPairing = (input: {
  docs: readonly VaultDoc[];
  sources: readonly VaultSourceFile[] | undefined;
  hashes: ReadonlyMap<string, string>;
}) => buildLibraryModel(input).pairing;

/**
 * The pairing is the crossing a person makes between what a document said and what we
 * made of it. Every case below is a way that crossing can lie: a page citing a file
 * that is not in the folder, a page citing it with no hash, and two pages covering one
 * file where only one is current.
 */

function source(path: string, mtime = 1_757_000_000_000): VaultSourceFile {
  return {
    path,
    name: path.split('/').pop() as string,
    format: (path.split('.').pop() as string).toLowerCase(),
    bytes: 2048,
    mtime,
  };
}

function wiki(
  slug: string,
  frontmatter: Record<string, unknown>,
  title = slug.replace('wiki/', ''),
): VaultDoc {
  return {
    slug,
    path: `${slug}.md`,
    title,
    tags: [],
    frontmatter,
    headings: [],
    excerpt: '',
    wordCount: 10,
    updatedAt: '2026-09-06T00:00:00Z',
    linksOut: [],
  };
}

const PLAN_HASH = 'a'.repeat(64);

const SOURCES = [source('sources/plan.pdf'), source('sources/budget.xlsx', 1_757_100_000_000)];

const DOCS: VaultDoc[] = [
  wiki(
    'wiki/quarter-plan',
    {
      sources: ['sources/plan.pdf'],
      source_hash: { 'sources/plan.pdf': PLAN_HASH.toUpperCase() },
      compiled_at: '2026-09-05T10:00:00Z',
      created_by: 'agent:claude',
    },
    'Quarter plan',
  ),
  wiki(
    'wiki/older-take',
    {
      sources: ['sources/plan.pdf'],
      source_hash: { 'sources/plan.pdf': 'c'.repeat(64) },
      compiled_at: '2026-09-01T10:00:00Z',
    },
    'Older take',
  ),
  wiki(
    'wiki/ghost',
    { sources: ['sources/deleted.docx'], source_hash: {}, compiled_at: '2026-09-06T10:00:00Z' },
    'Ghost',
  ),
  // A file under `wiki/` carrying a kind is an ontology node someone filed wrong; it is
  // not a write-up and must not appear on either side of the crossing.
  wiki('wiki/impostor', { kind: 'domain', sources: ['sources/budget.xlsx'] }, 'Impostor'),
];

describe('a wiki page points back at the originals it stands on', () => {
  const pairing = buildLibraryPairing({
    docs: DOCS,
    sources: SOURCES,
    hashes: new Map([['sources/plan.pdf', PLAN_HASH]]),
  });

  it('resolves the citation against the folder, so the state is the file’s own', () => {
    expect(pairing.originalsByWiki.get('wiki/quarter-plan')).toEqual([
      { path: 'sources/plan.pdf', name: 'plan.pdf', state: 'compiled' },
    ]);
  });

  it('reports a cited file that is not in this folder as absent, not as stale', () => {
    expect(pairing.originalsByWiki.get('wiki/ghost')).toEqual([
      { path: 'sources/deleted.docx', name: 'deleted.docx', state: null },
    ]);
  });

  it('gives a page citing nothing an empty list rather than no entry', () => {
    const empty = buildLibraryPairing({
      docs: [wiki('wiki/handover', { created_by: 'human' })],
      sources: SOURCES,
      hashes: new Map(),
    });
    expect(empty.originalsByWiki.get('wiki/handover')).toEqual([]);
  });

  it('never treats a document with a kind as a write-up', () => {
    expect(pairing.originalsByWiki.has('wiki/impostor')).toBe(false);
  });
});

describe('a source points forward at the pages written from it', () => {
  const pairing = buildLibraryPairing({
    docs: DOCS,
    sources: SOURCES,
    hashes: new Map([['sources/plan.pdf', PLAN_HASH]]),
  });

  it('lists every citing page and says which of them still matches the bytes', () => {
    expect(pairing.writeUpsBySource.get('sources/plan.pdf')).toEqual([
      { slug: 'wiki/older-take', title: 'Older take', freshness: 'behind' },
      { slug: 'wiki/quarter-plan', title: 'Quarter plan', freshness: 'current' },
    ]);
  });

  it('matches a recorded hash case-insensitively, because YAML is hand-edited', () => {
    const [, current] = pairing.writeUpsBySource.get('sources/plan.pdf') as [
      unknown,
      { freshness: string },
    ];
    expect(current.freshness).toBe('current');
  });

  /**
   * The defect this pins (PO steward, 2026-09-06): an unmeasured file was reported
   * `behind`, while the same pane's own state row said `checking`. Two claims about one
   * file, and only one of them true.
   */
  it('separates “nothing measured this yet” from “the page is behind”', () => {
    const unmeasured = buildLibraryPairing({ docs: DOCS, sources: SOURCES, hashes: new Map() });
    expect(unmeasured.writeUpsBySource.get('sources/plan.pdf')).toEqual([
      // Cited with a hash, nothing measured: unchecked, not behind.
      { slug: 'wiki/older-take', title: 'Older take', freshness: 'unchecked' },
      { slug: 'wiki/quarter-plan', title: 'Quarter plan', freshness: 'unchecked' },
    ]);
  });

  it('still calls a page that recorded no hash at all behind, measured or not', () => {
    const noHash = buildLibraryPairing({
      docs: [wiki('wiki/loose', { sources: ['sources/plan.pdf'] }, 'Loose')],
      sources: SOURCES,
      hashes: new Map(),
    });
    expect(noHash.writeUpsBySource.get('sources/plan.pdf')).toEqual([
      { slug: 'wiki/loose', title: 'Loose', freshness: 'behind' },
    ]);
  });

  it('leaves a source nobody cites out of the map, which is what “none” means', () => {
    expect(pairing.writeUpsBySource.has('sources/budget.xlsx')).toBe(false);
  });
});

describe('the model carries the pairing, so one derivation serves both panes', () => {
  it('exposes both directions', () => {
    const model = buildLibraryModel({
      sources: SOURCES,
      docs: DOCS,
      hashes: new Map([['sources/plan.pdf', PLAN_HASH]]),
    });
    expect(model.pairing.originalsByWiki.get('wiki/quarter-plan')).toHaveLength(1);
    expect(model.pairing.writeUpsBySource.get('sources/plan.pdf')).toHaveLength(2);
  });
});

describe('what the shelf counts', () => {
  it('opens on the freshest write-up', () => {
    expect(newestWikiPage(selectWikiPages(DOCS))?.slug).toBe('wiki/ghost');
  });

  it('still answers when no page records when it was compiled', () => {
    const pages = selectWikiPages([
      wiki('wiki/b', { created_by: 'human' }),
      wiki('wiki/a', { created_by: 'human' }),
    ]);
    expect(newestWikiPage(pages)?.slug).toBe('wiki/a');
  });

  it('has nothing to open in an empty folder', () => {
    expect(newestWikiPage([])).toBeNull();
  });

  it('orders formats by how many arrived in each', () => {
    expect(
      countSourceFormats([
        source('sources/a.pdf'),
        source('sources/b.xlsx'),
        source('sources/c.pdf'),
      ]),
    ).toEqual([
      { format: 'pdf', count: 2 },
      { format: 'xlsx', count: 1 },
    ]);
  });

  it('keeps the counts of the two unfinished states apart', () => {
    const model = buildLibraryModel({
      sources: SOURCES,
      docs: DOCS,
      hashes: new Map([['sources/plan.pdf', 'd'.repeat(64)]]),
    });
    expect(model.staleCount).toBe(1);
    expect(model.notCompiledCount).toBe(1);
    expect(model.needsCompileCount).toBe(2);
  });
});
