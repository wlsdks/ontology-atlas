import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Design-token gate — verifies the status signal colours meet WCAG AA (>= 4.5:1) on
 * the dark canvas. Since the app became dark-only (2026-07-19, light mode retired
 * entirely), this blocks a regression where status text is unreadable on the canvas.
 *
 * Parses the `@theme` block in globals.css and checks the real dark token values.
 */

const GLOBALS = readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');

const STATUS_TOKENS = [
  '--color-status-success',
  '--color-status-warning',
  '--color-status-paused',
  '--color-status-danger',
];

// AA normal text: status tokens are mostly used at small sizes, so the 4.5 threshold applies.
const AA_TEXT = 4.5;

function themeBlock(): string {
  // The @theme block has no nested braces, so the first `}` ends it.
  const m = GLOBALS.match(/@theme\s*\{([^}]*)\}/);
  if (!m) throw new Error('@theme block not found in globals.css');
  return m[1];
}

function tokenValue(block: string, name: string): string {
  const m = block.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  if (!m) throw new Error(`token ${name} not found in @theme block`);
  return m[1].trim();
}

function relativeLuminance(hex: string): number {
  const channels = hex
    .replace('#', '')
    .match(/../g)!
    .map((h) => parseInt(h, 16) / 255);
  const linear = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

describe('status 토큰 다크 캔버스 대비 (WCAG AA)', () => {
  const block = themeBlock();
  const canvas = tokenValue(block, '--color-canvas');

  it('다크 캔버스 토큰이 hex 로 정의돼 있다', () => {
    expect(canvas).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  for (const token of STATUS_TOKENS) {
    it(`${token} 가 다크 캔버스 위에서 >= ${AA_TEXT}:1`, () => {
      const value = tokenValue(block, token);
      expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
      const ratio = contrast(value, canvas);
      expect(
        ratio,
        `${token} ${value} on ${canvas} = ${ratio.toFixed(2)}:1 (need >= ${AA_TEXT})`,
      ).toBeGreaterThanOrEqual(AA_TEXT);
    });
  }
});
