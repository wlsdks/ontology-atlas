import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
const TOKENS = readFileSync(join(ROOT, 'app/styles/tokens.css'), 'utf8');

const NOTATIONS = {
  'getPropertyValue(…).trim() || literal': /getPropertyValue\(\s*(['"])(--[\w-]+)\1\s*\)\s*\.trim\(\)\s*\|\|\s*(['"])(#[0-9a-fA-F]{3,8})\3/g,
  'cssColor/cssVar(el, token, literal)': /\b(?:cssColor|cssVar)\(\s*[^,()]+,\s*(['"])(--[\w-]+)\1\s*,\s*(['"])(#[0-9a-fA-F]{3,8})\3\s*\)/g,
} as const;

type Fallback = { file: string; line: number; token: string; literal: string; notation: string };

function declared(token: string): string | null {
  const match = new RegExp(`(?:^|[\\s{;])${token}:\\s*([^;]+);`, 'm').exec(TOKENS);
  return match ? match[1].trim().toLowerCase() : null;
}

function fallbacks(file: string, source: string): Fallback[] {
  const found: Fallback[] = [];
  for (const [notation, pattern] of Object.entries(NOTATIONS)) {
    for (const match of source.matchAll(pattern)) {
      found.push({
        file,
        line: source.slice(0, match.index).split('\n').length,
        token: match[2],
        literal: match[4].toLowerCase(),
        notation,
      });
    }
  }
  return found;
}

function stale(entries: Fallback[]): string[] {
  return entries
    .filter((entry) => declared(entry.token) !== entry.literal)
    .map((entry) => `${entry.file}:${entry.line} ${entry.token} falls back to ${entry.literal}; tokens.css says ${declared(entry.token) ?? 'nothing'}`);
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const ALL = [...sourceFiles(join(ROOT, 'src')), ...sourceFiles(join(ROOT, 'app'))].flatMap((file) =>
  fallbacks(relative(ROOT, file), readFileSync(file, 'utf8')),
);

describe('a canvas colour fallback is the token it stands in for', () => {
  it('reads both notations from the source it judges', () => {
    for (const notation of Object.keys(NOTATIONS)) {
      expect(ALL.filter((entry) => entry.notation === notation).length, notation).toBeGreaterThan(0);
    }
  });

  it('keeps every literal fallback equal to the value tokens.css declares', () => {
    expect(stale(ALL)).toEqual([]);
  });

  it('refuses a stale literal and accepts the current one in both notations', () => {
    const planted = [
      'const a = cssColor(tokenEl, "--color-text-secondary", "#b4b5bd");',
      "const b = styles.getPropertyValue('--color-text-quaternary').trim() || '#61626c';",
      'const c = cssVar(rootEl, "--color-text-secondary", "#d0d6e0");',
      "const d = styles.getPropertyValue('--color-text-quaternary').trim() || '#82828a';",
    ].join('\n');
    const entries = fallbacks('planted.ts', planted);
    expect(entries).toHaveLength(4);
    expect(stale(entries).map((line) => line.split(' ')[0]).sort()).toEqual(['planted.ts:1', 'planted.ts:2']);
  });
});
