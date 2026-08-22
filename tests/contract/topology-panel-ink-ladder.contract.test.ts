import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Uses the same ESM import as its sibling contract (`contrast.contract.test.ts`).
// `require` bypasses the Vitest module graph, so editing `contrast.mjs` would stop
// `pnpm checks:changed` from **recommending this contract** (2026-08-07 review).
import { composite, contrastRatio, parseColor } from '../../scripts/lib/contrast.mjs';

/**
 * Holds the map panel's **second ink ramp** as a spec.
 *
 * ## Why this contract exists (2026-08-06 design system audit)
 *
 * Live measurement found `--topology-v2-panel-*` running a **parallel system that
 * differs from the global neutrals by a few steps each**. There were 0 hard-coded
 * values, so every value rule passed and `check-no-raw-color` was doing its job.
 * What was missing is a different question: **nobody was measuring whether a
 * surface-only token upholds the design system's properties.**
 *
 * ## Why the values were not converged onto the global ones
 *
 * Convergence was measured and it **improves** contrast (putting the global tokens
 * on the panel surface gives primary 15.16 → 16.79 · secondary 7.14 → **12.23** ·
 * tertiary 4.96 → 5.5). But raising secondary from 7.14 to 12.23 **changes this
 * panel's entire ink hierarchy**: the panel is a dense surface whose hierarchy is
 * deliberately compressed (global secondary/tertiary ratio 2.23 vs the panel's
 * 1.44), and the global ramp is cool (`#d0d6e0` · `#8a8f98`) while the panel's is
 * achromatic (`#a3a3ac` · `#868690`). Removing the chroma is the more legible
 * choice on a data-dense surface, so it is a judgement rather than taste, and
 * `.claude/rules/design.md` records that the map's values are research-based.
 * And `text-quaternary` **already matches the global value** (#82828a, converged
 * 2026-08-03) — so this ramp is not a copy unaware of the global one but
 * **partially and deliberately divergent**.
 *
 * So this contract fixes **properties**, not values: is it legible on that
 * surface, is the hierarchy monotonic, does the ink set grow unnoticed? Changing a
 * value is still free, but the table below has to change with it, so **the
 * judgement lands in the diff.**
 *
 * ## What this contract cannot do
 *
 * It does not judge whether there should be two ramps at all. That is a human
 * decision, recorded with its falsifier in `docs/DECISIONS.md` under 2026-08-06.
 */

const CSS = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');

/**
 * Reads the **base declaration** of `--x: <value>;`.
 *
 * ⚠️ Not "the last declaration in the file" — the first version of this gate did
 * that and was wrong (2026-08-06). `--color-text-quaternary`'s effective value is
 * the `#82828a` in `@theme`, but a `#8f95a0` appears later inside
 * `@media (prefers-contrast: more)`, so reading the last declaration **mistakes a
 * conditional override for the base value.** The base declaration always comes
 * first (`@theme` or a top-level `:root`).
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

const SURFACE_TOKEN = '--topology-v2-panel-surface';

/**
 * The declared ledger — **the measured contrast of each ink on that surface**.
 *
 * Changing a value means changing this table too, which is its purpose: adjusting
 * the map panel's ink is legitimate design work, but it must not happen
 * **silently**.
 */
const INK_LEDGER: ReadonlyArray<readonly [token: string, ratio: number]> = [
  ['--topology-v2-panel-text-primary', 15.16],
  ['--topology-v2-panel-metric-text', 8.88],
  ['--topology-v2-panel-text-secondary', 7.14],
  ['--topology-v2-panel-text-tertiary', 4.96],
  ['--topology-v2-panel-text-quaternary', 4.69],
];

/** The WCAG 1.4.3 body-text floor. Every ink in this panel is used at body size. */
const BODY_AA = 4.5;

function ratioOnPanel(token: string): number {
  const surface = resolve(SURFACE_TOKEN);
  const ink = resolve(token);
  expect(surface, `${SURFACE_TOKEN} 를 못 읽었다`).toBeTruthy();
  expect(ink, `${token} 를 못 읽었다`).toBeTruthy();
  const bg = parseColor(surface);
  const fg = parseColor(ink);
  expect(bg, `${SURFACE_TOKEN} 값을 색으로 못 읽었다: ${surface}`).toBeTruthy();
  expect(fg, `${token} 값을 색으로 못 읽었다: ${ink}`).toBeTruthy();
  return contrastRatio(composite(fg, bg), bg);
}

