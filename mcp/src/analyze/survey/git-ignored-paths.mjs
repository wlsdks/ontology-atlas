/**
 * What Git ignores under a survey root, so a working checkout is surveyed like a
 * clean one: build output and scratch folders kept beside the code are not
 * product code, and they never reach a clean checkout. One `git ls-files` per
 * walk. A root outside a work tree, a root Git ignores itself, or a git that is
 * absent, fails or is slow gives an empty set, which leaves the walk as it was.
 */

import { spawnSync } from 'node:child_process';

import { gitEnv, hardenedGitArgv } from '../../git/hardened-git.mjs';

/** A slower answer leaves the survey unfiltered rather than hold it. */
const GIT_TIMEOUT_MS = 5_000;
const GIT_MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

/**
 * Root-relative `/` paths Git ignores and does not track: a folder ignored whole
 * is one entry, without its trailing slash; an ignored file in a folder that also
 * holds tracked files is listed alone. Untracked files Git does not ignore stay
 * surveyed, since they are code being written.
 *
 * @param {string} rootPath absolute survey root
 * @returns {Set<string>}
 */
export function gitIgnoredPaths(rootPath) {
  const result = spawnSync(
    'git',
    hardenedGitArgv(rootPath, ['--no-optional-locks', 'ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z']),
    { encoding: 'utf8', env: gitEnv(), maxBuffer: GIT_MAX_OUTPUT_BYTES, timeout: GIT_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'] },
  );
  if (result.status !== 0 || typeof result.stdout !== 'string') return new Set();
  const paths = result.stdout.split('\0').filter(Boolean).map((path) => path.replace(/\/$/, ''));
  // `./` means the root itself is ignored: the caller chose this folder, so all of it is surveyed.
  return paths.includes('.') ? new Set() : new Set(paths);
}

/** Whether `path` or a folder above it is in `ignored`; O(path depth). */
export function isGitIgnored(ignored, path) {
  if (ignored.size === 0) return false;
  for (let end = path.indexOf('/'); end !== -1; end = path.indexOf('/', end + 1)) {
    if (ignored.has(path.slice(0, end))) return true;
  }
  return ignored.has(path);
}
