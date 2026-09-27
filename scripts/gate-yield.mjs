#!/usr/bin/env node
/**
 * Which CI checks ever catch anything?
 *
 * `run-ci-lane.mjs` appends one JSON line per command to `CI_LANE_REPORT`, and
 * `checks.yml` uploads that file as a `ci-lane-report-*` artifact kept 90 days. This
 * script downloads those artifacts into a durable cache and counts, per check, how many
 * distinct runs ran it and how many of those runs saw it fail.
 *
 * What it measures is CI only. A defect that `pre-push` or `pnpm checks:changed` caught
 * before the push never reaches this data, so a quiet row (`no CI failure`: 50+ runs,
 * no failed run, first seen 60+ days ago) is a check to examine, not one to delete.
 *
 * GitHub's run listing stops at 1,000 results (about eight days of this repository), so
 * runs are listed one `created` day at a time, and every run ever cached is aggregated,
 * not only the window listed now. The REST quota is shared with every lander: the script
 * refuses to start under 500 remaining calls, re-reads the quota every 50 calls, and
 * stops with a table labelled partial when it runs low.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const QUIET_MIN_RUNS = 50;
export const QUIET_MIN_AGE_DAYS = 60;
export const MIN_REMAINING_QUOTA = 500;
const QUOTA_RECHECK_CALLS = 50;
const LOOKBACK_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

const DROPPED_FLAG = /^--(?:base|changed|shard)(?:=|$)|^--passWithNoTests$/;
const FILE_ARGUMENT = /\/|\.(?:[cm]?[jt]sx?|json|md|ya?ml|css)$/;

/**
 * Reduces a command to the check it runs: comparison bases, shards, `--changed`,
 * `--passWithNoTests` and file arguments go, so per-file ESLint and per-shard Vitest
 * invocations collapse into one row each.
 */
export function normaliseCommand(command) {
  return String(command)
    .replace(/(\s--[A-Za-z-]+=)(?:'[^']*'|"[^"]*")/g, '$1_')
    .split(/\s+/)
    .filter((token) => token && !DROPPED_FLAG.test(token) && (token.startsWith('-') || !FILE_ARGUMENT.test(token)))
    .join(' ');
}

/**
 * `records`: report lines, each with its `runId` and the run's `at` (ISO time). A `skip`
 * line is not a run of the check. Runs and failures count distinct runs, not lines.
 * Rows sort by failures ascending, then runs descending.
 */
export function aggregateYield(records, { now = Date.now() } = {}) {
  const byCommand = new Map();
  for (const record of records) {
    if (record.status !== 'pass' && record.status !== 'fail') continue;
    const command = normaliseCommand(record.command);
    const at = Date.parse(record.at);
    const row = byCommand.get(command) ?? { command, runIds: new Set(), failedRunIds: new Set(), firstSeen: null, lastFailure: null };
    row.runIds.add(String(record.runId));
    if (Number.isFinite(at) && (row.firstSeen === null || at < row.firstSeen)) row.firstSeen = at;
    if (record.status === 'fail') {
      row.failedRunIds.add(String(record.runId));
      if (Number.isFinite(at) && (row.lastFailure === null || at > row.lastFailure)) row.lastFailure = at;
    }
    byCommand.set(command, row);
  }
  return [...byCommand.values()]
    .map(({ runIds, failedRunIds, ...row }) => {
      const runs = runIds.size;
      const failures = failedRunIds.size;
      const quiet = failures === 0 && runs >= QUIET_MIN_RUNS && row.firstSeen !== null && now - row.firstSeen >= QUIET_MIN_AGE_DAYS * DAY_MS;
      return { ...row, runs, failures, verdict: failures > 0 ? 'catches' : quiet ? 'no CI failure' : 'collecting' };
    })
    .sort((a, b) => a.failures - b.failures || b.runs - a.runs || a.command.localeCompare(b.command));
}

const day = (ms) => (ms === null ? '-' : new Date(ms).toISOString().slice(0, 10));

export function formatTable(rows) {
  const header = ['failed runs', 'runs', 'first seen', 'last failure', 'verdict', 'check'];
  const body = rows.map((row) => [String(row.failures), String(row.runs), day(row.firstSeen), day(row.lastFailure), row.verdict, row.command]);
  const widths = header.slice(0, -1).map((title, index) => Math.max(title.length, ...body.map((cells) => cells[index].length)));
  const line = (cells) => cells.map((cell, index) => (index < widths.length ? cell.padEnd(widths[index]) : cell)).join('  ');
  return [line(header), ...body.map(line)].join('\n');
}

/** Parses a JSONL report, dropping lines that are not report records. */
export function parseReport(text, { at, runId }) {
  return String(text).split('\n').filter(Boolean).flatMap((line) => {
    try {
      const record = JSON.parse(line);
      return record && typeof record.command === 'string' ? [{ ...record, runId: record.runId || runId, at }] : [];
    } catch {
      return [];
    }
  });
}

export function cacheRoot(env = process.env) {
  return env.ATLAS_GATE_YIELD_CACHE || join(homedir(), '.cache', 'atlas-gate-yield');
}

/** Every record in every cached run, whichever window listed it. */
export function readCache(root) {
  if (!existsSync(root)) return [];
  const records = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const dir = join(root, entry.name);
    if (!entry.isDirectory() || !existsSync(join(dir, 'run.json'))) continue;
    const meta = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'));
    const walk = (folder) => {
      for (const item of readdirSync(folder, { withFileTypes: true })) {
        const path = join(folder, item.name);
        if (item.isDirectory()) walk(path);
        else if (item.name.endsWith('.jsonl')) records.push(...parseReport(readFileSync(path, 'utf8'), { at: meta.at, runId: String(meta.id) }));
      }
    };
    walk(dir);
  }
  return records;
}