describe('지도 패널 잉크 램프 (표면 전용 두 번째 램프)', () => {
  it('장부가 비어 있지 않고 표면 토큰이 실재한다', () => {
    // Idling guard — an empty ledger or an unreadable surface would make every test below pass.
    expect(INK_LEDGER.length).toBeGreaterThan(3);
    expect(resolve(SURFACE_TOKEN)).toMatch(/^#|^rgb/);
  });

  it('선언된 잉크가 globals.css 의 패널 잉크 **전부**를 덮는다', () => {
    /**
     * Coverage assertion — it measures "sees the whole set", not "is not an empty
     * set" (`.claude/rules/design-gates.md`: the icon ratchet missing 3/4 by seeing
     * only one notation). A new ink on the panel fires here first.
     */
    /**
     * ⚠️ Fixed twice (2026-08-07 review).
     *
     * ① The first pattern, `text-[a-z]+`, could not cross a **hyphen** in the name and
     * missed inks such as `--topology-v2-panel-text-on-accent` — the assertion claiming
     * "a new ink fires here first" was passing silently, repeating design-gates.md's
     * "a scanner that sees one notation misses everything else" exactly.
     *
     * ② Widening it to catch every name containing `text` then dragged in the three
     * **accent inks** (`domain-text` · `count-text` · `primary-text`). Those are indigo
     * and sit **on tint surfaces**, so they must not be measured with the same ruler as
     * the neutral ladder on the panel surface (both their contrast and their hierarchy
     * belong to a different contract).
     *
     * Excluding them by hand would drift again, so they are separated **by
     * classification**: referencing indigo makes it an accent ink (owned by the
     * `accent-ink-contrast` contract), otherwise it is the neutral ladder and must be in
     * the ledger. A new neutral ink still fires here.
     */
    const allInks = [
      ...CSS.matchAll(/^\s*(--topology-v2-panel-[a-z0-9-]*text[a-z0-9-]*)\s*:/gm),
    ].map((m) => m[1]);
    const isAccentInk = (token: string): boolean =>
      /--color-indigo/.test(declaredValue(token) ?? '');
    const defined = allInks.filter((t) => !isAccentInk(t));
    expect(
      allInks.length - defined.length,
      '강조 잉크를 하나도 못 갈랐다 — 분류가 깨졌다',
    ).toBeGreaterThan(0);
    expect(defined.length, '패널 잉크 토큰을 하나도 못 찾았다 — 스캔이 깨졌다').toBeGreaterThan(3);
    const declared = new Set(INK_LEDGER.map(([t]) => t));
    const missing = [...new Set(defined)].filter((t) => !declared.has(t));
    expect(
      missing,
      `장부에 없는 패널 잉크: ${missing.join(', ')} — 새 잉크를 더했으면 대비를 재서 INK_LEDGER 에 등재한다`,
    ).toEqual([]);
  });

  it.each(INK_LEDGER)('%s 가 패널 표면 위에서 본문 AA 를 넘는다', (token) => {
    expect(ratioOnPanel(token)).toBeGreaterThanOrEqual(BODY_AA);
  });

  it.each(INK_LEDGER)('%s 의 실측 대비가 장부와 같다', (token, ratio) => {
    expect(
      Number(ratioOnPanel(token).toFixed(2)),
      `${token} 의 대비가 장부(${ratio})와 다르다 — 값을 바꿨으면 INK_LEDGER 도 같이 고쳐라. ` +
        `그 diff 가 «패널 잉크를 조정했다» 를 기록하는 자리다.`,
    ).toBeCloseTo(ratio, 1);
  });

  it('잉크 위계가 순서대로 내려간다', () => {
    /**
     * An inverted hierarchy makes "primary" fainter than "secondary" — the class of
     * defect where every value rule passes while the reading order collapses on screen.
     * It must decrease monotonically in ledger order.
     */
    const ratios = INK_LEDGER.map(([t]) => Number(ratioOnPanel(t).toFixed(2)));
    for (let i = 1; i < ratios.length; i += 1) {
      expect(
        ratios[i],
        `${INK_LEDGER[i][0]}(${ratios[i]}) 가 ${INK_LEDGER[i - 1][0]}(${ratios[i - 1]}) 보다 진하다 — 위계 역전`,
      ).toBeLessThan(ratios[i - 1]);
    }
  });

  it('전역 램프와 값이 같아진 잉크는 별칭이 아니라 같은 값으로 남는다', () => {
    /**
     * `text-quaternary` converged with the global value on 2026-08-03 (#82828a). That
     * fact is pinned here: **how far** the divergent ramp diverges is this contract's
     * information, and a converged place quietly diverging again is a regression.
     */
    expect(resolve('--topology-v2-panel-text-quaternary')?.toLowerCase()).toBe(
      resolve('--color-text-quaternary')?.toLowerCase(),
    );
  });
});
