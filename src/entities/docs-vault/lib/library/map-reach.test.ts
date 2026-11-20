import { describe, expect, it } from 'vitest';

import { buildWikiNodeIndex } from '@/shared/lib/library/wiki-page-schema';

import type { VaultDoc, VaultSourceFile } from '../../model/types';
import {
  deriveMapReach,
  mapReachOfPage,
  mapReachOfSource,
  pageHasMissingConcept,
  type MapReach,
  type MapReachState,
} from './map-reach';
import { deriveSourceProgress } from './source-progress';
import { buildLibraryModel, type LibraryModel } from './vault-library';

const HASH = 'a'.repeat(64);
const OTHER = 'f'.repeat(64);

function source(path: string): VaultSourceFile {
  return { path, name: path.split('/').pop() as string, format: 'md', bytes: 10, mtime: 1 };
}

function doc(slug: string, frontmatter: Record<string, unknown>): VaultDoc {
  return {
    slug, path: `${slug}.md`, title: slug, tags: [], frontmatter, 
    updatedAt: '2026-11-19T00:00:00Z', linksOut: [],
  };
}

function concept(slug: string, extra: Record<string, unknown> = {}): VaultDoc {
  return doc(slug, { kind: 'capability', ...extra });
}

/** A page citing `paths` with matching hashes; `describes` is left out when undefined. */
function page(slug: string, paths: string[], describes?: unknown, extra: Record<string, unknown> = {}): VaultDoc {
  return doc(slug, {
    sources: paths,
    source_hash: Object.fromEntries(paths.map((path) => [path, HASH])),
    ...(describes === undefined ? {} : { describes }),
    ...extra,
  });
}

function reachOf(sources: string[], docs: VaultDoc[], hashed: string[] = sources) {
  const model = buildLibraryModel({
    sources: sources.map(source),
    docs,
    hashes: new Map(hashed.map((path) => [path, HASH] as const)),
  });
  const nodes = buildWikiNodeIndex(docs.map((entry) => ({
    slug: entry.slug, kind: entry.frontmatter.kind, alias: entry.frontmatter.slug,
  })));
  return { model, reach: deriveMapReach(model, nodes) };
}

function stateOf(model: LibraryModel, reach: MapReach, path: string): MapReachState | null {
  return mapReachOfSource(reach, model.sources.findIndex((row) => row.path === path));
}

function pageIndex(model: LibraryModel, slug: string): number {
  return model.wikiPages.findIndex((entry) => entry.slug === slug);
}

const LOGIN = concept('capabilities/login');

