import { test, expect } from "@playwright/test";
import { installDesktopRailRuntime } from "../desktop-rail-arrival-harness";
import { openMapOnApp } from "./open-map-on-app";
import { storefrontSampleFiles } from "./storefront-sample-files";
import { FIRST_RUN_STARTER_DISMISSED_KEY } from "../../../src/features/first-run-starter/model/first-run-starter-dismiss";

/**
 * Only trusted key events: a synthetic `KeyboardEvent` does not trigger native button activation,
 * while Playwright's `keyboard.press` does.
 */

test.use({ viewport: { width: 1512, height: 950 } });

async function openTopology(page: import("@playwright/test").Page) {
  // `?guides=off` — the first-visit guidance intercepts the keyboard path with a scrim.
  await installDesktopRailRuntime(page, storefrontSampleFiles(), undefined, { replaceFixture: true });
  await page.addInitScript((key) => window.sessionStorage.setItem(key, "1"), FIRST_RUN_STARTER_DISMISSED_KEY);
  await openMapOnApp(page, "/ko/topology/?guides=off");
  await expect(page.getByTestId("topology-index-panel")).toBeVisible();
  await expect(page.getByTestId("topology-index-row").first()).toBeVisible();
}

/**
 * Opens via an INDEX tree row, not the hub rail.
 *
 * The hub rail is `suppressed={!leftPanelCollapsed && !drawerOpen}`, so it does not
 * exist at all in the default state with INDEX expanded. Not knowing that and
 * looking for `role="option"` makes the whole spec **skip silently** (the first
 * draft did). INDEX rows exist in every state, so they are the stable entry point
 * for the keyboard path.
 */
async function openDatasheetByKeyboard(page: import("@playwright/test").Page) {
  const row = page.getByTestId("topology-index-row").nth(1);
  await row.focus();
  // Enter is native activation — the point a synthetic KeyboardEvent cannot reproduce.
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("topology-node-popover-positioner")).toBeVisible({
    timeout: 5000,
  });
}

test.describe("keyboard path (trusted events)", () => {
  test("the datasheet is a named group, so a screen reader knows it appeared", async ({ page }) => {
    await openTopology(page);
    await openDatasheetByKeyboard(page);

    // Look at the panel inside, not the positioner: a layout wrapper with no role is correct.
    const named = page
      .getByTestId("topology-node-popover-positioner")
      .locator('[role="group"][aria-label]');
    await expect(named.first()).toBeVisible();
    const label = await named.first().getAttribute("aria-label");
    expect(label?.trim()).toBeTruthy();
  });

  test("Escape closes the surface that was opened", async ({ page }) => {
    await openTopology(page);
    await openDatasheetByKeyboard(page);

    await page.keyboard.press("Escape");
    // Unmounts after the exit transition (EXIT_WINDOW) — wait generously.
    await expect(page.getByTestId("topology-node-popover-positioner")).toHaveCount(0, {
      timeout: 5000,
    });
  });
});

/** When the return target is gone, focus goes to `<main>`; a surviving trigger always wins. */
test.describe("focus return", () => {
  test("closing the shortcuts sheet moves focus to the main content, not body", async ({ page }) => {
    await installDesktopRailRuntime(page, storefrontSampleFiles(), undefined, { replaceFixture: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMapOnApp(page, "/ko/topology/?guides=off", { waitUntil: "domcontentloaded" });

    const opener = page.getByTestId("topology-shortcuts-help-button");
    await expect(opener).toBeVisible({ timeout: 30_000 });
    /* Visible is not hydrated: press again until the sheet opens, since an early Enter reaches nothing. */
    const sheetClose = page.getByTestId("shortcut-sheet-close");
    await expect
      .poll(
        async () => {
          if (await sheetClose.isVisible().catch(() => false)) return true;
          await opener.focus();
          await page.keyboard.press("Enter");
          // Returns the moment the sheet opens; the ceiling only decides when to press again.
          return sheetClose
            .waitFor({ state: "visible", timeout: 1_000 })
            .then(() => true)
            .catch(() => false);
        },
        { timeout: 25_000, message: "the shortcuts sheet did not open; is Enter not attached yet" },
      )
      .toBe(true);
    await page.keyboard.press("Escape");

    await expect
      .poll(() => page.evaluate(() => document.activeElement?.tagName))
      .not.toBe("BODY");
  });

  /**
   * **A surviving trigger still wins** — a fallback that overrides correct restoration
   * is a change, not a fix.
   */
  test("opening from a surviving trigger returns exactly to that trigger", async ({ page }) => {
    await installDesktopRailRuntime(page, storefrontSampleFiles(), undefined, { replaceFixture: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMapOnApp(page, "/ko/topology/?guides=off", { waitUntil: "domcontentloaded" });

    const survivor = page.getByTestId("topology-auto-arrange");
    await expect(survivor).toBeVisible({ timeout: 30_000 });
    await survivor.focus();
    await page.keyboard.press("?");
    await expect(page.getByTestId("shortcut-sheet-close")).toBeVisible();
    await page.keyboard.press("Escape");

    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-testid")))
      .toBe("topology-auto-arrange");
  });
});
