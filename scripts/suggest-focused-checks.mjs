#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  formatFocusedCheckSuggestions,
  suggestFocusedChecks,
} from './lib/focused-check-suggestions.mjs';

const SHARED_AGENT_CONFIG_PATTERNS = [
  /^\.agents\/skills\/[^/]+\/SKILL\.md$/,
  /^\.codex\/(?:config\.toml|hooks\.json)$/,
  /^\.codex\/hooks\/(?:block-npm-publish|inject-ontology-summary)\.sh$/,
];
const LOCAL_AGENT_STATE_PREFIXES = ['.agents/', '.codex/'];

/**
 * A deleted file is not a check subject.
 *
 * ⚠️ **Measured 2026-08-21**: `git diff --name-only` **also returns deleted paths.**
 * Feeding those into the suggester builds `eslint <deleted file>`, and that command
 * dies on "no such file" — which is exactly how the push retiring the connect sheet
 * was blocked (the hook went red in 16 seconds).
 *
 * What was deleted still matters (the ledgers and contracts pointing at that file
 * should break). But that is **the contract checks' job**; handing a non-existent path
 * to a tool that reads files is simply a malfunction.
 */
function existingPaths(paths, { cwd = process.cwd(), exists = existsSync } = {}) {
  return paths.filter((path) => exists(resolve(cwd, path)));
}

export function changedPathsFromGit({
  cwd = process.cwd(),
  spawn = spawnSync,
  // The existence predicate is injectable so that de-duplication and
  // deleted-path filtering can be measured **separately**. Combined, testing one of
  // them would require creating files on disk.
  exists = existsSync,
} = {}) {
  const tracked = spawnGit({ cwd, spawn, args: ['diff', '--name-only', 'HEAD', '--'] });
  const untracked = spawnGit({ cwd, spawn, args: ['ls-files', '--others', '--exclude-standard'] });
  return existingPaths(
    uniqueLines(`${tracked}\n${untrackedPathsForAdvisor(untracked).join('\n')}`),
    { cwd, exists },
  );
}

