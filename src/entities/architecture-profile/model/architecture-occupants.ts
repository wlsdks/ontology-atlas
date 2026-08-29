/**
 * The architecture glob dialect, shared with the MCP.
 *
 * ⚠️ **Pattern semantics are the MCP's, verbatim.** `matchesArchitecturePath` mirrors
 * `matchesPathPattern` in `mcp/src/architecture-profile.mjs`; the cross-surface contract test runs
 * one fixture table through both. A web-only dialect would make the same profile treat a path
 * differently in the app and in an agent's brief.
 *
 * History: this module once also joined role globs to ontology concept `path` frontmatter and fed
 * the blueprint's bands with concepts. The owner corrected that model on 2026-08-27 — the ontology
 * is the meaning map, architecture is about the project source — so the bands now list source
 * modules (`src/views/architecture/model/source-modules.ts`), which consume this matcher for the
 * profile's `exclude_paths`.
 */

function normalizePath(value: unknown): string {
  return String(value ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '');
}

export function matchesArchitecturePath(path: string, pattern: string): boolean {
  const candidate = normalizePath(path);
  const normalized = normalizePath(pattern);
  if (!normalized) return false;
  let source = '^';
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]!;
    if (char === '*' && normalized[index + 1] === '*') {
      if (normalized[index + 2] === '/') {
        source += '(?:.*/)?';
        index += 2;
      } else {
        source += '.*';
        index += 1;
      }
      continue;
    }
    if (char === '*') {
      source += '[^/]*';
      continue;
    }
    if (char === '?') {
      source += '[^/]';
      continue;
    }
    source += /[\\^$+?.()|{}[\]]/.test(char) ? `\\${char}` : char;
  }
  return new RegExp(`${source}$`).test(candidate);
}
