import { expect, test } from "@playwright/test";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { waitForMapStill } from "./settle";

/**
 * **The guided tour points only at things that are on the screen.**
 *
 * Step 3 taught the line styles and closed with "the legend here always reminds
 * you". Measured while that step was up at 1512x982: no legend element was on
 * the screen at all. `topology-tier-legend` belongs to the 3D view and was not
 * mounted, the bottom-right readout stack measured 0x0, and no relation legend
 * component exists anywhere in the product — only leftover inset tokens named
 * after one. The word "here" pointed at nothing, in both locales.
 *
 * The line guide does exist: it is the relation section of the keyboard
 * shortcuts sheet, which this test also measures, so the step now names a place
 * a reader can actually reach.
 *
 * The rule, not the sentence: a step may name a legend only while a legend is
 * on the screen.
 */
test("no tour step names a legend that is not on screen", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installDesktopRailRuntime(page);
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await waitForMapStill(page);

  await page.getByTestId("topology-tour-button").click();
  await expect(page.getByTestId("guided-tour-card")).toBeVisible();

  const seen: Array<{ step: string; text: string; legendOnScreen: boolean }> = [];
  for (let i = 0; i < 9; i++) {
    const reading = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('[data-testid="guided-tour-card"]');
      if (!card) return null;
      const legends = [...document.querySelectorAll<HTMLElement>("[data-testid]")].filter((el) => {
        if (!/legend/i.test(el.dataset.testid ?? "")) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return false;
        const cs = getComputedStyle(el);
        return cs.visibility !== "hidden" && cs.opacity !== "0";
      });
      return {
        step: document.querySelector('[data-testid="guided-tour-progress"]')?.textContent?.trim() ?? String(0),
        text: (card.textContent ?? "").trim(),
        legendOnScreen: legends.length > 0,
      };
    });
    if (!reading) break;
    if (!seen.some((s) => s.step === reading.step)) seen.push(reading);
    const next = page.getByTestId("guided-tour-next");
    const activate = page.getByTestId("guided-tour-activate-target");
    if (await next.count()) await next.first().click();
    else if (await activate.count()) await activate.first().click();
    else break;
    await page.waitForTimeout(500);
  }

  // A non-empty subject set: the tour really was walked, not skipped past.
  expect(seen.length, `투어 단계를 못 걸었다: ${JSON.stringify(seen.map((s) => s.step))}`).toBeGreaterThanOrEqual(3);
  const lying = seen.filter((s) => /범례|legend/i.test(s.text) && !s.legendOnScreen);
  expect(
    lying.map((s) => s.step),
    `화면에 범례가 없는데 범례를 가리키는 투어 단계: ${JSON.stringify(lying.map((s) => s.text.slice(0, 80)))}`,
  ).toEqual([]);

  // The place the line guide really lives, so the step's new pointer is not a second empty promise.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.getByTestId("topology-shortcuts-help-button").click();
  await expect(page.getByTestId("shortcut-sheet-relation-guide")).toBeVisible();
});
