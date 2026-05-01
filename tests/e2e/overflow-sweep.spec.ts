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
];

const ROUTES = [
  "/",
  "/login",
  "/signup",
  "/reset-password",
  "/account",
  "/projects/",
  "/project/sample/",
  // mission v2 정렬: admin + /review/knowledge 폐기 (PR #5/#6).
  // 살아있는 mission v2 surface 추가 — /topology · /ontology · /ontology/edit
  // · /docs · /settings/*.
  "/knowledge/",
  "/knowledge/documents/",
  "/topology/",
  "/ontology/",
  "/ontology/edit/",
  "/docs/",
];

for (const vp of VIEWPORTS) {
  test(`overflow sweep — ${vp.label}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    const violations: Array<{ route: string; scroll: number; client: number }> = [];

    for (const url of ROUTES) {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);
      const { scroll, client } = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      if (scroll > client) {
        violations.push({ route: url, scroll, client });
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
