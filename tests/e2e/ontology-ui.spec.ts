import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { useDogfoodSample } from "./sample-source";

/**
 * Smoke for live routes: `/download/`, `/projects/` and the `/ontology/` redirect to topology.
 * First-paint and scroll checks live in web-surface-smoke, scroll-end-gap and overflow-sweep
 * specs.
 */
test.describe("ontology view UI", () => {
  // These assertions depend on dogfood vault data, so each file selects the sample explicitly.
  test.beforeEach(async ({ page }) => {
    await useDogfoodSample(page);
  });

  test("desktop: /download states installability before it explains the product", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/en/download/");

    // The headline comes from the catalog; assert one headline, not its exact sentence.
    const headings = page.getByRole("heading", { level: 1 });
    await expect(headings).toHaveCount(1);
    await expect(headings).toBeVisible();

    // The macOS action is a single stable target across both release states:
    // the Apple Silicon DMG once published, the browser map before that.
    // Asserting the label would pin this spec to one state and break on
    // release day — assert the role the element plays.
    const primary = page.getByTestId("gateway-hero-cta");
    await expect(primary).toBeVisible();

    await expect(page.getByText(/Signed and notarized by Apple/i).first()).toBeVisible();
    await expect(page.getByText(/Open Anyway/i)).toHaveCount(0);
    await expect(page.getByText(/Not signed yet/i)).toHaveCount(0);

    // Operator-only release-pipeline status must never reach the public page.
    await expect(page.getByText(/waiting on PR review/i)).toHaveCount(0);
    await expect(page.getByText(/version alignment/i)).toHaveCount(0);
  });

  test("project cards expose a working topology link", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/en/projects/");

    const topologyLink = page
      .getByTestId("project-selector-card")
      .filter({ has: page.getByRole("link", { name: "Ontology Atlas", exact: true }) })
      .getByRole("link", { name: "View on map" });
    await expect(topologyLink).toBeVisible();
    await topologyLink.click();
    // The project's own node: its inspector carries code evidence, while the bare slug opened a drawer
    // that cannot connect the code folder.
    await expect(page).toHaveURL(/\/en\/topology\/\?p=project%3Aontology-atlas/);
    await expect(page.getByTestId("map-detail-panel")).toHaveAttribute(
      "data-selected-node-id",
      "project:ontology-atlas",
    );
  });

  test("legacy node redirect keeps the explicitly requested INDEX beside the selection", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    await seedFirstRunSeen(page);
    await page.addInitScript(() => {
      window.localStorage.setItem("demo:sample-source:v1", "dogfood");
    });

    await page.goto("/en/ontology/?node=capability:mcp-tool-server");

    await expect(page).toHaveURL(
      /\/en\/topology\/\?index=expanded&p=capability%3Amcp-tool-server/,
    );
    await expect(page.locator("html")).toHaveAttribute(
      "data-topology-index",
      "expanded",
    );
    await expect(page.getByTestId("topology-index-panel")).toBeVisible();
    await expect(page.getByTestId("map-detail-panel")).toBeVisible();
    await expect(page.getByTestId("map-detail-panel")).toHaveAttribute(
      "data-selected-node-id",
      "capability:mcp-tool-server",
    );
  });
});
