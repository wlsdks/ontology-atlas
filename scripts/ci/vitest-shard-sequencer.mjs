import { appendFileSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { BaseSequencer } from 'vitest/node';

/**
 * Splits a sharded Vitest sweep by measured seconds instead of file count.
 *
 * Vitest's own `--shard` sorts files by a path hash and cuts equal counts, so a shard's time is
 * whatever its files happen to weigh: the full sweep measured 271 s, 222 s and 186 s on its three
 * runners (four trains, 2026-11-17/18). Every shard sees the same file list and the same weights,
 * so each computes the same assignment and keeps only its own part.
 */
export const DURATIONS = new URL('../data/vitest-file-durations.json', import.meta.url);

/** `project:path` for a file, the key the durations file uses. */
export function specKey(project, root, moduleId) {
  return `${project}:${relative(root, moduleId).replaceAll('\\', '/')}`;
}

function readDurations(url = DURATIONS) {
  try {
    const parsed = JSON.parse(readFileSync(url, 'utf8'));
    return parsed && typeof parsed.files === 'object' && parsed.files ? parsed.files : {};
  } catch {
    return {};
  }
}

/**
 * Longest-first greedy assignment. `entries` are `{ key, seconds }`; a file never measured
 * weighs the median of the measured ones. Ties break by key, so the result does not depend on
 * input order. Returns one key list per shard.
 */
export function assignShards(entries, count) {
  const known = entries.map((entry) => entry.seconds).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  const fallback = known.length ? known[Math.floor(known.length / 2)] : 1;
  const weighed = entries
    .map(({ key, seconds }) => ({ key, seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : fallback }))
    .sort((a, b) => b.seconds - a.seconds || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const shards = Array.from({ length: count }, () => ({ load: 0, keys: [] }));
  for (const entry of weighed) {
    let target = shards[0];
    for (const shard of shards) if (shard.load < target.load) target = shard;
    target.load += entry.seconds;
    target.keys.push(entry.key);
  }
  return shards.map((shard) => shard.keys);
}

export class DurationShardSequencer extends BaseSequencer {
  async shard(files) {
    const { index, count } = this.ctx.config.shard;
    const root = this.ctx.config.root;
    const durations = readDurations();
    const keyed = files.map((spec) => ({ spec, key: specKey(spec.project.name, root, spec.moduleId) }));
    const shards = assignShards(keyed.map(({ key }) => ({ key, seconds: durations[key] })), count);
    const mine = new Set(shards[index - 1]);
    return keyed.filter(({ key }) => mine.has(key)).map(({ spec }) => spec);
  }
}

/**
 * Appends one JSON line per test file to `VITEST_TIMINGS_FILE`: what the file cost a runner,
 * environment and import included, which the JSON reporter's test-only duration leaves out.
 * `pnpm unit:durations` turns CI's lines into the weights above.
 */
export class VitestTimingsReporter {
  constructor(file = process.env.VITEST_TIMINGS_FILE) {
    this.file = file;
  }

  onInit(vitest) {
    this.root = vitest.config.root;
  }

  onTestModuleEnd(testModule) {
    if (!this.file) return;
    const d = testModule.diagnostic();
    const ms = d.environmentSetupDuration + d.prepareDuration + d.collectDuration + d.setupDuration + d.duration;
    try {
      appendFileSync(this.file, `${JSON.stringify({ key: specKey(testModule.project.name, this.root, testModule.moduleId), ms: Math.round(ms) })}\n`);
    } catch {
      // A timing line is evidence for the next rebalance, never part of the test result.
    }
  }
}
