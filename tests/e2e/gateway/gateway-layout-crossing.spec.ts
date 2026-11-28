import { expect, test, type Page } from "@playwright/test";

/**
 * The website's pages are each their own prerendered document, so a press between them in a plain
 * browser is a page load (`src/i18n/navigation.tsx`), and the document that arrives must render its own
 * copy with nothing missing: the download page, the sample map and the guide. The way back is a load too.
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

/** A page load drops this marker; a navigation inside one document keeps it. */
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

  test("download, sample map and guide each load their own document without a missing message", async ({ page }) => {
    const problems = watchConsole(page);

    await page.goto("/ko/download/");
    await expect(page.getByTestId("gateway-hero").locator("h1")).toBeVisible();
    await markDocument(page);

    await page.getByTestId("gateway-other-sample").click();
    await expect(page).toHaveURL(/\/ko\/sample\/?$/);
    await expect(page.getByTestId("ontology-map-canvas")).toBeVisible({ timeout: 20_000 });
    expect(await sameDocument(page), "the press into the sample map did not load the sample's own document").toBe(false);
    await markDocument(page);

    await page.getByTestId("gateway-nav-guide").click();
    await expect(page).toHaveURL(/\/ko\/guide\/?$/);
    await expect(page.locator("main h1")).toBeVisible();
    expect(await sameDocument(page), "the press into the guide did not load the guide's own document").toBe(false);

    await page.goBack();
    await expect(page).toHaveURL(/\/ko\/sample\/?$/);
    await expect(page.getByTestId("ontology-map-canvas")).toBeVisible({ timeout: 20_000 });
    await page.goBack();
    await expect(page).toHaveURL(/\/ko\/download\/?$/);
    await expect(page.getByTestId("gateway-hero").locator("h1")).toBeVisible();

    expect(problems).toEqual([]);
  });
});