describe('a source reaches the map through a page that describes an existing concept', () => {
  it('counts a source once when several pages cite it, taking the best state among them', () => {
    const { model, reach } = reachOf(['sources/a.md', 'sources/b.md', 'sources/c.md'], [
      LOGIN,
      page('wiki/a1', ['sources/a.md'], ['capabilities/login']),
      page('wiki/a2', ['sources/a.md'], ['capabilities/gone']),
      page('wiki/a3', ['sources/a.md']),
      page('wiki/b1', ['sources/b.md'], ['capabilities/gone']),
      page('wiki/b2', ['sources/b.md']),
      page('wiki/b3', ['sources/b.md'], []),
      page('wiki/c1', ['sources/c.md']),
      page('wiki/c2', ['sources/c.md'], []),
    ]);
    expect(stateOf(model, reach, 'sources/a.md')).toBe('onMap');
    expect(stateOf(model, reach, 'sources/b.md')).toBe('linkBroken');
    expect(stateOf(model, reach, 'sources/c.md')).toBe('notLinked');
    expect(reach).toMatchObject({
      total: 3, judged: 3, onMap: 1, byState: { onMap: 1, linkBroken: 1, notLinked: 1, noConcept: 0 },
    });
  });

  it('reaches every source a linked page cites', () => {
    const paths = ['sources/a.md', 'sources/b.md', 'sources/c.md'];
    const { model, reach } = reachOf(paths, [LOGIN, page('wiki/many', paths, ['capabilities/login'])]);
    expect(paths.map((path) => stateOf(model, reach, path))).toEqual(['onMap', 'onMap', 'onMap']);
    expect(reach.onMap).toBe(3);
  });

  it('reads `describes: []` as checked and none fits, only when every page says so', () => {
    const { model, reach } = reachOf(['sources/a.md', 'sources/b.md'], [
      LOGIN,
      page('wiki/a1', ['sources/a.md'], []),
      page('wiki/a2', ['sources/a.md'], []),
      page('wiki/b1', ['sources/b.md'], []),
      page('wiki/b2', ['sources/b.md']),
    ]);
    expect(stateOf(model, reach, 'sources/a.md')).toBe('noConcept');
    expect(stateOf(model, reach, 'sources/b.md')).toBe('notLinked');
    expect(model.wikiPages[pageIndex(model, 'wiki/a1')]!.describes).toEqual([]);
    expect(model.wikiPages[pageIndex(model, 'wiki/b2')]!.describes).toBeNull();
  });

  it('breaks the link when the concept is deleted, and reports the page', () => {
    const docs = [LOGIN, page('wiki/a', ['sources/a.md'], ['capabilities/login'])];
    const before = reachOf(['sources/a.md'], docs);
    expect(before.reach.onMap).toBe(1);
    const { model, reach } = reachOf(['sources/a.md'], docs.slice(1));
    expect(stateOf(model, reach, 'sources/a.md')).toBe('linkBroken');
    expect(mapReachOfPage(reach, 0)).toBe('linkBroken');
    expect(pageHasMissingConcept(reach, 0)).toBe(true);
    expect(reach.onMap).toBe(0);
  });

  it('keeps a page on the map when one of its entries is gone, and still flags the missing one', () => {
    const { model, reach } = reachOf(['sources/a.md'], [
      LOGIN, page('wiki/a', ['sources/a.md'], ['capabilities/gone', 'capabilities/login']),
    ]);
    expect(stateOf(model, reach, 'sources/a.md')).toBe('onMap');
    expect(pageHasMissingConcept(reach, pageIndex(model, 'wiki/a'))).toBe(true);
  });

  it('resolves NFD and NFC Hangul slugs to the same concept, and holds entries in NFC', () => {
    const name = '로그인';
    const nfc = `capabilities/${name.normalize('NFC')}`;
    const nfd = `capabilities/${name.normalize('NFD')}`;
    expect(nfd).not.toBe(nfc);
    const { model, reach } = reachOf(['sources/a.md', 'sources/b.md'], [
      concept(nfd),
      page('wiki/a', ['sources/a.md'], [nfd]),
      page('wiki/b', ['sources/b.md'], [`  ${nfc}  `]),
    ]);
    expect(reach.byState.onMap).toBe(2);
    expect(model.wikiPages[pageIndex(model, 'wiki/a')]!.describes).toEqual([nfc]);
    expect(model.wikiPages[pageIndex(model, 'wiki/b')]!.describes).toEqual([nfc]);
  });

  it('resolves a unique tail and a `slug:` alias, and refuses an ambiguous tail and a wiki page', () => {
    const { model, reach } = reachOf(['sources/tail.md', 'sources/alias.md', 'sources/both.md', 'sources/wiki.md'], [
      LOGIN,
      concept('elements/signer', { slug: 'elements/jwt-signer' }),
      concept('capabilities/auth/session'),
      concept('elements/session'),
      page('wiki/tail', ['sources/tail.md'], ['login']),
      page('wiki/alias', ['sources/alias.md'], ['elements/jwt-signer']),
      page('wiki/both', ['sources/both.md'], ['session']),
      page('wiki/wiki', ['sources/wiki.md'], ['wiki/tail']),
    ]);
    expect(stateOf(model, reach, 'sources/tail.md')).toBe('onMap');
    expect(stateOf(model, reach, 'sources/alias.md')).toBe('onMap');
    expect(stateOf(model, reach, 'sources/both.md')).toBe('linkBroken');
    expect(stateOf(model, reach, 'sources/wiki.md')).toBe('linkBroken');
  });

  it('judges only compiled sources, from the pages whose matching, whole citation compiles them', () => {
    const paths = ['sources/stale.md', 'sources/partial.md', 'sources/uncited.md', 'sources/checking.md', 'sources/mixed.md'];
    const { model, reach } = reachOf(paths, [
      LOGIN,
      page('wiki/stale', ['sources/stale.md'], ['capabilities/login'], { source_hash: { 'sources/stale.md': OTHER } }),
      page('wiki/partial', ['sources/partial.md'], ['capabilities/login'], { sources_truncated: ['sources/partial.md'] }),
      page('wiki/checking', ['sources/checking.md'], ['capabilities/login']),
      // An outdated page links the concept; the page that compiles the source does not.
      page('wiki/mixed-old', ['sources/mixed.md'], ['capabilities/login'], { source_hash: { 'sources/mixed.md': OTHER } }),
      page('wiki/mixed-part', ['sources/mixed.md'], ['capabilities/login'], { sources_truncated: ['sources/mixed.md'] }),
      page('wiki/mixed-now', ['sources/mixed.md'], []),
    ], paths.filter((path) => path !== 'sources/checking.md'));
    expect(model.sources.map((row) => row.state)).toEqual(['stale', 'partial', 'not-compiled', 'checking', 'compiled']);
    expect(paths.map((path) => stateOf(model, reach, path))).toEqual([null, null, null, null, 'noConcept']);
    expect(reach).toMatchObject({ total: 5, judged: 1, onMap: 0 });
    // Line 2's total is line 1's, and it counts only what line 1 counts.
    const progress = deriveSourceProgress(model, { now: Date.parse('2026-11-19T12:00:00Z') });
    expect(reach.total).toBe(progress.total);
    expect(reach.judged).toBe(progress.compiled);
  });

  it('reads a scalar `describes:` as no list, as the wiki schema does', () => {
    const { model, reach } = reachOf(['sources/a.md'], [LOGIN, page('wiki/a', ['sources/a.md'], 'capabilities/login')]);
    expect(stateOf(model, reach, 'sources/a.md')).toBe('notLinked');
  });

  it('keeps empty and drops non-string entries, as `validateWikiPage` reads the list', () => {
    const { model, reach } = reachOf(['sources/a.md', 'sources/b.md'], [
      LOGIN,
      page('wiki/a', ['sources/a.md'], ['']),
      page('wiki/b', ['sources/b.md'], [7, null]),
    ]);
    expect(stateOf(model, reach, 'sources/a.md')).toBe('linkBroken');
    expect(stateOf(model, reach, 'sources/b.md')).toBe('noConcept');
  });

  it('shares a clean `describes:` list with the frontmatter rather than copying it', () => {
    const describes = ['capabilities/login'];
    const { model } = reachOf(['sources/a.md'], [LOGIN, page('wiki/a', ['sources/a.md'], describes)]);
    expect(model.wikiPages[0]!.describes).toBe(describes);
  });

  it('counts a page citing one path twice once, and ignores the shipped template', () => {
    const { model, reach } = reachOf(['sources/a.md', 'sources/t.md'], [
      LOGIN,
      page('wiki/twice', ['sources/a.md', 'sources/a.md'], ['capabilities/login']),
      page('wiki/_template', ['sources/t.md'], ['capabilities/login']),
    ]);
    const row = model.sources.findIndex((entry) => entry.path === 'sources/a.md');
    expect(model.compiledBy.offsets[row + 1]! - model.compiledBy.offsets[row]!).toBe(1);
    // The template compiles its source but is not a listed page, so it carries no link.
    expect(stateOf(model, reach, 'sources/t.md')).toBe('notLinked');
    expect(model.wikiPages.map((entry) => entry.slug)).toEqual(['wiki/twice']);
  });

  it('is empty for an empty folder', () => {
    const { reach } = reachOf([], []);
    expect(reach).toMatchObject({ total: 0, judged: 0, onMap: 0 });
  });
});
