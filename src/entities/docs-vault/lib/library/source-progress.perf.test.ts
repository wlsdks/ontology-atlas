import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

import type { VaultDoc, VaultSourceFile } from '../../model/types';
import { deriveSourceProgress } from './source-progress';
import { buildLibraryModel } from './vault-library';

const COUNT = 50_000;
const HASH = 'a'.repeat(64);
const NOW = Date.parse('2026-11-19T12:00:00Z');
const DAY = 86_400_000;

/**
 * 50,000 sources and 50,000 pages, one citation each: most match, some are read in part, some are
 * behind, some wait for a hash, and pages carry a few hundred distinct `compiled_at` values over
 * 400 days, as agent runs write them.
 */
function folder() {
  return buildLibraryModel(folderInput());
}

function folderInput() {
  const sources: VaultSourceFile[] = [];
  const docs: VaultDoc[] = [];
  const hashes = new Map<string, string>();
  for (let index = 0; index < COUNT; index += 1) {
    const path = `sources/team/${index % 97}/document-${index}.pdf`;
    sources.push({ path, name: `document-${index}.pdf`, format: 'pdf', bytes: 1000, mtime: 1 });
    if (index % 50 !== 0) hashes.set(path, HASH);
    const kind = index % 10;
    docs.push({
      slug: `wiki/page-${index}`, path: `wiki/page-${index}.md`, title: `Page ${index}`, tags: [], headings: [],
      excerpt: '', wordCount: 1, updatedAt: '', linksOut: [],
      frontmatter: {
        sources: [path],
        source_hash: { [path]: kind === 7 ? 'b'.repeat(64) : HASH },
        ...(kind === 8 ? { sources_truncated: [path] } : {}),
        ...(kind === 9 ? {} : { compiled_at: new Date(NOW - (index % 400) * DAY - (index % 3) * 3_600_000).toISOString() }),
      },
    });
  }
  return { sources, docs, hashes, offsetMinutes: () => 540 };
}

describe('source progress at 50,000 sources and 50,000 pages', () => {
  const clock = { now: NOW, offsetMinutes: () => 540 };

  it('derives within its budget', () => {
    const model = folder();
    for (let warm = 0; warm < 3; warm += 1) deriveSourceProgress(model, clock);
    const runs: number[] = [];
    for (let run = 0; run < 5; run += 1) {
      const started = performance.now();
      deriveSourceProgress(model, clock);
      runs.push(performance.now() - started);
    }
    const median = [...runs].sort((a, b) => a - b)[2];
    const progress = deriveSourceProgress(model, clock);
    console.log(
      `[perf] source progress, ${COUNT} sources — median ${median.toFixed(1)} ms of [${runs.map((ms) => ms.toFixed(1)).join(', ')}], ${progress.series.length} ${progress.unit} points`,
    );
    expect(progress.total).toBe(COUNT);
    expect(progress.series.length).toBeLessThanOrEqual(120);
    /* Product budget 50 ms (source-progress spec, criterion 4). Measured 2026-11-19 on an M-series Mac: see the PR. */
    expect(median).toBeLessThanOrEqual(50);
  });

  it('keeps the library model within 4 MB of what it held before source progress', () => {
    setFlagsFromString('--expose-gc');
    const gc = runInNewContext('gc') as () => void;
    const heap = () => {
      gc();
      gc();
      return process.memoryUsage().heapUsed;
    };
    const input = folderInput();
    buildLibraryModel(input);
    const before = heap();
    let model: ReturnType<typeof buildLibraryModel> | null = buildLibraryModel(input);
    const held = heap() - before;
    const dated = model.sources.filter((row) => (row.compiledDay ?? -1) >= 0).length;
    model = null;
    console.log(
      `[perf] library model, ${COUNT} sources and pages — ${(held / 1e6).toFixed(2)} MB retained beyond its inputs, ${dated} rows dated`,
    );
    expect(model).toBeNull();
    /*
     * Product budget: the spec's 4 MB over the model before this feature. Measured 2026-11-19 on Node
     * 24 with this folder: 33.4 MB on main, 42.4 MB when each row kept its covering citations, and
     * 34.6 MB with one day number per row (about 24 B a row, the floor for one more field).
     */
    expect(held).toBeLessThanOrEqual(33.4e6 + 4 * 1024 * 1024);
  });
});
