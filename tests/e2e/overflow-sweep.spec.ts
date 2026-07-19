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
  "/en/ontology/edit/",
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
      const { scroll, bodyScroll, client } = await measureOverflow(page);
      if (scroll > client || bodyScroll > client) {
        violations.push({ route: url, scroll, bodyScroll, client });
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
