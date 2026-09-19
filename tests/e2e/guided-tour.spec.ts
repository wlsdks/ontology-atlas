import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

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
  // This spec opens the tour **manually**. Without seeding away the first-visit
  // automatic surfaces (the folder-first guidance sheet and the auto tour), the 900ms
  // trigger races the manual click and on a slow CI runner the tour button is covered
  // by the overlay and the click times out (the cause of the 2026-07-24 CI flake).
  // Seeding "done" does not prevent a rerun — the tour button always calls
  // tour.start() regardless of stored state.
  await seedFirstRunSeen(page);
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

test.describe("guided tour click-through (dev branch, 1440x900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("all 8 steps render a resolvable anchor + card", async ({ page }, testInfo) => {
    // The tour runs on the map — since 2026-07-30 `/` is the gateway.
    await gotoAndSettle(page, "/en/topology/");

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

    // Step 3 — relations (centered explanation; the persistent corner legend is retired)
    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "relations");
    await expect(page.getByTestId("guided-tour-cutout")).toHaveCount(0);
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

  // Regression for the 2026-07-24 live defect: at step 4 (try-click), if the
  // spotlight hole is misaligned with the drawn node, the four-strip blocker swallows
  // the click even when the user presses the lit node and the tour stalls forever. The
  // probe (topology-tour-anchor) reports the engine's real worldToScreen coordinates,
  // so "the probe centre always passes clicks through" is pinned as a contract.
  test("step 4: probe center is click-passable and advances the tour", async ({ page }) => {
    // The tour runs on the map — since 2026-07-30 `/` is the gateway.
    await gotoAndSettle(page, "/en/topology/");

    const tourButton = page.getByTestId("topology-tour-button");
    await expect(tourButton).toBeVisible({ timeout: 15_000 });
    await tourButton.click();

    const card = page.getByTestId("guided-tour-card");
    const overlay = page.getByTestId("guided-tour-overlay");
    await expect(overlay).toHaveAttribute("data-tour-step", "welcome");
    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "nodes");
    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "relations");
    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "try-click");
    await expect(page.getByTestId("guided-tour-cutout")).toBeVisible({ timeout: 5_000 });

    const probe = page.getByTestId("topology-tour-anchor");
    const box = await probe.boundingBox();
    expect(box).not.toBeNull();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    // Hole/probe alignment: the topmost element at the probe centre must be the canvas,
    // not a blocker strip (a strip means the click never reaches the canvas).
    const hitTag = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x as number, y as number)?.tagName ?? "NONE",
      [cx, cy],
    );
    expect(hitTag).toBe("CANVAS");

    await page.mouse.click(cx, cy);
    await expect(overlay).toHaveAttribute("data-tour-step", "datasheet", { timeout: 5_000 });
  });
});

/**
 * **The INDEX step shows the INDEX, not the first-run card** (2026-09-19).
 *
 * A first-run person starts the tour from the first-run card, so at the
 * "INDEX: the map's table of contents" step that card was still standing where
 * the list should be, and the cutout lit a sample picker and an open-folder
 * button while the copy described a list of names. The card gives way to the
 * list for that step; the other specs seed the card away and could not see it.
 */
test.describe("guided tour on a true first run", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the INDEX step lights the list, not the first-run card", async ({ page }) => {
    await page.goto("/en/topology/?e2e=1&guides=off");
    await page.waitForLoadState("networkidle");
    const starterTour = page.getByTestId("first-run-tour-cta");
    await expect(starterTour, "이 스펙은 첫 실행 카드에서 출발한다").toBeVisible();
    await starterTour.click();
    const overlay = page.getByTestId("guided-tour-overlay");
    await expect(overlay).toHaveAttribute("data-tour-step", "welcome");
    const card = page.getByTestId("guided-tour-card");
    for (const step of ["nodes", "relations", "try-click"]) {
      await card.getByTestId("guided-tour-next").click();
      await expect(overlay).toHaveAttribute("data-tour-step", step);
    }
    const cutout = page.getByTestId("guided-tour-cutout");
    await expect(cutout).toBeVisible({ timeout: 5_000 });
    const box = (await cutout.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(overlay).toHaveAttribute("data-tour-step", "datasheet", { timeout: 5_000 });
    await card.getByTestId("guided-tour-next").click();
    await expect(overlay).toHaveAttribute("data-tour-step", "index");

    await expect(page.getByTestId("topology-index-tree"), "INDEX 단계인데 목록이 안 보인다").toBeVisible();
    await expect(page.getByTestId("first-run-starter-dismiss"), "INDEX 단계인데 첫 실행 카드가 서 있다").toHaveCount(0);
  });
});
