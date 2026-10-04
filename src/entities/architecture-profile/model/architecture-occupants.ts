/** App/MCP glob dialect; ambiguous wildcards use bounded state traversal. */

function normalizePath(value: unknown): string {
  return String(value ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '');
}

interface PathPattern { test(path: string): boolean }

const NO_SLASH = -1;
const NO_LINE = -2;
const ONE_NO_SLASH = -3;
const OPTIONAL_DIR = -4;
function compilePathProgram(pattern: string): PathPattern {
  const tokens: number[] = [];
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === '*' && pattern[i + 1] === '*') {
      if (pattern[i + 2] === '/') {
        tokens.push(OPTIONAL_DIR, NO_LINE, 47);
        i += 2;
        while (pattern[i + 1] === '*' && pattern[i + 2] === '*' && pattern[i + 3] === '/') i += 3;
      } else {
        tokens.push(NO_LINE);
        i++;
      }
    } else if (char === '*') tokens.push(NO_SLASH);
    else if (char === '?') tokens.push(ONE_NO_SLASH);
    else tokens.push(pattern.charCodeAt(i));
  }
  const variable = tokens.findIndex(t => t < 0);
  const prefix = pattern.slice(0, variable < 0 ? pattern.length : variable);
  const program = Int32Array.from(tokens.slice(variable < 0 ? tokens.length : variable));
  tokens.length = 0;
  const active = new Uint8Array(program.length + 1);
  function closure(state: Uint8Array) {
    for (let i = 0; i < program.length; i++) {
      if (!state[i]) continue;
      if (program[i] === NO_SLASH || program[i] === NO_LINE) state[i + 1] = 1;
      else if (program[i] === OPTIONAL_DIR) {
        state[i + 1] = 1;
        state[i + 3] = 1;
      }
    }
  }
  return { test(path: string) {
    if (!path.startsWith(prefix)) return false;
    active.fill(0);
    active[0] = 1;
    closure(active);
    for (let n = prefix.length; n < path.length; n++) {
      const code = path.charCodeAt(n), nonline = code !== 10 && code !== 13 && code !== 0x2028 && code !== 0x2029;
      let live = false;
      // Reverse writes preserve the previous lower states.
      for (let i = program.length; i >= 0; i--) {
        let reachable = false;
        const loop = program[i];
        if (active[i] && ((loop === NO_SLASH && code !== 47) || (loop === NO_LINE && nonline))) reachable = true;
        if (i > 0 && active[i - 1]) {
          const before = program[i - 1];
          if (before === code || (before === ONE_NO_SLASH && code !== 47)) reachable = true;
        }
        active[i] = reachable ? 1 : 0;
        if (reachable) live = true;
      }
      if (!live) return false;
      closure(active);
    }
    return active[program.length] === 1;
  } };
}

function compilePathPattern(pattern: string): PathPattern | null {
  const normalized = normalizePath(pattern);
  if (!normalized) return null;
  let source = '^';
  let broadStars = 0;
  let segmentStars = 0;
  let needsProgram = false;
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]!;
    if (char === '*' && normalized[index + 1] === '*') {
      broadStars += 1;
      segmentStars += 1;
      if (broadStars > 1 || segmentStars > 1) needsProgram = true;
      if (normalized[index + 2] === '/') {
        source += '(?:.*/)?';
        segmentStars = 0;
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
      segmentStars += 1;
      if (segmentStars > 1) needsProgram = true;
      source += '[^/]*';
      continue;
    }
    if (char === '?') {
      source += '[^/]';
      continue;
    }
    if (char === '/') segmentStars = 0;
    source += /[\\^$+?.()|{}[\]]/.test(char) ? `\\${char}` : char;
  }
  const regex = new RegExp(`${source}$`);
  return needsProgram ? compilePathProgram(normalized) : regex;
}

export function matchesArchitecturePath(path: string, pattern: string): boolean {
  const candidate = normalizePath(path);
  return compilePathPattern(pattern)?.test(candidate) ?? false;
}

export function createArchitecturePathMatcher(): (path: string, pattern: string) => boolean {
  const patterns = new Map<string, PathPattern | null>();
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
