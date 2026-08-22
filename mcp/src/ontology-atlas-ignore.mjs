import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// `.ontology-atlasignore` — a gitignore-style pattern file at the vault root, one
// reference pattern per line, excluded from `materialize_external_element`
// suggestions. It stops deliberately external code (everything under a src
// directory, say) surfacing as noise on every run.
//
//   - lines starting with `#` are comments
//   - blank lines are ignored
//   - `*` matches any character except `/`
//   - `**` matches any character including directory separators
//   - `?` matches a single character except `/`
//   - a trailing `/` is stripped (the directory marker does not affect matching)
//
// Negation (`!pattern`) is unsupported for now.
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
    if (line.startsWith('!')) continue; // negation 미지원
    patterns.push(line.endsWith('/') ? line.slice(0, -1) : line);
  }
  return patterns;
}

/**
 * Does `ref` (e.g. `src/views/foo.tsx`) match any of the patterns?
 */
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
  // 1. Escape regex specials, except `*`, `?`, `/` — the meaningful chars of our glob.
  let r = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');

  // 2. `/**/` in the middle → `/(?:.*/)?`, matching *zero or more directories*.
  //     `src/**/foo.ts` therefore matches both `src/foo.ts` and `src/x/foo.ts`.
  r = r.replace(/\/\*\*\//g, '/__OATLAS_MID__');
  // 3. Leading `**/` — the same, a 0+ directory prefix.
  if (r.startsWith('**/')) r = '__OATLAS_START__' + r.slice(3);
  // 4. Trailing `/**` — a 0+ directory suffix. gitignore matches only what is
  //     inside the directory; our refs are always paths, so `src/**` means every
  //     ref starting with `src/` and does not match the bare `src`.
  if (r.endsWith('/**')) r = r.slice(0, -3) + '__OATLAS_END__';

  // 5. Any remaining bare `**` → `.*`
  r = r.replace(/\*\*/g, '.*');
  // 6. `*` — `[^/]*`
  r = r.replace(/\*/g, '[^/]*');
  // 7. `?` — `[^/]`
  r = r.replace(/\?/g, '[^/]');

  // 8. Restore the placeholder.
  r = r.replace(/__OATLAS_MID__/g, '(?:.*/)?');
  r = r.replace(/__OATLAS_START__/g, '(?:.*/)?');
  r = r.replace(/__OATLAS_END__/g, '/.*');

  return new RegExp('^' + r + '$');
}
