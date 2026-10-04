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

function compilePathPattern(pattern: string): RegExp | null {
  const normalized = normalizePath(pattern);
  if (!normalized) return null;
  let source = '^';
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]!;
    if (char === '*' && normalized[index + 1] === '*') {
      if (normalized[index + 2] === '/') {
        source += '(?:.*/)?';
        index += 2;
        while (normalized[index + 1] === '*' && normalized[index + 2] === '*' && normalized[index + 3] === '/') {
          index += 3;
        }
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
  return new RegExp(`${source}$`);
}

export function matchesArchitecturePath(path: string, pattern: string): boolean {
  const candidate = normalizePath(path);
  return compilePathPattern(pattern)?.test(candidate) ?? false;
}

export function createArchitecturePathMatcher(): (path: string, pattern: string) => boolean {
  const patterns = new Map<string, RegExp | null>();
  return (path, pattern) => {
    const candidate = normalizePath(path);
    let regex = patterns.get(pattern);
    if (regex === undefined) {
      regex = compilePathPattern(pattern);
      patterns.set(pattern, regex);
    }
    return regex?.test(candidate) ?? false;
  };
}
