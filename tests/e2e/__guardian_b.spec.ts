import { expect, test } from "@playwright/test";

/**
 * 임시 측정 스펙 (B안 구현 검수) — 끝나면 삭제한다.
 */
const URL = "/ko/project/fallback/?slug=storefront&guides=off";

test.use({ viewport: { width: 1512, height: 982 } });

test("hero geometry census", async ({ page }) => {
  await page.goto(URL);
  await page.waitForLoadState("networkidle");

  const census = await page.evaluate(() => {
    const header = document.querySelector("header");
    const r = (el: Element | null) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) };
    };
    return {
      header: r(header),
      title: r(document.querySelector("h1")),
      desc: r(document.querySelector('[data-testid="project-detail-description"]')),
      svg: r(document.querySelector("header svg[role=img]")),
      rows: [...document.querySelectorAll('[data-testid="domain-capacity-bar-row"]')].map(r),
    };
  });
  console.log("BEFORE hero:", JSON.stringify(census, null, 1));

  await page.screenshot({ path: "/private/tmp/guardian-b-before-hero.png" });

  // 구성 탭
  await page.getByRole("tab", { name: /구성/ }).click();
  await page.waitForTimeout(400);
  const cards = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="project-detail-domain-card"]')].map((el) => {
      const b = el.getBoundingClientRect();
      return { y: +b.y.toFixed(1), h: +b.height.toFixed(1) };
    }),
  );
  console.log("BEFORE composition cards:", JSON.stringify(cards));
  await page.screenshot({ path: "/private/tmp/guardian-b-before-composition.png", fullPage: true });
  expect(true).toBe(true);
});
