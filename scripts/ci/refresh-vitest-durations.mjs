#!/usr/bin/env node
// Rewrites the per-file weights that balance the Unit · Contract shards from timing lines.
// Usage: gh run download <run-id> -p "vitest-timings-*" -D output/vitest-timings
// then pnpm unit:durations -- output/vitest-timings
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DURATIONS } from './vitest-shard-sequencer.mjs';

/** Timing lines -> seconds per key; a file timed twice keeps its longest run. */
export function measureLines(text) {
  const files = new Map();
  for (const line of String(text).split('\n')) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    if (typeof row?.key !== 'string' || !Number.isFinite(row.ms) || row.ms < 0) continue;
    files.set(row.key, Math.max(files.get(row.key) ?? 0, row.ms / 1000));
  }
  return files;
}

/** Measured files replace their weight; unmeasured ones keep it while their file exists. */
export function mergeDurations(history, measured, isLive = () => true) {
  const files = Object.fromEntries(Object.entries(history.files ?? {}).filter(([key]) => isLive(key)));
  for (const [key, seconds] of measured) files[key] = Number(seconds.toFixed(3));
  const sorted = Object.fromEntries(Object.keys(files).sort((a, b) => a.localeCompare(b, 'en')).map((key) => [key, files[key]]));
  return { version: 1, files: sorted };
}

function timingPaths(target) {
  if (statSync(target).isFile()) return [target];
  return readdirSync(target, { recursive: true })
    .map((name) => join(target, String(name)))
    .filter((path) => path.endsWith('.jsonl'));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const targets = process.argv.slice(2).filter((arg) => arg !== '--' && !arg.startsWith('--'));
  const paths = targets.flatMap(timingPaths);
  if (paths.length === 0) {
    console.error('[unit:durations] no .jsonl timing files under the given paths');
    process.exitCode = 1;
  } else {
    const measured = new Map();
    for (const path of paths) {
      for (const [key, seconds] of measureLines(readFileSync(path, 'utf8'))) {
        measured.set(key, Math.max(measured.get(key) ?? 0, seconds));
      }
    }
    const history = existsSync(DURATIONS) ? JSON.parse(readFileSync(DURATIONS, 'utf8')) : { files: {} };
    const live = (key) => existsSync(new URL(`../../${key.slice(key.indexOf(':') + 1)}`, import.meta.url));
    writeFileSync(DURATIONS, `${JSON.stringify(mergeDurations(history, measured, live), null, 2)}\n`);
    console.log(`[unit:durations] ${measured.size} files measured from ${paths.length} file(s)`);
  }
}
