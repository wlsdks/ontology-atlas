import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Paths whose content is data or generated output, never source a person maintains. */
const EXCLUDED_PREFIXES = [
  'docs/',
  'public/',
  'samples/',
  'src/entities/docs-vault/data/',
  'cli/templates/vault-ko/',
];

const HARNESS_ROOTS = new Set(['.claude', '.agents', '.codex', '.githooks', '.github']);
const PACKAGE_ROOTS = new Set(['app', 'mcp', 'cli', 'scripts', 'src-tauri']);

/**
 * The area a hygiene ratchet judges `path` in: `src/<layer>`, `app`, `tests/<dir>`,
 * `mcp`, `cli`, `scripts`, `src-tauri`, `harness` or `root`; `null` when excluded.
 */
export function sourceArea(path) {
  if (EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix))) return null;
  const [top, second, ...rest] = path.split('/');
  const nested = rest.length > 0;
  if (top === 'src') return nested ? `src/${second}` : 'src';
  if (top === 'tests') return nested ? `tests/${second}` : 'tests';
  if (PACKAGE_ROOTS.has(top) && second !== undefined) return top;
  if (HARNESS_ROOTS.has(top) && second !== undefined) return 'harness';
  return 'root';
}

/** A ratchet gate id for an area; raise records are named after it, so it holds no `/`. */
export function areaGate(prefix, area) {
  return `${prefix}.${area.replaceAll('/', '-')}`;
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

const lines = (text) => text.split('\n').filter(Boolean);

/**
 * Paths this change touches against `base` (committed, staged, unstaged and untracked),
 * outside the excluded areas. Deleted paths stay in the list: they still count at the base.
 */
export function changedPaths(base, cwd = process.cwd()) {
  if (base === null) return [];
  const paths = new Set([
    ...lines(git(['diff', '--name-only', '--no-renames', base, '--'], cwd)),
    ...lines(git(['ls-files', '--others', '--exclude-standard'], cwd)),
  ]);
  return [...paths].filter((path) => sourceArea(path) !== null).sort();
}

/** Direct files of `dir` in the working tree: tracked and still present, or untracked. */
export function directFilesInWorktree(dir, cwd = process.cwd()) {
  const prefix = dir === '' ? '' : `${dir}/`;
  const listed = lines(git(['ls-files', '--cached', '--others', '--exclude-standard', '--', prefix || '.'], cwd));
  const direct = new Set(listed.filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/')));
  return [...direct].filter((p) => existsSync(join(cwd, p))).length;
}

/** Direct files of `dir` in commit `sha`; 0 when the folder did not exist. */
export function directFilesAtCommit(dir, sha, cwd = process.cwd()) {
  try {
    const rows = lines(git(['ls-tree', sha, '--', dir === '' ? '.' : `${dir}/`], cwd));
    return rows.filter((row) => row.split(/\s+/)[1] === 'blob').length;
  } catch {
    return 0;
  }
}
