import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

import { buildWikiNodeIndex } from '@/shared/lib/library/wiki-page-schema';

import type { VaultDoc, VaultSourceFile } from '../../model/types';
import { deriveMapReach } from './map-reach';
import { buildLibraryModel } from './vault-library';

const COUNT = 50_000;
const CONCEPTS = 5_000;
const HASH = 'a'.repeat(64);
const NOW = Date.parse('2026-11-19T12:00:00Z');
const DAY = 86_400_000;

function doc(slug: string, frontmatter: Record<string, unknown>): VaultDoc {
  return {
    slug, path: `${slug}.md`, title: slug, tags: [], updatedAt: '',
    linksOut: [], frontmatter,
  };
}

/**
 * Criterion 5's folder: 50,000 sources, 50,000 pages citing one each, and 5,000 concepts. Compile
 * states follow the source-progress perf folder; by `index % 10` a page has no `describes:` (0),
 * `describes: []` (1), one missing slug (2), and otherwise two concepts, so about two links a page.
 */
function folderInput() {
  const sources: VaultSourceFile[] = [];
  const docs: VaultDoc[] = [];
  const hashes = new Map<string, string>();
  for (let index = 0; index < CONCEPTS; index += 1) {
    docs.push(doc(`capabilities/concept-${index}`, { kind: 'capability', slug: `capabilities/concept-${index}` }));
  }
  for (let index = 0; index < COUNT; index += 1) {
    const path = `sources/team/${index % 97}/document-${index}.pdf`;
    sources.push({ path, name: `document-${index}.pdf`, format: 'pdf', bytes: 1000, mtime: 1 });
    if (index % 50 !== 0) hashes.set(path, HASH);
    const kind = index % 10;
    const link = Math.floor(index / 10) % 10;
    docs.push(doc(`wiki/page-${index}`, {
      sources: [path],
      source_hash: { [path]: kind === 7 ? 'b'.repeat(64) : HASH },
      ...(kind === 8 ? { sources_truncated: [path] } : {}),
      ...(kind === 9 ? {} : { compiled_at: new Date(NOW - (index % 400) * DAY).toISOString() }),
      ...(link === 0 ? {} : {
        describes: link === 1 ? [] : link === 2 ? ['capabilities/gone'] : [
          `capabilities/concept-${index % CONCEPTS}`,
          `capabilities/concept-${(index * 7) % CONCEPTS}`,
        ],
      }),
    }));
  }
  return { sources, docs, hashes, offsetMinutes: () => 540 };
}

describe('map reach at 50,000 sources, 50,000 pages and 5,000 concepts', () => {
  it('derives within its budget', () => {
    const input = folderInput();
    const model = buildLibraryModel(input);
    const indexStarted = performance.now();
    const nodes = buildWikiNodeIndex(input.docs.map((entry) => ({
      slug: entry.slug, kind: entry.frontmatter.kind, alias: entry.frontmatter.slug,
    })));
    const indexMs = performance.now() - indexStarted;
    for (let warm = 0; warm < 3; warm += 1) deriveMapReach(model, nodes);
    const runs: number[] = [];
    for (let run = 0; run < 5; run += 1) {
      const started = performance.now();
      deriveMapReach(model, nodes);
      runs.push(performance.now() - started);
    }
    const median = [...runs].sort((a, b) => a - b)[2]!;
    const reach = deriveMapReach(model, nodes);
    console.log(
      `[perf] map reach, ${COUNT} sources — median ${median.toFixed(1)} ms of [${runs.map((ms) => ms.toFixed(1)).join(', ')}]; node index ${indexMs.toFixed(1)} ms, built once per folder; ${JSON.stringify(reach.byState)}`,
    );
    expect(reach.total).toBe(COUNT);
    expect(reach.onMap).toBeGreaterThan(0);
    /* Brief budget 50 ms; the spec's criterion 5 asks 20 ms, which slice L7 holds on the built app. */
    expect(median).toBeLessThanOrEqual(50);
  });

  it('keeps the library model within 2 MB of what it held before map reach', () => {
    setFlagsFromString('--expose-gc');
    const gc = runInNewContext('gc') as () => void;
    // The typed arrays' bytes live outside the V8 heap, so they are counted beside it.
    const heap = () => {
      gc();
      gc();
      const usage = process.memoryUsage();
      return usage.heapUsed + usage.arrayBuffers;
    };
    const input = folderInput();
    buildLibraryModel(input);
    const before = heap();
    let model: ReturnType<typeof buildLibraryModel> | null = buildLibraryModel(input);
    const held = heap() - before;
    const linked = model.wikiPages.filter((entry) => (entry.describes?.length ?? 0) > 0).length;
    model = null;
    console.log(
      `[perf] library model, ${COUNT} sources and pages — ${(held / 1e6).toFixed(2)} MB retained beyond its inputs, ${linked} pages with links`,
    );
    expect(model).toBeNull();
    /*
     * Product budget: 2 MB over the model before map reach. Measured 2026-11-20 on Node 24 with this
     * folder: 34.61 MB on main, the same five runs out of five.
     */
    expect(held).toBeLessThanOrEqual(34.61e6 + 2e6);
  });
});
