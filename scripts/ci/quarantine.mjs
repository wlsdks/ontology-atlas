#!/usr/bin/env node
/**
 * The quarantine's four jobs (`tests/quarantine.json`, `scripts/lib/ci/quarantine.mjs`):
 *
 *   run-browser          run the quarantined Playwright specs and print passed or failed per file
 *   run-unit             the same for the quarantined Vitest files
 *   check-expiry         fail when an entry is past its last day; only the nightly browser run asks
 *   prove <file>         repeat a file in batches of 5, 10 and 50, stopping at the first failure
 *
 * `run-browser` and `run-unit` exit 0 whatever the tests do, and 1 only when a file produced no
 * result: a quarantined file never fails the night, but a run that measured nothing says so.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  browserOutcomes,
  expiredEntries,
  passingRepeats,
  PROVE_REQUIRED,
  proveRepeats,
  quarantineKind,
  quarantinedBrowserSpecs,
  quarantinedVitestFiles,
  readQuarantine,
  REPOSITORY_ROOT,
  utcDay,
} from '../lib/ci/quarantine.mjs';
import { FAILING_SPEC_TITLE } from './run-playwright-ci.mjs';

const USAGE = `Usage: node scripts/ci/quarantine.mjs <command>
  run-browser                    run the quarantined Playwright specs; exit 0 unless one produced no result
  run-unit                       run the quarantined Vitest files; exit 0 unless one produced no result
  check-expiry [--today=YYYY-MM-DD]  exit 1 when an entry is past its expires day (default: today, UTC)
  prove <file>                   repeat a Playwright spec or Vitest file ${PROVE_REQUIRED} times in batches of 5, 10 and 50`;

/** A Playwright file argument is a regex; anchor and escape it so it names exactly one spec. */
function playwrightFilter(spec) {
  return `/tests/e2e/${spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return undefined; }
}

function reportPath(cwd, name) {
  const directory = resolve(cwd, 'output/quarantine');
  mkdirSync(directory, { recursive: true });
  const path = resolve(directory, name);
  rmSync(path, { force: true });
  return path;
}

function annotate(env, line) {
  return env.GITHUB_ACTIONS === 'true' ? [line] : [];
}

function printOutcomes(rows, { env, log }) {
  let missing = 0;
  for (const { file, outcome, entry } of rows) {
    if (outcome === 'no result') missing++;
    log(`[quarantine] ${outcome.padEnd(9)} ${file}  (owner ${entry.owner}, expires ${entry.expires}, ${entry.issue})`);
    if (outcome === 'failed' || outcome === 'no result') {
      for (const line of annotate(env, `::warning file=${file},title=quarantined test ${outcome}::${file} is quarantined until ${entry.expires}; ${entry.issue}`)) log(line);
    }
  }
  const failed = rows.filter((row) => row.outcome === 'failed').length;
  log(`[quarantine] ${rows.length} quarantined file(s): ${rows.length - failed - missing} passed, ${failed} failed, ${missing} without a result`);
  return missing === 0 ? 0 : 1;
}

function entryFor(registry, file) {
  return registry.entries.find((entry) => entry.file === file);
}

function runBrowser({ registry, spawn, cwd, env, log }) {
  const specs = quarantinedBrowserSpecs(registry);
  if (specs.length === 0) {
    log('[quarantine] run-browser: nothing is quarantined');
    return 0;
  }
  const output = reportPath(cwd, 'browser-results.json');
  spawn('pnpm', ['exec', 'playwright', 'test', ...specs.map(playwrightFilter), '--reporter=list,json'], {
    cwd, env: { ...env, PLAYWRIGHT_JSON_OUTPUT_NAME: output }, stdio: 'inherit',
  });
  const outcomes = browserOutcomes(readJson(output) ?? {});
  return printOutcomes(specs.map((spec) => {
    const file = `tests/e2e/${spec}`;
    return { file, entry: entryFor(registry, file), outcome: outcomes.get(spec) ?? 'no result' };
  }), { env, log });
}

function runUnit({ registry, spawn, cwd, env, log }) {
  const files = quarantinedVitestFiles(registry);
  if (files.length === 0) {
    log('[quarantine] run-unit: nothing is quarantined');
    return 0;
  }
  const output = reportPath(cwd, 'unit-results.json');
  spawn('pnpm', ['exec', 'vitest', 'run', ...files, '--reporter=default', '--reporter=json', `--outputFile.json=${output}`], {
    cwd, env, stdio: 'inherit',
  });
  const outcomes = new Map((readJson(output)?.testResults ?? [])
    .map((result) => [relative(cwd, result.name).split('\\').join('/'), result.status === 'passed' ? 'passed' : 'failed']));
  return printOutcomes(files.map((file) => ({ file, entry: entryFor(registry, file), outcome: outcomes.get(file) ?? 'no result' })), { env, log });
}

function checkExpiry({ registry, today, env, log }) {
  const expired = expiredEntries(registry, today);
  for (const entry of expired) {
    log(`[quarantine] expired: ${entry.file} (owner ${entry.owner}) was quarantined until ${entry.expires}; fix it and paste \`node scripts/ci/quarantine.mjs prove ${entry.file}\`, or renew it with new evidence. ${entry.issue}`);
    // The title `pnpm pr:land` lists failing files by, so every landing names the entry.
    for (const line of annotate(env, `::error file=${entry.file},title=${FAILING_SPEC_TITLE}::${entry.file} quarantine expired on ${entry.expires}`)) log(line);
  }
  if (expired.length > 0) return 1;
  log(`[quarantine] ${registry.entries.length} entr${registry.entries.length === 1 ? 'y' : 'ies'}, none past its expires day on ${today}`);
  return 0;
}

