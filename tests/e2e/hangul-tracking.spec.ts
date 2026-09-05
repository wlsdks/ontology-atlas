import { expect, test } from '@playwright/test';

import { AUDITED_ROUTES } from './audited-routes';
import { seedFirstRunSeen } from './first-run-seed';

/**
 * **Caps tracking is a Latin device** (owner, 2026-09-06, of the installed app in Korean):
 * the uppercase eyebrow style is applied to Korean strings and *"it spaces the syllables apart and
 * reads broken."*
 *
 * ## Why this is measured in a browser and not in source
 *
 * The defect is a **pair**: a `--tracking-caps-*` class on an element whose *rendered text* is
 * Hangul. Neither half is a violation alone — the same class on `OVERVIEW` is the specification —
 * and lint can see the class while knowing nothing about what the message catalogue will put
 * inside it. Only the rendered page holds both facts at once, which is why this is a spec and not
 * a contract test.
 *
 * ## The threshold, and why it is not zero
 *
 * | | letter-spacing on a 9.5-11px label |
 * |---|---|
 * | `--tracking-caps-12 … -16` (the defect) | 1.14 – 1.76px |
 * | `--tracking-caption` / `--tracking-label` (kept) | 0.38 – 0.44px |
 *
 * Measured on twelve `/ko/` routes at 1512x949 before the rule existed: 26 distinct Hangul
 * strings across eight routes, every one of them a caps-step consumer. The two type-ramp pairs are
 * body-text pairs that apply to both scripts and were never part of the complaint, so the gate
 * sits at **0.6px** — above everything kept, below everything removed, and a number a future
 * caps step cannot slip under.
 */
const MAX_HANGUL_TRACKING_PX = 0.6;

/** Hangul syllables, compatibility jamo, and both jamo extension blocks. */
const HANGUL_SOURCE = '[\\u1100-\\u11FF\\u3130-\\u318F\\uA960-\\uA97F\\uAC00-\\uD7A3]';

const KOREAN_ROUTES = AUDITED_ROUTES.filter((route) => route.startsWith('/ko/'));

type Offender = { text: string; tracking: number; classes: string };

async function trackedHangul(
  page: import('@playwright/test').Page,
  limit: number,
  source: string,
): Promise<Offender[]> {
  return page.evaluate(
    ([max, hangulSource]) => {
      const hangul = new RegExp(hangulSource as string);
      const out: Offender[] = [];
      for (const node of document.querySelectorAll('body *')) {
        // Leaf elements only: a container's `textContent` is its children's, and its own
        // letter-spacing may never reach a glyph.
        if (node.children.length > 0) continue;
        const text = (node.textContent ?? '').trim();
        if (!text || !hangul.test(text)) continue;
        const spacing = Number.parseFloat(getComputedStyle(node).letterSpacing);
        if (!Number.isFinite(spacing) || spacing <= (max as number)) continue;
        out.push({
          text: text.slice(0, 40),
          tracking: Number(spacing.toFixed(2)),
          // `getAttribute` rather than `className`: on an SVG element the property is an
          // `SVGAnimatedString`, and stringifying it yields `[object SVGAnimatedString]` — a
          // failure message naming no class at all.
          classes: (node.getAttribute('class') ?? '').slice(0, 120),
        });
      }
      return out;
    },
    [limit, source] as const,
  );
}

test.beforeEach(async ({ page }) => {
  await seedFirstRunSeen(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

for (const route of KOREAN_ROUTES) {
  test(`한글에는 대문자 자간이 걸리지 않는다 — ${route}`, async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await page.goto(`${route}?guides=off`);
    await expect(page.locator('body')).toBeVisible();
    /*
     * ⚠️ **The locale reaches `<html>` from a client effect** (`LocaleHtmlLang`), and the override
     * keys on it — so a page measured before that effect measures the pre-fix state. The one
     * address where it never arrives is the not-found page: it renders outside `app/[locale]/`, so
     * nothing there knows which language was asked for. That is a real gap, older and wider than
     * this rule (a screen reader is told the wrong language there too), and it is measured rather
     * than excluded: if that page ever grows a Korean caps eyebrow, this fails and says so.
     */
    const localised = !route.includes('this-route-does-not-exist');
    if (localised) {
      await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('ko');
    }
    await page.waitForTimeout(400);
    const offenders = await trackedHangul(page, MAX_HANGUL_TRACKING_PX, HANGUL_SOURCE);
    expect(
      offenders,
      '한글 문자열에 대문자 자간이 걸렸다 — 음절 사이가 단어 사이만큼 벌어진다',
    ).toEqual([]);
  });
}

/**
 * ⚠️ **A gate that can only pass is not a gate.** The detector is proved against a planted
 * violation in the same shape the defect had — a Hangul string wearing a caps step — and against
 * the two things it must stay quiet about: a Latin string wearing the same step, and a Hangul
 * string wearing the body-text pair that was deliberately kept.
 */
test('계기 프로브 — 심은 위반은 잡고, 지킨 값과 라틴 문자는 놓아둔다', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 949 });
  await page.goto('/ko/?guides=off');
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('ko');
  /*
   * The three shapes are planted in one step, after hydration, so nothing can re-render between
   * writing them and reading them. The violation carries a **hand-written** value: under
   * `:lang(ko)` the token itself is zero, so the only way to reproduce the defect now is to
   * bypass the token — which is exactly the regression this gate has to catch.
   */
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'tracking-probe';
    host.innerHTML =
      '<span id="p-bad" style="letter-spacing:1.54px">\uc774 \ud3f4\ub354 \ub0b4\uc8fc\uae30</span>' +
      '<span id="p-latin" style="letter-spacing:0.14em">CONNECTORS</span>' +
      '<span id="p-token" style="letter-spacing:var(--tracking-caps-14)">\uc5f0\uacb0 \ub3c4\uad6c</span>';
    document.body.append(host);
  });
  const planted = (await trackedHangul(page, MAX_HANGUL_TRACKING_PX, HANGUL_SOURCE)).map(
    (offender) => offender.text,
  );
  expect(planted, '심은 위반을 못 잡으면 이 계기는 영구 초록이다').toContain('이 폴더 내주기');
  // Latin wearing the same step is the specification, not a defect, and the token under `:lang(ko)`
  // is already zero — neither may be reported.
  expect(planted).not.toContain('CONNECTORS');
  expect(planted).not.toContain('연결 도구');

  /*
   * GREEN again once the planted shape is gone — the page's own Hangul is clean, so the detector
   * is not reporting phantoms either.
   *
   * ⚠️ The restoration removes the **element**, not the declaration. An inline `letter-spacing`
   * written into `innerHTML` does not answer to a later `removeProperty` or to a `var()`
   * reassignment through CSSOM in Chrome (measured: the value stayed at 1.54px through both), so
   * a probe built that way would report GREEN for the wrong reason — the exact shape of an idle
   * gate. The token half of the proof is already carried above by `p-token`, which wears
   * `var(--tracking-caps-14)` and is never reported.
   */
  await page.evaluate(() => document.getElementById('tracking-probe')!.remove());
  expect(await trackedHangul(page, MAX_HANGUL_TRACKING_PX, HANGUL_SOURCE)).toEqual([]);
});
