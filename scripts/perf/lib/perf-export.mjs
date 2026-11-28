// The app folder the perf commands measure: the production build with names kept
// (`vite build --minify false`), so a CPU profile names source functions. Built into its own folder,
// beside the one the app embeds, and marked with the commit it came from; any other build is redone.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const EXPORT_FOLDER = 'src-tauri/target/perf-export';
export const EXPORT_DIR = join(ROOT, EXPORT_FOLDER);
const STAMP = join(ROOT, 'src-tauri', 'target', 'perf-export.json');

function head() {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  // A new file reaches the bundle only through an edited tracked one, so added files are ignored.
  const dirty = execFileSync('git', ['diff', '--name-only', '--diff-filter=MDR', 'HEAD', '--', 'src', 'app', 'messages'], { cwd: ROOT, encoding: 'utf8' }).trim() !== '';
  return { commit, dirty };
}

function run(label, command, args, env = {}) {
  console.log(`[perf-export] ${label}`);
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });
  if (result.status !== 0) throw new Error(`${label} failed (exit ${result.status})`);
}

/** Builds the names-kept app folder unless it is a perf export of this commit with no uncommitted source change. */
export function ensurePerfExport({ rebuild = false } = {}) {
  const now = head();
  const stamp = existsSync(STAMP) ? JSON.parse(readFileSync(STAMP, 'utf8')) : null;
  if (!rebuild && stamp && stamp.commit === now.commit && !now.dirty && !stamp.dirty) return stamp;
  run('docs-vault:build', 'pnpm', ['docs-vault:build']);
  run('messages:build', 'pnpm', ['messages:build']);
  run('vite build, names kept', process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--minify', 'false'], { ATLAS_APP_FOLDER: EXPORT_FOLDER });
  const written = { ...now, builtAt: new Date().toISOString(), mangling: false };
  writeFileSync(STAMP, JSON.stringify(written));
  return written;
}
