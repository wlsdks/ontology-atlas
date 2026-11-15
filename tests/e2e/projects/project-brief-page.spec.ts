import { expect, test, type Page } from "@playwright/test";

const PROJECT_PAGE = "/ko/project/storefront/?guides=off";

async function openProjectPage(page: Page) {
  await page.goto(PROJECT_PAGE);
  await expect(page.getByTestId("project-detail-identity")).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
}

test.describe("project page reads as a brief", () => {
  test.use({ viewport: { width: 1512, height: 982 } });

  test("the lead paragraph is inside the first viewport at 1280x720", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openProjectPage(page);
    const lead = page.getByTestId("project-detail-lead");
    await expect(lead).toBeVisible();
    const box = (await lead.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, "the lead paragraph ends below the first screen").toBeLessThanOrEqual(720);
  });

  test("domains of different size draw bars of different lengths", async ({ page }) => {
    await openProjectPage(page);
    const bars = page.getByTestId("project-detail-domain-bar");
    await expect(bars.first()).toBeVisible();
    const widths = await bars.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width));
    const totals = await page
      .getByTestId("project-detail-domain-option")
      .evaluateAll((nodes) => nodes.map((node) => Number(node.lastElementChild?.textContent)));
    expect(totals[0]).toBeGreaterThan(totals.at(-1)!);
    expect(widths[0] - widths.at(-1)!, "the largest and smallest domains draw bars of one length").toBeGreaterThan(20);
    // Length follows the count: the ratio of two bars is the ratio of their totals.
    expect(widths.at(-1)! / widths[0]).toBeCloseTo(totals.at(-1)! / totals[0], 1);
  });

  test("the domain list keeps one selected row, which the arrow keys move", async ({ page }) => {
    await openProjectPage(page);
    const list = page.getByRole("listbox");
    await expect(list.locator("[aria-expanded]")).toHaveCount(0);
    const selected = list.locator('[role="option"][aria-selected="true"]');
    await expect(selected).toHaveCount(1);
    const title = page.getByTestId("project-detail-domain-detail-title");
    const nameOf = async () => (await selected.getAttribute("aria-label"))!.split(":")[0];
    await expect(title).toHaveText(await nameOf());

    await selected.focus();
    await page.keyboard.press("ArrowDown");
    await expect(selected).toHaveCount(1);
    const second = page.getByTestId("project-detail-domain-option").nth(1);
    await expect(second).toHaveAttribute("aria-selected", "true");
    await expect(second).toBeFocused();
    await expect(title).toHaveText(await nameOf());
  });

  test("nothing unfolds in place, and the hand-off preview opens a dialog", async ({ page }) => {
    await openProjectPage(page);
    // The rail's settings menu is shell chrome; the page is everything inside `main`.
    await expect(page.locator("#main details")).toHaveCount(0);
    await page.getByTestId("project-detail-handoff-preview").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("pre")).toContainText('get_concept("storefront")');
  });

  test("the overflow menu opens under its trigger with right edges aligned", async ({ page }) => {
    await openProjectPage(page);
    const trigger = page.getByTestId("project-detail-more");
    await trigger.click();
    const menu = page.getByTestId("project-detail-more-menu");
    await expect(menu).toBeVisible();
    await menu.evaluate((node) => Promise.all(node.getAnimations().map((animation) => animation.finished)));
    const [triggerBox, menuBox] = [(await trigger.boundingBox())!, (await menu.boundingBox())!];
    expect(menuBox.y).toBeGreaterThanOrEqual(triggerBox.y + triggerBox.height);
    expect(menuBox.y - (triggerBox.y + triggerBox.height)).toBeLessThan(12);
    expect(Math.abs(menuBox.x + menuBox.width - (triggerBox.x + triggerBox.width))).toBeLessThan(1);
  });
});
