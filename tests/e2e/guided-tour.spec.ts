import { expect, test } from "@playwright/test";

/**
 * Guided tour (`src/features/guided-tour`) click-through — walks all 8
 * declarative steps (dev persona branch at step 7) at 1440x900, screenshots
 * each step, and asserts the cutout/card render sane, resolvable rects.
 *
 * Manual-verification companion for the 2026-07-24 tour polish pass — not a
 * committed CI spec (guided tour has no prior e2e coverage; unit coverage
 * lives in `src/features/guided-tour/**\/*.test.ts(x)`).
 */

async function gotoAndSettle(page: import("@playwright/test").Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

test.describe("guided tour click-through (dev branch, 1440x900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("all 8 steps render a resolvable anchor + card", async ({ page }, testInfo) => {
    await gotoAndSettle(page, "/en/");

    const tourButton = page.getByTestId("topology-tour-button");
    await expect(tourButton).toBeVisible({ timeout: 15_000 });
    await tourButton.click();

    const card = page.getByTestId("guided-tour-card");
    const overlay = page.getByTestId("guided-tour-overlay");

    // Step 1 — welcome (no anchor, centered card, full scrim)
    await expect(overlay).toHaveAttribute("data-tour-step", "welcome");
    await expect(card).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("01-welcome.png") });

    // Step 2 — nodes (canvas-node: project)
    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "nodes");
    await expect(page.getByTestId("guided-tour-cutout")).toBeVisible({ timeout: 5_000 });
    await page.screenshot({ path: testInfo.outputPath("02-nodes.png") });

    // Step 3 — relations (testid: topology-relation-legend)
    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "relations");
    await expect(page.getByTestId("guided-tour-cutout")).toBeVisible({ timeout: 5_000 });
    await page.screenshot({ path: testInfo.outputPath("03-relations.png") });

    // Step 4 — try-click (interactive canvas-node: domain). Click through the
    // funnel cutout by reading its rect rather than guessing a coordinate.
    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "try-click");
    await expect(page.getByTestId("guided-tour-waiting")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("04-try-click-waiting.png") });

    const cutout = page.getByTestId("guided-tour-cutout");
    await expect(cutout).toBeVisible({ timeout: 5_000 });
    const cutoutBox = await cutout.boundingBox();
    expect(cutoutBox).not.toBeNull();
    if (cutoutBox) {
      await page.mouse.click(
        cutoutBox.x + cutoutBox.width / 2,
        cutoutBox.y + cutoutBox.height / 2,
      );
    }

    // Step 5 — datasheet (auto-advanced after the click above resolves a selection)
    await expect(overlay).toHaveAttribute("data-tour-step", "datasheet", { timeout: 5_000 });
    await expect(page.getByTestId("guided-tour-cutout")).toBeVisible({ timeout: 5_000 });
    await page.screenshot({ path: testInfo.outputPath("05-datasheet.png") });

    // Step 6 — index
    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "index");
    await expect(page.getByTestId("guided-tour-cutout")).toBeVisible({ timeout: 5_000 });
    await page.screenshot({ path: testInfo.outputPath("06-index.png") });

    // Step 7 — recent (branch step)
    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "recent");
    await expect(page.getByTestId("guided-tour-cutout")).toBeVisible({ timeout: 5_000 });
    await page.screenshot({ path: testInfo.outputPath("07-recent.png") });

    // Step 8 — agent (dev branch)
    const devBranchButton = card.getByTestId("guided-tour-dev-branch");
    await expect(devBranchButton).toBeVisible();
    await devBranchButton.click();
    await expect(overlay).toHaveAttribute("data-tour-step", "agent", { timeout: 5_000 });
    await page.screenshot({ path: testInfo.outputPath("08-agent.png") });

    // Finish
    await card.getByTestId("guided-tour-finish").click();
    await expect(overlay).toHaveCount(0);
  });
});
