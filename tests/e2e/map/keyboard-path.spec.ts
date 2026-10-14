import { test, expect } from "@playwright/test";
import { seedFirstRunSeen } from "../first-run-seed";
import { FIRST_RUN_STARTER_DISMISSED_KEY } from "../../../src/features/first-run-starter/model/first-run-starter-dismiss";

/**
 * Only trusted key events: a synthetic `KeyboardEvent` does not trigger native button activation,
 * while Playwright's `keyboard.press` does.
 */

test.use({ viewport: { width: 1512, height: 950 } });

async function openTopology(page: import("@playwright/test").Page) {
  // `?guides=off` — the first-visit guidance intercepts the keyboard path with a scrim.
  await page.addInitScript((key) => window.sessionStorage.setItem(key, "1"), FIRST_RUN_STARTER_DISMISSED_KEY);
  await page.goto("/ko/topology/?guides=off");
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

test.describe("키보드 경로 (신뢰 이벤트)", () => {
  test("데이터시트는 이름을 가진 그룹이다 (스크린리더가 등장을 안다)", async ({ page }) => {
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

  test("Escape 는 연 표면을 닫는다", async ({ page }) => {
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
test.describe("포커스 반환", () => {
  test("단축키 시트를 닫으면 body 가 아니라 본문으로 간다", async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ko/topology/?guides=off", { waitUntil: "domcontentloaded" });

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
        { timeout: 25_000, message: "단축키 시트가 안 열렸다 — Enter 가 아직 안 붙었나" },
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
  test("살아남은 트리거에서 열면 그 트리거로 정확히 돌아온다", async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ko/topology/?guides=off", { waitUntil: "domcontentloaded" });

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
