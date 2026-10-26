import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "../../first-run-seed";
import { waitForMapStill } from "../../settle";

/**
 * The opener button unmounts while the sheet is open, so the recorded return element is empty;
 * close must look up the control by selector after it remounts (`returnFocusSelector`).
 */
test("closing the shortcuts sheet returns focus to the button that opened it", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await waitForMapStill(page, { what: "camera" });

  const trigger = page.getByTestId("topology-shortcuts-help-button");
  await trigger.focus();
  await trigger.click();
  await expect(page.getByRole("dialog", { name: /키보드 단축키/ })).toBeVisible();

  await expect(page.getByTestId("shortcut-sheet-relation-guide")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger, "if the button vanished after closing, this spec spins idle").toBeVisible();
  await expect(trigger, "focus did not return to the button that opened the sheet").toBeFocused();
});
