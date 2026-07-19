import { expect, test } from "@playwright/test";

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

const REAL_CAPABILITY_SLUG = "capability:topology-analysis-modes";

test.describe("topology-map-v2 smoke", () => {
  test("renders the canvas engine with a non-zero surface", async ({ page }) => {
    await page.goto("/ko/topology/");
    const canvas = page.getByTestId("topology-map-v2-canvas");
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width).toBeGreaterThan(0);
    expect(box?.height).toBeGreaterThan(0);
  });

  test("a valid ?p= deep link keeps the URL and opens the datasheet", async ({ page }) => {
    await page.goto(`/en/topology/?p=${encodeURIComponent(REAL_CAPABILITY_SLUG)}`);
    const detailPanel = page.getByTestId("topology-v2-detail-panel");
    await expect(detailPanel).toBeVisible({ timeout: 15_000 });
    expect(new URL(page.url()).searchParams.get("p")).toBe(REAL_CAPABILITY_SLUG);
  });

  test("a missing bare slug shows a visible not-found toast", async ({ page }) => {
    await page.goto("/en/topology/?p=missing-xyz");
    await expect(page.getByText("Node not found: missing-xyz")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Escape deselects the focused node", async ({ page }) => {
    await page.goto(`/en/topology/?p=${encodeURIComponent(REAL_CAPABILITY_SLUG)}`);
    const detailPanel = page.getByTestId("topology-v2-detail-panel");
    await expect(detailPanel).toBeVisible({ timeout: 15_000 });

    // Retry the keypress rather than a single press-then-assert: right after
    // a fresh navigation, `next dev`'s React StrictMode double-invokes the
    // window keydown effect (mount → unmount → mount), so the very first
    // Escape can land on a listener mid-resubscription and no-op. The second
    // press always lands — real users type once and it works because they're
    // not racing the initial mount. `toPass` re-runs press+assert until the
    // deselect actually lands, bounded so a genuine regression still fails.
    await expect(async () => {
      await page.keyboard.press("Escape");
      await expect(detailPanel).toHaveCount(0);
    }).toPass({ timeout: 5_000 });
  });

  test("opening the doc and going back keeps the map selection", async ({ page }) => {
    await page.goto(`/en/topology/?p=${encodeURIComponent(REAL_CAPABILITY_SLUG)}`);
    const detailPanel = page.getByTestId("topology-v2-detail-panel");
    await expect(detailPanel).toBeVisible({ timeout: 15_000 });

    const documentAction = detailPanel.getByTestId("topology-v2-detail-panel-action-document");
    await expect(documentAction).toBeVisible();
    await expect(documentAction).not.toHaveAttribute("aria-disabled", "true");
    await documentAction.click();
    await expect(page).toHaveURL(/\/en\/docs\//, { timeout: 10_000 });

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`p=${REAL_CAPABILITY_SLUG.replace(":", "%3A")}`));
    await expect(page.getByTestId("topology-v2-detail-panel")).toBeVisible({ timeout: 15_000 });
  });
});
