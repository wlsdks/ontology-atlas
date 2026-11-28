/**
 * The quarantine registry, `tests/quarantine.json`: whole test files that block neither a merge
 * nor the release gate while a fix is under way. Each entry names its owner, the reason, the
 * Actions run where the file failed and then passed on a rerun of the same commit, the issue that
 * tracks the fix, and a window of at most 14 days. Gating runs leave the files out, the nightly
 * still runs them, and an entry past its window fails the nightly browser run, never a landing lane.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MERGE_SMOKE_SPECS } from '../../ci/merge-smoke-specs.mjs';

export const REPOSITORY_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const QUARANTINE_REGISTRY = 'tests/quarantine.json';
export const QUARANTINE_MAX_ENTRIES = 10;
export const QUARANTINE_MAX_DAYS = 14;
/** Repeats a fix must pass in a row before its entry is removed: 5, then 10, then 50. */
const PROVE_BATCHES = Object.freeze([5, 10, 50]);
export const PROVE_REQUIRED = PROVE_BATCHES.reduce((sum, size) => sum + size, 0);

const ENTRY_KEYS = Object.freeze(['file', 'owner', 'reason', 'evidence', 'issue', 'added', 'expires']);
const E2E_PREFIX = 'tests/e2e/';
// Each runs alone in its own surface lane, which has no other subject to keep gating.
const SURFACE_LANE_SPECS = Object.freeze(['web-surface-smoke.spec.ts', 'contextual-meaning-editor.spec.ts']);
const BROWSER_SPEC = /^tests\/e2e\/(?:[\w-]+\/)*[\w-]+\.spec\.ts$/;
// Vitest's `app/` and `src/` inventories; a bracket is part of a file name and is escaped in the exclude glob.
const VITEST_FILE = /^(?:app|src)\/(?:[\w[\]-][\w.[\]-]*\/)*[\w[\]-][\w.[\]-]*\.(?:test|spec)\.tsx?$/;
const GITHUB_LOGIN = /^[A-Za-z\d](?:[A-Za-z\d-]{0,38})$/;
const ACTIONS_RUN = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+(?:\/attempts\/\d+|\/job\/\d+)?$/;
const GITHUB_ISSUE = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+$/;
const DAY_MS = 86_400_000;

/** `'browser'` for a Playwright spec, `'vitest'` for a Vitest file, `undefined` for anything else. */
export function quarantineKind(file) {
  if (typeof file !== 'string') return undefined;
  if (BROWSER_SPEC.test(file)) return 'browser';
  if (VITEST_FILE.test(file)) return 'vitest';
  return undefined;
}

/** Milliseconds since the epoch for a real `YYYY-MM-DD` calendar day, else `undefined`. */
function calendarDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const time = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value) return undefined;
  return time;
}

function fileViolations(file, exists) {
  if (file.startsWith('tests/contract/')) return ['a contract file cannot be quarantined'];
  const kind = quarantineKind(file);
  if (!kind) {
    return [`not a Playwright spec under ${E2E_PREFIX} or a Vitest file under app/ or src/ (node:test files cannot be quarantined)`];
  }
  if (kind === 'browser') {
    const spec = file.slice(E2E_PREFIX.length);
    if (MERGE_SMOKE_SPECS.includes(spec)) return ['a merge-smoke spec cannot be quarantined'];
    if (SURFACE_LANE_SPECS.includes(spec)) return ['a surface-lane spec cannot be quarantined: its lane runs nothing else'];
  }
  return exists(file) ? [] : ['the file does not exist'];
}

function dayViolations(entry) {
  const added = calendarDay(entry.added);
  const expires = calendarDay(entry.expires);
  const problems = [];
  if (added === undefined) problems.push('added must be a calendar day, YYYY-MM-DD');
  if (expires === undefined) problems.push('expires must be a calendar day, YYYY-MM-DD');
  if (problems.length > 0) return problems;
  const days = (expires - added) / DAY_MS;
  if (days < 1) return ['expires must come after added'];
  if (days > QUARANTINE_MAX_DAYS) return [`expires is ${days} days after added; the most is ${QUARANTINE_MAX_DAYS}`];
  return [];
}

function entryViolations(entry, exists) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return ['an entry must be an object'];
  const problems = [];
  for (const key of Object.keys(entry)) if (!ENTRY_KEYS.includes(key)) problems.push(`unknown key ${key}`);
  for (const key of ENTRY_KEYS) {
    if (typeof entry[key] !== 'string' || entry[key].trim() === '') problems.push(`${key} is required`);
  }
  if (problems.length > 0) return problems;
  problems.push(...fileViolations(entry.file, exists));
  if (!GITHUB_LOGIN.test(entry.owner)) problems.push('owner must be a GitHub login');
  if (!ACTIONS_RUN.test(entry.evidence)) problems.push('evidence must be a GitHub Actions run URL');
  if (!GITHUB_ISSUE.test(entry.issue)) problems.push('issue must be a GitHub issue URL');
  problems.push(...dayViolations(entry));
  return problems;
}

/**
 * Every rule the registry breaks, as `<file>: <rule>` lines; empty when it is sound. No rule reads
 * today's date: expiry is `expiredEntries`, which only the nightly browser run asks.
 */
