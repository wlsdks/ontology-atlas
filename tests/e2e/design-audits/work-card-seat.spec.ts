import { expect, test, type Locator, type Page } from "@playwright/test";

import { waitForAnimationsDone } from "../settle";
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

/** Buttons of the map's first-run card that something else is drawn over at their centre. */
function coveredStartButtons(page: Page) {
  return page.evaluate(() => {
    const stack = document.querySelector('[data-testid="vault-start-steps"], [data-testid="map-start-stack-layer"] [role="status"]');
    if (!stack) return ["no first-run card"];
    return [...stack.querySelectorAll<HTMLElement>("button, a[href]")].flatMap((button) => {
      const box = button.getBoundingClientRect();
      if (box.width === 0) return [];
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return hit && button.contains(hit) ? [] : [`${button.textContent?.trim()}: ${hit?.getAttribute("data-testid") ?? hit?.tagName ?? "nothing"}`];
    });
  });
}

const overlaps = (a: DOMRect | null, b: DOMRect | null) =>
  a !== null && b !== null && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

const SIZES = [
  { width: 1040, height: 720 },
  { width: 1512, height: 900 },
  { width: 1920, height: 1080 },
] as const;

test.describe("the work card in the shell's notice seat", () => {
  for (const size of SIZES) {
    test(`at ${size.width}×${size.height} stands down on Check results, covers nothing, sits under no notice, and the update waits for it`, async ({ page }) => {
      await page.setViewportSize(size);
      const harness = await startCheck(page, { offerUpdate: true });
      await expect(page.getByTestId("work-run-card"), "the Library outside Check results is elsewhere").toBeVisible();

      await page.getByTestId("library-open-report").click();
      await expect(page.getByTestId("library-check-stage")).toBeVisible();
      await expect(page.getByTestId("work-run-card")).toHaveCount(0);

      await goToMap(page);
      const card = page.getByTestId("work-run-card");
      await expect(card).toHaveAttribute("data-state", "open");
      await waitForAnimationsDone(card);
      // Dev server only: Next's badge floats at the bottom right; the exported app has none.
      await page.evaluate(() => document.querySelector("nextjs-portal")?.remove());
      expect(await topmostAtNinePoints(card), "something covers the card").toEqual([]);
      await expect.poll(() => coveredStartButtons(page), { message: "the card covers a first-run button" }).toEqual([]);
      await expect(page.getByTestId("app-update-toast")).toHaveCount(0);

      await harness.mutateSource(page, "wiki/alpha.md", "---\ntitle: Alpha\n---\n\nEdited elsewhere.\n");
      const notice = page.locator("[data-sonner-toast]").first();
      await expect(notice, "an edit made outside Atlas raises a notice").toBeVisible();
      await waitForAnimationsDone(notice);
      expect(overlaps(await notice.boundingBox() as DOMRect | null, await card.boundingBox() as DOMRect | null), "the notice stands over the card").toBe(false);
      expect(await topmostAtNinePoints(card), "the notice covers the card").toEqual([]);

      await page.getByTestId("work-run-hide").click();
      await expect(card).toHaveCount(0);
      await expect(page.getByTestId("app-update-toast"), "the update notice takes the seat once the card is put away").toBeVisible();
    });
  }

  for (const locale of ["en", "ko", "ja", "zh"] as const) {
    test(`says an unreadable report whole in ${locale}`, async ({ page }) => {
      await page.setViewportSize({ width: 1512, height: 900 });
      const harness = await startCheck(page, { locale });
      await goToMap(page);
      await harness.answer(page, "Prose with no list in it.");
      const card = page.getByTestId("work-run-card");
      await expect(card).toHaveAttribute("data-phase", "unreadable");
      await waitForAnimationsDone(card);
      const cut = await card.evaluate((element) =>
        ["work-run-title", "work-run-detail"].flatMap((id) => {
          const line = element.querySelector<HTMLElement>(`[data-work-run-layer="current"] [data-testid="${id}"]`);
          if (!line) return [`${id}: missing`];
          return line.scrollWidth > line.clientWidth || line.scrollHeight > line.clientHeight ? [`${id}: ${line.textContent}`] : [];
        }));
      expect(cut, "the card cuts its sentence").toEqual([]);
    });
  }
});
