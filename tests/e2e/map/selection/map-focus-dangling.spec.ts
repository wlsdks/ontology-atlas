import { expect, test } from "@playwright/test";
import "../../atlas-map-probe";
import { installDesktopRailRuntime } from "../../desktop-rail-arrival-harness";
import { waitForMapStill } from "../../settle";

/**
 * `?p=<project slug>` matches no `kind:slug` node name; with no selection match, nothing
 * may end up dimmed. Counts painted pixels because lint, types and selectors cannot see
 * which nodes a token was applied to.
 */

const VAULT = {
  "project.md": `---\nuid: 11111111-1111-4111-8111-111111111111\nslug: project\nkind: project\ntitle: My project\ncontains:\n  - domains/example-domain\n---\n\n# My project\n`,
  "domains/example-domain.md": `---\nuid: 22222222-2222-4222-8222-222222222222\nslug: domains/example-domain\nkind: domain\ntitle: Example domain\ncapabilities:\n  - capabilities/example-capability\n---\n\n# Example domain\n`,
  "capabilities/example-capability.md": `---\nuid: 33333333-3333-4333-8333-333333333333\nslug: capabilities/example-capability\nkind: capability\ntitle: Example capability\ndomain: domains/example-domain\n---\n\n# Example capability\n`,
};

/** Pixels clearly brighter than the background — node outlines and labels land here. */
async function readablePixelCount(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    /*
     * ⚠️ There can be **two canvases** — during a surface change the outgoing and
     * incoming ones coexist (`use-presence`). Taking the first measures the outgoing one
     * (a screen already emptying), so **the brightest one** is chosen.
     */
    const canvases = [
      ...document.querySelectorAll<HTMLCanvasElement>('[data-testid="ontology-map-canvas"]'),
    ].filter((c) => c.width > 0 && c.height > 0);
    if (canvases.length === 0) return -1;
    const canvas = canvases[canvases.length - 1];
    const ctx = canvas.getContext("2d");
    if (!ctx) return -1;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let readable = 0;
    // Sample every 4 pixels — a full scan is slow, and node outlines are several pixels thick so they are still caught.
    for (let i = 0; i < data.length; i += 4 * 4) {
      const luminance = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      // The background is #0a0a0d (luminance ≈ 10). 60 clears 3:1 against it comfortably.
      if (luminance > 60) readable += 1;
    }
    return readable;
  });
}

/** The folder is read after the map first draws; readings wait for the picked vault. */
async function waitForPickedVault(page: import("@playwright/test").Page) {
  await page.waitForFunction(
    (count) => {
      const nodes = window.__atlasMap?.nodes() ?? [];
      return nodes.length === count && nodes.some((n) => n.label === "Example domain");
    },
    Object.keys(VAULT).length,
    { timeout: 30_000 },
  );
}

async function openVault(page: import("@playwright/test").Page, query: string) {
  await page.setViewportSize({ width: 1512, height: 900 });
  await installDesktopRailRuntime(page, VAULT, undefined, { replaceFixture: true });
  await page.goto(`/ko/?e2e=1&guides=off`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await expect(page.getByTestId("ontology-map-canvas").first()).toBeVisible({ timeout: 30_000 });
  await waitForPickedVault(page);
  await waitForMapStill(page);
  if (query) {
    await page.goto(`/ko/topology/?e2e=1&guides=off&${query}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("ontology-map-canvas").first()).toBeVisible({ timeout: 30_000 });
  }
  // Until the layout has been drawn — decided by value (a fixed wait rides machine speed).
  await expect
    .poll(() => readablePixelCount(page), { timeout: 30_000, message: "the map drew nothing" })
    .toBeGreaterThan(-1);
}

test("the map stays readable when entered through a project deep link from the document box", async ({ page }) => {
  test.setTimeout(120_000);

  // Baseline — how bright it is when opened with no parameters.
  await openVault(page, "");
  const plain = await expect
    .poll(() => readablePixelCount(page), { timeout: 30_000 })
    .toBeGreaterThan(0)
    .then(() => readablePixelCount(page));

  // The failing path — the address "open in map" on a project document actually
  // produces (`topology-href.ts`: kind: project → `/topology/?p=<slug>`).
  await page.goto("/ko/topology/?e2e=1&guides=off&p=project", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("ontology-map-canvas").first()).toBeVisible({ timeout: 30_000 });
  await waitForPickedVault(page);
  await waitForMapStill(page, { what: "camera" });
  await expect
    .poll(() => readablePixelCount(page), {
      timeout: 30_000,
      message:
        "entering through a project deep link leaves no readable pixels on the map; " +
        "a selection with no matching node was translated into dim everything",
    })
    .toBeGreaterThan(0);

  // Must reach half the baseline — "one pixel is enough to pass" would go green on a
  // state where only a label survives and every node has sunk.
  await expect
    .poll(() => readablePixelCount(page), { timeout: 30_000, message: `the project deep link is much darker than the screen without a parameter (${plain})` })
    .toBeGreaterThan(plain / 2);
});

test("a deep link to a node absent from the map falls back to nothing selected", async ({ page }) => {
  test.setTimeout(120_000);

  await openVault(page, "");
  const plain = await readablePixelCount(page);

  /*
   * Measures the safety net itself. The test above blocks **one cause** (project slug
   * vs node name mismatch), but as long as the rule that translates "selected a node
   * that does not exist" into "dim everything" survives, the same accident happens by
   * another path. So this checks the map stays readable even for a name that could not
   * possibly exist.
   */
  await page.goto("/ko/topology/?e2e=1&guides=off&p=element:this-node-does-not-exist", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("ontology-map-canvas").first()).toBeVisible({ timeout: 30_000 });
  await waitForPickedVault(page);
  await expect
    .poll(() => readablePixelCount(page), {
      timeout: 30_000,
      message: "a deep link to a missing node dimmed the whole map",
    })
    .toBeGreaterThan(plain / 2);
});
