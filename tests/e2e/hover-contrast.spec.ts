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
 * ## 이 계기가 **안 보는 것** (2026-08-15 실측 — 켤지 말지를 숫자가 정했다)
 *
 * - **비텍스트 대비(1.4.11)는 판정하지 않는다.** 호버로 보더가 바뀌는 자리를
 *   전수해 3:1 로 재 봤더니 **60건 중 57건이 미달**이었다(1.12~2.92). 이걸
 *   오류로 켜면 57건 소음이고, 그건 이 저장소가 명시적으로 금지한 모양이다
 *   (`design-gates.md` 「룰을 켜기 전 반드시 측정한다」 — 소음이 기존 신호까지
 *   덮는다). 게다가 이 앱의 호버는 보더 하나로 상태를 말하지 않는다: 면·잉크·
 *   보더가 **함께** 바뀌고, 「1px 보더는 이 어두운 바탕에서 무엇을 골라도
 *   휘도로 못 가른다」는 것은 이미 별도로 실측됐다. **「보더에 3:1 을 요구할
 *   것인가」는 계기의 질문이 아니라 디자인 판정**이라 그 자리로 넘긴다.
 * - **`group-hover:` 로 바뀌는 자식 잉크** — 이 계기는 컨트롤 **자신의** 색만
 *   읽는다(실측 25자리가 그 시야 밖).
 * - **볼트가 있어야 그려지는 컨트롤·열리는 표면**(시트·메뉴·팝오버). 2026-08-15 (6)
 *   이 기록한 사각과 같은 것이다 — 조건부로만 나오는 표시는 런타임 계기의 시야에
 *   영원히 안 들어올 수 있고, 그래서 소스 층의 계산 계약이 짝으로 필요하다.
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
/**
 * 쉬는 상태를 걷기 **전에** 포인터를 컨트롤이 없는 곳으로 치운다.
 *
 * 이 함수가 없으면 같은 페이지에서 `auditRoute` 를 두 번 부를 때 두 번째
 * 스윕의 「쉬는 상태」가 **첫 스윕이 마지막으로 호버한 컨트롤 위에서** 읽힌다.
 * 그 컨트롤은 rest == hover 가 되어 «호버가 색을 안 바꾼다»로 분류돼 조용히
 * 빠진다 — 아래 자기검증 테스트가 정확히 그렇게 두 번 부른다.
 *
 * ⚠️ **고정 좌표를 쓰지 않는다.** 이 파일 머리말이 기록한 그 사고가 «(2,2)를
 * 안전하다고 가정했는데 좌측 레일 위였다» 였다. 후보를 훑어 **실제로 컨트롤이
 * 없는 지점**을 찾고, 못 찾으면 그 사실을 드러낸다.
 */
async function parkPointer(page: Page): Promise<void> {
  const { width, height } = VIEWPORT;
  const candidates: Array<[number, number]> = [
    [Math.floor(width / 2), height - 2],
    [width - 2, Math.floor(height / 2)],
    [Math.floor(width / 2), 2],
    [2, height - 2],
  ];
  for (const [x, y] of candidates) {
    const clear = await page
      .evaluate(
        ([px, py]) => {
          const el = document.elementFromPoint(px, py);
          return !el || !el.closest("a[href],button,[role=button],summary");
        },
        [x, y],
      )
      .catch(() => false);
    if (clear) {
      await page.mouse.move(x, y);
      await page.waitForTimeout(30);
      return;
    }
  }
  throw new Error("포인터를 치울 빈 지점을 못 찾았다 — 쉬는 상태가 호버된 채로 읽힐 수 있다");
}

async function auditRoute(page: Page) {
  const offenders: string[] = [];
  let compared = 0;
  await parkPointer(page);
  const controls = page.locator("a[href],button,[role=button],summary");
  const n = await controls.count();
  const resting: (Sample | null)[] = [];
  for (let i = 0; i < n; i++) resting.push(await readState(controls.nth(i)));
  for (let i = 0; i < n; i++) {
    const el = controls.nth(i);
    const visible = await el
      .evaluate((node) => {
        const c = getComputedStyle(node), r = node.getBoundingClientRect();
        /*
         * ⚠️ **첫 뷰포트 제약을 걷어냈다** (2026-08-15). 종전엔
         * `r.top >= 0 && r.bottom <= innerHeight …` 로 **처음 보이는 화면 안**
         * 컨트롤만 쟀다. 그 제약은 기술적 한계가 아니라 관성이었다 —
         * Playwright 의 `hover()` 는 대상을 알아서 스크롤해 넣는다. 실측:
         * 그 한 줄이 **17개 라우트에서 컨트롤 25개**를 안 재고 있었다.
         *
         * 쉬는 상태를 스크롤 전에 걷어도 되는 이유: 이 계기가 읽는 것은 색뿐이고
         * 색은 스크롤로 안 바뀐다(배경 합성도 조상 체인이라 위치와 무관하다).
         */
        return (
          r.width > 6 && r.height > 6 && c.visibility !== "hidden" && Number(c.opacity) > 0.05 &&
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
    const { offenders, compared } = await auditRoute(page);
    /*
     * **라우트마다 바닥이 있다** (2026-08-15). 종전엔 이 단언 하나뿐이라
     * 어느 라우트가 **0건을 비교하고도 초록**일 수 있었다 — 「미달 없음」과
     * 「아무것도 안 쟀음」이 화면에서 똑같이 생긴다. 자매 래칫 둘
     * (`contrast-ratchet`·`a11y-ratchet`)은 이미 그 문법을 쓰는데 이 계기만
     * 안 쓰고 있었고, 그 가드가 19개 중 **한 라우트에만** 있었다.
     *
     * 3 은 실측(2026-08-15, 1512×900)에서 가장 적은 라우트가 4였던 것에
     * 여유 하나를 뺀 값이다. 이 수가 내려가면 화면이 조용해진 것이거나
     * 계기가 고장난 것이고, 어느 쪽이든 봐야 한다.
     */
    expect(compared, `${route} 에서 호버로 색이 바뀌는 컨트롤을 거의 못 찾았다 — 미달 0 이 증거가 아니다`).toBeGreaterThanOrEqual(3);
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
