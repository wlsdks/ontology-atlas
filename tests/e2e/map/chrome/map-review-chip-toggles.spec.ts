import { expect, test } from "@playwright/test";
import { installDesktopRailRuntime } from "../../desktop-rail-arrival-harness";
import { openMapOnApp, READY_AGENT } from "../open-map-on-app";
import { storefrontSampleFiles } from "../storefront-sample-files";
import { waitForMapStill } from "../../settle";

/**
 * A control may wear the active tone and `aria-pressed` only while the thing it names is on,
 * so pressing the review chip again must close the panel.
 */
test("the meaning-review chip states its own state and closes when pressed again", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await installDesktopRailRuntime(page, storefrontSampleFiles(), READY_AGENT, { replaceFixture: true });
  await openMapOnApp(page, "/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await waitForMapStill(page, { what: "camera" });

  const chip = page.getByTestId("topology-vault-agent-toggle");
  const panel = page.getByTestId("analysis-workbench");
  await expect(chip).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toHaveCount(0);

  await chip.click();
  await expect(panel).toBeVisible();
  await expect(chip, "the panel is open but the chip does not report a pressed state").toHaveAttribute("aria-expanded", "true");

  // The same press closes it: a lit control that ignores a press is not a control.
  await chip.click();
  await expect(panel).toHaveCount(0);
  await expect(chip).toHaveAttribute("aria-expanded", "false");

  // The map gets its width back when the panel goes. The panel leaves on a transition, so the
  // width is read until it has come back rather than once on the frame the panel unmounted.
  await expect
    .poll(() => page.evaluate(() => document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect().width))
    .toBeGreaterThan(1200);
});

/**
 * In Neural the close button folds a concept's panel and keeps the concept selected. The corner
 * tiles step aside for the panel, not for the selection, so they come back.
 */
test("the corner tiles return when a concept's panel is folded and the concept stays selected", async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 900 });
  await installDesktopRailRuntime(page, storefrontSampleFiles(), READY_AGENT, { replaceFixture: true });
  await openMapOnApp(page, "/en/topology/?e2e=1&guides=off&view=neural&p=capability%3Acart", { waitUntil: "domcontentloaded" });

  const lane = page.getByTestId("topology-utility-action-lane");
  await expect(page.getByTestId("map-detail-panel")).toBeVisible();
  await expect(lane, "the tiles must step aside while the panel stands").toHaveAttribute("inert", "");

  await page.getByTestId("map-detail-panel-close").click();
  await expect(page.getByTestId("map-detail-panel")).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("p"), "folding the panel must not drop the selection").toBe("capability:cart");
  await expect(lane).not.toHaveAttribute("inert", "");
  await page.getByTestId("topology-vault-agent-toggle").click();
  await expect(page.getByTestId("analysis-workbench")).toBeVisible();
});
