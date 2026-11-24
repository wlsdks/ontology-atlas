/**
 * What Git ignores under a folder, so the source walk counts a built checkout and
 * a clean one alike: build output and generated files a repository ignores are
 * not its code. A tracked file stays counted even where a pattern would ignore it.
 */

import { spawnSync } from 'node:child_process';

import { gitEnv, hardenedGitArgv } from '../../git/hardened-git.mjs';

const GIT_TIMEOUT_MS = 5000;
const LIST_MAX_BUFFER = 16 * 1024 * 1024;

/**
 * The untracked paths under `rootPath` that Git ignores, relative to it with `/`
 * separators; a folder ignored whole is one entry, without its trailing `/`. Empty
 * outside a repository, when the folder is ignored whole, or when Git cannot
 * answer, so the walk then counts every file. One `git ls-files` run, O(entries).
 */
export function gitIgnoredPaths(rootPath) {
  const args = ['--no-optional-locks', 'ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--directory'];
  let argv;
  try {
    argv = hardenedGitArgv(rootPath, args);
  } catch {
    return new Set();
  }
  const result = spawnSync('git', argv, {
    env: gitEnv(),
    maxBuffer: LIST_MAX_BUFFER,
    timeout: GIT_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0 || !result.stdout) return new Set();
  // macOS Git prints names precomposed (NFC) while the disk may keep them decomposed; the walk compares NFC too.
  const paths = result.stdout.toString('utf8').split('\0').map((path) => path.replace(/\/$/, '').normalize('NFC'));
  return new Set(paths.filter((path) => path && path !== '.'));
}
