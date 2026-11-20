import { expect, test, type Locator } from "@playwright/test";

import { goToMap, startCheck } from "../library/library-check-run-fixture";

/** Nine points across the card: each must hit the card itself, not a surface drawn over it. */
async function topmostAtNinePoints(card: Locator) {
  return card.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const misses: string[] = [];
    for (const x of [0.1, 0.5, 0.9]) for (const y of [0.15, 0.5, 0.85]) {
      const hit = document.elementFromPoint(box.left + box.width * x, box.top + box.height * y);
      if (!hit || !element.contains(hit)) misses.push(`${x},${y}: ${hit?.getAttribute("data-testid") ?? hit?.tagName ?? "nothing"}`);
    }
    return misses;
  });
}

test.describe("the work card in the shell's notice seat", () => {
  test("stands down on Check results, holds the seat elsewhere, and the update notice waits for it", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    await startCheck(page, { offerUpdate: true });
    await expect(page.getByTestId("work-run-card"), "the Library outside Check results is elsewhere").toBeVisible();

    await page.getByTestId("library-open-report").click();
    await expect(page.getByTestId("library-check-stage")).toBeVisible();
    await expect(page.getByTestId("work-run-card")).toHaveCount(0);

    await goToMap(page);
    const card = page.getByTestId("work-run-card");
    await expect(card).toHaveAttribute("data-state", "open");
    // Dev server only: Next's badge floats at the bottom right; the exported app has none.
    await page.evaluate(() => document.querySelector("nextjs-portal")?.remove());
    expect(await topmostAtNinePoints(card), "something covers the card").toEqual([]);
    await expect(page.getByTestId("app-update-toast")).toHaveCount(0);

    await page.getByTestId("work-run-hide").click();
    await expect(card).toHaveCount(0);
    await expect(page.getByTestId("app-update-toast"), "the update notice takes the seat once the card is put away").toBeVisible();
  });
});
