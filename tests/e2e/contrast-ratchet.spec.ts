import { expect, test } from '@playwright/test';

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

const ROUTES = ['/ko/', '/ko/topology/', '/ko/docs/', '/ko/ontology/studio/', '/ko/projects/'];

/**
 * 2026-08-03 전수 (1512×900, 위 5개 라우트, 조합 110):
 *
 * | 라우트 | 미달 | 무엇 |
 * |---|---:|---|
 * | `/ko` | 2 | 주 CTA 인디고 면 위 흰 글자 **4.42:1** (요구 4.5) |
 * | `/ko/projects` | 2 | `--color-text-quaternary` **4.31:1** |
 * | 지도 · 문서함 · 공방 | 0 | |
 *
 * 넷 다 **헌장 색이 걸린 사안**이라 계기를 켠 쪽이 단독으로 못 고친다 — 처방은
 * 디자인 게이트(「체계」·「도해」)로 간다. 그래서 0이 아니라 래칫이다.
 * **이 수는 내려가기만 한다.**
 */
const BASELINE_FAILING_COMBINATIONS = 4;

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
  await page.setViewportSize({ width: 1512, height: 900 });
  const failures: string[] = [];
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
    for (const s of samples) {
      const judged = judgeText(s);
      if (!judged) continue; // 못 읽은 색은 «통과» 가 아니라 미측정이다
      measured += 1;
      if (!judged.passes) {
        failures.push(`${route} ${judged.ratio}:1 < ${judged.required} · ${s.fontSizePx}px · ${s.fg} on ${s.bg} — «${s.sample}»`);
      }
    }
  }

  // 탐지기가 놀고 있으면 위 판정이 «항상 통과» 가 된다 — 그건 게이트가 없는 것과 같다.
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
