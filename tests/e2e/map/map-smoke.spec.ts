import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import en from "../../../messages/en.json";
import { atlasSampleFiles, installDesktopRailRuntime } from "../desktop-rail-arrival-harness";
import { openMapOnApp } from "./open-map-on-app";

/**
 * Small and stable on purpose: a handful of contracts true of the current map, using real
 * dogfood vault slugs (`docs/ontology/`) rather than fixtures.
 */

/**
 * Picked from the vault, not pinned: the dogfood vault is redrawn often, and this spec only
 * needs a deterministic capability, so take the first by slug from the manifest.
 */
const REAL_CAPABILITY_SLUG = (() => {
  const manifestPath = path.resolve(
    __dirname,
    "../../../src/entities/docs-vault/data/manifest.json",
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    docs: Array<{ slug: string; frontmatter?: { kind?: string } }>;
  };
  const slugs = manifest.docs
    .filter((doc) => doc.frontmatter?.kind === "capability")
    .map((doc) => doc.slug.split("/").pop() as string)
    .sort();
  if (slugs.length === 0) {
    throw new Error(
      "dogfood 매니페스트에 역량 노드가 없다 — 볼트나 생성기가 깨졌다",
    );
  }
  // A map node id is `<kind>:<name>` (different from the vault slug's `capabilities/` prefix).
  return `capability:${slugs[0]}`;
})();

// The dev server can transiently show a page's client tree twice under load
// (a double render, not present in a production build). It doesn't show up
// running one spec alone, only when the whole
// suite runs back-to-back and the dev server is under sustained pressure.
// Letting the network settle before querying a testid gives the duplicate
// time to collapse to one before a Playwright strict-mode locator can trip
// on it — same fix applied to the analogous `project-selector-new-cta`
// duplicate in `ontology-ui.spec.ts`.
async function gotoAndSettle(page: import("@playwright/test").Page, url: string) {
  // The runtime seeds first-run so no automatic onboarding surface appears: the auto tour's
  // full-screen scrim can cover the panel action button on a slow runner.
  await installDesktopRailRuntime(page, atlasSampleFiles(), undefined, { replaceFixture: true });
  await openMapOnApp(page, url);
  await page.waitForLoadState("networkidle");
}

test.describe("ontology-map smoke", () => {
  // Assertions lean on dogfood vault data, so `gotoAndSettle` serves that vault as the folder.
  test("a valid ?p= deep link keeps the URL and opens the datasheet", async ({ page }) => {
    await gotoAndSettle(page, `/en/topology/?p=${encodeURIComponent(REAL_CAPABILITY_SLUG)}`);
    const detailPanel = page.getByTestId("map-detail-panel");
    await expect(detailPanel).toBeVisible({ timeout: 15_000 });
    expect(new URL(page.url()).searchParams.get("p")).toBe(REAL_CAPABILITY_SLUG);
  });

  test("a missing bare slug shows a visible not-found toast", async ({ page }) => {
    await gotoAndSettle(page, "/en/topology/?p=missing-xyz");
    await expect(page.getByText(en.topology.deeplinkNotFound.replace("{query}", "missing-xyz"))).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Escape deselects the focused node", async ({ page }) => {
    await gotoAndSettle(page, `/en/topology/?p=${encodeURIComponent(REAL_CAPABILITY_SLUG)}`);
    const detailPanel = page.getByTestId("map-detail-panel");
    await expect(detailPanel).toBeVisible({ timeout: 15_000 });

    // Retry the keypress rather than a single press-then-assert: right after
    // a fresh navigation, the dev build's React StrictMode double-invokes the
    // window keydown effect (mount → unmount → mount), so the very first
    // Escape can land on a listener mid-resubscription and no-op (confirmed
    // live — 1st Escape leaves the panel, 2nd closes it + drops `?p=`).
    // The production build has no StrictMode double-invoke, so a real
    // user's single Escape works.
    //
    // The inner assertion MUST use a short timeout: `toHaveCount` defaults to
    // the global 15s expect timeout, which would swallow the entire `toPass`
    // budget on the first no-op press so the retry never fires a 2nd press.
    // A 1s inner window lets `toPass` loop back and press again.
    await expect(async () => {
      await page.keyboard.press("Escape");
      await expect(detailPanel).toHaveCount(0, { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    // On the Flat map the effective Escape closes the panel and releases the focus together.
    await expect.poll(() => new URL(page.url()).searchParams.get("p"), { timeout: 5_000 }).toBeNull();
  });

  test("opening the doc and going back keeps the map selection", async ({ page }) => {
    await gotoAndSettle(page, `/en/topology/?p=${encodeURIComponent(REAL_CAPABILITY_SLUG)}`);
    const detailPanel = page.getByTestId("map-detail-panel");
    await expect(detailPanel).toBeVisible({ timeout: 15_000 });

    await detailPanel.getByTestId("map-detail-panel-more-menu-trigger").click();
    const documentAction = detailPanel
      .getByTestId("map-detail-panel-more-menu")
      .getByTestId("map-detail-panel-action-document");
    await expect(documentAction).toBeVisible();
    await expect(documentAction).not.toHaveAttribute("aria-disabled", "true");
    const documentHref = new URL((await documentAction.getAttribute("href"))!, page.url());
    expect(documentHref.pathname).toBe("/en/library/");
    expect(documentHref.searchParams.get("tab")).toBe("ontology");
    const documentSlug = documentHref.searchParams.get("slug");
    expect(documentSlug?.split("/").pop()).toBe(REAL_CAPABILITY_SLUG.split(":")[1]);
    await documentAction.click();
    await expect(page).toHaveURL(/\/en\/library\//, { timeout: 10_000 });
    await expect(page.getByTestId("docs-editor-path")).toHaveText(`${documentSlug}.md`);
    await expect(page.getByTestId("docs-reading-pane").locator("article")).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`p=${REAL_CAPABILITY_SLUG.replace(":", "%3A")}`));
    await expect(page.getByTestId("map-detail-panel")).toBeVisible({ timeout: 15_000 });
  });
});
