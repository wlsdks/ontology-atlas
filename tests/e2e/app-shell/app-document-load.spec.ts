import { expect, test } from "@playwright/test";
import { installDesktopRailRuntime } from "../desktop-rail-arrival-harness";
import { readOldStore, seedOldStore } from "../old-browser-folder-store";

/**
 * What a document of an app address holds in the installed app, which the boot script marks before first
 * paint: the workbench and, once hydrated, no second page. A plain browser's side is
 * `tests/e2e/gateway/app-address-in-a-browser.spec.ts`.
 */

const DESKTOP_INIT = () => {
  (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {
    invoke: () => Promise.reject(new Error("stub")),
    transformCallback: (cb: unknown) => cb,
  };
  (window as unknown as { isTauri?: boolean }).isTauri = true;
};

test.describe("an app address in the installed app", () => {
  test("shows the workbench and, once hydrated, no app-only page: the first main is the workbench's", async ({ page }) => {
    await page.addInitScript(DESKTOP_INIT);
    await page.goto("/ko/library/");
    const rail = page.getByTestId("app-nav-rail");
    await expect(rail).toHaveCount(1, { timeout: 20_000 });
    // Mounted, not only present in the HTML: React gave the rail a fiber.
    await expect
      .poll(() => rail.evaluate((node) => Object.keys(node).some((key) => key.startsWith("__reactFiber"))), { timeout: 20_000 })
      .toBe(true);

    await expect(page.locator('[data-face="app-only"]')).toHaveCount(0);
    await expect(page.getByTestId("app-only-page")).toHaveCount(0);
    await expect(page.locator("#main")).toHaveCount(1);
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("the skip link lands focus inside the workbench", async ({ page }) => {
    await page.addInitScript(DESKTOP_INIT);
    await page.goto("/ko/library/");
    await expect(page.locator("#main")).toHaveCount(1, { timeout: 20_000 });
    await page.locator('a[href="#main"]').focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.closest('[data-face="workbench"]') !== null && document.activeElement !== document.body))
      .toBe(true);
  });

  test("runs no cleanup: every record, with or without a path on disk, keeps its bytes", async ({ page }) => {
    await installDesktopRailRuntime(page, {}, undefined, { replaceFixture: true });
    await page.goto("/ko/guide/");
    await page.waitForLoadState("networkidle");
    await seedOldStore(page, [
      { key: "docs-vault:fs-handle:other-folder", kind: "app-folder" },
      { key: "docs-vault:fs-handle:browser-folder", kind: "browser-folder" },
      { key: "appearance", kind: "other" },
    ]);
    await page.goto("/ko/library/");
    await expect(page.getByTestId("app-nav-rail")).toHaveCount(1, { timeout: 20_000 });
    await page.waitForLoadState("networkidle");
    // The app writes its own record beside these. The cleanup is the browser's alone, so even a record
    // with no path on disk stays here, and every seeded key keeps its bytes.
    expect(await readOldStore(page)).toMatchObject({
      "docs-vault:fs-handle:other-folder": 200_000,
      "docs-vault:fs-handle:browser-folder": 200_000,
      appearance: 200_000,
    });
  });
});
