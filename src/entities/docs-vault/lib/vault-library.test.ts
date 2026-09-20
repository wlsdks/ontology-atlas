import { describe, expect, it } from 'vitest';

import {
  buildLibraryModel,
  countSourceFormats,
  countWikiPages,
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
  it('keeps old write-ups and filed answers in the compile queue even when another page is current', () => {
    const model = buildLibraryModel({
      docs: [...DOCS, wiki('wiki/research/launch-date', {
        sources: ['sources/plan.pdf'], source_hash: { 'sources/plan.pdf': 'unmeasured' },
      })],
      sources: [SOURCES[0]],
      hashes: new Map([['sources/plan.pdf', PLAN_HASH]]),
    });
    expect(model.sources[0].state).toBe('compiled');
    expect(model.sources[0].reviewPages).toEqual(['wiki/older-take', 'wiki/research/launch-date']);
    expect(model.needsCompileCount).toBe(1);
    expect(model.staleCount).toBe(0);
  });

  it('keeps retained history visible without asking ordinary Compile to overwrite it', () => {
    const model = buildLibraryModel({
      docs: [wiki('wiki/current', { sources: ['sources/plan.pdf'], source_hash: { 'sources/plan.pdf': PLAN_HASH } }),
        wiki('wiki/answers/retained', { sources: ['sources/plan.pdf'], source_hash: { 'sources/plan.pdf': 'unmeasured' } })],
      sources: [SOURCES[0]], hashes: new Map([['sources/plan.pdf', PLAN_HASH]]),
    });
    expect(model.sources[0].state).toBe('compiled');
    expect(model.sources[0].citedBy).toContain('wiki/answers/retained');
    expect(model.sources[0].reviewPages).toEqual([]);
    expect(model.needsCompileCount).toBe(0);
  });

  it('does not decide which pages are behind before the source hash arrives', () => {
    const model = buildLibraryModel({ docs: DOCS, sources: [SOURCES[0]], hashes: new Map() });
    expect(model.sources[0].reviewPages).toEqual([]);
    expect(model.needsCompileCount).toBe(0);
  });

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
    expect(model.partialCount).toBe(0);
    expect(model.needsCompileCount).toBe(2);
  });
});

/**
 * **Half a document is not a written-up document.**
 *
 * A long file is cut at the per-read cap, and the page still records a hash of the whole
 * file — so the hash matches and the row said `compiled` while the second half of a
 * 200-page PDF had never reached any page. `sources_truncated:` is the writer's record of
 * exactly that, and these cases are the four ways it can be read wrong.
 */
