import { expect, test, type Page } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitFrames } from "./settle";
// The `window.__atlasMap` type is declared in exactly one place.
import "./atlas-map-probe";

/**
 * Web surface smoke: asks only whether the website still does its own jobs. A browser reads the
 * gateway, looks at a sample map and learns that every other address belongs to the app. Whether the
 * app-only page is the whole document of an app address, from the first byte, is `gateway/app-address-in-a-browser.spec.ts`.
 */

/**
 * The dev server compiles a route on first entry. When suites run back to back, hydration can finish late
 * and a testid attaches one frame later; waiting for networkidle absorbs that variance.
 */
async function gotoSettled(page: Page, url: string) {
  await seedFirstRunSeen(page);
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

/** Arrow keys walk the canvas from mark to mark; the first one that lands selects a concept. */
async function selectAConcept(page: Page) {
  const canvas = page.getByTestId("ontology-map-canvas");
  await canvas.focus();
  await expect.poll(() => page.evaluate(() => Boolean(window.__atlasMap)), { timeout: 15_000 }).toBe(true);
  for (const key of ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"] as const) {
    await page.keyboard.press(key);
    await waitFrames(page, 3);
    const id = await page.evaluate(() => window.__atlasMap?.selection().nodeId ?? null);
    if (id) return id;
  }
  throw new Error("no arrow key selected a concept on the sample map");
}

test.describe("web smoke 1: the gateway offers the app and a way to look", () => {
  test("the download page leads to the sample map, never to a map of its own", async ({ page }) => {
    await gotoSettled(page, "/ko/download/");

    await expect(page.getByTestId("download-gnb")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("gateway-hero-cta")).toBeVisible();
    // "Go look" must not loop back to this page or open a screen that needs a folder.
    await expect(page.getByTestId("gateway-hero-web-cta")).toHaveAttribute("href", /\/sample\/?$/);

    // One sentence names the computers the app does not run on and where they go instead.
    await expect(page.getByTestId("gateway-other-computers")).toBeVisible();
    await expect(page.getByTestId("gateway-other-sample")).toHaveAttribute("href", /\/sample\/?$/);
    await expect(page.getByTestId("gateway-other-guide")).toHaveAttribute("href", /\/guide\/connect-agent\/?$/);
  });
});

test.describe("web smoke 2: the sample map", () => {
  test("draws the sample read-only: a canvas, a size that can be read, and a panel for a pressed concept", async ({
    page,
  }) => {
    // `?e2e=1` attaches the map's inspection hook, which the key walk below reads.
    await gotoSettled(page, "/ko/sample/?e2e=1");

    const canvas = page.getByTestId("ontology-map-canvas");
    await expect(canvas).toBeVisible({ timeout: 20_000 });
    const box = await canvas.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect(box?.height ?? 0).toBeGreaterThan(0);

    // A count of 0 would mean the map mounted and drew nothing.
    const counts = (await page.getByTestId("sample-map-size").innerText()).match(/\d+/g)?.map(Number) ?? [];
    expect(counts.length).toBe(2);
    expect(counts[0]).toBeGreaterThan(0);
    // The heading's number and the marks handed to the map are one count.
    await expect(page.getByTestId("ontology-map")).toHaveAttribute("data-source-node-count", String(counts[0]));

    // The compact panel opens on a press and closes on Escape; nothing here opens a folder or edits.
    await expect(page.getByTestId("sample-concept-panel")).toHaveCount(0);
    const id = await selectAConcept(page);
    const panel = page.getByTestId("sample-concept-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { level: 2 })).not.toHaveText("");
    expect(id).toBeTruthy();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);

    // The way on is the app, and the page reaches no screen of the workbench.
    await expect(page.getByTestId("sample-map-download")).toHaveAttribute("href", /\/download\/?$/);
    await expect(page.getByTestId("app-nav-rail")).toHaveCount(0);
    await expect(page.getByTestId("first-run-starter")).toHaveCount(0);
  });

  test("a sample that does not arrive says so, and Try again draws the map once the network is back", async ({
    page,
  }) => {
    // The sample's data is the only chunk that names its concepts, so only it is cut.
    let networkDown = true;
    await page.route(/\/(?:_next\/static\/chunks|assets)\//, async (route) => {
      if (!networkDown) return route.continue();
      const response = await route.fetch();
      const body = await response.text();
      return body.includes("Inquiry Ticket") ? route.abort() : route.fulfill({ response, body });
    });
    await gotoSettled(page, "/ko/sample/");

    await expect(page.getByTestId("sample-map-failed")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("ontology-map-canvas")).toHaveCount(0);

    networkDown = false;
    await page.getByTestId("sample-map-retry").click();
    await expect(page.getByTestId("ontology-map-canvas")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("sample-map-failed")).toHaveCount(0);
  });
});
