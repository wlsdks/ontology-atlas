import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **초점 표시는 보여야 한다** (2026-08-18).
 *
 * ## 왜 이 검사가 생겼나
 *
 * 2026-08-05 에 이 앱의 초점 정책을 정하며 **「있는가」로 판정하고 끝냈다** —
 * 상호작용 요소 197개 전부가 표시를 가졌다. 그때 재지 않은 축이 「보이는가」다.
 * 2026-08-18 에 재 보니 알파 0.46 이 바탕과 합성되어 **1.75:1** 이었다:
 *
 *     /ko/ 13/14 · /ko/topology/ 28/28 · /ko/docs/ 32/34 · /ko/projects/ 14/18
 *
 * 상태를 알리는 시각 표시의 기준은 3:1 이다(WCAG 1.4.11 비텍스트 대비). 절반이다.
 *
 * ## 이 검사가 하는 일
 *
 * 초점 링은 **쉬는 상태 DOM 으로는 원리적으로 안 보인다.** 그래서 요소마다
 * 초점을 주고 `:focus-visible` 인지 확인한 뒤, 계산된 outline/box-shadow 를 읽고
 * **알파를 실제 바탕과 합성해서** 대비를 낸다. 알파를 안 합성하면 0.46 짜리
 * 링이 원본 색의 대비(4.24:1)로 보여서, 이 결함이 통째로 안 보인다.
 *
 * 분모를 함께 보고한다 — 「몇 개 중 몇 개」를 못 말하면 0건이 「깨끗해서 0」인지
 * 「아무것도 안 봐서 0」인지 갈리지 않는다.
 */

const ROUTES = ["/ko/", "/ko/topology/", "/ko/docs/", "/ko/projects/", "/ko/agents/"];
const FLOOR = 3;

/*
 * ⚠️ **트랜지션을 끄고 잰다.** 이 저장소가 이미 기록해 둔 함정이다 — 초점을 준
 * 직후에 계산된 값을 읽으면 **전환이 시작되기 전 값**이 나온다. 이 컨트롤들은
 * `transition-[…,box-shadow,…]` 를 갖고 있어서, 끄지 않고 재면 멀쩡한 링이
 * 전부 「투명」으로 읽힌다(실측: 가짜 위반 6건).
 */
const KILL_MOTION = `(() => {
  const style = document.createElement("style");
  style.id = "focus-audit-no-motion";
  style.textContent = "*, *::before, *::after { transition: none !important; animation: none !important; }";
  document.head.appendChild(style);
  return true;
})()`;

const AUDIT = `(() => {
  const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = (p) => 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]);
  const ratio = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const parse = (s) => {
    const m = String(s).match(/rgba?\\((\\d+(?:\\.\\d+)?),\\s*(\\d+(?:\\.\\d+)?),\\s*(\\d+(?:\\.\\d+)?)(?:,\\s*([\\d.]+))?\\)/);
    return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
  };
  const behind = (el) => {
    let cur = el;
    while (cur) {
      const c = parse(getComputedStyle(cur).backgroundColor);
      if (c && c[3] > 0.9) return [c[0], c[1], c[2]];
      cur = cur.parentElement;
    }
    return [8, 9, 10];
  };
  const nodes = Array.from(document.querySelectorAll(
    'button:not(:disabled), a[href], summary, [role="button"], [tabindex]:not([tabindex="-1"])'
  )).filter((el) => el.getBoundingClientRect().width > 4);
  const out = { measured: 0, below: [], worst: null };
  for (const el of nodes.slice(0, 80)) {
    el.focus();
    if (!el.matches(":focus-visible")) continue;
    const cs = getComputedStyle(el);
    const bg = behind(el);
    /*
     * **층을 하나만 보면 안 된다.** Tailwind 링은 «오프셋 층 + 링 층» 두 겹이고,
     * 오프셋 층은 **일부러 바탕색과 같다**(그래서 대비 1.00). 첫 층만 집으면
     * 정상인 링이 전부 위반으로 잡힌다. 초점을 알리는 데는 눈에 띄는 층이
     * 하나만 있으면 되므로 **가장 잘 보이는 층**으로 판정한다.
     */
    const candidates = [];
    if (cs.outlineStyle !== "none") {
      const o = parse(cs.outlineColor);
      if (o && parseFloat(cs.outlineWidth) > 0) candidates.push(o);
    }
    for (const layer of cs.boxShadow.split(/,(?![^(]*\\))/)) {
      const c = parse(layer);
      const geom = layer.replace(/rgba?\\([^)]*\\)/, "");
      if (c && c[3] > 0.01 && /[1-9]/.test(geom)) candidates.push(c);
    }
    if (candidates.length === 0) continue;
    let r = 0;
    for (const c of candidates) {
      const a = c[3];
      const comp = [0, 1, 2].map((i) => Math.round(c[i] * a + bg[i] * (1 - a)));
      r = Math.max(r, ratio(comp, bg));
    }
    out.measured += 1;
    if (out.worst === null || r < out.worst) out.worst = r;
    if (r < 3) {
      // 이름 없는 요소도 다음 사람이 찾을 수 있게 — testid 가 없으면 글·클래스로 가리킨다.
      const label = el.getAttribute("data-testid")
        || (el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 20)
        || el.tagName + "." + String(el.className).slice(0, 40);
      out.below.push(label + " " + r.toFixed(2) + " (바탕 " + bg.join(",") + ")");
    }
  }
  return out;
})()`;

for (const route of ROUTES) {
  test(`초점 표시가 보인다 — ${route}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1512, height: 900 });
    await seedFirstRunSeen(page);
    await page.goto(`${route}?guides=off`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);
    await page.evaluate(KILL_MOTION);

    const got = (await page.evaluate(AUDIT)) as {
      measured: number;
      below: string[];
      worst: number | null;
    };

    // 분모부터 — 아무것도 못 재고 초록이 되는 것이 이 부류 검사의 기본 실패다.
    expect(got.measured, `${route}: 초점 표시를 하나도 못 쟀다 — 검사가 헛돌고 있다`).toBeGreaterThan(3);
    console.log(`[focus] ${route} 잰 것 ${got.measured} · 최저 ${got.worst?.toFixed(2)}:1`);
    expect(
      got.below,
      `${route}: 초점 표시가 ${FLOOR}:1 아래다 (알파를 바탕과 합성한 값) — ${got.below.join(" · ")}`,
    ).toEqual([]);
  });
}
