import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Design system gate — colour CSS properties in a component's inline style must go
 * through a token (var(--color-*)), not a hard-coded hex (.claude/rules/design.md,
 * docs/DESIGN-SYSTEM.md "no hardcoded hex"). A raw hex in an inline style bypasses
 * the light/dark token switch and produces a mode regression (cf. the
 * locale-redirect regression fix).
 *
 * Detection scope: only the pattern of assigning a #hex directly to a
 * colour-related CSS property inside `style={{ ... }}`. A Sigma WebGL palette
 * (object key `amber: '#...'`) and token definition files are naturally excluded
 * because they do not hit the CSS property-name anchor. A hex inside a comment
 * (`// token #27a644`) does not match either, since no colour property name
 * precedes it.
 */

const SRC_DIR = path.join(process.cwd(), 'src');

const COLOR_PROPS = [
  'background',
  'backgroundColor',
  'color',
  'borderColor',
  'border',
  'borderTopColor',
  'borderBottomColor',
  'borderLeftColor',
  'borderRightColor',
  'fill',
  'stroke',
  'boxShadow',
  'outline',
  'outlineColor',
  'textDecorationColor',
  'caretColor',
  'textShadow',
];

// e.g. `background: '#08090a'` / `boxShadow: '... #fff'`. A #hex anywhere before
// the value separator (, ; } or newline) is a violation.
const HEX_IN_COLOR_PROP = new RegExp(
  `\\b(?:${COLOR_PROPS.join('|')})\\s*:\\s*[^,;}\\n]*#[0-9a-fA-F]{3,8}`,
  'g',
);

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

describe('디자인 토큰 가드 — inline style 에 raw hex 색 금지', () => {
  it('어떤 .tsx 도 색 CSS 속성에 hardcoded hex 를 inline 대입하지 않는다', () => {
    const files = collectTsxFiles(SRC_DIR);
    // Ensures the scanner really walked the tree (no false pass on an empty glob).
    expect(files.length).toBeGreaterThan(20);

    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const matches = source.match(HEX_IN_COLOR_PROP);
      if (matches) {
        const rel = path.relative(process.cwd(), file);
        for (const m of matches) violations.push(`${rel}: ${m.trim()}`);
      }
    }

    expect(
      violations,
      `inline style 에 토큰 대신 raw hex 를 쓴 곳:\n${violations.join('\n')}\n` +
        `→ var(--color-*) 토큰으로 교체하세요.`,
    ).toEqual([]);
  });
});
