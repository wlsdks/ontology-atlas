import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// `.ontology-atlasignore` at the vault root: gitignore-style reference patterns,
// one per line, excluded from `materialize_external_element` suggestions. `#`
// comments and blank lines are skipped; `*` excludes `/`, `**` crosses
// directories, `?` is one non-`/` character, a trailing `/` is stripped.
// Negation (`!pattern`) is unsupported.
export function loadOntologyAtlasIgnore(vaultRoot) {
  const file = resolve(vaultRoot, '.ontology-atlasignore');
  if (!existsSync(file)) return [];
  const text = readFileSync(file, 'utf-8');
  return parseOntologyAtlasIgnore(text);
}

export function parseOntologyAtlasIgnore(text) {
  const lines = text.split(/\r?\n/);
  const patterns = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) continue;
    if (line.startsWith('!')) continue;
    patterns.push(line.endsWith('/') ? line.slice(0, -1) : line);
  }
  return patterns;
}

export function refMatchesOntologyAtlasIgnore(ref, patterns) {
  if (!patterns || patterns.length === 0) return false;
  for (const pat of patterns) {
    if (matchPattern(ref, pat)) return true;
  }
  return false;
}

function matchPattern(ref, pattern) {
  const regex = patternToRegex(pattern);
  return regex.test(ref);
}

function patternToRegex(pattern) {
  // Escape regex specials except `*`, `?` and `/`, the glob's own characters.
  let r = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');

  // A middle `/**/` matches zero or more directories, so `src/**/foo.ts`
  // matches `src/foo.ts` and `src/x/foo.ts`.
  r = r.replace(/\/\*\*\//g, '/__OATLAS_MID__');
  if (r.startsWith('**/')) r = '__OATLAS_START__' + r.slice(3);
  // A trailing `/**` means every ref under the directory, not the bare `src`:
  // refs are always paths.
  if (r.endsWith('/**')) r = r.slice(0, -3) + '__OATLAS_END__';

  r = r.replace(/\*\*/g, '.*');
  r = r.replace(/\*/g, '[^/]*');
  r = r.replace(/\?/g, '[^/]');

  r = r.replace(/__OATLAS_MID__/g, '(?:.*/)?');
  r = r.replace(/__OATLAS_START__/g, '(?:.*/)?');
  r = r.replace(/__OATLAS_END__/g, '/.*');

  return new RegExp('^' + r + '$');
}
