import { expect, test } from '@playwright/test';
import { AUDITED_ROUTES } from './audited-routes';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Playwright specs load as CJS (using `import.meta` stops the file loading at all).
const { judgeText, judgeAdjacentMarks } = require('../../scripts/lib/contrast.mjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Same reason.
const { collectAdjacentMarks } = require('../../scripts/lib/contrast-collect.mjs');

/**
 * Contrast ratchet — **a token that drops contrast turns red in the build it lands
 * in.**
 *
 * **Why an instrument is not enough.** `scripts/measure-contrast.mjs` landed on
 * 2026-08-03, but it only runs **when a person invokes it**. The standard practice
 * in design-system testing demands the opposite: *"a token edit that quietly drops
 * contrast below the accessibility threshold shows up the same build it lands"*. A
 * hand-invoked instrument does not exist unless whoever edited the token invokes it.
 *
 * **Why this is needed alongside the axe ratchet.** They overlap without being the
 * same. `a11y-ratchet`'s `color-contrast` counts elements **axe's way** (12
 * elements); this counts **(foreground, background, size) combinations** (4
 * combinations). The unit of prescription is the combination, so this side is easier
 * to fix, while axe covers rules we do not look at. Keeping both is worth it — when
 * one develops a blind spot, the other covers it.
 *
 * The calculation lives in `scripts/lib/contrast.mjs` (pure functions with fixture
 * probes). This file only collects and judges.
 */

// Uses **the same list** as the axe ratchet. This side used to have 5 routes and
// that side 8, with no reason recorded on either — the cost of that blind spot is
// in `audited-routes.ts`'s doc-block.
const ROUTES = AUDITED_ROUTES;

/**
 * Full inventory 2026-08-03 (1512×900, the 5 routes of the time, 109 combinations):
 *
 * | Route | Failing | What |
 * |---|---:|---|
 * | ~~`/ko`~~ | ~~2~~ → **0** | The ink on the primary CTA's indigo fill was `--color-text-primary` (#f7f8f8, **4.42:1**). Moved to `--color-text-on-accent` (#ffffff, **4.70:1**), which already existed for that surface — two places, `button.tsx`'s `primary` variant and `DownloadPage`'s size badge. Zero new values |
 * | ~~`/ko/projects`~~ | ~~2~~ → **0** | `--color-text-quaternary` only broke on surfaces one step up (overlay-1 composited **4.37**, elevated **4.16**). The 2026-08-03 verdict took it `#787c84` → `#82828a` — all four resting surfaces AA (5.23 / 5.00 / 4.81 / 4.57), hierarchy step ratio 1.17 preserved, converging with the map panel's quaternary. Ledger: docs/DECISIONS.md |
 * | Map · docs · studio | 0 | |
 *
 * With the baseline at 0, this gate's life is held by the `measured > 50` collection
 * guard below — without it an empty screen and no failures are the same green.
 * **This number only goes down.**
 */
const BASELINE_FAILING_COMBINATIONS = 0;

/**
 * Floor on the (foreground, background, size) combinations **actually measured** on
 * real content for one route.
 *
 * Measured 2026-08-04 (17 routes): the thinnest are the two 404s at **6** —
 * naturally low, being a single-card screen — then `/ko/guide/` at 15, with most
 * between 16 and 30.
 *
 * The floor of 4 was **found by probe**: adding a temporary route rendering only
 * `<div />` produced **3** (the value with shell chrome alone) and this assertion
 * went red on the spot. So 4 stands between "a shell-only screen, 3" and "the
 * thinnest real screen, 6". A genuinely empty document is 0, so the margin is far
 * larger.
 *
 * This guard does the same job as the axe ratchet's `MIN_RULES_PASSED_PER_ROUTE`:
 * with the baseline at 0, "no failures" and "nothing was measured" are the same
 * green, and this assertion is the only thing separating them.
 */
const MIN_COMBINATIONS_PER_ROUTE = 4;

/**
 * Count of adjacent data-mark pairs failing WCAG 1.4.11 (3:1) — **only goes down.**
 *
 * **Why this gate appeared on 2026-08-06.** `judgeAdjacentMarks` and the on-screen
 * collector already existed as of 2026-08-04, but **both lived only inside
 * `scripts/measure-contrast.mjs`**, the hand-invoked instrument. This CI ratchet
 * called `judgeText` alone — so the adjacent-mark check was **a check that ran only
 * when a person remembered it**, which is exactly how this repository missed a
 * 1.14:1 adjacent pair. The failure the instrument's own doc-block recorded ("the
 * calculator existed but no instrument called it") was repeating one layer up.
 *
 * Inventory at switch-on (17 routes, 1512×900): touching pairs **1**, failures
 * **0**, pairs already separated by a gap 8. Hence a baseline of 0.
 */
const BASELINE_FAILING_ADJACENT_PAIRS = 0;

/** Extracts only colours and fonts from the page; pure functions do the judging. */
const COLLECT = `(() => {
  const resolveBackground = (el) => {
    const stack = [];
    for (let node = el; node; node = node.parentElement) {
      const m = /rgba?\\(([^)]+)\\)/.exec(getComputedStyle(node).backgroundColor);
      if (!m) continue;
      const p = m[1].split(/[\\s,/]+/).filter(Boolean).map(Number);
      const a = p.length > 3 ? p[3] : 1;
      if (a <= 0) continue;
      stack.push([p[0], p[1], p[2], a]);
      if (a >= 1) break;
    }
    let base = [8, 9, 10, 1];
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      const [r, g, b, a] = stack[i];
      base = [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a), 1];
    }
    return 'rgb(' + base[0] + ', ' + base[1] + ', ' + base[2] + ')';
  };
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('*')) {
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
    if (!own) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    const bg = resolveBackground(el);
    /*
     * **The ink is what the eye receives, not what \`color\` says.** \`opacity\` composites
     * the whole element against what is behind it, and it never touches the computed
     * \`color\`, so an \`opacity-80\` on a word was invisible to this collector — the
     * first-run card's ⌘O keycap read 4.70:1 here while measuring 3.63:1 on screen
     * (2026-09-05). Opacity multiplies down the tree, so the effective alpha is the
     * product from the element up to the root, and \`resolveBackground\` has already
     * flattened what sits behind it.
     */
    let alpha = 1;
    for (let node = el; node; node = node.parentElement) {
      const o = Number(getComputedStyle(node).opacity);
      if (Number.isFinite(o)) alpha *= o;
      if (alpha <= 0) break;
    }
    const fg = alpha >= 0.999 ? cs.color : (() => {
      const f = /rgba?\(([^)]+)\)/.exec(cs.color);
      const b = /rgba?\(([^)]+)\)/.exec(bg);
      if (!f || !b) return cs.color;
      const fp = f[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      const bp = b[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      const mix = (i) => fp[i] * alpha + bp[i] * (1 - alpha);
      return 'rgb(' + mix(0) + ', ' + mix(1) + ', ' + mix(2) + ')';
    })();
    const key = fg + '|' + cs.fontSize + '|' + cs.fontWeight + '|' + bg;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ fg, bg, fontSizePx: parseFloat(cs.fontSize), fontWeight: cs.fontWeight, sample: own.slice(0, 40) });
  }
  return out;
})()`;

test('대비 래칫 — WCAG 1.4.3 미달 조합이 늘지 않는다', async ({ page }) => {
  // Routes went 5 → 17. At 2.5s of settle time per route this exceeds the default 60s.
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  const failures: string[] = [];
  const thinRuns: string[] = [];
  let measured = 0;
  /** Adjacent marks — the failing touching pairs, plus evidence that the structure was found at all. */
  const adjacentFailures: string[] = [];
  let adjacentTouching = 0;
  let adjacentSeparated = 0;

  for (const route of ROUTES) {
    await page.goto(`${route}?guides=off`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const marks = (await page.evaluate(collectAdjacentMarks)) as Array<{
      separated?: boolean;
      a?: string;
      b?: string;
      over?: string;
      selector?: string;
    }>;
    for (const m of marks) {
      if (m.separated) {
        // A 1px gap is the **colour-independent separator** the charter requires — not
        // subject to judgement, but counted. Dropping it silently makes "measured" and
        // "not measured" the same green.
        adjacentSeparated += 1;
        continue;
      }
      const judged = judgeAdjacentMarks(m);
      if (!judged) continue; // An unreadable colour is not measured, not a pass
      adjacentTouching += 1;
      if (!judged.passes) {
        adjacentFailures.push(
          `${route} ${judged.ratio}:1 < 3 · ${m.a} ↔ ${m.b} over ${m.over} — ${m.selector}`,
        );
      }
    }
    const samples = (await page.evaluate(COLLECT)) as Array<{
      fg: string;
      bg: string;
      fontSizePx: number;
      fontWeight: string;
      sample: string;
    }>;
    let routeMeasured = 0;
    for (const s of samples) {
      const judged = judgeText(s);
      if (!judged) continue; // An unreadable colour is not measured, not a pass
      measured += 1;
      routeMeasured += 1;
      if (!judged.passes) {
        failures.push(`${route} ${judged.ratio}:1 < ${judged.required} · ${s.fontSizePx}px · ${s.fg} on ${s.bg} — «${s.sample}»`);
      }
    }
    if (routeMeasured < MIN_COMBINATIONS_PER_ROUTE) {
      thinRuns.push(`  ${route}: 잰 조합 ${routeMeasured}`);
    }
  }

  // An idling detector makes every judgement above "always pass", which is the same
  // as having no gate.
  //
  // ⚠️ This used to be a **total** of `> 50`. That was loose even at 5 routes (one
  // route clearing 50 keeps it green while every other screen is empty), and a
  // whole-run total leaves a blind spot that blocks effectively nothing. The guard has
  // to stand **per route**.
  expect(
    thinRuns,
    `라우트당 조합 ${MIN_COMBINATIONS_PER_ROUTE}개도 못 쟀다 — 미달이 없는 게 아니라 ` +
      `화면이 안 떴거나 채집이 깨진 것이다.\n${thinRuns.join('\n')}`,
  ).toEqual([]);
  expect(measured, '조합을 한 개도 못 쟀다면 채집이 깨진 것이다').toBeGreaterThan(50);

  expect(
    failures.length,
    `WCAG 1.4.3 미달 조합이 ${BASELINE_FAILING_COMBINATIONS} → ${failures.length} 로 늘었다.\n` +
      `토큰을 바꿨다면 그 변경이 대비를 떨어뜨린 것이다.\n${failures.join('\n')}`,
  ).toBeLessThanOrEqual(BASELINE_FAILING_COMBINATIONS);

  expect(
    failures.length,
    `미달이 ${BASELINE_FAILING_COMBINATIONS} → ${failures.length} 로 줄었다. ` +
      `BASELINE_FAILING_COMBINATIONS 도 ${failures.length} 로 내려라 — 여유를 무료로 두지 않는다.`,
  ).toBeGreaterThanOrEqual(BASELINE_FAILING_COMBINATIONS);

  /**
   * Is the adjacent-mark collector **alive**?
   *
   * ⚠️ This does not assert "there must be at least one touching pair". Separating
   * every touching pair with a 1px gap is precisely **the outcome this charter wants**,
   * and requiring one would turn the gate red the moment the screen improves — a gate
   * pinning today's shape rather than the spec. So it asserts "was any adjacent-mark
   * **structure** found at all": touching or separated, a collector that finds nothing
   * is broken.
   */
  expect(
    adjacentTouching + adjacentSeparated,
    '인접 데이터 마크 구조를 하나도 못 찾았다 — 미달이 없는 게 아니라 채집기가 깨졌다',
  ).toBeGreaterThan(0);

  expect(
    adjacentFailures.length,
    `WCAG 1.4.11 미달 인접 쌍이 ${BASELINE_FAILING_ADJACENT_PAIRS} → ${adjacentFailures.length} 로 늘었다.\n` +
      `맞닿은 두 마크의 대비가 3:1 미만이면 색-무관 구분자(1px 틈 · 라벨 · 패턴)가 있어야 한다.\n` +
      `${adjacentFailures.join('\n')}`,
  ).toBeLessThanOrEqual(BASELINE_FAILING_ADJACENT_PAIRS);
});
