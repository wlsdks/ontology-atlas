import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "../first-run-seed";

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

    // Client navigation must keep the arrived chapter's address while the global skip
    // link moves keyboard focus into that chapter's reading landmark.
    const skip = page.locator('a[href="#main"]');
    await skip.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/guide\/first-five-minutes\/?(?:\?[^#]*)?#main$/);
    await expect(page.locator('main#main')).toBeFocused();
  });

  test("마지막 장은 이전만 갖는다", async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.goto("/ko/guide/trust/?guides=off", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("guide-pager")).toBeVisible();
    await expect(page.getByTestId("guide-pager-next")).toHaveCount(0);
    await expect(page.getByTestId("guide-pager-prev")).toBeVisible();
  });
});
