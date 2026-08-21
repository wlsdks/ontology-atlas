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

/**
 * 추천을 **그대로 실행**한다 — 첫 실패에서 멈춘다.
 *
 * ## 왜 이 모드가 생겼나 (2026-08-21)
 *
 * 이 도구는 무엇을 돌릴지 **정확히** 지목해 왔다. 그런데 사람(과 에이전트)이
 * 그 목록을 받아 **일부만 골라 돌렸다.** 2026-08-20 하루에 CI 두 라운드가
 * 그렇게 탔다 — `test:contracts` 만 돌리고 `test:run` 과 e2e 를 건너뛰었고,
 * 건너뛴 자리에서 정확히 터졌다.
 *
 * 같은 저장소의 `pre-commit` 훅이 그 교훈을 이미 적어 뒀다: *"기억에 의존하는
 * 규율은 세 번 이상 반복되면 규율이 아니라 사고 대기열이다."* 고르는 여지를
 * 없애는 것이 답이고, 그 자리는 **추천기 자신**이다.
 *
 * 첫 실패에서 멈추는 이유: 뒤의 검사는 대개 같은 원인으로 무너져서, 다 돌리면
 * 화면이 길어질 뿐 새 정보가 없다. 고칠 것 하나를 정확히 준다.
 */
export function runFocusedChecks({
  commands = [],
  cwd = process.cwd(),
  stdout = process.stdout,
  spawn = spawnSync,
} = {}) {
  if (commands.length === 0) {
    stdout.write('[focused-checks] 돌릴 것이 없다 — 바뀐 경로에 걸리는 검사가 없다.\n');
    return 0;
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
      stdout.write(`\n[focused-checks] 실패: ${suggestion.command}\n`);
      stdout.write('[focused-checks] 고치고 다시 돌려라. 남은 검사는 안 돌렸다.\n');
      return code;
    }
  }
  stdout.write(`\n[focused-checks] ${commands.length}개 통과\n`);
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
  // `--run` 은 경로가 아니다. 안 걸러내면 그 문자열이 바뀐 파일로 취급된다.
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
  pnpm checks:changed -- --run          # 추천을 그대로 실행 (첫 실패에서 멈춘다)

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
