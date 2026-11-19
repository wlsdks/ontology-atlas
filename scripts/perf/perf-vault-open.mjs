#!/usr/bin/env node
// Measures the installed app's reopen from the derived index's rows (src-tauri/crates/vault-index
// rows.rs) against a build from the files, on generated vaults.
// Usage: pnpm perf:vault-open -- --files=10000 --files=50000 --shape=key --shape=all [--check] [--keep]
// The app's real build code runs under Vitest with the crate's `vault-rows-bridge` answering the
// two row commands; file reads stand in for the app's batch read, so both sides are the floor of
// what the app pays without its WebView bridge. The same run also proves a manifest from rows
// equals one from files (`a_manifest_from_rows_equals_a_manifest_from_files`).
// Generated vaults and indexes live under the OS temp folder and are deleted unless --keep.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, utimesSync } from 'node:fs';
import { cpus, loadavg, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateScaleVault } from './gen-scale-vault.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const MANIFEST = join(ROOT, 'src-tauri', 'Cargo.toml');
const EXE = process.platform === 'win32' ? '.exe' : '';
const BRIDGE = join(ROOT, 'src-tauri', 'target', 'release', `vault-rows-bridge${EXE}`);
const BENCH = join(ROOT, 'src-tauri', 'target', 'release', `vault-index-bench${EXE}`);
const TEST = 'src/entities/docs-vault/lib/local-manifest/build-local-manifest.rows.perf.test.ts';
const WORK = join(tmpdir(), 'atlas-perf-vault-open');
const REPORT = join(WORK, 'report.jsonl');
const MB = 1024 * 1024;

/**
 * Limits from the 2026-11-19 derived-index plan, slice 2. Before: the app's build from files took
 * 1.7 s CPU at 10,000 files and 9.0 s at 50,000, holding 261 to 271 MB of heap at 50,000.
 */
const LIMITS = {
  reopenMs: { 10000: 1000, 50000: 3000 },
  rowsRatio: 0.9,
  bothRatio: 1.5,
};

function parseArgs(argv) {
  const files = [];
  const shapes = [];
  let check = false;
  let keep = false;
  for (const arg of argv) {
    if (arg.startsWith('--files=')) files.push(Number(arg.slice('--files='.length)));
    else if (arg.startsWith('--shape=')) shapes.push(arg.slice('--shape='.length));
    else if (arg === '--check') check = true;
    else if (arg === '--keep') keep = true;
    else if (arg !== '--') throw new Error(`unknown argument ${arg}`);
  }
  return { files: files.length ? files : [10000], shapes: shapes.length ? shapes : ['key'], check, keep };
}

/** Rows are refused for files modified within two seconds of being seen; a vault written just now is dated back. */
function dateBack(dir) {
  const then = new Date(Date.now() - 60_000);
  const visit = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name.endsWith('.md')) utimesSync(path, then, then);
    }
  };
  visit(dir);
}

function prepare(files, shape) {
  const dir = join(WORK, `${shape}-${files}`);
  const indexDir = join(WORK, `index-${shape}-${files}`);
  if (!existsSync(join(dir, 'atlas.md'))) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    generateScaleVault(dir, files, shape);
  }
  dateBack(dir);
  rmSync(indexDir, { recursive: true, force: true });
  // The search index beside the rows, so both files' size is measured together.
  execFileSync(BENCH, ['build', dir], { env: { ...process.env, OATLAS_INDEX_DIR: indexDir }, stdio: 'ignore' });
  return { dir, files, shape, indexDir };
}

const { files, shapes, check, keep } = parseArgs(process.argv.slice(2));
console.log(`vault-open perf · ${cpus().length} cores · load ${loadavg().map((n) => n.toFixed(1)).join(' ')}`);
execFileSync('cargo', ['build', '--release', '--quiet', '-p', 'vault-index', '--bins', '--features', 'index-dir-override', '--manifest-path', MANIFEST], { stdio: 'inherit' });
mkdirSync(WORK, { recursive: true });
rmSync(REPORT, { force: true });
let rows = [];
let status = 1;
try {
  const vaults = files.flatMap((count) => shapes.map((shape) => prepare(count, shape)));
  const run = spawnSync('pnpm', ['exec', 'vitest', 'run', '--project=perf', TEST], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, VAULT_ROWS_BRIDGE: BRIDGE, VAULT_OPEN_VAULTS: JSON.stringify(vaults), VAULT_OPEN_REPORT: REPORT },
  });
  status = run.status ?? 1;
  rows = existsSync(REPORT) ? readFileSync(REPORT, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)) : [];
} finally {
  if (!keep) rmSync(WORK, { recursive: true, force: true });
}

const fmt = (value, digits = 0) => (value === null || value === undefined ? 'n/a' : value.toFixed(digits));
console.log('| files | shape | from files ms (CPU) | reopen, one file changed, ms (CPU) | from rows | heap MB from files / reopen | first open writes rows ms | rows.sqlite / text | both files / text | load |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
let broken = 0;
for (const row of rows) {
  const rowsRatio = row.rowsBytes / row.textBytes;
  const bothRatio = row.folderBytes / row.textBytes;
  console.log(`| ${row.files} | ${row.shape} | ${fmt(row.before.ms)} (${fmt(row.before.cpuMs)}) | ${fmt(row.after.ms)} (${fmt(row.after.cpuMs)}) | ${row.after.fromRows} | ${fmt(row.before.heapMb)} / ${fmt(row.after.heapMb)} | ${fmt(row.cold.writeMs)} | ${fmt(row.rowsBytes / MB)} / ${fmt(row.textBytes / MB)} MB = ${fmt(rowsRatio, 2)} | ${fmt(bothRatio, 2)} | ${fmt(row.load, 1)} |`);
  const over = (name, value, limit) => {
    if (limit !== undefined && value > limit) {
      broken += 1;
      console.error(`over the limit: ${row.files} ${row.shape}: ${name} ${value.toFixed(2)} > ${limit}`);
    }
  };
  over('reopen ms', row.after.ms, LIMITS.reopenMs[row.files]);
  over('rows.sqlite / text', rowsRatio, LIMITS.rowsRatio);
  over('both files / text', bothRatio, LIMITS.bothRatio);
  // The same process measured both, so the heap a reopen holds is compared with the build from files.
  over('reopen heap MB over the build from files', row.after.heapMb, row.before.heapMb);
}
console.log(`load after ${loadavg().map((n) => n.toFixed(1)).join(' ')}`);
if (status !== 0) {
  console.error('the manifest equality test or a measurement failed');
  process.exit(status);
}
if (rows.length !== files.length * shapes.length) {
  console.error(`expected ${files.length * shapes.length} measurements, got ${rows.length}`);
  process.exit(1);
}
if (check && broken > 0) process.exit(1);
