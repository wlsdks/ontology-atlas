import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Design system gate — blocks the forbidden Tailwind patterns from
 * .claude/rules/forbidden.md / docs/DESIGN-SYSTEM.md "Absolute rules (Don'ts)".
 * This previously relied on human PR review alone (the rule text says violations
 * are rejected at PR stage); this gate catches the regression in code immediately.
 *
 * Blocked patterns (only the unambiguous ones):
 *   - backdrop-blur*  → no glassmorphism
 *   - hover:scale-*   → no scale-based hover
 *   - (from|via|to)-(pink|fuchsia|purple|violet|rose)-N → no purple/pink gradients
 *
 * Comments (JSDoc `/* *​/`, line `//`) are stripped before scanning, so that
 * comments explaining the rule (e.g. "no glassmorphism(backdrop-blur)") do not
 * become false positives.
 * A subtle fade using only var(--color-*) token stops in a linear-gradient passes,
 * because it carries no forbidden colour stop (pink/purple and so on).
 *
 * NOTE: never write an arbitrary-value Tailwind class (the bracket form) in this
 * comment. Tailwind v4's content scanner extracts class candidates even from test
 * file comments, and a bogus placeholder breaks the CSS generated for globals.css,
 * producing a dev 500.
 */

const SCAN_DIRS = ['src', 'app'].map((d) => path.join(process.cwd(), d));

const FORBIDDEN_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: 'backdrop-blur (glassmorphism 금지)', re: /\bbackdrop-blur(-[a-z0-9]+)?\b/g },
  { name: 'hover:scale- (scale hover 금지)', re: /\bhover:scale-/g },
  {
    name: '보라/핑크 그라디언트 금지',
    re: /\b(?:from|via|to)-(?:pink|fuchsia|purple|violet|rose)-\d/g,
  },
];

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block / JSDoc / JSX comments
    .replace(/\/\/[^\n]*/g, ' '); // line comments
}

function collectTsxFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      collectTsxFiles(full, acc);
    } else if (/\.tsx$/.test(entry.name) && !/\.(test|spec)\.tsx$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

describe('디자인 가드 — 금지 Tailwind 패턴', () => {
  it('backdrop-blur / hover:scale / 보라·핑크 그라디언트 클래스를 쓰지 않는다', () => {
    const files = SCAN_DIRS.flatMap((dir) => collectTsxFiles(dir));
    // Ensures the scanner really walked the tree.
    expect(files.length).toBeGreaterThan(20);

    const violations: string[] = [];
    for (const file of files) {
      const code = stripComments(readFileSync(file, 'utf8'));
      for (const { name, re } of FORBIDDEN_PATTERNS) {
        const matches = code.match(re);
        if (matches) {
          const rel = path.relative(process.cwd(), file);
          violations.push(`${rel}: ${name} → ${[...new Set(matches)].join(', ')}`);
        }
      }
    }

    expect(
      violations,
      `금지 디자인 패턴 사용:\n${violations.join('\n')}\n` +
        `→ docs/DESIGN-SYSTEM.md "Absolute rules (Don'ts)" 참고.`,
    ).toEqual([]);
  });
});