export function quarantineViolations(registry, { root = REPOSITORY_ROOT, exists = (file) => existsSync(join(root, file)) } = {}) {
  if (registry === null || typeof registry !== 'object' || Array.isArray(registry)
    || Object.keys(registry).join() !== 'entries' || !Array.isArray(registry.entries)) {
    return ['the registry must be exactly { "entries": [...] }'];
  }
  const problems = [];
  if (registry.entries.length > QUARANTINE_MAX_ENTRIES) {
    problems.push(`${registry.entries.length} entries; the most is ${QUARANTINE_MAX_ENTRIES}`);
  }
  const seen = new Set();
  registry.entries.forEach((entry, index) => {
    const label = typeof entry?.file === 'string' && entry.file ? entry.file : `entry ${index + 1}`;
    if (seen.has(label)) problems.push(`${label}: listed twice`);
    seen.add(label);
    for (const problem of entryViolations(entry, exists)) problems.push(`${label}: ${problem}`);
  });
  return problems;
}

/** The registry, refused whole when any rule fails, so no executor acts on part of it. */
export function readQuarantine({ root = REPOSITORY_ROOT, exists } = {}) {
  const path = join(root, QUARANTINE_REGISTRY);
  let registry;
  try {
    registry = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${QUARANTINE_REGISTRY} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  const problems = quarantineViolations(registry, { root, exists });
  if (problems.length > 0) {
    throw new Error(`${QUARANTINE_REGISTRY} breaks ${problems.length} rule(s):\n${problems.map((line) => `  - ${line}`).join('\n')}`);
  }
  return registry;
}

/** Quarantined Playwright specs, relative to `tests/e2e/` as discovery names them. */
export function quarantinedBrowserSpecs(registry) {
  return registry.entries
    .filter((entry) => quarantineKind(entry.file) === 'browser')
    .map((entry) => entry.file.slice(E2E_PREFIX.length));
}

/** Quarantined Vitest files, relative to the repository root. */
export function quarantinedVitestFiles(registry) {
  return registry.entries.filter((entry) => quarantineKind(entry.file) === 'vitest').map((entry) => entry.file);
}

/** A Vitest `--exclude` glob that matches exactly this path, brackets and all. */
export function vitestExcludeGlob(file) {
  return file.replace(/[\\*?[\]{}()!+@]/g, '\\$&');
}

/** Today's UTC calendar day, `YYYY-MM-DD`. */
export function utcDay(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/** Entries whose last day, `expires`, is before `today`. */
export function expiredEntries(registry, today) {
  const day = calendarDay(today);
  if (day === undefined) throw new Error(`not a calendar day: ${today}`);
  return registry.entries.filter((entry) => calendarDay(entry.expires) < day);
}

/**
 * Runs the batches in order and stops at the first failing repeat. `runBatch(size)` returns how
 * many repeats passed in a row from the start of that batch, `size` when all did.
 */
export function proveRepeats({ runBatch, batches = PROVE_BATCHES, report = () => {} }) {
  const required = batches.reduce((sum, size) => sum + size, 0);
  let passed = 0;
  for (const [index, size] of batches.entries()) {
    const inBatch = runBatch(size);
    if (!Number.isInteger(inBatch) || inBatch < 0 || inBatch > size) throw new Error(`batch of ${size} reported ${inBatch} passes`);
    passed += inBatch;
    report({ batch: index + 1, batches: batches.length, size, inBatch, passed, required });
    if (inBatch < size) return { passed, required, proven: false };
  }
  return { passed, required, proven: true };
}

function* reportSpecs(suite) {
  yield* suite.specs ?? [];
  for (const child of suite.suites ?? []) yield* reportSpecs(child);
}

/** Tests a Playwright JSON report shows as finished without a failure: passed, flaky or a declared skip. */
function finishedCleanly(test) {
  return test.status === 'expected' || test.status === 'flaky'
    || (test.status === 'skipped' && (test.results ?? []).length > 0);
}

/**
 * Passing repeats in a row from a `--repeat-each=<size> --workers=1 --max-failures=1` report.
 * One worker runs the repeats in order and the first failure skips the rest, so whole repeats
 * finished cleanly are exactly the ones before it.
 */
export function passingRepeats(report, size, exitStatus) {
  const tests = [...reportSpecs(report)].flatMap((spec) => spec.tests ?? []);
  if (tests.length === 0 || tests.length % size !== 0) return 0;
  const clean = tests.filter(finishedCleanly).length;
  if (exitStatus === 0 && clean === tests.length) return size;
  return Math.min(Math.floor(clean / (tests.length / size)), size - 1);
}

/** Each spec file in a Playwright JSON report: `failed`, `flaky`, `passed` or `skipped`. */
export function browserOutcomes(report) {
  const outcomes = new Map();
  for (const spec of reportSpecs(report)) {
    const tests = spec.tests ?? [];
    const previous = outcomes.get(spec.file) ?? [];
    outcomes.set(spec.file, [...previous, ...tests.map((test) => test.status)]);
  }
  return new Map([...outcomes].map(([file, statuses]) => {
    if (statuses.includes('unexpected')) return [file, 'failed'];
    if (statuses.includes('flaky')) return [file, 'flaky'];
    if (statuses.includes('expected')) return [file, 'passed'];
    return [file, 'skipped'];
  }));
}
