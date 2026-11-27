import { expect, test } from "@playwright/test";

/**
 * Smoke for `/download/`. The app's own addresses are the app-only page in a browser
 * (`app-shell/app-document-load.spec.ts`); first-paint and scroll checks live in web-surface-smoke
 * and overflow-sweep specs.
 */
test.describe("ontology view UI", () => {
  test("desktop: /download states installability before it explains the product", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/en/download/");

    // The headline comes from the catalog; assert one headline, not its exact sentence.
    const headings = page.getByRole("heading", { level: 1 });
    await expect(headings).toHaveCount(1);
    await expect(headings).toBeVisible();

    // The macOS action is a single stable target across both release states:
    // the Apple Silicon DMG once published, the sample map before that.
    // Asserting the label would pin this spec to one state and break on
    // release day — assert the role the element plays.
    const primary = page.getByTestId("gateway-hero-cta");
    await expect(primary).toBeVisible();

    await expect(page.getByText(/Checked by Apple/i).first()).toBeVisible();
    await expect(page.getByText(/Open Anyway/i)).toHaveCount(0);
    await expect(page.getByText(/Not signed yet/i)).toHaveCount(0);

    // Operator-only release-pipeline status must never reach the public page.
    await expect(page.getByText(/waiting on PR review/i)).toHaveCount(0);
    await expect(page.getByText(/version alignment/i)).toHaveCount(0);
  });
});
