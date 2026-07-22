// R+ — commit preflight (`ontology-atlas preflight`) 의 git staged 파일
// 목록 헬퍼. 순수 wrapper — `run` 을 주입 가능하게 해서 실제 git 프로세스
// 없이도 단위 test 가능.

import { execFileSync } from 'node:child_process';

function defaultRun(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' });
}

/**
 * Git staged 파일 목록 (repo-relative, `/` 구분자). `--diff-filter=ACMR` —
 * added/copied/modified/renamed 파일만 (deleted 파일은 이미 사라진 코드라
 * vault path 매칭 대상에서 제외).
 *
 * git repo 가 아니거나 명령 실패 시 `null` — 호출자가 조용히 skip 하도록.
 *
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @param {(args: string[], cwd: string) => string} [options.run]  injectable git runner
 * @returns {string[] | null}
 */
export function getStagedFiles({ cwd = process.cwd(), run = defaultRun } = {}) {
  let out;
  try {
    out = run(['diff', '--cached', '--name-only', '--diff-filter=ACMR'], cwd);
  } catch {
    return null;
  }
  if (typeof out !== 'string') return null;
  return out
    .split('\n')
    .map((line) => line.trim().replace(/\\/g, '/'))
    .filter(Boolean);
}