function spawnGit({ cwd, spawn, args }) {
  const result = spawn('git', args, {
    cwd,
    encoding: 'utf-8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim();
    throw new Error(detail || `git ${args.join(' ')} exited ${result.status}`);
  }
  return String(result.stdout || '');
}

function uniqueLines(output) {
  return [...new Set(String(output || '').split(/\r?\n/).filter(Boolean))];
}

export function untrackedPathsForAdvisor(output) {
  return uniqueLines(output).filter(
    (path) =>
      SHARED_AGENT_CONFIG_PATTERNS.some((pattern) => pattern.test(path)) ||
      !LOCAL_AGENT_STATE_PREFIXES.some((prefix) => path.startsWith(prefix)),
  );
}

/**
 * **Runs the recommendations as given**, stopping at the first failure.
 *
 * **Why this mode exists** (2026-08-21). This tool has always named **exactly** what
 * to run. But people (and agents) took that list and **ran only part of it.** Two CI
 * rounds burned that way in one day on 2026-08-20 — only `test:contracts` was run
 * while `test:run` and e2e were skipped, and the break was precisely in what was
 * skipped.
 *
 * The same repository's `pre-commit` hook already recorded the lesson: *"a discipline
 * that relies on memory, once it repeats three times, is not a discipline but an
 * accident queue."* Removing the room to pick is the answer, and the place to remove
 * it is **the suggester itself.**
 *
 * Why it stops at the first failure: later checks usually collapse from the same
 * cause, so running them all lengthens the output without adding information. This
 * gives exactly one thing to fix.
 */
const PLAYWRIGHT_PREFIX = 'pnpm exec playwright test ';

/**
 * Collapse many single-spec Playwright invocations into one.
 *
 * **Why** (measured 2026-08-22). Playwright commands are emitted one spec at a time,
 * which is right for a human who wants to run one. On a large change it is not: a
 * 1,536-file branch produced **657** checks, most of them a separate
 * `playwright test <one spec>`. Each invocation pays its own startup and global
 * setup, and the hook runs them serially — 35 checks took 40 minutes, putting the
 * full run past **twelve hours**. CI runs the same specs sharded in parallel and
 * finishes in about eight minutes.
 *
 * Playwright accepts several spec paths in a single invocation, so the specs are
 * merged into one command. **Coverage is identical** — the same spec files, in one
 * process instead of N. Nothing is dropped and nothing is deferred, which is what
 * separates this from the "pick a few and hope" failure this tool exists to stop.
 *
 * The merged command takes the place of the first Playwright entry so ordering is
 * preserved: whatever ran before e2e still runs before it.
 */
export function collapsePlaywrightCommands(commands) {
  const specs = [];
  const seen = new Set();
  for (const c of commands) {
    if (!c.command.startsWith(PLAYWRIGHT_PREFIX)) continue;
    for (const spec of c.command.slice(PLAYWRIGHT_PREFIX.length).trim().split(/\s+/)) {
      if (spec && !seen.has(spec)) {
        seen.add(spec);
        specs.push(spec);
      }
    }
  }
  // One invocation already — nothing to gain, and rewriting it would only lose the
  // suggester's own wording.
  if (commands.filter((c) => c.command.startsWith(PLAYWRIGHT_PREFIX)).length < 2) {
    return commands;
  }
  const merged = {
    command: PLAYWRIGHT_PREFIX + specs.join(' '),
    reason: `${specs.length} e2e specs in one Playwright run — same coverage, one startup`,
  };
  const out = [];
  let placed = false;
  for (const c of commands) {
    if (!c.command.startsWith(PLAYWRIGHT_PREFIX)) {
      out.push(c);
      continue;
    }
    if (!placed) {
      out.push(merged);
      placed = true;
    }
  }
  return out;
}

export function runFocusedChecks({
  commands = [],
  cwd = process.cwd(),
  stdout = process.stdout,
  spawn = spawnSync,
} = {}) {
  if (commands.length === 0) {
    stdout.write('[focused-checks] nothing to run: no check matches the changed paths.\n');
    return 0;
  }
  const before = commands.length;
  commands = collapsePlaywrightCommands(commands);
  if (commands.length !== before) {
    stdout.write(
      `[focused-checks] collapsed ${before - commands.length + 1} e2e commands into one Playwright run ` +
        `(${before} -> ${commands.length}). The same specs run the same number of times; only startup happens once.\n`,
    );
  }
  for (const [index, suggestion] of commands.entries()) {
    stdout.write(`\n[focused-checks] (${index + 1}/${commands.length}) ${suggestion.command}\n`);
    const result = spawn(suggestion.command, {
      cwd,
      shell: true,
      stdio: 'inherit',
    });
    const code = result.status ?? 1;
    if (code !== 0) {
      stdout.write(`\n[focused-checks] failed: ${suggestion.command}\n`);
      stdout.write('[focused-checks] fix it and run again. The remaining checks did not run.\n');
      return code;
    }
  }
  stdout.write(`\n[focused-checks] ${commands.length} passed\n`);
  return 0;
}

export function runSuggestFocusedChecks({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  stdout = process.stdout,
  stderr = process.stderr,
  spawn = spawnSync,
} = {}) {
  const args = stripLeadingSeparator(argv);
  if (args.includes('--help') || args.includes('-h')) {
    stdout.write(`${suggestFocusedChecksUsage()}\n`);
    return 0;
  }
  // `--run` is not a path; without filtering it is treated as a changed file.
  const run = args.includes('--run');
  const pathArgs = args.filter((arg) => arg !== '--run');
  try {
    const paths = pathArgs.length > 0 ? pathArgs : changedPathsFromGit({ cwd, spawn });
    const suggestions = suggestFocusedChecks(paths);
    stdout.write(`${formatFocusedCheckSuggestions(suggestions)}\n`);
    if (!run) return 0;
    return runFocusedChecks({ commands: suggestions.commands, cwd, stdout, spawn });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`[focused-checks] ${message}\n`);
    return 2;
  }
}

export function stripLeadingSeparator(argv = []) {
  const args = Array.isArray(argv) ? [...argv] : [];
  return args[0] === '--' ? args.slice(1) : args;
}

export function suggestFocusedChecksUsage() {
  return `Usage:
  pnpm checks:changed
  pnpm checks:changed -- <path...>
  pnpm checks:changed -- --run          # run every recommendation, stopping at the first failure

Suggests the first focused checks for changed files so agents avoid full-suite
verification by default. With no path arguments it
uses tracked changes from git diff plus untracked files from git ls-files,
excluding local .agents/ and .codex/ agent state except shared repo skills,
Codex hooks, and Codex MCP config. Pass paths explicitly to inspect a planned
file set before editing. Escalate to broad lint/build/test only when the
focused checks leave a concrete uncovered risk.`;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  process.exitCode = runSuggestFocusedChecks();
}
