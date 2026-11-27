import { expect, test, type Page } from "@playwright/test";

/**
 * The website's pages (`app/(gateway)/[locale]`) are one layout with its own picked message subset.
 * Each press between them is a client navigation, and the screen on arrival must render its own copy
 * with nothing missing: the download page, the sample map (which adds the map's labels to the subset)
 * and the guide.
 */

function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || /MISSING_MESSAGE/.test(message.text())) {
      problems.push(`console: ${message.text().slice(0, 200)}`);
    }
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message.slice(0, 200)}`));
  return problems;
}

/** A client navigation keeps this marker; a full document load drops it. */
async function markDocument(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __sameDocument?: boolean }).__sameDocument = true;
  });
}

async function sameDocument(page: Page) {
  return page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument === true);
}

test.describe("website page crossing", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("download, sample map and guide cross without a reload or a missing message", async ({ page }) => {
    const problems = watchConsole(page);

    await page.goto("/ko/download/");
    await expect(page.getByTestId("gateway-hero").locator("h1")).toBeVisible();
    await markDocument(page);

    await page.getByTestId("gateway-other-sample").click();
    await expect(page).toHaveURL(/\/ko\/sample\/?$/);
    await expect(page.getByTestId("ontology-map-canvas")).toBeVisible({ timeout: 20_000 });
    expect(await sameDocument(page), "the press into the sample map reloaded the document").toBe(true);

    await page.getByTestId("gateway-nav-guide").click();
    await expect(page).toHaveURL(/\/ko\/guide\/?$/);
    await expect(page.locator("main h1")).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/ko\/sample\/?$/);
    await expect(page.getByTestId("ontology-map-canvas")).toBeVisible({ timeout: 20_000 });
    await page.goBack();
    await expect(page).toHaveURL(/\/ko\/download\/?$/);
    expect(await sameDocument(page), "the way back to the download page reloaded the document").toBe(true);

    expect(problems).toEqual([]);
  });
});
