import { test, expect } from "@playwright/test";

/**
 * 주요 라우트를 여러 뷰포트에서 열어 document scrollWidth가 viewport를 넘지
 * 않는지 일괄 확인한다. 가로 스크롤이 생기면 즉시 실패.
 */

const VIEWPORTS = [
  { label: "mobile-390", w: 390, h: 844 },
  { label: "mobile-360", w: 360, h: 780 },
  { label: "tablet-768", w: 768, h: 1024 },
  { label: "desktop-1280", w: 1280, h: 800 },
  { label: "desktop-1920", w: 1920, h: 1080 },
  { label: "desktop-2560", w: 2560, h: 1440 },
];

const ROUTES = [
  "/en/",
  "/en/projects/",
  "/en/project/ontology-atlas/",
  // R10 (auth + cloud surface 영구 제거) 이후 살아있는 user-facing surface 만.
  "/en/topology/",
  "/en/ontology/",
  "/en/ontology/edit/",
  "/en/docs/",
];

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
      const { scroll, bodyScroll, client } = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        bodyScroll: document.body.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
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
