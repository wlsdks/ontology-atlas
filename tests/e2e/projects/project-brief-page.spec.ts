import { expect, test, type Page } from "@playwright/test";
import projectPages from "../../../messages/ko/projectPages.json";

const detail = projectPages.detail;

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

  test("the first screen at 1280x720 holds the lead, what to check, what changed and the composition heading", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openProjectPage(page);
    const firstToCheck = page.getByTestId("project-detail-to-check-row").or(page.getByTestId("project-detail-to-check-empty")).first();
    await expect(firstToCheck).toBeVisible();
    for (const [name, locator] of [
      ["lead paragraph", page.getByTestId("project-detail-lead")],
      ["to-check heading", page.getByTestId("project-detail-to-check-heading")],
      ["first to-check row", firstToCheck],
      ["changed heading", page.getByTestId("project-detail-changed-heading")],
      ["composition heading", page.locator("#project-detail-composition-title")],
    ] as const) {
      const box = (await locator.boundingBox())!;
      expect(box.y + box.height, `the ${name} ends below the first screen`).toBeLessThanOrEqual(720);
    }
  });

  test("on the web no stale row is drawn, and the evidence line says only the app reads Git", async ({ page }) => {
    await openProjectPage(page);
    await expect(page.getByTestId("project-detail-evidence-line")).toHaveText(detail.toCheckEvidenceAppOnly);
    await expect(page.locator('[data-testid="project-detail-to-check-row"][data-reason="stale"]')).toHaveCount(0);
    await expect(page.getByTestId("project-detail-capability-stale")).toHaveCount(0);
    await expect(page.getByTestId("project-detail-to-check-heading")).toContainText(detail.toCheckHeading.split(" ·")[0]!);
  });

  test("every row opens where it is judged", async ({ page }) => {
    await openProjectPage(page);
    const rows = page.getByTestId("project-detail-to-check-row");
    // The sample raises one document and changes another after review, so rows exist to check.
    await expect(rows.first()).toBeVisible();
    for (const row of await rows.all()) {
      const reason = await row.getAttribute("data-reason");
      const href = (await row.getAttribute("href"))!;
      if (reason === "stale" || reason === "definition-missing") expect(href).toMatch(/\/topology\/\?mode=focus&p=/);
      else expect(href).toMatch(/\/docs\/\?slug=/);
    }
    await expect(page.getByTestId("project-detail-changed-map-link")).toHaveAttribute("href", /\/topology\/\?recent=auto$/);
    await expect(page.getByTestId("project-detail-changes-link")).toHaveAttribute("href", /\/changes\/$/);
  });

  for (const [width, height] of [
    [1440, 900],
    [1920, 1080],
  ] as const) {
    test(`band A leaves no blank run wider than 12% of the column and keeps rows equal at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openProjectPage(page);
      const band = await page.evaluate(() => {
        const box = (testId: string) => document.querySelector(`[data-testid="${testId}"]`)!.getBoundingClientRect();
        const heights = (testId: string) => [...document.querySelectorAll(`[data-testid="${testId}"]`)].map((el) => Math.round(el.getBoundingClientRect().height));
        return {
          column: box("project-detail-identity"),
          lead: box("project-detail-body"),
          toCheck: box("project-detail-to-check"),
          changed: box("project-detail-changed"),
          toCheckHeights: heights("project-detail-to-check-row"),
          changedHeights: heights("project-detail-changed-row"),
          changedSlots: getComputedStyle(document.querySelector('[data-testid="project-detail-changed-rows"]')!).gridTemplateColumns.split(" ").length,
        };
      });
      if (width < 1920) {
        // Two columns: what changed is one strip under the brief and what to check, in three slots.
        const rowBottom = Math.max(band.lead.bottom, band.toCheck.bottom);
        expect(band.changed.left, "the strip starts at the brief's left edge").toBeCloseTo(band.lead.left, 0);
        expect(band.changed.right, "the strip ends at what to check's right edge").toBeCloseTo(band.toCheck.right, 0);
        expect(band.changed.top - rowBottom, "the strip sits right under the taller of the two").toBeLessThanOrEqual(48);
        expect(band.changedSlots, "what changed lays its rows in three slots").toBe(3);
      }
      const gaps = {
        "brief to what to check": band.toCheck.left - band.lead.right,
        "what to check to the column edge": band.column.right - Math.max(band.toCheck.right, band.changed.right),
      };
      console.log(`[band A ${width}] column ${Math.round(band.column.width)} gaps ${JSON.stringify(gaps)}`);
      for (const [name, gap] of Object.entries(gaps)) {
        expect(gap / band.column.width, `${name} is ${Math.round(gap)}px`).toBeLessThanOrEqual(0.12);
      }
      expect(new Set(band.toCheckHeights).size, "to-check rows differ in height").toBeLessThanOrEqual(1);
      expect(new Set(band.changedHeights).size, "changed rows differ in height").toBeLessThanOrEqual(1);
      if (width >= 1920) expect(band.changed.top, "what changed does not share a top edge with what to check").toBe(band.toCheck.top);
    });
  }

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
    await expect(dialog.locator("pre")).toContainText('get_concepts({slugs:["storefront"]})');
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
