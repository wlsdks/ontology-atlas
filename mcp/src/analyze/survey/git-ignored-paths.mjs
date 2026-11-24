/**
 * What Git ignores under a survey root, so a working checkout is surveyed like a
 * clean one: build output and scratch folders kept beside the code are not
 * product code, and they never reach a clean checkout. Two git calls per walk.
 * A root outside a work tree, a work tree that does not hold the root, a root Git
 * ignores itself, or a git that is absent, fails or is slow gives an empty set,
 * which leaves the walk as it was.
 */

import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';

import { gitEnv, hardenedGitArgv } from '../../git/hardened-git.mjs';

/** A slower answer leaves the survey unfiltered rather than hold it. */
const GIT_TIMEOUT_MS = 5_000;
const GIT_MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

function runGit(rootPath, args) {
  const result = spawnSync('git', hardenedGitArgv(rootPath, ['--no-optional-locks', ...args]), {
    encoding: 'utf8',
    env: gitEnv(),
    maxBuffer: GIT_MAX_OUTPUT_BYTES,
    timeout: GIT_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return result.status === 0 && typeof result.stdout === 'string' ? result.stdout : null;
}

/**
 * Whether the work tree Git uses for `rootPath` holds it: a repository whose own
 * `core.worktree` names another folder would answer about that folder's files.
 */
function workTreeHolds(rootPath) {
  const topLevel = runGit(rootPath, ['rev-parse', '--show-toplevel'])?.trim();
  if (!topLevel) return false;
  try {
    const inside = relative(realpathSync(topLevel), realpathSync(rootPath));
    return inside !== '..' && !inside.startsWith(`..${sep}`) && !isAbsolute(inside);
  } catch {
    return false;
  }
}

/**
 * Root-relative `/` paths Git ignores and does not track, in NFC: a folder ignored
 * whole is one entry, without its trailing slash; an ignored file in a folder that
 * also holds tracked files is listed alone. Untracked files Git does not ignore
 * stay surveyed, since they are code being written.
 *
 * @param {string} rootPath absolute survey root
 * @returns {Set<string>}
 */
export function gitIgnoredPaths(rootPath) {
  if (!workTreeHolds(rootPath)) return new Set();
  const listed = runGit(rootPath, ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z']);
  if (listed === null) return new Set();
  const paths = listed.split('\0').filter(Boolean).map((path) => path.replace(/\/$/, '').normalize('NFC'));
  // `./` means the root itself is ignored: the caller chose this folder, so all of it is surveyed.
  return paths.includes('.') ? new Set() : new Set(paths);
}

/**
 * Whether `path` or a folder above it is in `ignored`. Compared in NFC, since a
 * macOS folder name read from disk may be decomposed where Git answers composed.
 * O(path depth x path length).
 */
export function isGitIgnored(ignored, path) {
  if (ignored.size === 0) return false;
  const composed = path.normalize('NFC');
  for (let end = composed.indexOf('/'); end !== -1; end = composed.indexOf('/', end + 1)) {
    if (ignored.has(composed.slice(0, end))) return true;
  }
  return ignored.has(composed);
}