describe('a source only part of which reached a page', () => {
  const PARTIAL_DOCS: VaultDoc[] = [
    wiki(
      'wiki/quarter-plan',
      {
        sources: ['sources/plan.pdf'],
        source_hash: { 'sources/plan.pdf': PLAN_HASH },
        sources_truncated: ['sources/plan.pdf'],
        compiled_at: '2026-09-07T10:00:00Z',
      },
      'Quarter plan',
    ),
  ];

  const modelWith = (docs: VaultDoc[], hash = PLAN_HASH) =>
    buildLibraryModel({
      sources: [source('sources/plan.pdf')],
      docs,
      hashes: new Map([['sources/plan.pdf', hash]]),
    });

  it('says partial rather than compiled while the bytes still match', () => {
    const model = modelWith(PARTIAL_DOCS);
    expect(model.sources[0].state).toBe('partial');
    expect(model.partialCount).toBe(1);
  });

  it('counts it as work Compile can still do, so the shelf offers the second read', () => {
    const model = modelWith(PARTIAL_DOCS);
    expect(model.needsCompileCount).toBe(1);
    // …and never as one of the other two. A partial page is not a missing page, and it is
    // not a page behind its bytes; a screen adding these up would count one file twice.
    expect(model.notCompiledCount).toBe(0);
    expect(model.staleCount).toBe(0);
  });

  /**
   * The precedence that matters: a page that read half a file, of a file that has since
   * been replaced, is not describing half of what is on disk. It is describing half of
   * something else, and `stale` is the word for that.
   */
  it('becomes stale, not partial, once the file changes underneath it', () => {
    const model = modelWith(PARTIAL_DOCS, 'd'.repeat(64));
    expect(model.sources[0].state).toBe('stale');
    expect(model.partialCount).toBe(0);
    expect(model.staleCount).toBe(1);
  });

  it('is compiled again as soon as one page has read the file whole', () => {
    const model = modelWith([
      ...PARTIAL_DOCS,
      wiki(
        'wiki/full-take',
        { sources: ['sources/plan.pdf'], source_hash: { 'sources/plan.pdf': PLAN_HASH } },
        'Full take',
      ),
    ]);
    expect(model.sources[0].state).toBe('compiled');
    expect(model.needsCompileCount).toBe(0);
  });

  it('tells the source pane which write-up stops short and which does not', () => {
    const model = modelWith([
      ...PARTIAL_DOCS,
      wiki(
        'wiki/full-take',
        { sources: ['sources/plan.pdf'], source_hash: { 'sources/plan.pdf': PLAN_HASH } },
        'Full take',
      ),
    ]);
    expect(model.pairing.writeUpsBySource.get('sources/plan.pdf')).toEqual([
      { slug: 'wiki/full-take', title: 'Full take', freshness: 'current' },
      { slug: 'wiki/quarter-plan', title: 'Quarter plan', freshness: 'partial' },
    ]);
  });

  it('reads a single truncated path written as a scalar, as it reads `sources:`', () => {
    const model = modelWith([
      wiki(
        'wiki/hand-written',
        {
          sources: 'sources/plan.pdf',
          source_hash: { 'sources/plan.pdf': PLAN_HASH },
          sources_truncated: 'sources/plan.pdf',
        },
        'Hand written',
      ),
    ]);
    expect(model.sources[0].state).toBe('partial');
  });

  it('ignores a truncation record naming a file the page does not cite', () => {
    const model = modelWith([
      wiki(
        'wiki/quarter-plan',
        {
          sources: ['sources/plan.pdf'],
          source_hash: { 'sources/plan.pdf': PLAN_HASH },
          sources_truncated: ['sources/something-else.pdf'],
        },
        'Quarter plan',
      ),
    ]);
    expect(model.sources[0].state).toBe('compiled');
  });
});

describe('the shipped template is not a page', () => {
  it('leaves wiki/_template.md out of the list, as the validators leave it out of judgement', () => {
    // Seen in the installed app on 2026-09-06: "<the page name>" at the top of five real
    // pages, opened first in the reader. The template is the shape, not a page.
    const pages = selectWikiPages([
      wiki('wiki/_template', { title: '<the page name>', created_by: 'agent:claude' }),
      wiki('wiki/a', { created_by: 'agent:claude' }),
    ]);
    expect(pages.map((page) => page.slug)).toEqual(['wiki/a']);
  });
});

/**
 * The count and the list must answer the same question. The project page counted every `wiki/`
 * slug of its own instead, so it reported the template `init` writes, and any ontology node
 * misfiled under `wiki/`, as pages — a larger number than the Library listed for one folder.
 */
describe('countWikiPages', () => {
  it('counts what the Wiki list draws', () => {
    const docs = [
      wiki('wiki/a', {}),
      wiki('wiki/b', {}),
      { ...wiki('domains/order', {}), slug: 'domains/order' },
    ];
    expect(countWikiPages(docs)).toBe(2);
    expect(countWikiPages(docs)).toBe(selectWikiPages(docs).length);
  });

  it('does not count the template `init` writes, or any other furniture', () => {
    const docs = [wiki('wiki/a', {}), wiki('wiki/_template', {}), wiki('wiki/_log', {})];
    expect(countWikiPages(docs)).toBe(1);
    expect(countWikiPages(docs)).toBe(selectWikiPages(docs).length);
  });

  it('does not count an ontology node filed under wiki/', () => {
    const docs = [wiki('wiki/a', {}), wiki('wiki/order', { kind: 'domain' })];
    expect(countWikiPages(docs)).toBe(1);
    expect(countWikiPages(docs)).toBe(selectWikiPages(docs).length);
  });
});