function unzipFile(zip, target) {
  execFileSync('unzip', ['-o', '-q', zip, '-d', target]);
}

/**
 * Downloads one run's lane reports into `dir`. `gh(args, encoding)` is `gh api`; a skipped
 * run is cached empty without a call. `run.json` is written last, so a run counts as
 * cached only once every artifact landed.
 */
export function fetchRun({ run, dir, gh, unzip = unzipFile }) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  if (run.conclusion !== 'skipped') {
    const listing = JSON.parse(gh([`repos/{owner}/{repo}/actions/runs/${run.id}/artifacts?per_page=100`], 'utf8'));
    for (const artifact of listing.artifacts ?? []) {
      if (!artifact.name.startsWith('ci-lane-report-') || artifact.expired) continue;
      const zip = join(dir, `${artifact.id}.zip`);
      writeFileSync(zip, gh([`repos/{owner}/{repo}/actions/artifacts/${artifact.id}/zip`], 'buffer'));
      const target = join(dir, String(artifact.id));
      mkdirSync(target, { recursive: true });
      unzip(zip, target);
      rmSync(zip);
    }
  }
  writeFileSync(join(dir, 'run.json'), JSON.stringify({ id: run.id, at: run.created_at, conclusion: run.conclusion }));
}

function realGh(args, encoding = 'utf8') {
  return execFileSync('gh', ['api', ...args], { encoding, maxBuffer: 256 * 1024 * 1024 });
}

export function main({ argv = process.argv.slice(2), env = process.env, gh = realGh, now = Date.now(), stdout = process.stdout, stderr = process.stderr } = {}) {
  const runsArg = argv.find((arg) => arg.startsWith('--runs='))?.slice('--runs='.length) ?? '200';
  const limit = Number(runsArg);
  if (!Number.isInteger(limit) || limit < 1) {
    stderr.write(`[gates:yield] --runs must be a positive integer, got ${runsArg}\n`);
    return 2;
  }
  const remainingQuota = () => JSON.parse(gh(['rate_limit'], 'utf8')).resources?.core?.remaining ?? 0;
  const startQuota = remainingQuota();
  if (startQuota < MIN_REMAINING_QUOTA) {
    stderr.write(`[gates:yield] only ${startQuota} REST calls remain (under ${MIN_REMAINING_QUOTA}); the quota is shared with landing, so try again after it resets\n`);
    return 1;
  }
  let calls = 0;
  let partial = false;
  const counted = (args, encoding) => {
    if (calls > 0 && calls % QUOTA_RECHECK_CALLS === 0 && remainingQuota() < MIN_REMAINING_QUOTA) {
      partial = true;
      throw new Error('quota');
    }
    calls += 1;
    return gh(args, encoding);
  };

  const root = cacheRoot(env);
  let listed = 0;
  let fetched = 0;
  try {
    // One `created` day per query keeps every listing far below GitHub's 1,000-result cap.
    for (let back = 0; back < LOOKBACK_DAYS && listed < limit; back += 1) {
      const date = day(now - back * DAY_MS);
      for (let page = 1; listed < limit; page += 1) {
        const listing = JSON.parse(counted([`repos/{owner}/{repo}/actions/workflows/checks.yml/runs?status=completed&created=${date}&per_page=100&page=${page}`], 'utf8'));
        const batch = listing.workflow_runs ?? [];
        for (const run of batch.slice(0, limit - listed)) {
          listed += 1;
          const dir = join(root, String(run.id));
          if (existsSync(join(dir, 'run.json'))) continue;
          fetchRun({ run, dir, gh: counted });
          fetched += 1;
        }
        if (batch.length < 100) break;
      }
    }
  } catch (error) {
    if (!partial) throw error;
  }

  const records = readCache(root);
  const cachedRuns = existsSync(root) ? readdirSync(root).length : 0;
  stdout.write(`[gates:yield] listed ${listed} checks.yml run(s), fetched ${fetched}, ${calls} REST call(s); ${cachedRuns} run(s) cached in ${root}\n`);
  if (partial) stdout.write(`[gates:yield] PARTIAL: stopped under ${MIN_REMAINING_QUOTA} remaining REST calls; the table covers only what is cached\n`);
  if (records.length === 0) {
    stdout.write('[gates:yield] no lane reports yet. Reports start with the change that added CI_LANE_REPORT, so earlier runs carry none; run this again once CI has accumulated runs.\n');
    return 0;
  }
  const times = records.map((record) => Date.parse(record.at)).filter(Number.isFinite);
  stdout.write(`[gates:yield] data covers ${day(Math.min(...times))} to ${day(Math.max(...times))}\n`);
  stdout.write(`${formatTable(aggregateYield(records, { now }))}${partial ? '\n(partial)' : ''}\n`);
  stdout.write(`\nno CI failure = ${QUIET_MIN_RUNS}+ runs, 0 failed runs, first seen ${QUIET_MIN_AGE_DAYS}+ days ago.\n`);
  stdout.write('Catches by pre-push and pnpm checks:changed never reach CI and are not in this data: a quiet row is a candidate to examine, not to delete.\n');
  return 0;
}

if (process.argv[1]?.endsWith('gate-yield.mjs')) {
  process.exitCode = main();
}
