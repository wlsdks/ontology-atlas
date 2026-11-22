/**
 * Prepare `origin/main`'s copy of a script to run when this checkout's copy is older: every landing goes
 * through one conductor, so its code must be main's. The script and its local imports are compared
 * by content; any difference runs main's files from a temporary directory.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';

const IMPORT = /^\s*(?:import|export)\s[^;]*?\sfrom\s+['"](\.[^'"]+)['"]/gm;

/** Every repository file `entry` reaches through relative imports, `entry` first. */
export function importGraph(entry, read) {
  const files = [];
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.shift();
    if (files.includes(file)) continue;
    const text = read(file);
    if (text === null) return null;
    files.push(file);
    for (const [, spec] of text.matchAll(IMPORT)) {
      pending.push(posix.normalize(posix.join(posix.dirname(file), spec)));
    }
  }
  return files;
}

/** The files whose local content differs from main's (a missing local file differs). */
export function staleFiles(files, readMain, readLocal) {
  return files.filter((file) => readLocal(file) !== readMain(file));
}

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : null;
}

/**
 * `null` when this checkout's copy is current (the caller runs it), or main's copy written to a
 * temporary directory: the script to run in its place, and `cleanup` to remove it afterwards.
 */
export function mainCopyIfStale({ entry, cwd = process.cwd(), env = process.env, log = console.error }) {
  if (env.ATLAS_PR_LAND_LOCAL === '1' || env.ATLAS_MAIN_COPY_RUNNING === '1') return null;
  const root = git(['rev-parse', '--show-toplevel'], cwd)?.trim();
  if (!root) return null;
  git(['fetch', '--quiet', 'origin', 'main'], root);
  const readMain = (file) => git(['show', `origin/main:${file}`], root);
  const readLocal = (file) => {
    try {
      return readFileSync(join(root, file), 'utf8');
    } catch {
      return null;
    }
  };
  const files = importGraph(entry, readMain);
  if (!files) return null;
  const stale = staleFiles(files, readMain, readLocal);
  if (stale.length === 0) return null;

  log(`[${posix.basename(entry, '.mjs')}] this checkout's ${stale.join(', ')} differ from origin/main; running main's copy. ATLAS_PR_LAND_LOCAL=1 runs this checkout's copy instead.`);
  // Real path: on macOS the temp dir is a symlink, and an entry guard comparing
  // import.meta.url with argv[1] would otherwise never fire.
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-main-copy-')));
  for (const file of files) {
    mkdirSync(dirname(join(directory, file)), { recursive: true });
    writeFileSync(join(directory, file), readMain(file));
  }
  return {
    script: join(directory, entry),
    cwd: root,
    env: { ATLAS_MAIN_COPY_RUNNING: '1' },
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}
