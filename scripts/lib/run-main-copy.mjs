/**
 * Run `origin/main`'s copy of a script when this checkout's copy is older.
 *
 * `pnpm pr:land` runs from whichever branch the lander has checked out, so a fix
 * to the landing train reaches only branches that merged it. On 2026-09-26 a
 * branch cut before #1901 conducted a train with the pre-fix script and landed
 * #1888 twice, the second time as an empty commit, an hour after the fix was on
 * `main`. The lock serialises every landing through one conductor, so the
 * conductor's code is shared infrastructure and must be main's.
 *
 * The script and every local module it imports (the import graph read from
 * `origin/main` itself) are compared by content; if any differs, main's files are
 * written to a temporary directory and run from there, with the repository as the
 * working directory. The scripts import only Node built-ins and each other, which
 * is what makes a copy outside the repository runnable.
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
 * Returns null when this checkout's copy is current (the caller runs it), or the
 * exit status of main's copy after running it.
 */
export function runMainCopyIfStale({ entry, argv, cwd = process.cwd(), env = process.env, log = console.error }) {
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
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-main-copy-')));
  try {
    for (const file of files) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      writeFileSync(join(dir, file), readMain(file));
    }
    const result = spawnSync(process.execPath, [join(dir, entry), ...argv], {
      cwd: root,
      stdio: 'inherit',
      env: { ...env, ATLAS_MAIN_COPY_RUNNING: '1' },
    });
    return result.status ?? 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
