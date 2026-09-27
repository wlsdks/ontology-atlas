/**
 * The architecture glob dialect: `matchesArchitecturePath` mirrors `matchesPathPattern` in
 * `mcp/src/architecture-profile.mjs`, or a profile would treat a path differently in app and brief.
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
