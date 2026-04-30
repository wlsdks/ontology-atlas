import { expect, test } from "@playwright/test";

/**
 * T-01 URL 계약 Phase 1: /project/view/?slug=X 레거시가 canonical
 * /project/X/로 즉시 replace되는지 확인. 방문자 공유 링크·구 북마크 보존.
 */

test("/project/view/?slug=aslan-maps → /project/aslan-maps/", async ({ page }) => {
  await page.goto("/project/view/?slug=aslan-maps");
  await page.waitForURL(/\/project\/aslan-maps\/?($|\?)/, { timeout: 10_000 });
  // title·콘텐츠는 Next.js 클라이언트 네비 타이밍에 따라 flaky하므로 URL만 검증.
  expect(page.url()).toMatch(/\/project\/aslan-maps\/?($|\?)/);
});

test("canonical meta가 /project/[slug]/ 경로로 지정된다", async ({ page }) => {
  const res = await page.request.get("/project/aslan-maps/");
  const html = await res.text();
  expect(html).toMatch(/<link[^>]*rel="canonical"[^>]*\/project\/aslan-maps\//);
});
