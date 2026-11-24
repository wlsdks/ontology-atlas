/**
 * What Git ignores under a folder, so the source walk counts a built checkout and
 * a clean one alike: build output and generated files a repository ignores are
 * not its code. A tracked file stays counted even where a pattern would ignore it.
 */

import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';

import { gitEnv, hardenedGitArgv } from '../../git/hardened-git.mjs';

const GIT_TIMEOUT_MS = 5000;
const LIST_MAX_BUFFER = 16 * 1024 * 1024;

/** A hardened git run's stdout in `rootPath`, or null when Git cannot answer. */
function gitOutput(rootPath, args) {
  let argv;
  try {
    argv = hardenedGitArgv(rootPath, ['--no-optional-locks', ...args]);
  } catch {
    return null;
  }
  const result = spawnSync('git', argv, {
    env: gitEnv(),
    maxBuffer: LIST_MAX_BUFFER,
    timeout: GIT_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return result.status === 0 && result.stdout ? result.stdout.toString('utf8') : null;
}

/**
 * Whether the work tree Git uses for `rootPath` holds it: a repository whose own
 * `core.worktree` names another folder would list that folder's ignored files.
 */
function workTreeHolds(rootPath) {
  const topLevel = gitOutput(rootPath, ['rev-parse', '--show-toplevel'])?.trim();
  if (!topLevel) return false;
  try {
    const inside = relative(realpathSync(topLevel), realpathSync(rootPath));
    return inside !== '..' && !inside.startsWith(`..${sep}`) && !isAbsolute(inside);
  } catch {
    return false;
  }
}

/**
 * The untracked paths under `rootPath` that Git ignores, relative to it with `/`
 * separators; a folder ignored whole is one entry, without its trailing `/`. Empty
 * outside a repository, when Git's work tree does not hold the folder, when the
 * folder is ignored whole, or when Git cannot answer, so the walk then counts every
 * file. Two git runs (`rev-parse`, `ls-files`), O(entries).
 */
export function gitIgnoredPaths(rootPath) {
  if (!workTreeHolds(rootPath)) return new Set();
  const listed = gitOutput(rootPath, ['ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--directory']);
  if (listed === null) return new Set();
  // macOS Git prints names precomposed (NFC) while the disk may keep them decomposed; the walk compares NFC too.
  const paths = listed.split('\0').map((path) => path.replace(/\/$/, '').normalize('NFC'));
  return new Set(paths.filter((path) => path && path !== '.'));
}
