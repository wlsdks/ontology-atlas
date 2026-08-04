import { expect, test, type Locator, type Page } from "@playwright/test";

import { judgeText } from "../../scripts/lib/contrast.mjs";
import { AUDITED_ROUTES } from "./audited-routes";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **WCAG 는 상태를 가리지 않는다** — 호버 중에도 4.5:1 이어야 한다.
 *
 * ## 왜 이 게이트가 생겼나 (2026-08-05 감사)
 *
 * `measure-contrast.mjs` 도 `contrast-ratchet` 도 **쉬는 상태의 DOM 만** 훑는다.
 * 그 사각에서 제품의 주 CTA 들이 호버하는 동안 AA 를 깨고 있었다:
 *
 *   Apple Silicon용 받기  4.70 → **3.51**
 *   앱 받기               4.70 → **3.17**
 *   기존 폴더 선택        4.70 → **4.01**
 *   다음 액션 복사        4.61 → **4.41**
 *
 * 원인은 두 갈래였고 둘 다 «관례»였다. ① 다크 UI 는 호버에서 밝아지는데,
 * **채워진 버튼**은 잉크가 흰색이라 밝아질수록 대비가 떨어진다. ② 틴트를 지는
 * 컨트롤에 `accent` 잉크를 썼는데 호버에서 틴트가 한 단 올라갔다.
 *
 * ## ⚠️ 스타일시트를 읽어서 추론하지 않는다
 *
 * 처음엔 `document.styleSheets` 에서 `:hover` 규칙을 찾아 계산했다. **그 계기는
 * 0건을 냈다** — 캐스케이드 승자가 아니라 «마지막으로 매치된 규칙»을 골랐고,
 * 그래서 호버 배경이 엉뚱하게 패널색으로 풀렸다. 실제로 마우스를 올려
 * `getComputedStyle` 을 읽자 5건이 나왔다. **추론은 계측이 아니다.**
 */
const VIEWPORT = { width: 1512, height: 900 };

/** 조상의 반투명 배경을 합성해 불투명 배경을 구한다(알파 토큰이 많은 앱이라 필수). */
const SOLID_FN = `(el) => {
  const stack = [];
  for (let n = el; n; n = n.parentElement) {
    const m = /rgba?\\(([^)]+)\\)/.exec(getComputedStyle(n).backgroundColor);
    if (!m) continue;
    const q = m[1].split(/[\\s,/]+/).filter(Boolean).map(Number);
    const a = q.length > 3 ? q[3] : 1;
    if (a <= 0) continue;
    stack.push([q[0], q[1], q[2], a]);
    if (a >= 1) break;
  }
  let base = [8, 9, 10];
  for (let i = stack.length - 1; i >= 0; i--) {
    const [r, g, bl, a] = stack[i];
    base = [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), bl * a + base[2] * (1 - a)];
  }
  return 'rgb(' + base.map(Math.round).join(', ') + ')';
}`;

type Sample = { fg: string; bg: string; fontSizePx: number; fontWeight: string; label: string; tag: string };

async function readState(el: Locator): Promise<Sample | null> {
  return el
    .evaluate((node, S) => {
      const solid = eval(S) as (n: Element) => string;
      const c = getComputedStyle(node);
      return {
        fg: c.color,
        bg: solid(node),
        fontSizePx: parseFloat(c.fontSize),
        fontWeight: c.fontWeight,
        label: (node.textContent || node.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 30),
        tag: node.tagName.toLowerCase(),
      };
    }, SOLID_FN)
    .catch(() => null);
}

/**
 * ⚠️ **쉬는 상태를 먼저 한 번에 읽는다.**
 *
 * 처음엔 컨트롤마다 «읽고 → 호버하고 → 마우스를 (2,2)로 치운다» 를 반복했다.
 * 그 (2,2)가 **좌측 레일 위**였고, 심어 둔 프로브를 (0,0)에 놓자 그 위이기도
 * 했다 — 다음 컨트롤의 «쉬는 상태»를 **이미 호버된 채로** 읽어서 rest == hover
 * 가 되고, 그러면 «호버가 색을 안 바꾼다»로 분류돼 조용히 건너뛰었다.
 * 자기검증 프로브가 정확히 그 구멍에서 실패해 잡아냈다.
 *
 * 그래서 쉬는 상태는 **아무것도 호버하기 전에** 한 번에 걷는다.
 */
