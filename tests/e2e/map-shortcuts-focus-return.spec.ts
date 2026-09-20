import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapStill } from "./settle";

/**
 * **Closing the shortcuts sheet gives the keyboard back where it was** (map
 * round, 2026-09-20).
 *
 * The sheet records the element to return to when it opens, but the button
 * that opens it unmounts at that moment — the sheet raises a blocking-overlay
 * flag that turns off that button's render condition — so the record is empty
 * and the close falls back to the start of the content. Measured on the live
 * map: open with the map's `?` button, press Escape, and focus lands on
 * `main`, while the button itself is back in the page. A keyboard user is put
 * at the top of the content and has to walk back.
 *
 * The repo already solves exactly this elsewhere (`returnFocusSelector` on the
 * analysis workbench and the architecture dock): name the control to come back
 * to, and look it up after it remounts.
 */
test("단축키 시트를 닫으면 포커스가 열었던 버튼으로 돌아온다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await waitForMapStill(page, { what: "camera" });

  const trigger = page.getByTestId("topology-shortcuts-help-button");
  await trigger.focus();
  await trigger.click();
  await expect(page.getByRole("dialog", { name: /키보드 단축키/ })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger, "닫은 뒤 버튼이 사라졌다면 이 스펙이 공회전한다").toBeVisible();
  await expect(trigger, "포커스가 열었던 버튼으로 돌아오지 않았다").toBeFocused();
});
