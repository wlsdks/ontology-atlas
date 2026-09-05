import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const read = (relative: string) => readFileSync(resolve(ROOT, relative), 'utf8');
const CSS = read('app/globals.css');

/** The first `:root` declaration of a token, which is the dark base the app ships. */
function token(name: string): string {
  const match = CSS.match(new RegExp(`^\\s*--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`, 'm'));
  if (!match) throw new Error(`token --${name} has no six-digit hex at :root`);
  return match[1];
}

function relativeLuminance(hex: string): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Two clocks on one row: meaning time and record time.
 *
 * `reviewed_at` says when a person read this document and judged the meaning
 * right. `updatedAt` says when the bytes were last written, by anyone, for any
 * reason. They answer different questions, so the row shows both — and the
 * record time is the weaker claim, so it is the dimmed one.
 *
 * Dimming is where this can go wrong quietly. A demoted column that drops below
 * AA is not a hierarchy, it is a column some readers cannot read, so the ratio
 * is computed here from the shipped tokens rather than eyeballed.
 */
describe('the two-clock row', () => {
  it('dims the record column without dropping it below AA on either ground', () => {
    const dim = token('color-text-quaternary');
    for (const ground of ['color-panel', 'color-canvas'] as const) {
      const ratio = contrast(dim, token(ground));
      expect(
        ratio,
        `--color-text-quaternary on --${ground} measured ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the meaning column ahead of the record column, not merely different', () => {
    const meaning = contrast(token('color-text-secondary'), token('color-panel'));
    const record = contrast(token('color-text-quaternary'), token('color-panel'));
    expect(meaning).toBeGreaterThan(record);
  });

  it('renders both clocks on one row, and the meaning clock only when it exists', () => {
    const source = read('src/views/docs-vault/ui/parts/DocMetaBar.tsx');
    expect(source).toContain('data-testid="doc-meaning-time"');
    expect(source).toContain('data-testid="doc-record-time"');
    // The meaning clock is guarded — a document nobody reviewed shows one clock
    // rather than an invented second one.
    expect(source).toContain('reviewedAt ? (');
    expect(source).toContain('doc.frontmatter?.reviewed_at');
    // The dimmed column inherits the row's quaternary ink; it must not be
    // re-coloured locally, which is how a demoted column drifts below AA.
    expect(source).toContain('text-[color:var(--color-text-secondary)]');
  });

  it('names which clock is which, so the pair is not two undated numbers', () => {
    const en = JSON.parse(read('messages/en.json'));
    const ko = JSON.parse(read('messages/ko.json'));
    for (const catalog of [en, ko]) {
      expect(typeof catalog.vaultWidgets.parts.sidebar.review.reviewedOn).toBe('string');
      expect(typeof catalog.vaultWidgets.parts.sidebar.review.reviewedOnTitle).toBe('string');
      expect(typeof catalog.vaultWidgets.parts.meta.recordTimeTitle).toBe('string');
    }
  });
});
