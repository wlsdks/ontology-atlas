#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
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

export function changedPathsFromGit({ cwd = process.cwd(), spawn = spawnSync } = {}) {
  const tracked = spawnGit({ cwd, spawn, args: ['diff', '--name-only', 'HEAD', '--'] });
  const untracked = spawnGit({ cwd, spawn, args: ['ls-files', '--others', '--exclude-standard'] });
  return uniqueLines(`${tracked}\n${untrackedPathsForAdvisor(untracked).join('\n')}`);
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
  try {
    const paths = args.length > 0 ? args : changedPathsFromGit({ cwd, spawn });
    stdout.write(`${formatFocusedCheckSuggestions(suggestFocusedChecks(paths))}\n`);
    return 0;
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
