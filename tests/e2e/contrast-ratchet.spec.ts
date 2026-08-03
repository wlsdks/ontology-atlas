import { expect, test } from '@playwright/test';
import { AUDITED_ROUTES } from './audited-routes';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Playwright 스펙은 CJS 로 로드된다(`import.meta` 를 쓰면 파일이 아예 안 실린다).
const { judgeText } = require('../../scripts/lib/contrast.mjs');

/**
 * 대비 래칫 — **토큰이 대비를 떨어뜨리면 그 빌드에서 빨개진다.**
 *
 * ## 왜 계기만으로는 부족한가
 *
 * 2026-08-03 에 `scripts/measure-contrast.mjs` 를 놓았지만 그건 **사람이 부를
 * 때만** 도는 계기였다. 디자인 시스템 테스트의 표준 관행은 그 반대를 요구한다 —
 * *"a token edit that quietly drops contrast below the accessibility threshold
 * shows up the same build it lands"*. 손으로 부르는 계기는 토큰을 고친 사람이
 * 부르지 않으면 존재하지 않는다.
 *
 * ## 왜 axe 래칫이 있는데 또 필요한가
 *
 * 겹치지만 같지 않다. `a11y-ratchet` 의 `color-contrast` 는 axe 가 **자기 방식**
 * 으로 원소를 세고(12 원소), 이쪽은 **(전경·배경·크기) 조합**을 센다(4 조합).
 * 처방 단위가 조합이라 이쪽이 고치기 쉽고, axe 는 우리가 안 보는 룰까지 본다.
 * 둘 다 두는 값이 있다 — 하나가 사각지대를 만들면 다른 하나가 덮는다.
 *
 * 계산은 `scripts/lib/contrast.mjs`(순수 함수, fixture 프로브 있음). 이 파일은
 * 채집과 판정만 한다.
 */

// axe 래칫과 **같은 목록**을 쓴다. 종전 이쪽은 5개, 저쪽은 8개였고 둘 다
// 이유가 안 적혀 있었다 — 그 사각지대의 대가는 `audited-routes.ts` 머리에.
const ROUTES = AUDITED_ROUTES;

/**
 * 2026-08-03 전수 (1512×900, 위 5개 라우트, 조합 109):
 *
 * | 라우트 | 미달 | 무엇 |
 * |---|---:|---|
 * | ~~`/ko`~~ | ~~2~~ → **0** | 주 CTA 의 인디고 면 위 잉크가 `--color-text-primary`(#f7f8f8, **4.42:1**)였다. 그 표면 전용으로 이미 있던 `--color-text-on-accent`(#ffffff, **4.70:1**)로 옮겼다 — `button.tsx` 의 `primary` 변형과 `DownloadPage` 의 크기 배지 두 곳. 새 값 0개 |
 * | ~~`/ko/projects`~~ | ~~2~~ → **0** | `--color-text-quaternary` 가 한 단 올라선 표면(overlay-1 합성 **4.37** · elevated **4.16**)에서만 뚫리는 값이었다. 2026-08-03 「체계」 판정으로 `#787c84` → `#82828a` — 네 정지 표면 전부 AA(5.23 / 5.00 / 4.81 / 4.57), 위계 스텝비 1.17 보존, 지도 패널 quaternary 와 값 수렴. 원장: docs/DECISIONS.md |
 * | 지도 · 문서함 · 공방 | 0 | |
 *
 * 기준선이 0 이므로 이 게이트의 생사는 아래 `measured > 50` 채집 가드가 쥔다 —
 * 빈 화면과 미달 없음은 그것 없이는 같은 초록이다.
 * **이 수는 내려가기만 한다.**
 */
const BASELINE_FAILING_COMBINATIONS = 0;

/**
 * 라우트 하나가 내용에 적용해 **실제로 잰 (전경·배경·크기) 조합**의 바닥.
 *
 * 실측 2026-08-04(17 라우트): 가장 마른 자리가 404 두 벌의 **6** 이고 — 카드
 * 하나짜리 화면이라 원래 적다 — 그다음이 `/ko/guide/` 15, 대부분 16~30 이다.
 *
 * 바닥 4 는 **프로브로 잡았다**: `<div />` 만 그리는 임시 라우트를 만들어
 * 목록에 넣었더니 **3** 이 나왔고(셸 크롬만 남은 값), 이 단언이 그 자리에서
 * 빨개졌다. 그래서 4 는 «셸만 남은 화면 3» 과 «가장 마른 진짜 화면 6» 사이에
 * 서 있다. 진짜 빈 문서는 0 이라 여유는 훨씬 크다.
 *
 * axe 래칫의 `MIN_RULES_PASSED_PER_ROUTE` 와 같은 일을 하는 가드다: 기준선이
 * 0 이면 «미달 없음» 과 «아무것도 안 쟀다» 가 같은 초록이라, 둘을 가르는 것이
 * 이 단언 하나뿐이다.
 */
const MIN_COMBINATIONS_PER_ROUTE = 4;

/** 페이지에서 색·폰트만 꺼내 온다. 판정은 순수 함수가 한다. */
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
    const key = cs.color + '|' + cs.fontSize + '|' + cs.fontWeight + '|' + bg;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ fg: cs.color, bg, fontSizePx: parseFloat(cs.fontSize), fontWeight: cs.fontWeight, sample: own.slice(0, 40) });
  }
  return out;
})()`;

test('대비 래칫 — WCAG 1.4.3 미달 조합이 늘지 않는다', async ({ page }) => {
  // 라우트가 5 → 17 로 늘었다. 라우트당 2.5초 수렴 대기가 있어 기본 60초를 넘는다.
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  const failures: string[] = [];
  const thinRuns: string[] = [];
  let measured = 0;

  for (const route of ROUTES) {
    await page.goto(`${route}?guides=off`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
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
      if (!judged) continue; // 못 읽은 색은 «통과» 가 아니라 미측정이다
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

  // 탐지기가 놀고 있으면 위 판정이 «항상 통과» 가 된다 — 그건 게이트가 없는 것과 같다.
  //
  // ⚠️ 종전엔 **총합** `> 50` 이었다. 라우트가 5개일 때도 느슨했고(한 라우트가
  // 50을 넘기면 나머지 4개가 빈 화면이어도 초록), 17개가 된 지금은 총합 326 이라
  // 사실상 아무것도 안 막는다. 가드는 **라우트마다** 서야 한다.
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
});