function playwrightBatch(file, size, { spawn, cwd, env }) {
  const output = reportPath(cwd, 'prove-results.json');
  const run = spawn('pnpm', ['exec', 'playwright', 'test', playwrightFilter(file.slice('tests/e2e/'.length)),
    `--repeat-each=${size}`, '--retries=0', '--workers=1', '--max-failures=1', '--reporter=dot,json'], {
    cwd, env: { ...env, PLAYWRIGHT_JSON_OUTPUT_NAME: output }, stdio: 'inherit',
  });
  return passingRepeats(readJson(output) ?? {}, size, run.status);
}

function vitestBatch(file, size, { spawn, cwd, env, log }) {
  for (let repeat = 0; repeat < size; repeat++) {
    const run = spawn('pnpm', ['exec', 'vitest', 'run', file], { cwd, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (run.status !== 0) {
      log(`${run.stdout ?? ''}${run.stderr ?? ''}`.trimEnd());
      return repeat;
    }
  }
  return size;
}

function prove({ file, spawn, cwd, env, log }) {
  const kind = quarantineKind(file);
  if (!kind) throw new Error(`prove takes a Playwright spec under tests/e2e/ or a Vitest file under app/ or src/: ${file}`);
  if (!existsSync(resolve(cwd, file))) throw new Error(`no such file: ${file}`);
  const runBatch = (size) => (kind === 'browser'
    ? playwrightBatch(file, size, { spawn, cwd, env })
    : vitestBatch(file, size, { spawn, cwd, env, log }));
  const result = proveRepeats({
    runBatch,
    report: ({ batch, batches, size, inBatch, passed, required }) => log(
      `[quarantine] batch ${batch}/${batches}: ${inBatch} of ${size} passed (${passed} of ${required})`,
    ),
  });
  log(result.proven
    ? `[quarantine] prove ${file}: ${result.passed} of ${result.required} passed`
    : `[quarantine] prove ${file}: ${result.passed} of ${result.required} passed; stopped at the first failure`);
  return result.proven ? 0 : 1;
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h') return { command: 'help', ok: Boolean(command) };
  if (command === 'run-browser' || command === 'run-unit') {
    if (rest.length > 0) throw new Error(`${command} takes no arguments`);
    return { command };
  }
  if (command === 'check-expiry') {
    if (rest.length > 1 || (rest.length === 1 && !rest[0].startsWith('--today='))) throw new Error('check-expiry takes only --today=YYYY-MM-DD');
    return { command, today: rest[0]?.slice('--today='.length) };
  }
  if (command === 'prove') {
    if (rest.length !== 1) throw new Error('prove takes one file');
    return { command, file: rest[0] };
  }
  throw new Error(`unknown command: ${command}`);
}

/**
 * Runs one command and returns its exit code; a malformed argument throws. Tests pass `spawn`,
 * `env`, `log` and a `registry` in place of the file.
 *
 * @param {string[]} argv
 * @param {{
 *   spawn?: (command: string, args: string[], options: object) => { status: number | null, stdout?: string, stderr?: string },
 *   cwd?: string,
 *   env?: Record<string, string | undefined>,
 *   log?: (line: string) => void,
 *   registry?: { entries: Array<Record<string, string>> },
 *   now?: Date,
 * }} [options]
 * @returns {number}
 */
export function runQuarantine(argv, {
  spawn = spawnSync,
  cwd = REPOSITORY_ROOT,
  env = process.env,
  log = (line) => console.log(line),
  registry,
  now = new Date(),
} = {}) {
  const options = parseArguments(argv);
  if (options.command === 'help') {
    log(USAGE);
    return options.ok ? 0 : 2;
  }
  if (options.command === 'prove') return prove({ file: options.file, spawn, cwd, env, log });
  const sound = registry ?? readQuarantine({ root: cwd });
  if (options.command === 'run-browser') return runBrowser({ registry: sound, spawn, cwd, env, log });
  if (options.command === 'run-unit') return runUnit({ registry: sound, spawn, cwd, env, log });
  return checkExpiry({ registry: sound, today: options.today ?? utcDay(now), env, log });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = runQuarantine(process.argv.slice(2)); }
  catch (error) { console.error(`[quarantine] ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 2; }
}
