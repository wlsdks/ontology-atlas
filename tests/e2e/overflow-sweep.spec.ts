import { test, expect } from "@playwright/test";

/**
 * 주요 라우트를 여러 뷰포트에서 열어 document scrollWidth가 viewport를 넘지
 * 않는지 일괄 확인한다. 가로 스크롤이 생기면 즉시 실패.
 *
 * 뷰포트 목록은 소유자 반응형 스윕 매트릭스(fix/responsive-sweep)를 따른다 —
 * 1280·1440·1512(MBP14 실제 해상도)·1920·2560 데스크톱 + 모바일 스모크
 * 390·360(파손 방지 수준, 데스크톱 우선 제품이라 최적화 대상 아님) + 기존
 * tablet-768 회귀 유지. 1920/2560 은 `.topology-ui-scale`(app/globals.css)의
 * 실제 zoom 1.15/1.3 브레이크포인트와 일치해 크롬 스케일 정합도 같이 덮는다 —
 * 별도 zoom 시뮬레이션 뷰포트가 필요 없다(실제 min-width 미디어쿼리라 진짜
 * 값으로 통과해야 의미 있다).
 */

const VIEWPORTS = [
  { label: "mobile-390", w: 390, h: 844 },
  { label: "mobile-360", w: 360, h: 780 },
  { label: "tablet-768", w: 768, h: 1024 },
  { label: "desktop-1280", w: 1280, h: 800 },
  { label: "desktop-1440", w: 1440, h: 900 },
  { label: "desktop-1512", w: 1512, h: 949 },
  { label: "desktop-1920", w: 1920, h: 1080 },
  { label: "desktop-2560", w: 2560, h: 1440 },
];

const ROUTES = [
  "/en/",
  "/en/projects/",
  "/en/project/ontology-atlas/",
  "/en/project/new/",
  // R10 (auth + cloud surface 영구 제거) 이후 살아있는 user-facing surface 만.
  "/en/topology/",
  "/en/ontology/",
  "/en/ontology/insights/",
  "/en/docs/",
  "/en/download/",
];

async function measureOverflow(page: import("@playwright/test").Page) {
  return page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    bodyScroll: document.body.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
}

/**
 * 넘쳤는가 — **판정식을 이름 있는 함수로 뺀 이유**가 있다 (2026-08-06).
 *
 * 처음 프로브는 `measureOverflow` 의 반환값만 단언했다. 그래서 게이트에서
 * `bodyScroll > client` 항을 **통째로 지워도 프로브가 초록**이었다 — 「계측이
 * 보는가」는 증명했지만 「게이트가 그걸 쓰는가」는 증명하지 못한 것이다.
 *
 * 판정식이 여기 한 곳에 있으면 프로브가 **게이트와 같은 함수**를 부르게 되고,
 * 항을 지우는 순간 프로브가 빨개진다.
 */
function isOverflowing({
  scroll,
  bodyScroll,
  client,
}: {
  scroll: number;
  bodyScroll: number;
  client: number;
}) {
  return scroll > client || bodyScroll > client;
}

for (const vp of VIEWPORTS) {
  test(`overflow sweep — ${vp.label}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    const violations: Array<{
      route: string;
      scroll: number;
      bodyScroll: number;
      client: number;
    }> = [];

    for (const url of ROUTES) {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);
      const measured = await measureOverflow(page);
      if (isOverflowing(measured)) {
        violations.push({ route: url, ...measured });
      }
    }

    if (violations.length > 0) {
      console.log(`[OVF] ${vp.label} violations:`, JSON.stringify(violations));
    }
    expect(
      violations,
      `overflow at ${vp.label}: ${JSON.stringify(violations)}`,
    ).toHaveLength(0);
  });
}

/**
 * **계기 프로브 — 이 검사가 헛돌고 있지 않은지 증명한다** (2026-08-06).
 *
 * 이 스윕은 늘 0을 낸다. 그러면 「깨끗해서 0」인지 「안 보여서 0」인지 가를 수가
 * 없다(`/gate-probe`). 실제로 같은 날 임시 계측기를 하나 만들었는데, 900px 짜리
 * 원소를 390px 뷰포트에 심어도 **0을 냈다.**
 *
 * 원인은 이 저장소가 `html`·`body` 에 `overflow-x: hidden` 을 걸어 둔 것이다 —
 * 그래서 **`documentElement.scrollWidth` 는 안 자란다**(390 → 390). 넘친 것을
 * 알려 주는 것은 **`body.scrollWidth`**(390 → 900) 하나뿐이다.
 *
 * 이 검사는 처음부터 둘 다 보고 있었다. 이 프로브는 그 `bodyScroll` 항이
 * **실제로 일하고 있다**는 것을 못박는다 — 누군가 「중복 같다」며 지우면 여기가
 * 빨개진다.
 */
test("계기 프로브 — 넘친 원소를 실제로 잡고, documentElement 만으로는 못 잡는다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ko/docs/?guides=off", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);

  const clean = await measureOverflow(page);
  expect(
    isOverflowing(clean),
    "심기 전부터 넘쳐 있으면 이 프로브가 아무것도 증명하지 못한다",
  ).toBe(false);

  await page.evaluate(() => {
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div data-testid="ovf-probe" style="width:900px;height:8px"></div>',
    );
  });
  await page.waitForTimeout(200);
  const dirty = await measureOverflow(page);

  /* **게이트의 판정식을 직접 부른다** — 계측만 단언하면 항을 지워도 초록이다. */
  expect(
    isOverflowing(dirty),
    "심어 둔 900px 을 게이트 판정식이 못 잡았다 — 이 스윕의 0은 증거가 아니다",
  ).toBe(true);
  expect(
    dirty.scroll,
    "documentElement.scrollWidth 가 넘침을 봤다면 overflow-x:hidden 전제가 바뀐 것이다 — 그때는 이 주석을 고쳐라",
  ).toBeLessThanOrEqual(dirty.client);

  await page.evaluate(() => document.querySelector('[data-testid="ovf-probe"]')?.remove());
});

// 리사이즈 전환 1920↔2560 — reload 없이 뷰포트만 바꿔 `.topology-ui-scale`
// zoom(1.15→1.3) 미디어쿼리가 다시 계산되는 순간에도 overflow가 생기지
// 않는지 확인한다. SPA 라우트 전환 후 리사이즈하는 실사용 패턴(외부 모니터
// 연결/분리, 창 드래그)과 가장 가깝다.
test("overflow sweep — resize transition 1920↔2560", async ({ page }) => {
  const violations: Array<{ step: string; route: string; scroll: number; client: number }> = [];

  for (const url of ROUTES) {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);

    await page.setViewportSize({ width: 2560, height: 1440 });
    await page.waitForTimeout(300);
    const afterGrow = await measureOverflow(page);
    if (afterGrow.scroll > afterGrow.client) {
      violations.push({ step: "1920→2560", route: url, ...afterGrow });
    }

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(300);
    const afterShrink = await measureOverflow(page);
    if (afterShrink.scroll > afterShrink.client) {
      violations.push({ step: "2560→1920", route: url, ...afterShrink });
    }
  }

  if (violations.length > 0) {
    console.log("[OVF] resize-transition violations:", JSON.stringify(violations));
  }
  expect(violations, `resize-transition overflow: ${JSON.stringify(violations)}`).toHaveLength(0);
});
