#!/usr/bin/env node
// Measures the installed app's search index (src-tauri/crates/vault-index) on generated vaults.
// Usage: pnpm perf:vault-index -- --files=10000 --files=50000 --shape=key --shape=all [--check] [--keep]
// Each phase runs in a fresh process of the crate's bench binary, as the app would after a launch.
// Generated vaults and indexes live under the OS temp folder and are deleted unless --keep.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { cpus, loadavg, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateScaleVault } from './gen-scale-vault.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const MANIFEST = join(ROOT, 'src-tauri', 'Cargo.toml');
const BENCH = join(ROOT, 'src-tauri', 'target', 'release', process.platform === 'win32' ? 'vault-index-bench.exe' : 'vault-index-bench');
const WORK = join(tmpdir(), 'atlas-perf-vault-index');
const BYTES_PER_MB = 1024 * 1024;
const REOPEN_RUNS = 5;
const UPDATE_RUNS = 5;

// Ranked lookups span two-syllable and longer Hangul, English, mixed and rare terms.
const QUERIES = JSON.parse(readFileSync(new URL('./scale-vault-words.json', import.meta.url), 'utf8')).queries;

/** Limits from the 2026-11-19 derived-index decision, per file count where they differ. */
const LIMITS = {
  buildMs: { 10000: 4000, 50000: 15000 },
  reopenMs: { 10000: 150, 50000: 600 },
  updateWriteMs: 20,
  searchP95Ms: { 50000: 50 },
  sizeRatio: 0.75,
  peakRssMb: { 50000: 250 },
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

function buildBench() {
  execFileSync('cargo', ['build', '--release', '--quiet', '-p', 'vault-index', '--bin', 'vault-index-bench', '--manifest-path', MANIFEST], { stdio: 'inherit' });
}

/** Runs one bench phase; on macOS and Linux also reads the process's peak resident memory. */
function run(args, env, { measureMemory = false } = {}) {
  const timeFlag = process.platform === 'darwin' ? '-l' : '-v';
  const useTime = measureMemory && process.platform !== 'win32' && existsSync('/usr/bin/time');
  const [command, commandArgs] = useTime ? ['/usr/bin/time', [timeFlag, BENCH, ...args]] : [BENCH, args];
  const result = spawnSync(command, commandArgs, { env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 16 * BYTES_PER_MB });
  if (result.status !== 0) throw new Error(`${args[0]} failed: ${result.stderr}`);
  const report = JSON.parse(result.stdout.trim().split('\n').pop());
  if (useTime) {
    const mac = /(\d+)\s+maximum resident set size/.exec(result.stderr);
    const linux = /Maximum resident set size \(kbytes\): (\d+)/.exec(result.stderr);
    report.peakRssMb = mac ? Number(mac[1]) / BYTES_PER_MB : linux ? Number(linux[1]) / 1024 : null;
  }
  return report;
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

function measure(files, shape) {
  const vault = join(WORK, `${shape}-${files}`);
  const indexDir = join(WORK, `index-${shape}-${files}`);
  if (!existsSync(join(vault, 'atlas.md'))) {
    rmSync(vault, { recursive: true, force: true });
    mkdirSync(vault, { recursive: true });
    generateScaleVault(vault, files, shape);
  }
  rmSync(indexDir, { recursive: true, force: true });
  const env = { OATLAS_INDEX_DIR: indexDir };
  const build = run(['build', vault], env, { measureMemory: true });
  const reopen = Array.from({ length: REOPEN_RUNS }, () => run(['reopen', vault], env));
  const updates = Array.from({ length: UPDATE_RUNS }, () => run(['update', vault], env));
  const search = run(['search', vault, ...QUERIES], env);
  const size = run(['size', vault], env);
  if (updates.some((update) => update.found !== 1)) throw new Error('an updated file was not searchable after its pass');
  return {
    files,
    shape,
    buildMs: build.totalMs,
    peakRssMb: build.peakRssMb,
    reopenMs: median(reopen.map((r) => r.totalMs)),
    reopenStampPassMs: median(reopen.map((r) => r.stampPassMs)),
    updateWriteMs: median(updates.map((u) => u.writeMs)),
    updateStampPassMs: median(updates.map((u) => u.stampPassMs)),
    searchP50Ms: search.p50Ms,
    searchP95Ms: search.p95Ms,
    searchP95OfMediansMs: search.p95OfMediansMs,
    indexMb: size.indexBytes / BYTES_PER_MB,
    textMb: size.textBytes / BYTES_PER_MB,
    sizeRatio: size.indexBytes / size.textBytes,
  };
}

function failures(row) {
  const broken = [];
  const limitFor = (limit) => (typeof limit === 'number' ? limit : limit[row.files]);
  const over = (name, value, limit) => {
    if (limit !== undefined && value !== null && value > limit) broken.push(`${name} ${value.toFixed(2)} > ${limit}`);
  };
  over('build ms', row.buildMs, limitFor(LIMITS.buildMs));
  over('reopen ms', row.reopenMs, limitFor(LIMITS.reopenMs));
  over('one-file update ms', row.updateWriteMs, LIMITS.updateWriteMs);
  // Per-query medians: the gate measures the index, not another process taking the CPU mid-sample.
  over('ranked top-20 p95 ms', row.searchP95OfMediansMs, limitFor(LIMITS.searchP95Ms));
  over('search.sqlite / text', row.sizeRatio, LIMITS.sizeRatio);
  over('peak RSS MB', row.peakRssMb, limitFor(LIMITS.peakRssMb));
  return broken;
}

const { files, shapes, check, keep } = parseArgs(process.argv.slice(2));
console.log(`vault-index perf · ${cpus().length} cores · load ${loadavg().map((n) => n.toFixed(1)).join(' ')}`);
buildBench();
const rows = [];
try {
  for (const count of files) for (const shape of shapes) rows.push(measure(count, shape));
} finally {
  if (!keep) rmSync(WORK, { recursive: true, force: true });
}
const fmt = (value, digits = 0) => (value === null || value === undefined ? 'n/a' : value.toFixed(digits));
console.log('| files | shape | build ms | peak RSS MB | reopen ms (stamp pass) | update write ms (stamp pass) | search p50 / p95 / p95 of medians ms | index MB / text MB |');
console.log('|---|---|---|---|---|---|---|---|');
let broken = 0;
for (const row of rows) {
  console.log(`| ${row.files} | ${row.shape} | ${fmt(row.buildMs)} | ${fmt(row.peakRssMb)} | ${fmt(row.reopenMs)} (${fmt(row.reopenStampPassMs)}) | ${fmt(row.updateWriteMs, 2)} (${fmt(row.updateStampPassMs)}) | ${fmt(row.searchP50Ms, 1)} / ${fmt(row.searchP95Ms, 1)} / ${fmt(row.searchP95OfMediansMs, 1)} | ${fmt(row.indexMb)} / ${fmt(row.textMb)} = ${fmt(row.sizeRatio, 2)} |`);
  for (const failure of failures(row)) {
    broken += 1;
    console.error(`over the limit: ${row.files} ${row.shape}: ${failure}`);
  }
}
console.log(`load after ${loadavg().map((n) => n.toFixed(1)).join(' ')}`);
if (check && broken > 0) process.exit(1);
