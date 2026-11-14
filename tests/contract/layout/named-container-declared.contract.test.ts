import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A named container variant (`@min-[960px]/insights:`) applies only under an ancestor that
 * declares `@container/insights`. With the declaration gone Tailwind still emits the rule and
 * nothing fails; the layout just never changes.
 */
const root = join(import.meta.dirname, '..', '..', '..');
const SOURCE = /\.(?:tsx?|css)$/;
const DECLARATION = /@container\/([a-z0-9-]+)/g;
const VARIANT = /@(?:min-|max-)?(?:\[[^\]\s]+\]|[a-z0-9]+)\/([a-z0-9-]+):/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE.test(entry.name) && !entry.name.includes('.test.') ? [path] : [];
  });
}

describe('named container variants', () => {
  it('every name a variant queries is declared by some @container/<name>', () => {
    const declared = new Set<string>();
    const queriedIn = new Map<string, string>();
    for (const file of [...sourceFiles(join(root, 'src')), ...sourceFiles(join(root, 'app'))]) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(DECLARATION)) declared.add(match[1]);
      for (const match of text.matchAll(VARIANT)) {
        if (!queriedIn.has(match[1])) queriedIn.set(match[1], relative(root, file));
      }
    }
    expect(queriedIn.size, 'the scan found no named container variant').toBeGreaterThan(10);
    const undeclared = [...queriedIn].filter(([name]) => !declared.has(name)).map(([name, file]) => `${name} (${file})`);
    expect(undeclared, 'queried but never declared, so these variants never apply').toEqual([]);
  });
});
