import { expect, test, type Page } from "@playwright/test";

/**
 * The gateway pages and the workbench have different layouts (`app/(gateway)/[locale]` and
 * `app/[locale]`), each with its own message catalog. A client-side move between them swaps the
 * whole provider tree, so each direction is walked by a press, not a fresh load, and the screen
 * on arrival must render its own copy with nothing missing.
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

test.describe("gateway ↔ workbench layout crossing", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the map's get-app tile and the gateway nav cross without a reload or a missing message", async ({ page }) => {
    const problems = watchConsole(page);

    await page.goto("/ko/topology/");
    await expect(page.getByTestId("app-nav-rail-get-app")).toBeVisible();
    await markDocument(page);

    await page.getByTestId("app-nav-rail-get-app").click();
    await expect(page).toHaveURL(/\/ko\/download\/?$/);
    await expect(page.getByTestId("gateway-hero").locator("h1")).toBeVisible();
    await expect(page.getByTestId("app-nav-rail-get-app")).toHaveCount(0);
    expect(await sameDocument(page), "the press into the gateway reloaded the document").toBe(true);

    await page.getByTestId("gateway-nav-guide").click();
    await expect(page).toHaveURL(/\/ko\/guide\/?$/);
    await expect(page.locator("main h1")).toBeVisible();

    await page.goBack();
    await page.goBack();
    await expect(page).toHaveURL(/\/ko\/topology\/?$/);
    await expect(page.getByTestId("app-nav-rail-get-app")).toBeVisible();
    expect(await sameDocument(page), "the way back into the workbench reloaded the document").toBe(true);

    expect(problems).toEqual([]);
  });
});
