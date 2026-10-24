import { expect, test, type Page } from "@playwright/test";

import { expectSmoothMotion, startSmoothness, stopSmoothness } from "../motion-sampler";
import { installDesktopBridge } from "../rounds-desktop-bridge";
import { waitForAnimationsDone } from "../settle";

const WINDOW_MS = 700;
const MAX_STEP_SHARE = 0.35;

async function openEmptyLane(page: Page) {
  await installDesktopBridge(page, { seedRounds: false });
  await page.setViewportSize({ width: 1512, height: 900 });
  await page.goto("/en/");
  await page.getByRole("button", { name: /Open.*folder/i }).first().click();
  await expect(page.getByTestId("app-nav-rail")).toBeVisible();
  await page.goto("/en/automations/?guides=off&kind=documents");
  await expect(page.locator('[data-placement="stage"]')).toBeVisible();
  await waitForAnimationsDone(page.locator("main"));
  await page.getByTestId("automations-new").click();
  await expect(page.getByTestId("library-rounds-allow")).toBeVisible();
  await waitForAnimationsDone(page.getByTestId("library-rounds-sheet"));
}

async function saveAndSample(page: Page) {
  const allow = await page.getByTestId("library-rounds-allow").elementHandle();
  return page.evaluate(
    ({ allowElement, windowMs }) =>
      new Promise<{ tops: number[]; placement: string | null }>((resolve) => {
        const wrapper = document.querySelector<HTMLElement>("[data-placement]")!;
        const tops: number[] = [wrapper.getBoundingClientRect().top];
        (allowElement as HTMLElement).click();
        const start = performance.now();
        const frame = () => {
          const current = document.querySelector<HTMLElement>("[data-placement]");
          tops.push(current ? current.getBoundingClientRect().top : tops[tops.length - 1]!);
          if (performance.now() - start < windowMs) requestAnimationFrame(frame);
          else resolve({ tops, placement: current?.getAttribute("data-placement") ?? null });
        };
        requestAnimationFrame(frame);
      }),
    { allowElement: allow, windowMs: WINDOW_MS },
  );
}

function maxStepShare(values: number[]): number {
  const total = Math.abs(values[values.length - 1]! - values[0]!);
  if (total === 0) return 0;
  let max = 0;
  for (let i = 1; i < values.length; i += 1) max = Math.max(max, Math.abs(values[i]! - values[i - 1]!) / total);
  return max;
}

test.describe("Automations stage glide", () => {
  test("the first schedule glides the lane from the window centre to the top", async ({ page }) => {
    await openEmptyLane(page);
    await startSmoothness(page);
    const { tops, placement } = await saveAndSample(page);
    expect(placement).toBe("list");
    expect(tops[tops.length - 1]!).toBeLessThan(tops[0]!);
    expect(maxStepShare(tops)).toBeLessThanOrEqual(MAX_STEP_SHARE);
    expectSmoothMotion(await stopSmoothness(page, "main"), { reflow: ["height"] });
  });

  test("under reduced motion the lane moves in one step", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openEmptyLane(page);
    const { tops, placement } = await saveAndSample(page);
    expect(placement).toBe("list");
    expect(tops[tops.length - 1]!).toBeLessThan(tops[0]!);
    expect(maxStepShare(tops)).toBeGreaterThan(0.9);
  });
});
