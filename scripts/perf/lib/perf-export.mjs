// The static export both perf commands measure: the production build with names kept
// (`next build --no-mangling`), so a CPU profile names source functions. Built into `out/` and
// marked with the commit it came from; any other `out/` is rebuilt.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
export const EXPORT_DIR = join(ROOT, 'out');
const STAMP = join(EXPORT_DIR, '.perf-export.json');

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

/** Builds `out/` unless it is a perf export of this commit with no uncommitted source change. */
export function ensurePerfExport({ rebuild = false } = {}) {
  const now = head();
  const stamp = existsSync(STAMP) ? JSON.parse(readFileSync(STAMP, 'utf8')) : null;
  if (!rebuild && stamp && stamp.commit === now.commit && !now.dirty && !stamp.dirty) return stamp;
  const require = createRequire(join(ROOT, 'package.json'));
  run('docs-vault:build', 'pnpm', ['docs-vault:build']);
  run('messages:build', 'pnpm', ['messages:build']);
  run('next build --no-mangling', process.execPath, [require.resolve('next/dist/bin/next'), 'build', '--no-mangling'], { ATLAS_BUILD_SKIP_TYPECHECK: '1' });
  run('localize html lang', process.execPath, ['scripts/web/localize-html-lang.mjs']);
  const written = { ...now, builtAt: new Date().toISOString(), mangling: false };
  writeFileSync(STAMP, JSON.stringify(written));
  return written;
}
