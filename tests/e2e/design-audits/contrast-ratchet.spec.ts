import { expect, test } from '@playwright/test';
import { AUDITED_ROUTES } from '../audited-routes';
import { waitForPageSettled } from '../settle';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Playwright specs load as CJS (using `import.meta` stops the file loading at all).
const { judgeText, judgeAdjacentMarks } = require('../../../scripts/lib/design/contrast.mjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Same reason.
const { collectAdjacentMarks } = require('../../../scripts/lib/design/contrast-collect.mjs');

const ROUTES = AUDITED_ROUTES;

const BASELINE_FAILING_COMBINATIONS = 0;

/** The floor is 4: a shell-only screen yields 3 and the thinnest real screen 6. */
const MIN_COMBINATIONS_PER_ROUTE = 4;

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
    const destination = route === '/ko/docs/' ? '/ko/library/?tab=ontology' : route;
    await page.goto(`${destination}${destination.includes('?') ? '&' : '?'}guides=off`, {
      waitUntil: 'domcontentloaded',
    });
    if (route === '/ko/docs/') {
      await expect(page).toHaveURL(
        (url) => url.pathname === '/ko/library/' && url.searchParams.get('tab') === 'ontology',
      );
      await expect(
        page.locator('#library-workspace-tabpanel-ontology [data-docs-viewer]'),
      ).toBeVisible();
    }
    await waitForPageSettled(page);

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

  // The guard is per route: a whole-run total lets one route clear it while others are empty.
  expect(
    thinRuns,
    `Fewer than ${MIN_COMBINATIONS_PER_ROUTE} combinations were measured on a route. That is not the absence of failures: ` +
      `the screen did not render or collection broke.\n${thinRuns.join('\n')}`,
  ).toEqual([]);
  expect(measured, '조합을 한 개도 못 쟀다면 채집이 깨진 것이다').toBeGreaterThan(50);

  expect(
    failures.length,
    `Combinations failing WCAG 1.4.3 grew from ${BASELINE_FAILING_COMBINATIONS} to ${failures.length}.\n` +
      `If you changed a token, that change lowered the contrast.\n${failures.join('\n')}`,
  ).toBeLessThanOrEqual(BASELINE_FAILING_COMBINATIONS);

  expect(
    failures.length,
    `Failures fell from ${BASELINE_FAILING_COMBINATIONS} to ${failures.length}. ` +
      `Lower BASELINE_FAILING_COMBINATIONS to ${failures.length} too; slack is not left lying around for free.`,
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
    `Adjacent pairs failing WCAG 1.4.11 grew from ${BASELINE_FAILING_ADJACENT_PAIRS} to ${adjacentFailures.length}.\n` +
      `When two touching marks contrast below 3:1, they need a colour-independent separator (a 1px gap, a label or a pattern).\n` +
      `${adjacentFailures.join('\n')}`,
  ).toBeLessThanOrEqual(BASELINE_FAILING_ADJACENT_PAIRS);
});
