import { expect, test, type Page } from "@playwright/test";

import { CODE_CONCEPTS, REFUSED_CONCEPTS, installCodeReaderRuntime, openConceptOnMap } from "./code-reader-fixture";

/*
 * The code reader: a concept's cited lines read in place beside the concept panel, in the app.
 * The two code reader commands are stubbed as Rust answers them; Rust's own refusals are proven in
 * `src-tauri/src/code_reader/tests.rs`.
 */

const MAP_MIN_WIDTH_PX = 480;

async function openReader(page: Page) {
  const row = page.getByTestId("map-detail-panel-code");
  await expect(row).toBeVisible();
  await row.click();
  const reader = page.getByTestId("code-reader");
  await expect(reader).toBeVisible();
  return reader;
}

/** The map's uncovered width left of the reader, inside the map's own slot. */
async function mapWidthBesideReader(page: Page): Promise<number> {
  return page.evaluate(() => {
    const slot = document.querySelector('[data-testid="topology-map-surface"]')!.getBoundingClientRect();
    const reader = document.querySelector('[data-testid="code-reader"]')!.getBoundingClientRect();
    return reader.left - slot.left;
  });
}

test.describe("Code reader", () => {
  test("opens on the cited lines beside the panel, moves between ranges and closes on a second press", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    await installCodeReaderRuntime(page);
    await openConceptOnMap(page, CODE_CONCEPTS.current);

    const row = page.getByTestId("map-detail-panel-code");
    await expect(row).toContainText("src/billing/invoice.ts");
    await expect(row).toContainText("2개");
    const reader = await openReader(page);
    await expect(row).toHaveAttribute("aria-pressed", "true");
    await expect(reader).toHaveAttribute("data-code-reader-placement", "beside");
    await expect(page.getByTestId("map-detail-panel")).toBeVisible();

    const code = reader.getByTestId("code-reader-code");
    const cited = code.locator('[data-line="40"]');
    await expect(cited).toHaveAttribute("data-cited", "true");
    await expect(cited).toBeInViewport();
    await expect(reader.getByTestId("code-reader-band")).toBeVisible();
    await expect(reader.getByTestId("code-reader-trust")).toHaveAttribute("data-cite-trust", "current");
    expect(await mapWidthBesideReader(page)).toBeGreaterThanOrEqual(MAP_MIN_WIDTH_PX);

    const ranges = reader.getByTestId("code-reader-range");
    await expect(ranges).toHaveText(["L40–52", "L7"]);
    await ranges.nth(1).click();
    await expect(ranges.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(code.locator('[data-line="7"]')).toHaveAttribute("data-cited", "true");
    await expect(code.locator('[data-line="7"]')).toBeInViewport();

    await reader.getByTestId("code-reader-top").click();
    await expect(reader.getByTestId("code-reader-band")).toHaveCount(0);

    await row.click();
    await expect(page.getByTestId("code-reader")).toHaveCount(0);
    await expect(row).toHaveAttribute("aria-pressed", "false");
  });

  test("says when the file changed after the document, runs past the end, or is cited without lines", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    await installCodeReaderRuntime(page);
    await openConceptOnMap(page, CODE_CONCEPTS.stale);
    let reader = await openReader(page);
    await expect(reader.getByTestId("code-reader-trust")).toHaveAttribute("data-cite-trust", "stale");
    await expect(reader.locator('[data-line="40"]')).toHaveAttribute("data-cited", "true");

    await page.goto(`/ko/topology/?p=${CODE_CONCEPTS.beyond}&guides=off`);
    reader = await openReader(page);
    await expect(reader.getByTestId("code-reader-trust")).toHaveAttribute("data-cite-trust", "beyond");
    await expect(reader.getByTestId("code-reader-trust")).toContainText("20");

    await page.goto(`/ko/topology/?p=${CODE_CONCEPTS.none}&guides=off`);
    reader = await openReader(page);
    await expect(reader.getByTestId("code-reader-trust")).toHaveAttribute("data-cite-trust", "none");
    await expect(reader.getByTestId("code-reader-ranges")).toHaveCount(0);
    await expect(reader.locator('[data-line="1"]')).toBeInViewport();
  });

  test("a refused read shows its state and no text", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    await installCodeReaderRuntime(page);
    await openConceptOnMap(page, REFUSED_CONCEPTS["config/.env"]!.slug);
    for (const [index, { slug, state }] of Object.values(REFUSED_CONCEPTS).entries()) {
      if (index > 0) await page.goto(`/ko/topology/?p=${slug}&guides=off`);
      const reader = await openReader(page);
      await expect(reader.getByTestId("code-reader-refusal")).toHaveAttribute("data-code-reader-refusal", state);
      await expect(reader.locator("[data-line]")).toHaveCount(0);
      await expect(reader.getByTestId("code-reader-copy-path")).toBeVisible();
    }
  });

  test("with no code folder connected the reader says so and offers the way to connect one", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    await installCodeReaderRuntime(page, { refuseAll: "code-reader-not-connected" });
    await openConceptOnMap(page, CODE_CONCEPTS.current);
    const reader = await openReader(page);
    await expect(reader.getByTestId("code-reader-refusal")).toHaveAttribute("data-code-reader-refusal", "notConnected");
    await expect(reader.getByTestId("code-reader-next-step")).toHaveText("코드 폴더 연결");
    await expect(reader.locator("[data-line]")).toHaveCount(0);
  });

  test("a file edited while open keeps its text and offers Read again; at rest nothing is read", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    await installCodeReaderRuntime(page);
    await openConceptOnMap(page, CODE_CONCEPTS.current);
    const reader = await openReader(page);
    await expect(reader.locator('[data-line="40"]')).toBeVisible();
    const before = await page.evaluate(() => ({ ...(window as unknown as { __codeReaderCalls: object }).__codeReaderCalls }));

    await page.evaluate(() => (window as unknown as { __codeReaderTouch(path: string): void }).__codeReaderTouch("src/billing/invoice.ts"));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(reader.getByTestId("code-reader-changed")).toBeVisible();
    await expect(reader.locator('[data-line="40"]')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __codeReaderCalls: { window: number } }).__codeReaderCalls.window)).toBe(
      (before as { window: number }).window,
    );

    await reader.getByTestId("code-reader-read-again").click();
    await expect(reader.getByTestId("code-reader-changed")).toHaveCount(0);
    await expect(reader.locator('[data-line="40"]')).toHaveAttribute("data-cited", "true");
  });

  test("at 1040 the reader takes the panel's place and Back returns to the concept", async ({ page }) => {
    await page.setViewportSize({ width: 1040, height: 800 });
    await installCodeReaderRuntime(page);
    await openConceptOnMap(page, CODE_CONCEPTS.current);
    const reader = await openReader(page);
    await expect(reader).toHaveAttribute("data-code-reader-placement", "replace");
    await expect(page.getByTestId("map-detail-panel")).toBeHidden();
    expect(await mapWidthBesideReader(page)).toBeGreaterThanOrEqual(MAP_MIN_WIDTH_PX);

    await reader.getByTestId("code-reader-back").click();
    await expect(page.getByTestId("code-reader")).toHaveCount(0);
    await expect(page.getByTestId("map-detail-panel")).toBeVisible();
  });
});
