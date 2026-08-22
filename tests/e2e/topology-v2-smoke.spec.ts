import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { useDogfoodSample } from "./sample-source";

/**
 * `topology-map-v2` canvas engine smoke — current-surface replacement for
 * the Sigma-era specs deleted in the 2026-07 e2e decontamination pass
 * (topology-overlap / topology-drag / topology-analysis-workflow /
 * topology-visual-regression / topology-loading, all targeting the retired
 * WebGL renderer and its `sigma-*` testids).
 *
 * Small and stable on purpose — a handful of contracts that are true of the
 * *current* map today, not an exhaustive interaction suite. Uses real
 * dogfood vault slugs (`docs/ontology/`) rather than fixtures.
 */

/**
 * The node to deep-link into is **picked from the vault — its name is not pinned
 * here.**
 *
 * `capability:topology-analysis-modes` used to be a constant, and when the vault was
 * regenerated against the spec on 2026-08-01 that capability disappeared and three
 * specs died at once (deep link, Escape, docs round trip). The vault is dogfood and
 * keeps getting redrawn, so a spec leaning on one node's name means **fixing e2e
 * every time the vault is fixed.**
 *
 * What this spec actually measures is not which capability opens but whether the deep
 * link arrives and the selection persists. So any capability will do as long as the
 * choice is deterministic — take the first capability by slug from the manifest.
 */
const REAL_CAPABILITY_SLUG = (() => {
  const manifestPath = path.resolve(
    __dirname,
    "../../src/entities/docs-vault/data/manifest.json",
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

// `next dev` can transiently double-render a page's client tree under load
// (streaming/hydration artifact — not present in a production static
// export). It doesn't show up running one spec alone, only when the whole
// suite runs back-to-back and the dev server is under sustained pressure.
// Letting the network settle before querying a testid gives the duplicate
// time to collapse to one before a Playwright strict-mode locator can trip
// on it — same fix applied to the analogous `project-selector-new-cta`
// duplicate in `ontology-ui.spec.ts`.
async function gotoAndSettle(page: import("@playwright/test").Page, url: string) {
  // Suppress the automatic onboarding surfaces (fix for the 2026-07-24 CI flake): on a
  // first visit in sample mode, /topology raises the folder guidance sheet plus a
  // 900ms auto tour. The auto tour's full-screen scrim (z-70) covered the panel action
  // button on a slow CI runner and the click timed out (the topology smoke verifies
  // the map, not onboarding). Seeding turns the automatic surfaces off; manual entry
  // is unaffected.
  await seedFirstRunSeen(page);
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

test.describe("topology-map-v2 smoke", () => {
  // Every assertion in this file leans on dogfood vault data (project name, deep-link
  // slug, node labels). Since the default sample became an example business on
  // 2026-07-26, the vault is selected explicitly per file rather than relying on the
  // default.
  test.beforeEach(async ({ page }) => {
    await useDogfoodSample(page);
  });

  test("renders the canvas engine with a non-zero surface", async ({ page }) => {
    await gotoAndSettle(page, "/ko/topology/");
    const canvas = page.getByTestId("topology-map-v2-canvas");
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width).toBeGreaterThan(0);
    expect(box?.height).toBeGreaterThan(0);
  });

  test("a valid ?p= deep link keeps the URL and opens the datasheet", async ({ page }) => {
    await gotoAndSettle(page, `/en/topology/?p=${encodeURIComponent(REAL_CAPABILITY_SLUG)}`);
    const detailPanel = page.getByTestId("topology-v2-detail-panel");
    await expect(detailPanel).toBeVisible({ timeout: 15_000 });
    expect(new URL(page.url()).searchParams.get("p")).toBe(REAL_CAPABILITY_SLUG);
  });

  test("a missing bare slug shows a visible not-found toast", async ({ page }) => {
    await gotoAndSettle(page, "/en/topology/?p=missing-xyz");
    await expect(page.getByText("Node not found: missing-xyz")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Escape deselects the focused node", async ({ page }) => {
    await gotoAndSettle(page, `/en/topology/?p=${encodeURIComponent(REAL_CAPABILITY_SLUG)}`);
    const detailPanel = page.getByTestId("topology-v2-detail-panel");
    await expect(detailPanel).toBeVisible({ timeout: 15_000 });

    // Retry the keypress rather than a single press-then-assert: right after
    // a fresh navigation, `next dev`'s React StrictMode double-invokes the
    // window keydown effect (mount → unmount → mount), so the very first
    // Escape can land on a listener mid-resubscription and no-op (confirmed
    // live — 1st Escape leaves the panel, 2nd closes it + drops `?p=`).
    // Production static export has no StrictMode double-invoke, so a real
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
    // The Esc ladder: the first effective Esc closes only the popover/panel and keeps
    // the ego focus (`?p=`) — one step at a time. Releasing the focus takes the next
    // Esc.
    expect(new URL(page.url()).searchParams.get("p")).toBe(REAL_CAPABILITY_SLUG);
    await expect(async () => {
      await page.keyboard.press("Escape");
      expect(new URL(page.url()).searchParams.get("p")).toBeNull();
    }).toPass({ timeout: 15_000 });
  });

  test("opening the doc and going back keeps the map selection", async ({ page }) => {
    await gotoAndSettle(page, `/en/topology/?p=${encodeURIComponent(REAL_CAPABILITY_SLUG)}`);
    const detailPanel = page.getByTestId("topology-v2-detail-panel");
    await expect(detailPanel).toBeVisible({ timeout: 15_000 });

    await detailPanel.getByTestId("topology-v2-detail-panel-more-menu-trigger").click();
    const documentAction = detailPanel
      .getByTestId("topology-v2-detail-panel-more-menu")
      .getByTestId("topology-v2-detail-panel-action-document");
    await expect(documentAction).toBeVisible();
    await expect(documentAction).not.toHaveAttribute("aria-disabled", "true");
    await documentAction.click();
    await expect(page).toHaveURL(/\/en\/docs\//, { timeout: 10_000 });

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`p=${REAL_CAPABILITY_SLUG.replace(":", "%3A")}`));
    await expect(page.getByTestId("topology-v2-detail-panel")).toBeVisible({ timeout: 15_000 });
  });
});