async function auditRoute(page: Page) {
  const offenders: string[] = [];
  let compared = 0;
  const controls = page.locator("a[href],button,[role=button],summary");
  const n = await controls.count();
  const resting: (Sample | null)[] = [];
  for (let i = 0; i < n; i++) resting.push(await readState(controls.nth(i)));
  for (let i = 0; i < n; i++) {
    const el = controls.nth(i);
    const visible = await el
      .evaluate((node) => {
        const c = getComputedStyle(node), r = node.getBoundingClientRect();
        return (
          r.width > 6 && r.height > 6 && c.visibility !== "hidden" && Number(c.opacity) > 0.05 &&
          r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth &&
          !(node as HTMLButtonElement).disabled && node.getAttribute("aria-disabled") !== "true"
        );
      })
      .catch(() => false);
    if (!visible) continue;

    const rest = resting[i];
    if (!rest) continue;
    await el.hover({ timeout: 1500 }).catch(() => {});
    await page.waitForTimeout(50);
    const hover = await readState(el);
    if (!hover) continue;
    // 호버가 색을 안 바꾸는 컨트롤은 이 검사의 대상이 아니다.
    if (hover.fg === rest.fg && hover.bg === rest.bg) continue;

    compared++;
    const R = judgeText(rest);
    const H = judgeText({ ...hover, fontSizePx: rest.fontSizePx, fontWeight: rest.fontWeight });
    // 파싱 실패는 통과가 아니라 미측정이다 — 조용히 넘기지 않는다.
    expect(R?.ratio, `쉬는 상태를 못 쟀다: ${rest.tag}«${rest.label}»`).toBeDefined();
    expect(H?.ratio, `호버 상태를 못 쟀다: ${rest.tag}«${rest.label}»`).toBeDefined();
    if (R!.passes && !H!.passes)
      offenders.push(`${rest.tag}«${rest.label}» ${R!.ratio} → ${H!.ratio} (필요 ${H!.required})`);
  }
  return { offenders, compared };
}

for (const route of AUDITED_ROUTES) {
  test(`호버 대비 — ${route}`, async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.setViewportSize(VIEWPORT);
    await page.goto(`${route}?guides=off`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("main", { timeout: 20_000 });
    await page.waitForTimeout(800);
    const { offenders } = await auditRoute(page);
    expect(offenders, "쉴 때는 통과하는데 호버에서 AA 를 깬다").toEqual([]);
  });
}

/**
 * 검출기가 **빈 집합 위에서 돌지 않는지** 확인한다(`/gate-probe`).
 *
 * 위 검사들은 「호버로 색이 바뀌는 컨트롤」만 본다. 그 집합이 0이 되면 전부
 * 공짜 초록이다. 그리고 판정 자체가 실제로 미달을 구별하는지도 같이 본다 —
 * 종전의 스타일시트 추론 계기가 정확히 여기서 조용히 실패했다.
 */
test("계기가 헛돌지 않는다 — 비교 대상이 있고, 심어 둔 미달을 잡는다", async ({ page }) => {
  await seedFirstRunSeen(page);
  await page.setViewportSize(VIEWPORT);
  await page.goto("/ko/?guides=off", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main", { timeout: 20_000 });
  await page.waitForTimeout(800);

  const { compared } = await auditRoute(page);
  expect(compared, "호버로 색이 바뀌는 컨트롤이 하나도 없다 — 게이트가 헛돈다").toBeGreaterThan(5);

  // 알려진 미달 짝(#5e6ad2 → #828fff, 흰 잉크)을 심어 판정이 실제로 잡는지 본다.
  await page.addStyleTag({
    content: ".__hover_probe{background:rgb(94,106,210);color:#fff;font-size:14px;font-weight:600}.__hover_probe:hover{background:rgb(130,143,255)}",
  });
  await page.evaluate(() => {
    const b = document.createElement("button");
    b.className = "__hover_probe";
    b.textContent = "probe";
    b.style.cssText += ";width:80px;height:24px;position:fixed;top:0;left:0;z-index:99999";
    document.body.prepend(b);
  });
  const after = await auditRoute(page);
  expect(
    after.offenders.some((o) => o.includes("probe")),
    "심어 둔 호버 미달을 못 잡는다 — 이 게이트의 0건은 증거가 아니다",
  ).toBe(true);
});
