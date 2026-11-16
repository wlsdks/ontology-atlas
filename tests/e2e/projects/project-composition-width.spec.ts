import { expect, test, type Page } from "@playwright/test";

const PROJECT_PAGE = "/ko/project/storefront/?guides=off";
/** No blank run between blocks, or between the last block and the column's edge, may exceed this share. */
const MAX_GAP_SHARE = 0.12;

async function openProjectPage(page: Page) {
  await page.goto(PROJECT_PAGE);
  await expect(page.getByTestId("project-detail-domain-list")).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
}

/** The composition's content box and the right edge of the furthest text inside the selected domain. */
async function compositionGeometry(page: Page) {
  return page.evaluate(() => {
    const section = document.querySelector('[data-testid="project-detail-composition"]')!.getBoundingClientRect();
    const list = document.querySelector('[data-testid="project-detail-domain-list"]')!.getBoundingClientRect();
    const detail = document.querySelector('[data-testid="project-detail-domain-detail"]')!;
    let textRight = 0;
    const walker = document.createTreeWalker(detail, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) textRight = Math.max(textRight, rect.right);
    }
    const heights = (selector: string) => [...document.querySelectorAll(selector)].map((el) => Math.round(el.getBoundingClientRect().height));
    return {
      width: section.width,
      right: section.right,
      listRight: list.right,
      detailLeft: detail.getBoundingClientRect().left,
      detailTop: detail.getBoundingClientRect().top,
      listTop: list.top,
      textRight,
      capabilityHeights: heights('[data-testid="project-detail-capability-link"]'),
      domainHeights: heights('[data-testid="project-detail-domain-option"]'),
    };
  });
}

test.describe("the composition spans the page column", () => {
  test("the largest domain and its first capability are in the first screen at 1512x982, with one selected row", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 982 });
    await openProjectPage(page);
    const options = page.getByTestId("project-detail-domain-option");
    await expect(page.locator('[role="option"][aria-selected="true"]')).toHaveCount(1);
    await expect(options.first()).toHaveAttribute("aria-selected", "true");
    const largest = (await options.first().boundingBox())!;
    const firstCapability = (await page.getByTestId("project-detail-capability-link").first().boundingBox())!;
    expect(largest.y + largest.height, "the largest domain row falls below the first screen").toBeLessThanOrEqual(982);
    expect(firstCapability.y + firstCapability.height, "the first capability row falls below the first screen").toBeLessThanOrEqual(982);
  });

  for (const [width, height] of [
    [1440, 900],
    [1920, 1080],
  ] as const) {
    test(`leaves no blank run wider than 12% of the column at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openProjectPage(page);
      const g = await compositionGeometry(page);
      const gaps = { "list to detail": g.detailLeft - g.listRight, "detail to the column edge": g.right - g.textRight };
      console.log(`[composition ${width}] column ${Math.round(g.width)} gaps ${JSON.stringify(gaps)}`);
      for (const [name, gap] of Object.entries(gaps)) {
        expect(gap / g.width, `${name} is ${Math.round(gap)}px`).toBeLessThanOrEqual(MAX_GAP_SHARE);
      }
      expect(new Set(g.capabilityHeights).size, "capability rows differ in height").toBe(1);
      expect(new Set(g.domainHeights).size, "domain rows differ in height").toBe(1);
    });
  }

  test("keeps the page's height when another domain is selected", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openProjectPage(page);
    const before = await page.evaluate(() => document.documentElement.scrollHeight);
    const options = page.getByTestId("project-detail-domain-option");
    const count = await options.count();
    await options.first().focus();
    for (let index = 1; index < count; index += 1) {
      await page.keyboard.press("ArrowDown");
      await expect(options.nth(index)).toHaveAttribute("aria-selected", "true");
      await expect(page.getByTestId("project-detail-domain-detail-leaving")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(before);
    }
  });

  test("stacks the selected domain under the list in a phone-width window, with no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openProjectPage(page);
    const g = await compositionGeometry(page);
    expect(g.detailTop, "the selected domain sits beside the list instead of under it").toBeGreaterThan(g.listTop + 1);
    expect(g.textRight).toBeLessThanOrEqual(g.right + 1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
  });
});
