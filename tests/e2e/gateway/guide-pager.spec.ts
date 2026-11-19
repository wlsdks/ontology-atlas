import { expect, test } from "@playwright/test";
import { GUIDE_PAGES } from "../../../src/views/gateway-doc/model/guide-pages";
import { seedFirstRunSeen } from "../first-run-seed";

/** The chapter after the landing one, read from the table of contents so a new chapter moves it. */
const SECOND = GUIDE_PAGES[1]!.segment;

test.describe("previous/next at the end of a guide chapter", () => {
  test("the first chapter has only next, and pressing it really lands on the next chapter", async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.goto("/ko/guide/?guides=off", { waitUntil: "domcontentloaded" });
    const pager = page.getByTestId("guide-pager");
    await expect(pager).toBeVisible();
    await expect(page.getByTestId("guide-pager-prev")).toHaveCount(0);
    const next = page.getByTestId("guide-pager-next");
    await expect(next).toBeVisible();
    await next.click();
    await page.waitForURL(new RegExp(`/guide/${SECOND}`), { timeout: 15_000 });
    // A middle chapter has both.
    await expect(page.getByTestId("guide-pager-prev")).toBeVisible();
    await expect(page.getByTestId("guide-pager-next")).toBeVisible();

    // Client navigation must keep the arrived chapter's address while the global skip
    // link moves keyboard focus into that chapter's reading landmark.
    const skip = page.locator('a[href="#main"]');
    await skip.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/guide/${SECOND}/?(?:\\?[^#]*)?#main$`));
    await expect(page.locator('main#main')).toBeFocused();
  });

  test("the last chapter has only previous", async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.goto("/ko/guide/trust/?guides=off", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("guide-pager")).toBeVisible();
    await expect(page.getByTestId("guide-pager-next")).toHaveCount(0);
    await expect(page.getByTestId("guide-pager-prev")).toBeVisible();
  });
});
