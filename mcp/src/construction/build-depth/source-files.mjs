import { readFileSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';

import { surveyEntry } from '../../analyze/survey/survey-paths.mjs';
import { withoutSpans } from '../../analyze/text.mjs';
import { UNIT_SOURCE_EXTENSIONS, unitForPath } from '../../analyze/survey/source-units.mjs';

/** Comments, docstrings, imports and re-exports removed; what is left is code. */
export function hasCode(text, path) {
  const ext = extname(path).toLowerCase();
  let rest = String(text);
  if (ext === '.py' || ext === '.rb') {
    // Each span is found in one forward pass: an unclosed opener never rescans the file.
    rest = withoutSpans(rest, /("""|''')/, (match) => match[1]);
    rest = withoutSpans(rest, /^[ \t]*from[ \t]+[\w.]+[ \t]+import[ \t]*\(/m, ')');
    rest = withoutSpans(rest, /^__all__[ \t]*\+?=[ \t]*([[(])/m, (match) => (match[1] === '[' ? ']' : ')'));
    rest = rest.replace(/#.*$/gm, '');
  } else {
    rest = withoutSpans(rest, /\/\*/, '*/').replace(/(^|[^:])\/\/.*$/gm, '$1');
    rest = withoutSpans(rest, /^[ \t]*(?:import|export)[ \t]+(?:type[ \t]+)?\{/m, '}', { after: /[ \t]*from[ \t]*['"][^'"\n]+['"];?/y });
    rest = withoutSpans(rest, /^[ \t]*import[ \t]*\(/m, ')');
  }
  const lines = rest.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const declarative = /^(?:import\s|from\s+[\w.]+\s+import\s|export\s+\*|export\s+(?:type\s+)?\{[^}]*\}\s*from\s|package\s+\w+|use\s+[\w:{}, *]+;|(?:pub\s+)?mod\s+\w+;|['"]use strict['"];?|module\.exports\s*=\s*require\(|[)\]};,]+$)/;
  return lines.some((line) => !declarative.test(line));
}

/** A small source file the vault names, or null: a path outside the root, through a link or under a private name is never opened. */
export function readSmallSource(repoRoot, path) {
  if (!UNIT_SOURCE_EXTENSIONS.has(extname(path).toLowerCase())) return null;
  const inside = surveyEntry(repoRoot, path);
  if (!inside) return null;
  try {
    const abs = join(repoRoot, inside);
    const stat = statSync(abs);
    if (!stat.isFile() || stat.size > 256 * 1024) return null;
    return readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
}

/** Up to three product files near `path`, longest first: its unit's, then its folder's. */
export function nearbyFiles(collection, path) {
  const unit = unitForPath(collection, path);
  const folder = dirname(path);
  const candidates = collection.files
    .filter((file) => file.class === 'product' && file.path !== path && file.lines > 0)
    .filter((file) => (unit && unit.files.includes(file)) || file.path.startsWith(`${folder}/`))
    .sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path));
  return candidates.slice(0, 3).map((file) => file.path);
}
