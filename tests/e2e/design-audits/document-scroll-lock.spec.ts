import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "../first-run-seed";

/**
 * The document does not scroll; the shell owns the viewport. Any document scroll range means an
 * element leaked outside the viewport, so exactly that is measured across states, including
 * expanded ones.
 */

const WIDTHS = [
  { w: 1040, h: 720 },
  { w: 1440, h: 900 },
] as const;

const ROUTES = ["/ko/?guides=off", "/ko/topology/?guides=off", "/ko/docs/?guides=off"] as const;

async function documentScrollSlack(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return el.scrollHeight - el.clientHeight;
  });
}

test.describe("문서 스크롤 잠금 — 셸이 뷰포트를 소유한다", () => {
  for (const { w, h } of WIDTHS) {
    for (const route of ROUTES) {
      test(`${route} @ ${w}×${h} — 문서 스크롤 범위 0`, async ({ page }) => {
        await seedFirstRunSeen(page);
        await page.setViewportSize({ width: w, height: h });
        await page.goto(
          route === "/ko/docs/?guides=off"
            ? "/ko/library/?tab=ontology&guides=off"
            : route,
          { waitUntil: "domcontentloaded" },
        );
        if (route === "/ko/docs/?guides=off") {
          await expect(page).toHaveURL(
            (url) => url.pathname === "/ko/library/" && url.searchParams.get("tab") === "ontology",
          );
          await expect(
            page.locator('#library-workspace-tabpanel-ontology [data-docs-viewer]'),
          ).toBeVisible();
        }
        // During the gateway's Suspense swap there are briefly two <main> elements — first() just confirms readiness.
        await expect(page.locator("main").first()).toBeVisible({ timeout: 20_000 });
        // Hydration can shift the layout — poll for the settled value.
        await expect
          .poll(() => documentScrollSlack(page), { timeout: 10_000 })
          .toBeLessThanOrEqual(0);
      });
    }

  }
});
