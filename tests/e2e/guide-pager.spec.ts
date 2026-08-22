import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **The end of a guide chapter is not a dead end** (a gate created by measurement,
 * 2026-08-13).
 *
 * The guide is 13 ordered chapters, and where the body ended there were zero ways to
 * reach the next one — a reader who finished had to go back to the left-hand contents
 * and work out for themselves which chapter they had just read. The canonical order
 * already exists (`guide-pages.ts`), so the end-of-chapter previous/next navigation
 * uses it directly.
 *
 * It also measures that the first chapter has only next and the last (trust) has only
 * previous — drawing a door to a chapter that does not exist is a new dead end.
 */
test.describe("가이드 장 끝 이전/다음", () => {
  test("첫 장은 다음만 갖고, 누르면 실제로 다음 장에 착지한다", async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.goto("/ko/guide/?guides=off", { waitUntil: "domcontentloaded" });
    const pager = page.getByTestId("guide-pager");
    await expect(pager).toBeVisible();
    await expect(page.getByTestId("guide-pager-prev")).toHaveCount(0);
    const next = page.getByTestId("guide-pager-next");
    await expect(next).toBeVisible();
    await next.click();
    await page.waitForURL(/\/guide\/first-five-minutes/, { timeout: 15_000 });
    // A middle chapter has both.
    await expect(page.getByTestId("guide-pager-prev")).toBeVisible();
    await expect(page.getByTestId("guide-pager-next")).toBeVisible();
  });

  test("마지막 장은 이전만 갖는다", async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.goto("/ko/guide/trust/?guides=off", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("guide-pager")).toBeVisible();
    await expect(page.getByTestId("guide-pager-next")).toHaveCount(0);
    await expect(page.getByTestId("guide-pager-prev")).toBeVisible();
  });
});
