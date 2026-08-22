import { test, expect } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * Keyboard path contract — **the layer synthetic events cannot measure**.
 *
 * ## Why this file exists
 *
 * The 2026-07-28 design council's interaction seat reported three keyboard defects.
 * On verification at least two were **artifacts of the measurement technique**:
 *
 * - "Enter opens nothing in the hub" — hub items are `<button type="button">`, so
 *   **Enter → click fires natively**. A synthetic `KeyboardEvent` does not reproduce
 *   native activation, so nothing opens by that method whatever you press.
 * - "the datasheet has `role=null`" — the panel carries `role="group"` plus an
 *   `aria-label`. The measurement grabbed the **positioner wrapper** (the trap
 *   `design.md` names explicitly: measure the wrong element and the conclusion
 *   inverts entirely).
 *
 * So this layer is judged only with **tools that send trusted events**. Playwright's
 * `keyboard.press` sends real key events through CDP, so native button activation,
 * focus movement, and shortcuts genuinely work.
 *
 * Three things are guarded here — when extending the list, add only what synthetic
 * events cannot measure.
 */

test.use({ viewport: { width: 1512, height: 950 } });

async function openTopology(page: import("@playwright/test").Page) {
  // `?guides=off` — the first-visit guidance intercepts the keyboard path with a scrim.
  await page.goto("/ko/topology/?guides=off");
  await expect(page.getByTestId("topology-index-panel")).toBeVisible();
  const dismiss = page.getByTestId("first-run-starter-dismiss");
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
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
  test("INDEX 행에서 Enter 로 데이터시트를 연다", async ({ page }) => {
    await openTopology(page);
    await openDatasheetByKeyboard(page);
  });

  test("데이터시트는 이름을 가진 그룹이다 (스크린리더가 등장을 안다)", async ({ page }) => {
    await openTopology(page);
    await openDatasheetByKeyboard(page);

    // Look at **the panel inside, not the positioner** — a layout wrapper having no
    // role is correct, and measuring it produces the false conclusion that the panel is
    // silent (the council's failure case).
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

/**
 * **Focus never falls to `<body>`.**
 *
 * Two places found by the 2026-07-29 keyboard measurement. Both showed the same
 * symptom — closing sends focus to body — with causes on opposite sides.
 *
 * - **The studio socket picker**: the global Escape handler called
 *   `setOpenRelation(null)` directly, skipping the focus-return code. The comment
 *   above it promised focus stays on the socket trigger. The search text being typed
 *   was lost with it, so the loss was twofold.
 * - **The shortcut sheet**: the opening button unmounted the moment the sheet turned
 *   on, so by the time the trap captured focus `document.activeElement === body`
 *   already. `body.isConnected` is always true, so the restore branch looked
 *   successful while **planting focus back on body.** The visible symptom and the
 *   cause were on opposite sides, so every attempt to fix the closing path missed.
 *
 * When the place to return to is gone, focus goes to **the start of the content**
 * (`<main>`) — better than walking the page from the top again. A surviving trigger
 * always wins over the fallback.
 */
test.describe("포커스 반환", () => {
  test("단축키 시트를 닫으면 body 가 아니라 본문으로 간다", async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ko/topology/?guides=off", { waitUntil: "domcontentloaded" });

    const opener = page.getByTestId("topology-shortcuts-help-button");
    await expect(opener).toBeVisible({ timeout: 30_000 });
    /*
     * ⚠️ **Visible ≠ keys attached** (2026-08-17, the spot that flaked in CI).
     *
     * Enter was pressed as soon as the button appeared, but on a slow runner hydration
     * had not happened and the Enter reached nothing — the sheet never opened and it
     * died after the full 15 seconds (measured 16.0s). Press again until it opens.
     */
    const sheetClose = page.getByTestId("shortcut-sheet-close");
    await expect
      .poll(
        async () => {
          if (await sheetClose.isVisible().catch(() => false)) return true;
          await opener.focus();
          await page.keyboard.press("Enter");
          await page.waitForTimeout(250);
          return sheetClose.isVisible().catch(() => false);
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
