import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const EXCLUDED_PREFIXES = [
  'docs/',
  'public/',
  'samples/',
  'src/entities/docs-vault/data/',
  'cli/templates/vault-ko/',
];

const HARNESS_ROOTS = new Set(['.claude', '.agents', '.codex', '.githooks', '.github']);
const PACKAGE_ROOTS = new Set(['app', 'mcp', 'cli', 'scripts', 'src-tauri']);

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

export function areaGate(prefix, area) {
  if (!AREA_GATE_PREFIXES.includes(prefix)) throw new Error(`${prefix} is not in AREA_GATE_PREFIXES`);
  return `${prefix}.${area.replaceAll('/', '-')}`;
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

const lines = (text) => text.split('\n').filter(Boolean);

export function changedPaths(base, cwd = process.cwd()) {
  if (base === null) return [];
  const paths = new Set([
    ...lines(git(['diff', '--name-only', '--no-renames', base, '--'], cwd)),
    ...lines(git(['ls-files', '--others', '--exclude-standard'], cwd)),
  ]);
  return [...paths].filter((path) => sourceArea(path) !== null).sort();
}

export function directFilesInWorktree(dir, cwd = process.cwd()) {
  const prefix = dir === '' ? '' : `${dir}/`;
  const listed = lines(git(['ls-files', '--cached', '--others', '--exclude-standard', '--', prefix || '.'], cwd));
  const direct = new Set(listed.filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/')));
  return [...direct].filter((p) => existsSync(join(cwd, p))).length;
}

export function directFilesAtCommit(dir, sha, cwd = process.cwd()) {
  try {
    const rows = lines(git(['ls-tree', sha, '--', dir === '' ? '.' : `${dir}/`], cwd));
    return rows.filter((row) => row.split(/\s+/)[1] === 'blob').length;
  } catch {
    return 0;
  }
}

export const AREA_GATE_PREFIXES = ['test-title-hangul', 'comment-bytes', 'oversize-files', 'wide-folders'];

const FIXED_AREAS = new Set(['src', 'app', 'tests', 'mcp', 'cli', 'scripts', 'src-tauri', 'harness', 'root']);

export function isAreaGate(gate, cwd = process.cwd()) {
  const prefix = AREA_GATE_PREFIXES.find((p) => gate.startsWith(`${p}.`));
  if (prefix === undefined) return false;
  const area = gate.slice(prefix.length + 1);
  if (FIXED_AREAS.has(area)) return true;
  const nested = /^(src|tests)-([a-z0-9-]+)$/.exec(area);
  return nested !== null && existsSync(join(cwd, nested[1], nested[2]));
}
