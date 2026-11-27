import { expect, test } from "@playwright/test";
import { installDesktopRailRuntime, mountDesktopVault } from "../desktop-rail-arrival-harness";

/**
 * In the installed app a project page's search palette finds the open folder's own documents:
 * before, it listed only the bundled projects and an app with a folder open searched an empty list.
 */

test("search finds a document of the open folder by its title and opens it", async ({ page }) => {
  await installDesktopRailRuntime(page);
  await mountDesktopVault(page);
  // The palette is the project page's own: the map's Cmd+K opens the concept search instead.
  await page.goto("/en/project/fallback/?slug=storefront&guides=off");
  await expect(page.getByTestId("project-detail-actions")).toBeVisible({ timeout: 30_000 });

  const input = page.locator("input#project-search-input");
  const shortcut = process.platform === "darwin" ? "Meta+k" : "Control+k";
  // The shortcut is bound once the page has hydrated, which exposes no signal of its own: press
  // until the palette answers, never again once it is open.
  await expect(async () => {
    if (!(await input.isVisible())) await page.keyboard.press(shortcut);
    await expect(input).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });

  await input.fill("청구서 발행");
  const result = page.locator('[id="search-result-doc-capabilities/invoice"]');
  await expect(result).toBeVisible();
  await expect(result).toContainText("청구서 발행");

  await result.click();
  await expect(page).toHaveURL(/\/docs\/\?slug=capabilities%2Finvoice/);
  await expect(input).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "청구서 발행" }).first()).toBeVisible({ timeout: 15_000 });
});
