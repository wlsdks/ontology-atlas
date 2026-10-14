import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "../../first-run-seed";
import { waitForMapStill } from "../../settle";

/**
 * The opener button unmounts while the sheet is open, so the recorded return element is empty;
 * close must look up the control by selector after it remounts (`returnFocusSelector`).
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
