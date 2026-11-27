import { expect, test } from "@playwright/test";
import koMessages from '../../../../messages/ko.json';
import { installDesktopRailRuntime } from "../../desktop-rail-arrival-harness";
import { openMapOnApp } from "../open-map-on-app";
import { storefrontSampleFiles } from "../storefront-sample-files";
import { waitForMapStill } from "../../settle";

/**
 * The chip must not claim `aria-haspopup="dialog"` without a dialog;
 * the panel needs an accessible name and `aria-controls`.
 */
test("the constellation chip opens a named region and points at it", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await installDesktopRailRuntime(page, storefrontSampleFiles(), undefined, { replaceFixture: true });
  await openMapOnApp(page, "/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await waitForMapStill(page, { what: "camera" });

  const trigger = page.getByTestId("saved-constellations-open");
  const region = page.getByRole("region", { name: koMessages.constellations.listTitle });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(await region.count(), "the region already exists before opening").toBe(0);

  await trigger.click();
  await expect(region).toBeVisible();
  const id = await region.getAttribute("id");
  expect(id, "the region has no id, so it cannot be tied to the chip").toBeTruthy();
  await expect(trigger).toHaveAttribute("aria-controls", id!);
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  // It never claims to be a dialog, because nothing about it is modal.
  expect(await page.getByRole("dialog").count(), "claims to be a dialog although it is not modal").toBe(0);

  // The chip keeps focus, Escape closes.
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(region).toHaveCount(0);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
});
