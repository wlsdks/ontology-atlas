import { describe, expect, it } from 'vitest';
import { composite, contrastRatio, parseColor } from '../../../scripts/lib/design/contrast.mjs';
import { readGlobalCss } from '../../../scripts/lib/design/global-css.mjs';

/**
 * Status signal colours meet WCAG AA (>= 4.5:1) on the dark canvas, checked against the real token
 * values in the `@theme` block of globals.css.
 */

const GLOBALS = readGlobalCss();

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
  const m = GLOBALS.match(/@theme(?:\s+static)?\s*\{([^}]*)\}/);
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

describe('status token contrast on the dark canvas (WCAG AA)', () => {
  const block = themeBlock();
  const canvas = tokenValue(block, '--color-canvas');

  it('the dark canvas tokens are defined as hex', () => {
    expect(canvas).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  for (const token of STATUS_TOKENS) {
    it(`${token} is >= ${AA_TEXT}:1 on the dark canvas`, () => {
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

/** A source state's ink is a mark (bar segment, dot), so the non-text floor applies (WCAG 1.4.11). */
const SOURCE_STATE_TOKENS = [
  '--color-source-page',
  '--color-source-partial',
  '--color-source-review',
  '--color-source-checking',
  '--color-source-unreadable',
  '--color-source-none',
  '--color-source-complete',
];
const NON_TEXT = 3;

function resolvedHex(block: string, name: string): string {
  const value = tokenValue(block, name);
  const alias = value.match(/^var\((--[\w-]+)\)$/);
  return alias ? resolvedHex(block, alias[1]) : value;
}

describe('source state inks on canvas and panel (WCAG 1.4.11)', () => {
  const block = themeBlock();
  for (const token of SOURCE_STATE_TOKENS) {
    for (const ground of ['--color-canvas', '--color-panel']) {
      it(`${token} is >= ${NON_TEXT}:1 on ${ground}`, () => {
        const value = resolvedHex(block, token);
        expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
        const ratio = contrast(value, resolvedHex(block, ground));
        expect(ratio, `${token} ${value} on ${ground} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(NON_TEXT);
      });
    }
  }
});

/** The words a `Sheet` writes: the format on the source paper, and a page's source tab on the canvas. */
const PAPER_TEXT: ReadonlyArray<{ ink: string; ground: string }> = [
  { ink: '--color-text-tertiary', ground: '--color-paper-source' },
  { ink: '--color-indigo-text-soft', ground: '--color-canvas' },
];

describe('paper sheet text (WCAG 1.4.3)', () => {
  const block = themeBlock();
  for (const { ink, ground } of PAPER_TEXT) {
    it(`${ink} is >= ${AA_TEXT}:1 on ${ground}`, () => {
      const groundRgb = parseColor(resolvedHex(block, ground));
      const inkRgba = parseColor(resolvedHex(block, ink));
      expect(groundRgb, `${ground} is not a readable colour`).not.toBeNull();
      expect(inkRgba, `${ink} is not a readable colour`).not.toBeNull();
      const ratio = contrastRatio(composite(inkRgba!, groundRgb!), groundRgb!);
      expect(ratio, `${ink} on ${ground} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_TEXT);
    });
  }
});
