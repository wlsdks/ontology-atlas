import { describe, expect, it } from 'vitest';

import { buildLibraryModel, createLibraryModelBuilder } from './vault-library';
import type { VaultDoc, VaultSourceFile } from '../../model/vault-manifest';

const HASH = (n: number) => n.toString(16).padStart(64, '0');

/** A seeded folder: sources cited by zero to three pages, recorded hashes that match or not, truncations and answers. */
function folder(sourceCount = 300, pageCount = 200, seed = 7) {
  let state = seed;
  const random = () => (state = (state * 1664525 + 1013904223) >>> 0) / 4294967296;
  const sources: VaultSourceFile[] = Array.from({ length: sourceCount }, (_, index) => ({
    path: `sources/s${index}.md`, name: `s${index}.md`, format: 'md', bytes: 10, mtime: 1,
  }));
  const docs: VaultDoc[] = Array.from({ length: pageCount }, (_, index) => {
    const cited = Array.from({ length: Math.floor(random() * 4) }, () => sources[Math.floor(random() * sourceCount)]!.path);
    const slug = index % 17 === 0 ? `wiki/answers/a${index}` : `wiki/p${index}`;
    return {
      slug, path: `${slug}.md`, title: `Page ${index}`, tags: [], linksOut: [], updatedAt: '',
      frontmatter: {
        sources: cited,
        source_hash: Object.fromEntries(cited.filter(() => random() < 0.9).map((path) => [path, HASH(random() < 0.8 ? Number(path.slice(9, -3)) : 1)])),
        ...(random() < 0.1 && cited[0] ? { sources_truncated: [cited[0]] } : {}),
        compiled_at: `2026-11-${String(1 + (index % 20)).padStart(2, '0')}T10:00:00Z`,
      },
    };
  });
  return { sources, docs };
}

const offsetMinutes = () => 540;

describe('Library model kept across hash publishes', () => {
  const { sources, docs } = folder();
  const batches = [sources.slice(0, 100), sources.slice(100, 220), sources.slice(220)];

  it('equals a fresh build after each publish, an unreadable file and a new listing', () => {
    const build = createLibraryModelBuilder();
    const hashes = new Map<string, string>();
    const steps: Array<{ docs: readonly VaultDoc[]; hashes: ReadonlyMap<string, string>; unreadable?: ReadonlySet<string> }> = [];
    for (const batch of batches) {
      for (const source of batch) hashes.set(source.path, HASH(Number(source.path.slice(9, -3))));
      steps.push({ docs, hashes: new Map(hashes) });
    }
    const cited = sources.find((source) => docs.some((doc) => (doc.frontmatter.sources as string[]).includes(source.path)))!.path;
    const unmeasured = new Map(hashes);
    unmeasured.delete(cited);
    steps.push({ docs, hashes: unmeasured }, { docs, hashes: unmeasured, unreadable: new Set([cited]) });
    const recited = docs.map((doc) => ({ ...doc, frontmatter: { ...doc.frontmatter, sources: (doc.frontmatter.sources as string[]).map((path) => path.replace(/s(\d)/, "s1$1")) } }));
    steps.push({ docs: [...docs.slice(1), docs[0]!], hashes }, { docs: recited, hashes });
    const seen = new Set<string>();
    for (const step of steps) {
      const input = { sources, offsetMinutes, ...step };
      const got = build(input);
      expect(got).toEqual(buildLibraryModel(input));
      seen.add(JSON.stringify([got.pathsNeedingHash.length, got.staleCount, got.needsCompileCount, got.sources.filter((row) => row.state === "unreadable").length]));
    }
    expect(seen.size, 'the steps never changed the model').toBeGreaterThan(3);
  });

  it('rebuilds only the rows, source lists and page lists a publish changes', () => {
    const build = createLibraryModelBuilder();
    const hashes = new Map<string, string>();
    const before = build({ sources, docs, hashes, offsetMinutes });
    const published = batches[0]!.map((source) => source.path);
    for (const path of published) hashes.set(path, HASH(Number(path.slice(9, -3))));
    const after = build({ sources, docs, hashes: new Map(hashes), offsetMinutes });

    const rebuiltRows = after.sources.filter((row, at) => row !== before.sources[at]).map((row) => row.path);
    expect(rebuiltRows.length, 'the publish changed no row').toBeGreaterThan(0);
    expect(rebuiltRows.every((path) => published.includes(path))).toBe(true);
    const changedState = new Set(after.sources.filter((row, at) => row.state !== before.sources[at]!.state).map((row) => row.path));
    const rebuiltPages = [...after.pairing.originalsByWiki].filter(([slug, list]) => list !== before.pairing.originalsByWiki.get(slug));
    expect(rebuiltPages.every(([, list]) => list.some((link) => changedState.has(link.path)))).toBe(true);
    const rebuiltWriteUps = [...after.pairing.writeUpsBySource.keys()]
      .filter((path) => after.pairing.writeUpsBySource.get(path) !== before.pairing.writeUpsBySource.get(path));
    expect(rebuiltWriteUps.every((path) => published.includes(path))).toBe(true);
    expect(after.wikiPages).toBe(before.wikiPages);
  });
});

describe('Library model rows keep their identity', () => {
  it('keeps the row object of every unchanged source when the page or source list is replaced', () => {
    const { sources, docs } = folder();
    const hashes = new Map(sources.map((source) => [source.path, HASH(Number(source.path.slice(9, -3)))] as const));
    const build = createLibraryModelBuilder();
    const first = build({ sources, docs, hashes, offsetMinutes }).sources;

    const sameAgain = build({ sources: sources.map((source) => ({ ...source })), docs: docs.map((doc) => ({ ...doc })), hashes, offsetMinutes }).sources;
    expect(sameAgain.filter((row, i) => row !== first[i])).toHaveLength(0);

    const target = sources.find((source) => !docs.some((doc) => (doc.frontmatter.sources as string[]).includes(source.path)))!.path;
    const citing = docs.map((doc, i) => (i === 1 ? { ...doc, frontmatter: { ...doc.frontmatter, sources: [...(doc.frontmatter.sources as string[]), target] } } : doc));
    const changed = build({ sources, docs: citing, hashes, offsetMinutes }).sources;
    expect(changed.filter((row, i) => row !== first[i]).map((row) => row.path)).toEqual([target]);
  });
});
