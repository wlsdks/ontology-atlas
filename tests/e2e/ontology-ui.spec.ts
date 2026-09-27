import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { useDogfoodSample } from "./sample-source";

/**
 * /ontology surface smoke — trimmed (2026-07 e2e decontamination).
 *
 * This file used to cover the old `/ontology` tree/workbench page
 * (`OntologyViewPage`, `ontology-command-bar`, `#tree-data-warnings`, the
 * MCP/Agents settings tab, the Insights maintenance board, …). That page was
 * retired when `/ontology` converged into a thin redirect to
 * `/topology?index=expanded` (B3 — "the hub is the map"), so those 17 tests only
 * failed waiting for markup that no longer renders — no product defect, just
 * e2e rot. They were deleted rather than repaired because the surface itself
 * is gone; equivalent current-surface coverage lives in
 * `map-smoke.spec.ts`.
 *
 * One more test ("detail panel is not exposed when there is no data") was dropped even
 * though it still reported green: it asserted zero `ontology-node-detail`
 * elements, but that testid has zero producers left in `src/` — the
 * assertion passes vacuously forever regardless of actual empty-state
 * behavior, so it stopped being a real regression guard.
 *
 * The three tests below survive because they exercise routes/testids that
 * are still live today (`/download/`, `/projects/`, and `/ontology/`'s
 * redirect-then-render-topology behavior) and still fail for a real reason
 * if broken. The `/` and `/topology` first-paint checks live in
 * `web-surface-smoke.spec.ts`; the `/download` scroll end and overflow in
 * `scroll-end-gap.spec.ts` and `overflow-sweep.spec.ts`. Phone widths are not
 * a target (owner direction, 2026-09-27).
 */
test.describe("ontology view UI", () => {
  // Every assertion in this file depends on dogfood vault data (project name, deep-link
  // slug, node labels). Since the default sample became the example business on
  // 2026-07-26, this selects explicitly per file rather than relying on the default.
  test.beforeEach(async ({ page }) => {
    await useDogfoodSample(page);
  });

  test("desktop: /download states installability before it explains the product", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/en/download/");

    // The headline comes from the catalog, not from a copy of it. Pinning the
    // sentence is what broke this spec on the 2026-07-27 remake: the assertion
    // was about *the page having one headline*, but it was written as "this
    // exact sentence", so a rewrite read as a regression.
    const headings = page.getByRole("heading", { level: 1 });
    await expect(headings).toHaveCount(1);
    await expect(headings).toBeVisible();

    // The macOS action is a single stable target across both release states:
    // the Apple Silicon DMG once published, the browser map before that.
    // Asserting the label would pin this spec to one state and break on
    // release day — assert the role the element plays.
    //
    // [re-aimed 2026-08-19] This site used to be the panel (`download-primary-cta`).
    // After the owner removed the install section entirely (*"the last section is probably unnecessary, it is
    // all at the top anyway"* — the last section is probably unnecessary, it is
    // all at the top anyway), the hero CTA carries the same role.
    const primary = page.getByTestId("gateway-hero-cta");
    await expect(primary).toBeVisible();

    /*
     * [deleted 2026-08-19] The subjects that disappeared with it — the repository exit
     * link (`download-repo-link`), the two platform sections (`download-platform-macos`,
     * `download-platform-windows`), the verification rail (`download-trust`, Developer ID,
     * SHA-256), and the architecture guidance (`About This Mac`). All lived inside the
     * download panel and the verification rail. `docs/DECISIONS.md` 2026-08-19 records the
     * cost.
     *
     * The signing and notarisation claim survives as the hero's single trust line, so that
     * is all this measures.
     */
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
    // The project's own node, whose inspector carries its code evidence (2026-09-25 sweep);
    // the bare slug opened the project drawer, which cannot connect the code folder.
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
