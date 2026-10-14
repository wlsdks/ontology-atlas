import { expect, test } from "@playwright/test";
import koMessages from '../../../../messages/ko.json';
import { seedFirstRunSeen } from "../../first-run-seed";
import { waitForMapStill } from "../../settle";

/**
 * The chip must not claim `aria-haspopup="dialog"` without a dialog;
 * the panel needs an accessible name and `aria-controls`.
 */
test("별자리 칩은 이름 있는 영역을 펼치고, 그 영역을 가리킨다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await waitForMapStill(page, { what: "camera" });

  const trigger = page.getByTestId("saved-constellations-open");
  const region = page.getByRole("region", { name: koMessages.constellations.listTitle });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(await region.count(), "열기 전에 이미 영역이 있다").toBe(0);

  await trigger.click();
  await expect(region).toBeVisible();
  const id = await region.getAttribute("id");
  expect(id, "영역에 id 가 없어 칩과 묶을 수 없다").toBeTruthy();
  await expect(trigger).toHaveAttribute("aria-controls", id!);
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  // It never claims to be a dialog, because nothing about it is modal.
  expect(await page.getByRole("dialog").count(), "모달이 아닌데 대화상자라고 말한다").toBe(0);

  // The chip keeps focus, Escape closes.
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(region).toHaveCount(0);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
});
