import { expect, test, type Page } from "@playwright/test";

import { TEXT_SIZE_ROOT_PERCENT, TEXT_SIZES, type TextSize } from "../../src/shared/lib/preferences/text-size";
import { CUT_TEXT, DEFAULT_ROOT_PX, TEXT_ZOOM_ROUTES, TEXT_ZOOM_WIDTHS } from "./text-zoom-probes";

const STEPS = TEXT_SIZES.filter((size): size is Exclude<TextSize, "default"> => size !== "default");

async function seedTextSize(page: Page, size: TextSize) {
  await page.addInitScript((value) => {
    window.localStorage.setItem("atlas.appearance.text-size", value);
  }, size);
}

for (const size of STEPS) {
  const rootPx = (DEFAULT_ROOT_PX * TEXT_SIZE_ROOT_PERCENT[size]) / 100;

  test(`${size} sizes the root before the first paint and keeps rem breakpoints`, async ({ page }) => {
    await seedTextSize(page, size);
    await page.setViewportSize({ width: 1040, height: 900 });
    await page.goto("/ko/docs/?guides=off", { waitUntil: "domcontentloaded" });
    const state = await page.evaluate(() => ({
      attribute: document.documentElement.getAttribute("data-text-size"),
      root: getComputedStyle(document.documentElement).fontSize,
      remBreakpoint: matchMedia("(min-width: 48rem)").matches,
    }));
    expect(state.attribute).toBe(size);
    expect(state.root).toBe(`${rootPx}px`);
    expect(state.remBreakpoint, "an author-set root must not move rem media queries").toBe(true);
  });

  for (const width of TEXT_ZOOM_WIDTHS) {
    for (const route of TEXT_ZOOM_ROUTES) {
      test(`${size} · ${route} · ${width}px leaves no text cut off`, async ({ page }) => {
        await seedTextSize(page, size);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await expect(page.locator("main").first()).toBeVisible({ timeout: 30_000 });
        await page.evaluate(
          () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        expect(
          await page.evaluate(() => getComputedStyle(document.documentElement).fontSize),
        ).toBe(`${rootPx}px`);
        const cut = (await page.evaluate(eval(CUT_TEXT))) as string[];
        expect(cut, `text cut off with no way to see the rest:\n${cut.join("\n")}`).toEqual([]);
      });
    }
  }
}

test("default leaves the root attribute off", async ({ page }) => {
  await seedTextSize(page, "default");
  await page.goto("/ko/docs/?guides=off", { waitUntil: "domcontentloaded" });
  expect(await page.evaluate(() => document.documentElement.hasAttribute("data-text-size"))).toBe(false);
});
