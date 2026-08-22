// Staged-file list helper for the commit preflight (`ontology-atlas preflight`).
// A pure wrapper: `run` is injectable so unit tests need no git process.

import { execFileSync } from 'node:child_process';

function defaultRun(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' });
}

/**
 * Staged files (repository-relative, `/` separated). `--diff-filter=ACMR` keeps
 * added/copied/modified/renamed only — a deleted file is code that is already
 * gone, so it is not a vault-path match candidate.
 *
 * `null` outside a git repository or when the command fails, so the caller can
 * skip silently.
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
