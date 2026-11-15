import { expect, test, type Page } from "@playwright/test";

import { activeTestId, arrive, pickDomain } from "../map-canvas-interaction-harness";
import { waitForAnimationsDone } from "../../settle";

const VIEWPORT = { width: 1512, height: 982 };

async function openFullDetail(page: Page) {
  const domain = await pickDomain(page);
  await page.mouse.click(domain.x, domain.y);
  const entry = page.getByTestId("map-detail-panel-open-full-detail");
  await expect(entry).toBeVisible();
  await entry.click();
  const dialog = page.getByRole("dialog").filter({ has: page.getByTestId("full-detail-a1") });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("full detail on the dogfood vault", () => {
  test.setTimeout(150000);

  test("opens as a centred modal over the map and closes back to its button on Escape", async ({ page }) => {
    await arrive(page, VIEWPORT);
    const dialog = await openFullDetail(page);
    await waitForAnimationsDone(dialog);
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog.getByTestId("full-detail-a1-title")).toBeFocused();
    await expect(page.locator('[data-surface-role="map-canvas"]')).toBeVisible();
    const box = (await dialog.boundingBox())!;
    expect(box.width).toBeLessThan(VIEWPORT.width);
    expect(Math.abs(box.x + box.width / 2 - VIEWPORT.width / 2)).toBeLessThanOrEqual(1);
    expect(box.y).toBeGreaterThan(0);
    expect(box.y + box.height).toBeLessThan(VIEWPORT.height);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => activeTestId(page)).toBe("map-detail-panel-open-full-detail");
  });

  test("an Escape pressed while the sheet still enters closes it and returns focus", async ({ page }) => {
    await arrive(page, VIEWPORT);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const dialog = await openFullDetail(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("map-detail-panel")).toBeVisible();
    await expect.poll(() => activeTestId(page)).toBe("map-detail-panel-open-full-detail");
  });
});
