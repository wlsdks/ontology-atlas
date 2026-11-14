import { describe, expect, it } from 'vitest';

// Same ESM import as the sibling contract: `require` bypasses the Vitest module graph, so editing
// `contrast.mjs` would stop `pnpm checks:changed` recommending this contract.
import { composite, contrastRatio, parseColor } from '../../../scripts/lib/design/contrast.mjs';
import { readGlobalCss } from '../../../scripts/lib/design/global-css.mjs';

/**
 * Holds the map panel second ink ramp as properties, not values: legible on the panel surface,
 * monotonic hierarchy, and the ink set cannot grow unnoticed. Whether two ramps should exist at all
 * is a human decision recorded in `docs/DECISIONS.md`.
 */

const CSS = readGlobalCss();

/**
 * Reads the base declaration, not the last one: a later `prefers-contrast: more` override would be
 * mistaken for the base value. The base comes first (`@theme` or a top-level `:root`).
 */
function declaredValue(token: string): string | null {
  const match = new RegExp(`${token}\\s*:\\s*([^;]+);`).exec(CSS);
  return match ? match[1].trim() : null;
}

/** Follows one level of `var(--other)` — this file's alias tokens have that shape. */
function resolve(token: string, depth = 0): string | null {
  const raw = declaredValue(token);
  if (!raw) return null;
  const alias = /^var\((--[a-z0-9-]+)\)$/.exec(raw);
  if (alias && depth < 4) return resolve(alias[1], depth + 1);
  return raw;
}

const SURFACE_TOKEN = '--map-panel-surface';

/**
 * The declared ledger — **the measured contrast of each ink on that surface**.
 *
 * Changing a value means changing this table too, which is its purpose: adjusting
 * the map panel's ink is legitimate design work, but it must not happen
 * **silently**.
 */
const INK_LEDGER: ReadonlyArray<readonly [token: string, ratio: number]> = [
  ['--map-panel-text-primary', 15.16],
  ['--map-panel-metric-text', 8.88],
  ['--map-panel-text-secondary', 7.14],
  ['--map-panel-text-tertiary', 4.96],
  ['--map-panel-text-quaternary', 4.78],
];

/** The WCAG 1.4.3 body-text floor. Every ink in this panel is used at body size. */
const BODY_AA = 4.5;

function ratioOnPanel(token: string): number {
  const surface = resolve(SURFACE_TOKEN);
  const ink = resolve(token);
  expect(surface, `could not read ${SURFACE_TOKEN}`).toBeTruthy();
  expect(ink, `could not read ${token}`).toBeTruthy();
  const bg = parseColor(surface);
  const fg = parseColor(ink);
  expect(bg, `could not read the value of ${SURFACE_TOKEN} as a color: ${surface}`).toBeTruthy();
  expect(fg, `could not read the value of ${token} as a color: ${ink}`).toBeTruthy();
  return contrastRatio(composite(fg, bg), bg);
}

describe('map panel ink ramp (a second ramp for the surface only)', () => {
  it('the ledger is not empty and the surface token exists', () => {
    // Idling guard — an empty ledger or an unreadable surface would make every test below pass.
    expect(INK_LEDGER.length).toBeGreaterThan(3);
    expect(resolve(SURFACE_TOKEN)).toMatch(/^#|^rgb/);
  });

  it('the declared inks cover **every** panel ink in globals.css', () => {
    /**
     * Coverage assertion — it measures "sees the whole set", not "is not an empty
     * set" (`.claude/rules/design-gates.md`: the icon ratchet missing 3/4 by seeing
     * only one notation). A new ink on the panel fires here first.
     */
    /**
     * Neutral inks are separated from accent inks by classification: a value referencing indigo is an
     * accent ink owned by the `accent-ink-contrast` contract; other panel text inks must be in the ledger.
     */
    const allInks = [
      ...CSS.matchAll(/^\s*(--map-panel-[a-z0-9-]*text[a-z0-9-]*)\s*:/gm),
    ].map((m) => m[1]);
    const isAccentInk = (token: string): boolean =>
      /--color-indigo/.test(declaredValue(token) ?? '');
    const defined = allInks.filter((t) => !isAccentInk(t));
    expect(
      allInks.length - defined.length,
      'could not separate out a single emphasis ink, so the classification is broken',
    ).toBeGreaterThan(0);
    expect(defined.length, 'found no panel ink token at all, so the scan is broken').toBeGreaterThan(3);
    const declared = new Set(INK_LEDGER.map(([t]) => t));
    const missing = [...new Set(defined)].filter((t) => !declared.has(t));
    expect(
      missing,
      `panel inks missing from the ledger: ${missing.join(', ')}; if you added a new ink, measure its contrast and register it in INK_LEDGER`,
    ).toEqual([]);
  });

  it.each(INK_LEDGER)('%s clears body AA on the panel surface', (token) => {
    expect(ratioOnPanel(token)).toBeGreaterThanOrEqual(BODY_AA);
  });

  it.each(INK_LEDGER)('the measured contrast of %s equals the ledger', (token, ratio) => {
    expect(
      Number(ratioOnPanel(token).toFixed(2)),
      `The contrast of ${token} differs from the ledger (${ratio}). If you changed the value, update INK_LEDGER with it; ` +
        `that diff is where the panel ink adjustment gets recorded.`,
    ).toBeCloseTo(ratio, 1);
  });

  it('the ink hierarchy descends in order', () => {
    /**
     * An inverted hierarchy makes "primary" fainter than "secondary" — the class of
     * defect where every value rule passes while the reading order collapses on screen.
     * It must decrease monotonically in ledger order.
     */
    const ratios = INK_LEDGER.map(([t]) => Number(ratioOnPanel(t).toFixed(2)));
    for (let i = 1; i < ratios.length; i += 1) {
      expect(
        ratios[i],
        `${INK_LEDGER[i][0]}(${ratios[i]}) is stronger than ${INK_LEDGER[i - 1][0]}(${ratios[i - 1]}), so the hierarchy is inverted`,
      ).toBeLessThan(ratios[i - 1]);
    }
  });

  it('an ink that has become equal to the global ramp stays the same value rather than an alias', () => {
    /** `text-quaternary` equals the global value; pinned so a converged place cannot quietly diverge. */
    expect(resolve('--map-panel-text-quaternary')?.toLowerCase()).toBe(
      resolve('--color-text-quaternary')?.toLowerCase(),
    );
  });
});
