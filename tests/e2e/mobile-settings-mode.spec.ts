import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

test.use({ viewport: { width: 390, height: 844 } });

test("확장 INDEX에서도 기존 설정으로 일반/전문가 모드를 왕복한다", async ({ page }) => {
  await seedFirstRunSeen(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/ko/topology/?guides=off");
  await page.waitForLoadState("networkidle");

  const trigger = page.getByTestId("topology-mobile-settings");
  await expect(trigger).toHaveCount(1);
  await expect(trigger).toBeVisible();

  const hit = await trigger.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return target?.closest('[data-testid="app-settings-trigger"]') !== null;
  });
  expect(hit, "INDEX sheet must not intercept the mobile settings tile").toBe(true);

  await trigger.getByTestId("app-settings-trigger").click();
  const mode = page.getByTestId("app-settings-view-mode");
  await expect(mode).toBeVisible();
  // 2026-08-15 SegmentedControl migration — a segment is an exclusive choice, so it is
  // radiogroup + aria-checked (attaching aria-pressed in parallel does not carry
  // exclusivity into the accessibility tree).
  const options = mode.getByRole("radio");

  await options.nth(1).click();
  await expect(options.nth(1)).toHaveAttribute("aria-checked", "true");
  await options.nth(0).click();
  await expect(options.nth(0)).toHaveAttribute("aria-checked", "true");

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("app-settings-popover")).toBeHidden();
  await expect(trigger).toBeVisible();
});
