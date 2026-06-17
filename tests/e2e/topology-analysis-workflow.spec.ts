import { expect, test, type Locator } from "@playwright/test";

async function rectOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("missing bounding box");
  return {
    left: box.x,
    top: box.y,
    right: box.x + box.width,
    bottom: box.y + box.height,
  };
}

function intersects(
  a: Awaited<ReturnType<typeof rectOf>>,
  b: Awaited<ReturnType<typeof rectOf>>,
  pad = 0,
) {
  return (
    a.left < b.right + pad &&
    a.right > b.left - pad &&
    a.top < b.bottom + pad &&
    a.bottom > b.top - pad
  );
}

test.describe("topology analysis workflow", () => {
  test("copies overview brief as a first-contact graph handoff", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text: string) => {
            (
              window as typeof window & {
                __lastCopiedTopologyOverviewBrief?: string;
              }
            ).__lastCopiedTopologyOverviewBrief = text;
          },
        },
        configurable: true,
      });
    });
    await page.goto("/en/topology/");

    await expect(page.getByTestId("sigma-topology-viewport")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("button", { name: "Map", pressed: true }),
    ).toBeVisible();
    await expect(page.getByText(/concepts · \d+ relations/i)).toBeVisible();
    await expect(
      page.getByRole("application", { name: /Ontology relief map/ }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Concept search" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open ontology workspace quick look (D)" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open source vault quick look (D)" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Project search" })).toHaveCount(0);
    await expect(page.getByText(/\d+ PROJECTS/)).toHaveCount(0);
    await page
      .getByRole("button", { name: "Copy topology overview brief" })
      .click();

    const copiedOverviewBrief = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __lastCopiedTopologyOverviewBrief?: string;
          }
        ).__lastCopiedTopologyOverviewBrief,
    );
    expect(copiedOverviewBrief).toContain("# Topology overview brief");
    expect(copiedOverviewBrief).toContain("- Health URL:");
    expect(copiedOverviewBrief).toContain("/en/topology/?mode=health");
    expect(copiedOverviewBrief).toContain("- Insights URL: /ontology/insights/");
    expect(copiedOverviewBrief).toContain(
      "- Agent overview check: ontology-atlas overview [vault] --limit 5",
    );
    expect(copiedOverviewBrief).toContain(
      '- MCP overview check: query_ontology({"operation":"overview","limit":5})',
    );
    expect(copiedOverviewBrief).toContain(
      '- MCP query plan: query_ontology({"operation":"query_plan","targetOperation":"overview"})',
    );
    expect(copiedOverviewBrief).toContain(
      '- MCP workspace check: query_ontology({"operation":"workspace_brief"})',
    );
  });

  test("opens health mode as an actionable graph-health workspace", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text: string) => {
            (
              window as typeof window & {
                __lastCopiedTopologyHealthEvidence?: string;
                __lastCopiedTopologyHealthImpactMcpCheck?: string;
                __lastCopiedTopologyHealthSyncGate?: string;
              }
            ).__lastCopiedTopologyHealthEvidence = text;
            if (text.startsWith('query_ontology({"operation":"blast_radius"')) {
              (
                window as typeof window & {
                  __lastCopiedTopologyHealthImpactMcpCheck?: string;
                }
              ).__lastCopiedTopologyHealthImpactMcpCheck = text;
            }
            if (text.startsWith("# Post-change ontology sync gate")) {
              (
                window as typeof window & {
                  __lastCopiedTopologyHealthSyncGate?: string;
                }
              ).__lastCopiedTopologyHealthSyncGate = text;
            }
          },
        },
        configurable: true,
      });
    });
    await page.goto("/en/topology/?mode=health");

    await expect(page.getByTestId("sigma-topology-viewport")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("button", { name: "Health", pressed: true }),
    ).toBeVisible();
    await expect(page.getByText(/^\d+ cleanup items/)).toBeVisible();
    await expect(page.getByText(/\d+ stale evidence/)).toBeVisible();
    await expect(page.getByText(/\d+ open question/)).toBeVisible();
    await expect(page.getByText(/\d+ hub candidate/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Copy topology health evidence" }),
    ).toBeVisible();
    const healthPanel = page.getByTestId("topology-analysis-panel");
    await expect(healthPanel).toHaveAttribute(
      "data-health-repair-lane-contract",
      "target-to-builder-to-sync",
    );
    await expect(healthPanel).toHaveAttribute(
      "data-health-repair-order-contract",
      "inspect-repair-sync",
    );
    await expect(healthPanel).toHaveAttribute(
      "data-health-repair-target-slug",
      /.+/,
    );
    await expect(healthPanel).toHaveAttribute(
      "data-health-repair-target-kind",
      /stale|orphan|promotion/,
    );
    const sigmaViewport = page.getByTestId("sigma-topology-viewport");
    await expect(sigmaViewport).toHaveAttribute(
      "data-health-repair-map-target-contract",
      "analysis-panel-target-to-audit-overlay",
    );
    await expect(sigmaViewport).toHaveAttribute(
      "data-health-repair-map-target-slug",
      await healthPanel.getAttribute("data-health-repair-target-slug") ?? "",
    );
    await expect(sigmaViewport).toHaveAttribute(
      "data-health-repair-map-target-kind",
      await healthPanel.getAttribute("data-health-repair-target-kind") ?? "",
    );
    const auditTargetCard = page.locator(
      '[data-skeleton-card][data-health-repair-audit-target="true"]',
    );
    await expect(auditTargetCard).toHaveAttribute(
      "data-health-repair-audit-contract",
      "panel-target-card-highlight",
    );
    await expect(auditTargetCard).toHaveAttribute(
      "data-slug",
      await healthPanel.getAttribute("data-health-repair-target-slug") ?? "",
    );
    await expect(auditTargetCard).toHaveAttribute(
      "data-health-repair-audit-kind",
      await healthPanel.getAttribute("data-health-repair-target-kind") ?? "",
    );
    await expect(auditTargetCard).toHaveAttribute(
      "data-health-repair-audit-badge-contract",
      "inline-card-state-label",
    );
    await expect(auditTargetCard).toHaveAttribute(
      "data-health-repair-audit-badge",
      "repair",
    );
    const auditLegend = page.getByTestId("topology-audit-legend");
    await expect(auditLegend).toBeVisible();
    await expect(auditLegend).toHaveAttribute(
      "data-audit-legend-contract",
      "health-support-bottom-left-clear-of-minimap",
    );
    await expect(auditLegend).toHaveAttribute(
      "data-audit-legend-attention-role",
      "support",
    );
    await expect(auditLegend).toHaveAttribute("data-audit-legend-density", "compact");
    const minimap = page.getByTestId("topology-minimap");
    await expect(minimap).toBeVisible();
    expect(intersects(await rectOf(auditLegend), await rectOf(healthPanel), 12)).toBe(
      false,
    );
    expect(intersects(await rectOf(auditLegend), await rectOf(minimap), 12)).toBe(
      false,
    );
    const healthRepairOrder = page.getByTestId("topology-health-repair-order");
    await expect(healthRepairOrder).toHaveAttribute(
      "data-health-repair-primary-action",
      "builder",
    );
    await expect(healthRepairOrder).toHaveAttribute(
      "data-health-repair-action-order",
      "builder-mcp-ontology",
    );
    await expect(healthRepairOrder).toHaveAttribute(
      "data-health-repair-visual-contract",
      "builder-primary-secondary-compact",
    );
    await expect(healthRepairOrder).toHaveAttribute(
      "data-health-repair-sync-gate",
      "post-change",
    );
    await expect(healthRepairOrder).toHaveAttribute(
      "data-primary-surface-token",
      "--topology-health-repair-primary-surface",
    );
    await expect(healthRepairOrder).toHaveAttribute(
      "data-secondary-border-token",
      "--topology-health-repair-secondary-border",
    );
    const firstRepairAction = healthRepairOrder.locator("a,button").first();
    await expect(firstRepairAction).toHaveText(/Edit relations/);
    await expect(firstRepairAction).toHaveAttribute(
      "data-health-repair-primary-action",
      "builder",
    );
    await expect(firstRepairAction).toHaveAttribute(
      "data-health-repair-action-tier",
      "primary",
    );
    await expect(firstRepairAction).toHaveAttribute(
      "data-surface-token",
      "--topology-health-repair-primary-surface",
    );
    await expect(firstRepairAction).toHaveAttribute(
      "data-border-token",
      "--topology-health-repair-primary-border",
    );
    const firstRepairActionBox = await firstRepairAction.boundingBox();
    expect(firstRepairActionBox?.width ?? 0).toBeGreaterThanOrEqual(96);
    await page.getByRole("button", { name: "Copy topology health evidence" }).click();
    const copiedHealthEvidence = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __lastCopiedTopologyHealthEvidence?: string;
          }
        ).__lastCopiedTopologyHealthEvidence,
    );
    expect(copiedHealthEvidence).toContain("- Impact check: ontology-atlas blast-radius");
    expect(copiedHealthEvidence).toContain(
      '- MCP impact check: query_ontology({"operation":"blast_radius"',
    );
    expect(copiedHealthEvidence).toContain("- Post-repair sync gate:");
    expect(copiedHealthEvidence).toContain("  # Post-change ontology sync gate");
    expect(copiedHealthEvidence).toContain('"operation": "maintenance_plan"');
    expect(copiedHealthEvidence).toContain("ontology-atlas validate [vault]");
    await page.getByTestId("topology-health-repair-proof-summary").click();
    await expect(
      page.getByRole("button", { name: "Copy topology health impact MCP check" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Copy topology health impact MCP check" })
      .click();
    const copiedHealthImpactMcpCheck = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __lastCopiedTopologyHealthImpactMcpCheck?: string;
          }
        ).__lastCopiedTopologyHealthImpactMcpCheck,
    );
    expect(copiedHealthImpactMcpCheck).toContain('"operation":"blast_radius"');
    await expect(
      page.getByRole("button", { name: "Copy topology health post-repair sync gate" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Copy topology health post-repair sync gate" })
      .click();
    const copiedHealthSyncGate = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __lastCopiedTopologyHealthSyncGate?: string;
          }
        ).__lastCopiedTopologyHealthSyncGate,
    );
    expect(copiedHealthSyncGate).toContain("# Post-change ontology sync gate");
    expect(copiedHealthSyncGate).toContain('"operation": "health"');
    expect(copiedHealthSyncGate).toContain('"operation": "maintenance_plan"');
    expect(copiedHealthSyncGate).toContain("ontology-atlas validate [vault]");
    await expect(
      page.getByRole("link", { name: "Edit relations" }),
    ).toBeVisible();
  });

  test("keeps health repair primary action visible on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/topology/?mode=health");

    await expect(page.getByTestId("sigma-topology-viewport")).toBeVisible({
      timeout: 20_000,
    });
    const healthPanel = page.getByTestId("topology-analysis-panel");
    await expect(healthPanel).toBeVisible();
    await expect(healthPanel).toHaveAttribute(
      "data-health-repair-lane-contract",
      "target-to-builder-to-sync",
    );
    await expect(page.getByTestId("sigma-topology-viewport")).toHaveAttribute(
      "data-health-repair-map-target-contract",
      "analysis-panel-target-to-audit-overlay",
    );
    await expect(
      page.locator('[data-skeleton-card][data-health-repair-audit-target="true"]'),
    ).toHaveAttribute(
      "data-health-repair-audit-contract",
      "panel-target-card-highlight",
    );
    await expect(
      page.locator('[data-skeleton-card][data-health-repair-audit-target="true"]'),
    ).toHaveAttribute(
      "data-health-repair-audit-badge-contract",
      "inline-card-state-label",
    );
    await expect(page.getByTestId("topology-audit-legend")).toBeHidden();

    const healthRepairOrder = page.getByTestId("topology-health-repair-order");
    await expect(healthRepairOrder).toHaveAttribute(
      "data-health-repair-action-order",
      "builder-mcp-ontology",
    );
    await expect(healthRepairOrder).toHaveAttribute(
      "data-health-repair-visual-contract",
      "builder-primary-secondary-compact",
    );
    await expect(healthRepairOrder).toHaveAttribute(
      "data-secondary-border-token",
      "--topology-health-repair-secondary-border",
    );
    const primaryRepair = healthRepairOrder
      .locator('a[data-health-repair-primary-action="builder"]')
      .first();
    await expect(primaryRepair).toBeVisible();
    await expect(primaryRepair).toBeInViewport();
    await expect(primaryRepair).toHaveAttribute(
      "data-border-token",
      "--topology-health-repair-primary-border",
    );
    const primaryRepairBox = await primaryRepair.boundingBox();
    expect(primaryRepairBox?.width ?? 0).toBeGreaterThanOrEqual(96);

    const overflow = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - window.innerWidth,
      y: document.documentElement.scrollHeight - window.innerHeight,
    }));
    expect(overflow.x).toBe(0);
    expect(overflow.y).toBeLessThanOrEqual(160);
  });

  test("restores ontology drawer handoff links from selected-node URL state", async ({
    page,
  }) => {
    await page.goto("/en/topology/?p=capabilities%2Ftopology-analysis-modes");

    await expect(page.getByTestId("sigma-topology-viewport")).toBeVisible({
      timeout: 20_000,
    });
    const drawer = page.getByRole("dialog", {
      name: "Topology Analysis Modes",
    });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText(/A Capability in the Views/)).toBeVisible();
    await expect(drawer.getByText("Connections (3)")).toBeVisible();
    await drawer.getByRole("button", { name: "Full detail" }).click();

    const detail = page.getByTestId("topology-node-detail-modal");
    await expect(detail).toBeVisible();
    await detail.getByRole("button", { name: "Edit" }).click();

    const topologyFocusLink = detail.getByRole("link", {
      name: "View only this node",
    });
    const ontologyLink = detail.getByRole("link", {
      name: "View in tree",
    });
    const builderLink = detail.getByRole("link", {
      name: "Edit",
    });
    const sourceLink = detail.getByRole("link", {
      name: "Open document",
    });

    await expect(topologyFocusLink).toHaveAttribute(
      "href",
      /\/en\/topology\/\?mode=focus&p=capability%3Atopology-analysis-modes/,
    );
    await expect(ontologyLink).toHaveAttribute(
      "href",
      /\/en\/ontology\/\?node=capability%3Atopology-analysis-modes/,
    );
    await expect(builderLink).toHaveAttribute(
      "href",
      /\/en\/ontology\/edit\/\?node=capabilities%2Ftopology-analysis-modes/,
    );
    await expect(sourceLink).toHaveAttribute(
      "href",
      /\/en\/docs\/\?slug=ontology%2Fcapabilities%2Ftopology-analysis-modes/,
    );
  });

  test("keeps selected-node handoff actions visible on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/topology/?p=capabilities%2Ftopology-analysis-modes");

    await expect(page.getByTestId("sigma-topology-viewport")).toBeVisible({
      timeout: 20_000,
    });
    const drawer = page.getByRole("dialog", {
      name: "Topology Analysis Modes",
    });
    const fullDetailButton = drawer.getByRole("button", {
      name: "Full detail",
    });

    await expect(drawer).toBeVisible();
    await expect(fullDetailButton).toBeInViewport();

    const [fullDetailBox, viewport] = await Promise.all([
      fullDetailButton.boundingBox(),
      page.viewportSize(),
    ]);

    expect(fullDetailBox, "full detail handoff should have a layout box").not.toBeNull();
    expect(viewport, "viewport should be known").not.toBeNull();
    expect(fullDetailBox!.y + fullDetailBox!.height).toBeLessThanOrEqual(
      viewport!.height,
    );
  });

  test("copies focused node MCP checks from Focus mode", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text: string) => {
            (
              window as typeof window & {
                __lastCopiedTopologyFocusBrief?: string;
                __lastCopiedTopologyFocusMcpCheck?: string;
                __lastCopiedTopologyFocusImpactMcpCheck?: string;
                __lastCopiedTopologyFocusSyncGate?: string;
              }
            ).__lastCopiedTopologyFocusMcpCheck = text;
            if (text.startsWith("# Topology focus review")) {
              (
                window as typeof window & {
                  __lastCopiedTopologyFocusBrief?: string;
                }
              ).__lastCopiedTopologyFocusBrief = text;
            }
            if (text.startsWith('query_ontology({"operation":"blast_radius"')) {
              (
                window as typeof window & {
                  __lastCopiedTopologyFocusImpactMcpCheck?: string;
                }
              ).__lastCopiedTopologyFocusImpactMcpCheck = text;
            }
            if (text.startsWith("# Post-change ontology sync gate")) {
              (
                window as typeof window & {
                  __lastCopiedTopologyFocusSyncGate?: string;
                }
              ).__lastCopiedTopologyFocusSyncGate = text;
            }
          },
        },
        configurable: true,
      });
    });
    await page.goto("/en/topology/?mode=focus&p=capabilities%2Ftopology-analysis-modes");

    await expect(page.getByTestId("sigma-topology-viewport")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("button", { name: "Focus", pressed: true }),
    ).toBeVisible();
    await expect(page.getByText(/^Showing links around Topology Analysis Modes/)).toBeVisible();
    await expect(
      page.getByRole("link", { name: "View tree", exact: true }),
    ).toHaveAttribute(
      "href",
      /\/en\/ontology\/\?node=capabilities%2Ftopology-analysis-modes/,
    );
    await expect(
      page.getByRole("link", { name: "Edit", exact: true }),
    ).toHaveAttribute(
      "href",
      /\/en\/ontology\/edit\/\?node=capabilities%2Ftopology-analysis-modes/,
    );
    const focusSecondaryActions = page.getByTestId("topology-focus-secondary-actions");
    await expect(focusSecondaryActions).toHaveAttribute(
      "data-focus-secondary-action-contract",
      "ontology-builder-exits",
    );
    await expect(focusSecondaryActions).toHaveAttribute(
      "data-command-secondary-surface-token",
      "--topology-command-secondary-surface",
    );
    await expect(
      focusSecondaryActions.locator('a[data-focus-secondary-action="ontology"]'),
    ).toHaveAttribute(
      "data-command-secondary-border-token",
      "--topology-command-secondary-border",
    );
    await expect(
      focusSecondaryActions.locator('a[data-focus-secondary-action="builder"]'),
    ).toHaveAttribute(
      "data-command-secondary-border-token",
      "--topology-command-secondary-border",
    );

    await page.getByTestId("topology-focus-primary-action").click();
    const copiedFocusBrief = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __lastCopiedTopologyFocusBrief?: string;
          }
        ).__lastCopiedTopologyFocusBrief,
    );
    expect(copiedFocusBrief).toContain("# Topology focus review");
    expect(copiedFocusBrief).toContain(
      "- Node: Topology Analysis Modes (capabilities/topology-analysis-modes)",
    );
    expect(copiedFocusBrief).toContain(
      "/en/topology/?mode=focus&p=capabilities%2Ftopology-analysis-modes",
    );
    expect(copiedFocusBrief).toContain(
      "- Ontology URL: /ontology/?node=capabilities%2Ftopology-analysis-modes",
    );
    expect(copiedFocusBrief).toContain(
      "- Save/edit URL: /ontology/edit/?node=capabilities%2Ftopology-analysis-modes",
    );
    expect(copiedFocusBrief).toContain(
      '- MCP impact check: query_ontology({"operation":"blast_radius","slug":"capabilities/topology-analysis-modes","depth":2,"direction":"incoming"})',
    );
    expect(copiedFocusBrief).toContain("- Post-change sync gate:");
    expect(copiedFocusBrief).toContain("  # Post-change ontology sync gate");
    expect(copiedFocusBrief).toContain('"operation": "health"');
    expect(copiedFocusBrief).toContain("ontology-atlas validate [vault]");

    await page.getByTestId("topology-focus-proof-summary").click();
    const focusMcpProfile = page.getByRole("button", {
      name: "Copy topology focus MCP profile",
    });
    await expect(focusMcpProfile).toHaveAttribute(
      "data-focus-proof-action",
      "mcp-profile",
    );
    await expect(focusMcpProfile).toHaveAttribute(
      "data-command-secondary-surface-token",
      "--topology-command-secondary-surface",
    );
    await focusMcpProfile.click();
    const copiedProfile = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __lastCopiedTopologyFocusMcpCheck?: string;
          }
        ).__lastCopiedTopologyFocusMcpCheck,
    );
    expect(copiedProfile).toBe(
      'query_ontology({"operation":"node_profile","slug":"capabilities/topology-analysis-modes","depth":2,"limit":12})',
    );

    await page
      .getByRole("button", { name: "Copy topology focus impact MCP check" })
      .click();
    const copiedImpact = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __lastCopiedTopologyFocusImpactMcpCheck?: string;
          }
        ).__lastCopiedTopologyFocusImpactMcpCheck,
    );
    expect(copiedImpact).toBe(
      'query_ontology({"operation":"blast_radius","slug":"capabilities/topology-analysis-modes","depth":2,"direction":"incoming"})',
    );

    await page
      .getByRole("button", { name: "Copy topology focus post-change sync gate" })
      .click();
    const copiedSyncGate = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __lastCopiedTopologyFocusSyncGate?: string;
          }
        ).__lastCopiedTopologyFocusSyncGate,
    );
    expect(copiedSyncGate).toContain("# Post-change ontology sync gate");
    expect(copiedSyncGate).toContain('"operation": "health"');
    expect(copiedSyncGate).toContain("ontology-atlas validate [vault]");
  });

  test("restores a path evidence route from URL state", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text: string) => {
            (
              window as typeof window & {
                __lastCopiedTopologyPathEvidence?: string;
                __lastCopiedTopologyPathMcpCheck?: string;
                __lastCopiedTopologyPathRelationPreflightMcpCheck?: string;
                __lastCopiedTopologyPathExplainRelationMcpCheck?: string;
                __lastCopiedTopologyPathAllPathsPlanMcpCheck?: string;
                __lastCopiedTopologyPathAllPathsMcpCheck?: string;
              }
            ).__lastCopiedTopologyPathEvidence = text;
            if (text.startsWith('query_ontology({"operation":"path"')) {
              (
                window as typeof window & {
                  __lastCopiedTopologyPathMcpCheck?: string;
                }
              ).__lastCopiedTopologyPathMcpCheck = text;
            }
            if (text.startsWith('query_ontology({"operation":"relation_check"')) {
              (
                window as typeof window & {
                  __lastCopiedTopologyPathRelationPreflightMcpCheck?: string;
                }
              ).__lastCopiedTopologyPathRelationPreflightMcpCheck = text;
            }
            if (text.startsWith('query_ontology({"operation":"explain_relation"')) {
              (
                window as typeof window & {
                  __lastCopiedTopologyPathExplainRelationMcpCheck?: string;
                }
              ).__lastCopiedTopologyPathExplainRelationMcpCheck = text;
            }
            if (text.startsWith('query_ontology({"operation":"query_plan"')) {
              (
                window as typeof window & {
                  __lastCopiedTopologyPathAllPathsPlanMcpCheck?: string;
                }
              ).__lastCopiedTopologyPathAllPathsPlanMcpCheck = text;
            }
            if (text.startsWith('query_ontology({"operation":"all_paths"')) {
              (
                window as typeof window & {
                  __lastCopiedTopologyPathAllPathsMcpCheck?: string;
                }
              ).__lastCopiedTopologyPathAllPathsMcpCheck = text;
            }
          },
        },
        configurable: true,
      });
    });
    await page.goto(
      "/en/topology/?mode=path&pathFrom=domain%3Aviews&pathTo=capability%3Atopology-analysis-modes",
    );

    await expect(page.getByTestId("sigma-topology-viewport")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("button", { name: "Path", pressed: true }),
    ).toBeVisible();
    await expect(page.getByText(/^Showing the link from/)).toBeVisible();
    await page.getByTestId("topology-path-proof-summary").click();
    await expect(page.getByText("Shows the visible link between two nodes.")).toBeVisible();
    const pathProofRoute = page.getByTestId("topology-path-proof-route");
    await expect(pathProofRoute).toHaveAttribute(
      "data-route-contract",
      "proof-disclosure-source-target",
    );
    await expect(pathProofRoute).toHaveAttribute(
      "data-surface-token",
      "--topology-path-route-surface",
    );
    await expect(pathProofRoute).toHaveAttribute(
      "data-chip-border-token",
      "--topology-path-route-chip-border",
    );
    await expect(page.locator('a[data-path-proof-action="source-ontology"]')).toHaveAttribute(
      "data-path-proof-action",
      "source-ontology",
    );
    await expect(page.locator('a[data-path-proof-action="target-builder"]')).toHaveAttribute(
      "data-surface-token",
      "--topology-path-route-chip-surface",
    );
    await expect(
      page.getByRole("button", { name: "Copy topology path evidence" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Copy topology path evidence" })
      .click();
    const copiedEvidence = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __lastCopiedTopologyPathEvidence?: string;
          }
        ).__lastCopiedTopologyPathEvidence,
    );
    expect(copiedEvidence).toContain("- Source ontology URL: /ontology/?node=domain%3Aviews");
    expect(copiedEvidence).toContain(
      "- Target ontology URL: /ontology/?node=capability%3Atopology-analysis-modes",
    );
    expect(copiedEvidence).toContain(
      "- Source save/edit URL: /ontology/edit/?node=domains%2Fviews",
    );
    expect(copiedEvidence).toContain(
      "- Target save/edit URL: /ontology/edit/?node=capabilities%2Ftopology-analysis-modes",
    );
    expect(copiedEvidence).toContain(
      "- CLI check: ontology-atlas path domain:views capability:topology-analysis-modes [vault] --max-hops 5",
    );
    expect(copiedEvidence).toContain(
      '- MCP check: query_ontology({"operation":"path","from":"domain:views","to":"capability:topology-analysis-modes","maxHops":5})',
    );
    expect(copiedEvidence).toContain(
      "- Relation preflight reason: domain -> capability maps to capabilities because domains own capabilities.",
    );
    expect(copiedEvidence).toContain(
      '- Relation preflight MCP check: query_ontology({"operation":"relation_check","from":"domain:views","to":"capability:topology-analysis-modes","type":"capabilities"})',
    );
    expect(copiedEvidence).toContain(
      '- explain_relation MCP check: query_ontology({"operation":"explain_relation","from":"domain:views","to":"capability:topology-analysis-modes","direction":"undirected","maxHops":5,"limit":10})',
    );
    expect(copiedEvidence).toContain(
      '- all_paths query plan MCP check: query_ontology({"operation":"query_plan","targetOperation":"all_paths","from":"domain:views","to":"capability:topology-analysis-modes","maxHops":5,"limit":10,"searchBudget":1000})',
    );
    expect(copiedEvidence).toContain(
      '- all_paths MCP check: query_ontology({"operation":"all_paths","from":"domain:views","to":"capability:topology-analysis-modes","maxHops":5,"limit":10,"searchBudget":1000})',
    );
    expect(copiedEvidence).toContain(
      "- all_paths evidence contract: report limit, searchBudget, expandedStates, exhaustive, truncatedByBudget, totalPathsExact, evidence.status, evidence.reason, and evidence.pathsComplete before using paths as write evidence",
    );
    expect(copiedEvidence).toContain("- Proof checklist:");
    expect(copiedEvidence).toContain("  - Visible path clue: ready");
    expect(copiedEvidence).toContain("  - relation_check preflight: required");
    expect(copiedEvidence).toContain("  - explain_relation context: required");
    expect(copiedEvidence).toContain("  - bounded all_paths plan: required");
    expect(copiedEvidence).toContain("  - post-write sync gate: after write");
    expect(copiedEvidence).toContain("- Post-write sync gate:");
    expect(copiedEvidence).toContain("  # Post-change ontology sync gate");
    expect(copiedEvidence).toContain('"operation": "health"');
    expect(copiedEvidence).toContain('"operation": "maintenance_plan"');
    expect(copiedEvidence).toContain("ontology-atlas validate [vault]");

    await page.getByTestId("topology-path-checks-summary").click();
    await expect(
      page.getByRole("button", { name: "Copy topology path MCP check" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Copy topology path MCP check" }).click();
    const copiedMcpCheck = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __lastCopiedTopologyPathMcpCheck?: string;
          }
        ).__lastCopiedTopologyPathMcpCheck,
    );
    expect(copiedMcpCheck).toBe(
      'query_ontology({"operation":"path","from":"domain:views","to":"capability:topology-analysis-modes","maxHops":5})',
    );

    await expect(
      page.getByRole("button", { name: "Copy topology path relation preflight MCP check" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Copy topology path relation preflight MCP check" })
      .click();
    const copiedRelationPreflightMcpCheck = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __lastCopiedTopologyPathRelationPreflightMcpCheck?: string;
          }
        ).__lastCopiedTopologyPathRelationPreflightMcpCheck,
    );
    expect(copiedRelationPreflightMcpCheck).toBe(
      'query_ontology({"operation":"relation_check","from":"domain:views","to":"capability:topology-analysis-modes","type":"capabilities"})',
    );

    await expect(
      page.getByRole("button", { name: "Copy topology path explain_relation MCP check" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Copy topology path explain_relation MCP check" })
      .click();
    const copiedExplainRelationMcpCheck = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __lastCopiedTopologyPathExplainRelationMcpCheck?: string;
          }
        ).__lastCopiedTopologyPathExplainRelationMcpCheck,
    );
    expect(copiedExplainRelationMcpCheck).toBe(
      'query_ontology({"operation":"explain_relation","from":"domain:views","to":"capability:topology-analysis-modes","direction":"undirected","maxHops":5,"limit":10})',
    );

    await expect(
      page.getByRole("button", {
        name: "Copy topology path all_paths query plan MCP check",
      }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Copy topology path all_paths query plan MCP check",
      })
      .click();
    const copiedAllPathsPlanMcpCheck = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __lastCopiedTopologyPathAllPathsPlanMcpCheck?: string;
          }
        ).__lastCopiedTopologyPathAllPathsPlanMcpCheck,
    );
    expect(copiedAllPathsPlanMcpCheck).toBe(
      'query_ontology({"operation":"query_plan","targetOperation":"all_paths","from":"domain:views","to":"capability:topology-analysis-modes","maxHops":5,"limit":10,"searchBudget":1000})',
    );

    await expect(
      page.getByRole("button", {
        name: "Copy topology path all_paths MCP execution check",
      }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Copy topology path all_paths MCP execution check",
      })
      .click();
    const copiedTopBarAllPathsMcpCheck = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __lastCopiedTopologyPathAllPathsMcpCheck?: string;
          }
        ).__lastCopiedTopologyPathAllPathsMcpCheck,
    );
    expect(copiedTopBarAllPathsMcpCheck).toBe(
      'query_ontology({"operation":"all_paths","from":"domain:views","to":"capability:topology-analysis-modes","maxHops":5,"limit":10,"searchBudget":1000})',
    );

  });

  test("restores builder handoff path URLs that use vault slugs", async ({
    page,
  }) => {
    await page.goto(
      "/en/topology/?mode=path&pathFrom=domains%2Fviews&pathTo=capabilities%2Ftopology-analysis-modes",
    );

    await expect(page.getByTestId("sigma-topology-viewport")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("button", { name: "Path", pressed: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/^Showing the link from Views to Topology Analysis Modes\./),
    ).toBeVisible();
  });

  test("keeps the mobile path primer owned by the analysis bar", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/topology/?mode=path");

    await expect(page.getByTestId("sigma-topology-viewport")).toBeVisible({
      timeout: 20_000,
    });
    const analysisBar = page.getByRole("region", {
      name: "Topology analysis mode",
    });
    await expect(analysisBar).toHaveAttribute(
      "data-path-guidance-owner",
      "analysis-rail",
    );
    const primerBody = analysisBar.getByText(
      "Choose a start node, then a target node.",
    );

    await expect(analysisBar).toBeVisible();
    await expect(primerBody).toBeVisible();

    const [barBox, primerBox] = await Promise.all([
      analysisBar.boundingBox(),
      primerBody.boundingBox(),
    ]);

    expect(barBox, "analysis bar should have a layout box").not.toBeNull();
    expect(primerBox, "path primer should have a layout box").not.toBeNull();
    expect(primerBox!.y).toBeGreaterThanOrEqual(barBox!.y);
    expect(primerBox!.y + primerBox!.height).toBeLessThanOrEqual(
      barBox!.y + barBox!.height + 1,
    );
  });
});
