import { expect, test } from "@playwright/test";

/**
 * /ontology surface smoke (T-6 / T-9 / UX 정정).
 *
 * Static dogfood vault has ontology nodes, so verify the current local-first
 * browse surface rather than the removed knowledge/review queue surfaces.
 */
test.describe("ontology view UI", () => {
  test("desktop: landing CTA exposes app download path", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/en/");
    await expect(
      page.getByRole("heading", { name: "Codebase ontology that grows with AI" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Download macOS app" })).toHaveAttribute(
      "href",
      "https://github.com/wlsdks/oh-my-ontology/releases",
    );
    await expect(page.getByRole("link", { name: "Installation guide" })).toHaveAttribute(
      "href",
      "/en/download/",
    );
  });

  test("desktop: ontology tree renders dogfood nodes", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text: string) => {
            (
              window as typeof window & {
                __lastCopiedAgentBriefing?: string;
              }
            ).__lastCopiedAgentBriefing = text;
          },
        },
        configurable: true,
      });
    });
    await page.goto("/en/ontology/");

    await expect(page.getByRole("heading", { name: "Ontology workbench" })).toBeAttached();
    await expect(page.getByTestId("ontology-command-bar")).toContainText("Ontology");
    await expect(page.getByLabel("Ontology hierarchy browse view")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByLabel("Ontology tree role and source status")).toContainText(
      "Concept map",
    );
    await expect(page.getByLabel(/Hierarchy notes/)).toContainText(
      "Hierarchy notes",
    );
    const projectionWarnings = page.locator("#tree-data-warnings");
    await expect(projectionWarnings).toBeVisible();
    await expect(projectionWarnings).toContainText("not a vault error");
    await expect(projectionWarnings).toContainText("The graph is still queryable");
    await expect(
      projectionWarnings.getByRole("link", { name: "Open query cockpit" }),
    ).toHaveAttribute("href", "/en/ontology/insights/");
    await expect(
      projectionWarnings.getByRole("link", { name: "Review in Save/edit" }),
    ).toHaveAttribute("href", "/en/ontology/edit/");
    await expect(
      projectionWarnings.getByRole("button", { name: "View projection notes" }),
    ).toBeVisible();
    await expect(
      projectionWarnings.getByRole("button", { name: /open details dialog/i }),
    ).toHaveCount(0);
    await projectionWarnings.getByRole("button", { name: "View projection notes" }).click();
    const projectionDialog = page.getByRole("dialog", {
      name: /tree projection notes/i,
    });
    await expect(projectionDialog).toBeVisible();
    await expect(projectionDialog.getByRole("tab", { name: "Summary" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await projectionDialog.getByRole("tab", { name: "Raw notes" }).click();
    await expect(projectionDialog).toContainText("Raw notes are emitted");
    await projectionDialog.getByRole("button", { name: "Close projection details" }).click();
    await expect(page.getByRole("link", { name: /Ontology insights/ })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Select oh-my-ontology; graph handle project:oh-my-ontology/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Select AI Agent Partner; graph handle domain:ai-agent-partner/ }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Concepts", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await page.getByTestId("agent-status-trigger").click();
    const agentStatus = page.getByTestId("agent-status-popover");
    await expect(agentStatus).toContainText("MCP connection");
    await expect(agentStatus).toContainText("readiness");
    await expect(agentStatus).toContainText("graph concepts");
    await expect(agentStatus).toContainText("start points");
    await expect(agentStatus.getByTestId("agent-setup-lanes")).toContainText("Claude Code");
    await expect(agentStatus.getByTestId("agent-setup-lanes")).toContainText(".mcp.json · /mcp");
    await expect(agentStatus.getByTestId("agent-setup-lanes")).toContainText("Codex");
    await expect(agentStatus.getByTestId("agent-setup-lanes")).toContainText(
      ".codex/config.toml · codex mcp list",
    );
    await agentStatus.getByRole("button", { name: "Copy agent briefing" }).click();
    await expect(agentStatus.getByTestId("agent-copy-feedback")).toContainText(
      "Agent briefing copied",
    );
    await expect(agentStatus.getByTestId("agent-copy-feedback")).toContainText(
      "Paste once into Claude Code or Codex",
    );
    const copiedAgentBriefing = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __lastCopiedAgentBriefing?: string;
          }
        ).__lastCopiedAgentBriefing,
    );
    expect(copiedAgentBriefing).toContain("# oh-my-ontology — agent onboarding brief");
    await expect(agentStatus.getByRole("button", { name: "Copy graph DB gate" })).toBeVisible();
    await expect(agentStatus).not.toContainText("AGENT CONNECTION");
    await expect(agentStatus).not.toContainText("entry");
    await expect(page.getByRole("link", { name: /Open Save\/edit/ })).toHaveAttribute(
      "href",
      "/en/ontology/edit/",
    );
    await expect(page.getByRole("link", { name: /Advanced canvas/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Work overview" }).click();
    const overview = page.getByRole("dialog", {
      name: "Ontology workbench primary actions",
    });
    await expect(overview).toBeVisible();
    await expect(overview.getByRole("link", { name: "Ontology hierarchy browse view" }))
      .toHaveAttribute("aria-current", "page");
    await expect(overview).toContainText("Browse");
    await expect(overview).toContainText("Write");
    await expect(overview).toContainText("Query");
    await expect(overview).not.toContainText("01");
    await expect(overview).not.toContainText("02");
    await expect(overview).not.toContainText("03");
  });

  test("mobile: ontology command bar keeps primary actions readable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/ontology/");

    const commandBar = page.getByTestId("ontology-command-bar");
    await expect(commandBar).toBeVisible();
    await expect(commandBar).toContainText("Work overview");
    await expect(commandBar).toContainText("Search");
    await expect(commandBar).toContainText("All");
    await expect(commandBar).toContainText("Insights");
    await expect(commandBar).toContainText("MCP setup");
    await expect(commandBar).toContainText("Open Save/edit");
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      )
      .toBe(0);
  });

  test("mobile: operations nav status does not overlap surface tabs", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/ontology/");

    const status = page.getByTestId("operations-mobile-status");
    const tabs = page.getByTestId("operations-mobile-tabs");
    await expect(status).toBeVisible();
    await expect(tabs).toBeVisible();
    await expect(tabs).toContainText("Source vault");
    await expect(tabs).toContainText("Ontology");
    await expect(tabs).toContainText("Topology");

    const [statusBox, tabsBox] = await Promise.all([status.boundingBox(), tabs.boundingBox()]);
    expect(statusBox).not.toBeNull();
    expect(tabsBox).not.toBeNull();
    if (!statusBox || !tabsBox) return;
    expect(statusBox.y + statusBox.height).toBeLessThanOrEqual(tabsBox.y);
    expect(tabsBox.x).toBeGreaterThanOrEqual(0);
    expect(tabsBox.x + tabsBox.width).toBeLessThanOrEqual(390);
  });

  test("mobile: projection warning actions stay readable and tappable", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/en/ontology/");

    const projectionWarnings = page.locator("#tree-data-warnings");
    await expect(projectionWarnings).toBeVisible();
    await expect(
      projectionWarnings.getByRole("button", { name: "View projection notes" }),
    ).toBeVisible();

    const queryCta = projectionWarnings.getByRole("link", { name: "Open query cockpit" });
    const builderCta = projectionWarnings.getByRole("link", { name: "Review in Save/edit" });
    await expect(queryCta).toHaveAttribute("href", "/en/ontology/insights/");
    await expect(builderCta).toHaveAttribute("href", "/en/ontology/edit/");

    await projectionWarnings.getByRole("button", { name: "View projection notes" }).click();
    const projectionDialog = page.getByRole("dialog", {
      name: /tree projection notes/i,
    });
    await expect(projectionDialog).toBeVisible();
    const overflowingNotes = await projectionDialog.locator("*").evaluateAll((els) => {
      const viewport = document.documentElement.clientWidth;
      return els
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            label: el.textContent || el.getAttribute("aria-label") || "",
            tag: el.tagName,
            left: rect.left,
            right: rect.right,
            width: rect.width,
            viewport,
          };
        })
        .filter(
          (item) =>
            item.width > 0.5 &&
            (item.left < -0.5 || item.right > item.viewport + 0.5),
        );
    });
    expect(overflowingNotes).toEqual([]);
    await projectionDialog.getByRole("button", { name: "Close projection details" }).click();

    const [panelBox, queryBox, builderBox] = await Promise.all([
      projectionWarnings.boundingBox(),
      queryCta.boundingBox(),
      builderCta.boundingBox(),
    ]);
    expect(panelBox).not.toBeNull();
    expect(queryBox).not.toBeNull();
    expect(builderBox).not.toBeNull();

    if (!panelBox || !queryBox || !builderBox) return;
    for (const box of [queryBox, builderBox]) {
      expect(box.x).toBeGreaterThanOrEqual(panelBox.x);
      expect(box.x + box.width).toBeLessThanOrEqual(panelBox.x + panelBox.width);
      expect(box.width).toBeGreaterThan(panelBox.width - 40);
    }
  });

  test("desktop: Korean ontology write CTA uses direct save/edit wording", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/ko/ontology/");

    await expect(page.getByRole("heading", { name: "개념 둘러보기" })).toBeAttached();
    await expect(page.getByRole("link", { name: /저장·편집 열기/ })).toHaveAttribute(
      "href",
      "/ko/ontology/edit/",
    );
    await expect(page.getByRole("link", { name: /고급 캔버스/ })).toHaveCount(0);
  });

  test("desktop: change panel copies an agent handoff when baseline has drift", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "demo:change-baseline:v1",
        JSON.stringify({
          v: 1,
          nodeSigs: [
            ["project:oh-my-ontology", "stale-project-signature"],
            ["domain:removed-by-agent", "removed-domain-signature"],
          ],
          nodeKinds: [
            ["project:oh-my-ontology", "project"],
            ["domain:removed-by-agent", "domain"],
          ],
          edgeKeys: [],
          takenAt: Date.now() - 60_000,
        }),
      );
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text: string) => {
            (
              window as typeof window & {
                __lastCopiedChangeHandoff?: string;
              }
            ).__lastCopiedChangeHandoff = text;
          },
        },
        configurable: true,
      });
    });

    await page.goto("/en/ontology/");

    const changePanel = page.getByTestId("ontology-change-panel");
    await expect(changePanel).toBeVisible();
    await expect(changePanel.getByTestId("change-summary")).toContainText(/edited|removed/);
    await changePanel.getByRole("button", { name: "Copy ontology changes for Claude Code or Codex" }).click();
    await expect(changePanel).toContainText("Agent handoff copied");
    const copied = await page.evaluate(
      () => (window as typeof window & { __lastCopiedChangeHandoff?: string }).__lastCopiedChangeHandoff,
    );
    expect(copied).toContain("Context Atlas ontology change handoff");
    expect(copied).toContain("query_ontology({ operation: \"health\"");
    expect(copied).toContain("Post-change sync gate:");
  });

  test("mobile: change panel keeps concept tree reachable on first entry", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "demo:change-baseline:v1",
        JSON.stringify({
          v: 1,
          nodeSigs: [
            ["project:oh-my-ontology", "stale-project-signature"],
            ["domain:removed-by-agent", "removed-domain-signature"],
          ],
          nodeKinds: [
            ["project:oh-my-ontology", "project"],
            ["domain:removed-by-agent", "domain"],
          ],
          edgeKeys: [],
          takenAt: Date.now() - 60_000,
        }),
      );
    });

    await page.goto("/en/ontology/");

    const changePanel = page.getByTestId("ontology-change-panel");
    await expect(changePanel).toBeVisible();
    await expect(changePanel.getByTestId("change-panel-chip-scroll")).toHaveCSS(
      "overflow-y",
      "auto",
    );
    const panelBox = await changePanel.boundingBox();
    expect(panelBox?.height).toBeLessThanOrEqual(270);
    await expect(page.getByRole("region", { name: "Ontology tree role and source status" })).toBeInViewport();
    await expect(page.getByRole("searchbox", { name: "Search concept tree" })).toBeInViewport();
  });

  test("desktop: selected-node brief hands off to topology and builder", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text: string) => {
            (
              window as typeof window & {
                __lastCopiedReviewBrief?: string;
              }
            ).__lastCopiedReviewBrief = text;
          },
        },
        configurable: true,
      });
    });
    await page.goto("/en/ontology/?node=capability%3Atopology-analysis-modes");

    const detail = page.getByTestId("ontology-node-detail");
    await expect(detail).toBeVisible();
    await expect(detail).toContainText("Topology Analysis Modes");
    const handoffNav = detail.getByRole("navigation", {
      name: "Selected node workbench handoffs",
    });
    await expect(handoffNav).toBeVisible();
    await expect(handoffNav).toContainText("Browse");
    await expect(handoffNav).toContainText("Write");
    await expect(handoffNav).toContainText("Query");
    await expect(handoffNav).not.toContainText("01");
    await expect(handoffNav).not.toContainText("02");
    await expect(handoffNav).not.toContainText("03");
    await page.getByRole("button", { name: "Work overview" }).click();
    await expect(page.getByText("active concept · capabilities/topology-analysis-modes")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Graph DB query pack insights" })).toHaveAttribute(
      "href",
      "/en/ontology/insights/?node=capabilities%2Ftopology-analysis-modes",
    );
    await page.getByRole("button", { name: "Close ontology work overview" }).click();

    const brief = page.getByTestId("ontology-review-brief");
    await detail.getByText("Review lens · agent checks").click();
    await detail.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await expect(brief).toBeVisible();
    await expect(brief).toContainText("Collaborator brief");
    await expect(brief).toContainText("Review questions");
    await expect(brief).toContainText("Change impact");
    await expect(detail).toContainText("Direct relation preview");
    await expect(brief.getByRole("link", { name: "Open topology" })).toHaveAttribute(
      "href",
      /\/en\/topology\/\?mode=focus&p=capability%3Atopology-analysis-modes/,
    );
    await expect(brief.getByRole("link", { name: "Focus in Save/edit" })).toHaveAttribute(
      "href",
      /\/en\/ontology\/edit\/\?node=capabilities%2Ftopology-analysis-modes/,
    );
    await expect(brief.getByRole("link", { name: "Open query cockpit" })).toHaveAttribute(
      "href",
      /\/en\/ontology\/insights\/?/,
    );
    await expect(
      brief.getByRole("button", { name: "Copy MCP check" }),
    ).toBeVisible();
    await expect(
      brief.getByRole("button", { name: "Copy CLI check" }),
    ).toBeVisible();
    await expect(
      brief.getByRole("button", { name: "Copy MCP impact" }),
    ).toBeVisible();
    await expect(
      brief.getByRole("button", { name: "Copy CLI impact" }),
    ).toBeVisible();
    await expect(
      brief.getByRole("button", { name: "Copy sync gate" }),
    ).toBeVisible();
    await expect(
      brief.getByRole("button", { name: "Copy vocabulary" }),
    ).toBeVisible();

    await brief.getByRole("button", { name: "Copy", exact: true }).click();
    const copiedBrief = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __lastCopiedReviewBrief?: string;
          }
        ).__lastCopiedReviewBrief,
    );
    expect(copiedBrief).toContain("# Topology Analysis Modes");
    expect(copiedBrief).toContain("## Review questions");
    expect(copiedBrief).toContain("## Change impact");
    expect(copiedBrief).toContain("## Direct relation preview");
    expect(copiedBrief).toMatch(/- (out|in) · [a-z_]+ · .+ \(.+, .+\)/);
    expect(copiedBrief).toContain(
      "- Topology focus: /topology/?mode=focus&p=capability%3Atopology-analysis-modes",
    );
    expect(copiedBrief).toContain(
      "- Builder: /ontology/edit/?node=capabilities%2Ftopology-analysis-modes",
    );
    expect(copiedBrief).toContain("- Query cockpit: /ontology/insights/");
    expect(copiedBrief).toContain(
      '- MCP check: query_ontology({"operation":"node_profile","slug":"capabilities/topology-analysis-modes","limit":8})',
    );
    expect(copiedBrief).toContain(
      "- CLI check: oh-my-ontology node capabilities/topology-analysis-modes --limit 8",
    );
    expect(copiedBrief).toContain(
      '- Impact MCP check: query_ontology({"operation":"blast_radius","slug":"capabilities/topology-analysis-modes","depth":2,"direction":"incoming"})',
    );
    await brief.getByRole("button", { name: "Copy vocabulary" }).click();
    const copiedVocabulary = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __lastCopiedReviewBrief?: string;
          }
        ).__lastCopiedReviewBrief,
    );
    expect(copiedVocabulary).toContain("# Review vocabulary: Topology Analysis Modes");
    expect(copiedVocabulary).toContain("## Meaning to keep");
    expect(copiedVocabulary).toContain("## Reuse context");
    expect(copiedVocabulary).toContain("## Relation anchors");
    expect(copiedVocabulary).toContain("- Open query cockpit: /ontology/insights/");
    await brief.getByRole("button", { name: "Copy MCP impact" }).click();
    const copiedImpactMcp = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __lastCopiedReviewBrief?: string;
          }
        ).__lastCopiedReviewBrief,
    );
    expect(copiedImpactMcp).toBe(
      'query_ontology({"operation":"blast_radius","slug":"capabilities/topology-analysis-modes","depth":2,"direction":"incoming"})',
    );
    await brief.getByRole("button", { name: "Copy sync gate" }).click();
    const copiedSyncGate = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __lastCopiedReviewBrief?: string;
          }
        ).__lastCopiedReviewBrief,
    );
    expect(copiedSyncGate).toContain("# Post-change ontology sync gate");
    expect(copiedSyncGate).toContain('"operation": "health"');
    expect(copiedSyncGate).toContain('"operation": "maintenance_plan"');
    expect(copiedSyncGate).toContain("oh-my-ontology validate [vault]");
  });

  test("mobile: selected-node sheet exposes direct relation evidence", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text: string) => {
            (
              window as typeof window & {
                __lastCopiedProofCheck?: string;
              }
            ).__lastCopiedProofCheck = text;
          },
        },
        configurable: true,
      });
    });
    await page.goto("/en/ontology/?node=capability%3Aagent-graph-readiness");

    const detail = page.getByTestId("ontology-node-detail");
    await expect(detail).toBeVisible();
    const detailBottomPadding = await detail.evaluate((element) =>
      window.getComputedStyle(element).paddingBottom,
    );
    expect(Number.parseFloat(detailBottomPadding)).toBeGreaterThanOrEqual(16);

    const signalRail = detail.getByTestId("ontology-signal-rail");
    await expect(signalRail).toBeVisible();
    await expect(signalRail).toContainText("Ontology object");
    await expect(signalRail.getByTestId("ontology-signal-lens")).toContainText("User-visible capability");
    await expect(signalRail.getByTestId("ontology-signal-relations")).toContainText("Relations");
    await expect(signalRail.getByTestId("ontology-signal-relations")).toContainText("out 12 · in 2");
    await expect(signalRail.getByTestId("ontology-signal-agent")).toContainText("Agent proof");
    await expect(signalRail.getByTestId("ontology-signal-agent")).toContainText("Claude/Codex");
    await expect(signalRail.getByTestId("ontology-signal-agent")).toContainText("Claude/Codex MCP order");
    await expect(signalRail.getByTestId("ontology-signal-agent")).toHaveAttribute(
      "title",
      "Claude/Codex proof",
    );
    await expect(signalRail.getByTestId("ontology-signal-agent")).toBeInViewport();

    const proofPath = detail.getByTestId("ontology-proof-path");
    await expect(proofPath).toContainText("Read");
    await expect(proofPath).toContainText("Impact");
    await expect(proofPath).toContainText("Guard");
    await expect(proofPath).toContainText("Sync");
    await expect(proofPath).toContainText("node_profile");
    await expect(proofPath).toContainText("blast_radius");
    await expect(proofPath).toContainText("all_paths");
    await expect(proofPath).toContainText("health");
    await expect(proofPath.getByTestId("ontology-proof-step-label-profile")).toHaveCSS(
      "letter-spacing",
      "0.18px",
    );
    const guardProofButton = proofPath.getByRole("button", {
      name: /Guard · all_paths \+ check/,
    });
    await expect(guardProofButton).toBeVisible();
    await guardProofButton.click();
    const proofCopyFeedback = proofPath.getByTestId("ontology-proof-copy-feedback");
    await expect(proofCopyFeedback).toContainText("Copied all_paths + check payload");
    await expect(proofCopyFeedback).toContainText(
      "Ask Claude/Codex to choose target + relation · target capabilities/agent-graph-readiness",
    );
    await expect(proofCopyFeedback).toHaveAttribute(
      "title",
      "Ask Claude/Codex to choose target + relation · target capabilities/agent-graph-readiness",
    );
    const proofCopyFeedbackBody = proofCopyFeedback.getByTestId(
      "ontology-proof-copy-feedback-body",
    );
    await expect(proofCopyFeedbackBody).toHaveCSS("text-transform", "none");
    await expect(proofCopyFeedback).toHaveAttribute("data-proof-step", "guard");
    await expect(proofCopyFeedback).toHaveAttribute("data-proof-command", "all_paths + check");
    await expect(proofCopyFeedback).toHaveAttribute(
      "data-proof-target",
      "capabilities/agent-graph-readiness",
    );
    await expect(proofCopyFeedback).toHaveAttribute(
      "data-proof-next-action",
      "Ask Claude/Codex to choose target + relation",
    );
    await expect(proofCopyFeedback).toHaveAttribute("role", "status");
    await expect(proofCopyFeedback).toHaveAttribute("aria-live", "polite");
    const copiedProofCheck = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __lastCopiedProofCheck?: string;
          }
        ).__lastCopiedProofCheck,
    );
    expect(copiedProofCheck).toContain('"operation":"query_plan"');
    expect(copiedProofCheck).toContain('"targetOperation":"all_paths"');
    expect(copiedProofCheck).toContain('"operation":"relation_check"');
    await proofPath.getByRole("button", { name: "Copy selected-node proof packet" }).click();
    await expect(proofCopyFeedback).toContainText("Copied full proof packet");
    await expect(proofCopyFeedback).toHaveAttribute("data-proof-step", "packet");
    await expect(proofCopyFeedback).toHaveAttribute(
      "data-proof-command",
      "node_profile + blast_radius + all_paths + health",
    );
    await expect(proofCopyFeedback).toHaveAttribute(
      "data-proof-target",
      "capabilities/agent-graph-readiness",
    );
    await expect(proofCopyFeedback).toHaveAttribute(
      "data-proof-next-action",
      "Paste into Claude/Codex",
    );
    await page.waitForTimeout(1700);
    await expect(proofCopyFeedback).toContainText("Copied full proof packet");
    await expect(proofCopyFeedback).toContainText(
      "Paste into Claude/Codex · target capabilities/agent-graph-readiness",
    );

    const relationPreview = detail.getByTestId("ontology-relation-preview");
    await expect(relationPreview).toBeVisible();
    await expect(relationPreview).toContainText("Direct relation preview");
    await expect(relationPreview).toContainText("out 12 · in 2");
    await expect(relationPreview).toContainText("source · agent-graph-readiness");
    await expect(relationPreview).toContainText("types · Contains 8 +2");

    const sourceChip = relationPreview.getByRole("link", {
      name: "source · capabilities/agent-graph-readiness",
    });
    await expect(sourceChip).toBeInViewport();
    await expect(sourceChip).toHaveAttribute(
      "data-source-slug",
      "capabilities/agent-graph-readiness",
    );
    await expect(sourceChip).toHaveAttribute(
      "title",
      "source · capabilities/agent-graph-readiness",
    );
    await expect(relationPreview.getByTestId("ontology-relation-type-chip")).toHaveAttribute(
      "title",
      "types · Contains 8, Related to 5, Depends on 1",
    );

    const relationRows = relationPreview.getByRole("button");
    const firstRelation = relationRows.first();
    const secondRelation = relationRows.nth(1);
    const thirdRelation = relationRows.nth(2);
    await expect(firstRelation).toBeVisible();
    await expect(secondRelation).toBeVisible();
    await expect(thirdRelation).toBeVisible();
    await expect(firstRelation).toBeInViewport();
    await expect(secondRelation).toBeInViewport();
    await expect(thirdRelation).toBeInViewport();
    await expect(firstRelation).toHaveAttribute("data-direction", "outgoing");
    await expect(firstRelation).toHaveAttribute("data-node-id", "element:insights-query-cockpit");
    await expect(firstRelation).toHaveAttribute("data-relation-type", "contains");
    await expect(thirdRelation).toContainText("agent-query-recipes.ts");
    await expect(thirdRelation).toHaveAttribute(
      "title",
      /src\/shared\/lib\/ontology-tree\/agent-query-recipes\.ts/,
    );

    const [detailBox, relationBox, secondRelationBox, thirdRelationBox, viewport] = await Promise.all([
      detail.boundingBox(),
      firstRelation.boundingBox(),
      secondRelation.boundingBox(),
      thirdRelation.boundingBox(),
      page.viewportSize(),
    ]);

    expect(detailBox, "detail sheet should have a layout box").not.toBeNull();
    expect(relationBox, "first relation row should have a layout box").not.toBeNull();
    expect(secondRelationBox, "second relation row should have a layout box").not.toBeNull();
    expect(thirdRelationBox, "third relation row should have a layout box").not.toBeNull();
    expect(viewport, "viewport should be known").not.toBeNull();
    expect(relationBox!.y + relationBox!.height).toBeLessThanOrEqual(
      viewport!.height,
    );
    expect(secondRelationBox!.y + secondRelationBox!.height).toBeLessThanOrEqual(
      viewport!.height,
    );
    expect(thirdRelationBox!.y + thirdRelationBox!.height).toBeLessThanOrEqual(
      viewport!.height,
    );
    expect(relationBox!.y).toBeGreaterThanOrEqual(detailBox!.y);
    expect(relationBox!.y + relationBox!.height).toBeLessThanOrEqual(
      detailBox!.y + detailBox!.height,
    );
    expect(secondRelationBox!.y).toBeGreaterThanOrEqual(detailBox!.y);
    expect(secondRelationBox!.y + secondRelationBox!.height).toBeLessThanOrEqual(
      detailBox!.y + detailBox!.height,
    );
    expect(thirdRelationBox!.y).toBeGreaterThanOrEqual(detailBox!.y);
    expect(thirdRelationBox!.y + thirdRelationBox!.height).toBeLessThanOrEqual(
      detailBox!.y + detailBox!.height,
    );

    await detail.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await expect(detail.getByRole("button", { name: "Close" })).toBeInViewport();
  });

  test("desktop: insights exposes agent graph readiness", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text: string) => {
            (window as typeof window & { __lastCopiedAgentText?: string }).__lastCopiedAgentText =
              text;
          },
        },
        configurable: true,
      });
    });
    await page.goto("/en/ontology/insights/");

    await expect(page.getByText("A query surface for validating the local markdown graph")).toBeVisible();
    await expect(page.getByText("Whether this graph is ready for an AI agent")).toBeVisible();

    const queryCockpit = page.getByTestId("insights-query-cockpit");
    await expect(queryCockpit).toBeVisible();
    await expect(queryCockpit).toContainText("Run the local graph like a small database");
    const proofRail = page.getByTestId("insights-query-proof-rail");
    await expect(proofRail).toContainText("Readiness");
    await expect(proofRail).toContainText("/100");
    await expect(proofRail).toContainText("Pack");
    await expect(proofRail).toContainText("scans");
    await expect(proofRail).toContainText("MCP");
    await expect(proofRail).toContainText("calls");
    await expect(proofRail).toContainText("Runtime gate");
    await expect(proofRail).toContainText("checks");
    await expect(queryCockpit).toContainText("CLI");
    await expect(queryCockpit).toContainText("Next");
    await expect(queryCockpit).toContainText("Copy the CLI pack for terminal fallback");
    await expect(queryCockpit).toContainText("Show validation flow");
    await queryCockpit.getByRole("tab", { name: "Run" }).click();
    await expect(queryCockpit).toContainText("MATCH graph RETURN");
    await queryCockpit.getByRole("tab", { name: "Result criteria" }).click();
    await expect(queryCockpit).toContainText("Scan contract");
    await expect(queryCockpit).toContainText("totalMatches");
    await expect(queryCockpit).toContainText("Path contract");
    await expect(queryCockpit).toContainText("evidence.pathsComplete");
    await expect(queryCockpit).toContainText("self-check + health gate");
    await expect(queryCockpit).toContainText("health.status");
    await queryCockpit.getByRole("button", { name: "Copy CLI pack" }).click();
    const copiedCockpitCliPack = await page.evaluate(
      () => (window as typeof window & { __lastCopiedAgentText?: string }).__lastCopiedAgentText,
    );
    expect(copiedCockpitCliPack).toContain("oh-my-ontology agent-brief [vault] --verify-fallbacks");
    expect(copiedCockpitCliPack).toContain("oh-my-ontology match-nodes [vault] --plan");
    await queryCockpit.getByRole("button", { name: "Copy graph DB pack" }).click();
    const copiedCockpitMcpPack = await page.evaluate(
      () => (window as typeof window & { __lastCopiedAgentText?: string }).__lastCopiedAgentText,
    );
    expect(copiedCockpitMcpPack).toContain('"operation": "facets"');
    expect(copiedCockpitMcpPack).toContain('"operation": "all_paths"');

    await page.getByRole("tab", { name: "Collaborate" }).click();
    const collaboratorBrief = page.getByTestId("insights-collaborator-brief");
    await expect(collaboratorBrief).toBeVisible();
    await expect(collaboratorBrief).toContainText("Collaborator insight brief");
    await expect(
      collaboratorBrief.getByRole("tablist", { name: "Collaborator brief sections" }),
    ).toBeVisible();
    await expect(collaboratorBrief.getByRole("tab", { name: "Decision" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(collaboratorBrief.getByTestId("insights-collaborator-decision-lane")).toBeVisible();
    await expect(collaboratorBrief).toContainText("Expected decision");
    await expect(collaboratorBrief).toContainText("Graph handoff");
    await expect(collaboratorBrief.getByTestId("insights-collaborator-review-questions")).toHaveCount(0);
    await expect(collaboratorBrief.getByTestId("insights-collaborator-impact-handoffs")).toHaveCount(0);

    await collaboratorBrief.getByRole("tab", { name: "Evidence" }).click();
    await expect(collaboratorBrief.getByRole("tab", { name: "Evidence" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(collaboratorBrief.getByTestId("insights-collaborator-review-questions")).toBeVisible();
    await expect(collaboratorBrief).toContainText("Review questions");
    await expect(
      collaboratorBrief.getByTestId("insights-collaborator-impact-handoffs"),
    ).toBeVisible();
    await expect(collaboratorBrief).toContainText("Impact handoff");
    await expect(collaboratorBrief.getByRole("link", { name: "Path" }).first()).toBeVisible();
    await expect(collaboratorBrief.getByRole("link", { name: "Ontology" }).first()).toBeVisible();
    await expect(collaboratorBrief.getByRole("link", { name: "Topology" }).first()).toBeVisible();
    await expect(collaboratorBrief.getByRole("link", { name: "Save/edit" }).first()).toBeVisible();

    await collaboratorBrief.getByRole("tab", { name: "Action" }).click();
    await expect(collaboratorBrief.getByTestId("insights-collaborator-meeting-agenda")).toBeVisible();
    await expect(collaboratorBrief).toContainText("Meeting agenda");
    await expect(
      collaboratorBrief.getByRole("button", { name: "Copy CLI check" }),
    ).toBeVisible();
    await expect(
      collaboratorBrief.getByRole("button", { name: "Copy MCP check" }),
    ).toBeVisible();
    await expect(
      collaboratorBrief.getByRole("button", { name: "Copy vocabulary review" }),
    ).toBeVisible();
    await collaboratorBrief.getByRole("button", { name: "Copy collaborator brief" }).click();
    const copiedCollaboratorBrief = await page.evaluate(
      () => (window as typeof window & { __lastCopiedAgentText?: string }).__lastCopiedAgentText,
    );
    expect(copiedCollaboratorBrief).toContain("# Collaborator insight brief");
    expect(copiedCollaboratorBrief).toContain("## Review focus");
    expect(copiedCollaboratorBrief).toContain("## Decision lane");
    expect(copiedCollaboratorBrief).toContain("- Expected decision:");
    expect(copiedCollaboratorBrief).toContain("- Next graph step:");
    expect(copiedCollaboratorBrief).toContain("- Graph handoff:");
    expect(copiedCollaboratorBrief).toContain("## Review questions");
    expect(copiedCollaboratorBrief).toContain("## Hub handoff");
    expect(copiedCollaboratorBrief).toContain("## Impact handoff");
    expect(copiedCollaboratorBrief).toContain("/topology/?mode=path&pathFrom=");
    expect(copiedCollaboratorBrief).toContain(
      "- Impact CLI check: oh-my-ontology domain-matrix [vault] --limit 6 --types depends_on,relates,describes",
    );
    expect(copiedCollaboratorBrief).toContain("- Impact MCP check:");
    expect(copiedCollaboratorBrief).toContain('query_ontology({"operation":"domain_matrix"');
    expect(copiedCollaboratorBrief).toContain("/topology/?mode=focus&p=");
    expect(copiedCollaboratorBrief).toContain("/ontology/edit/?node=");
    expect(copiedCollaboratorBrief).toMatch(
      /Align naming around the top hubs|Trace cross-domain impact|Resolve open ownership questions/,
    );
    expect(copiedCollaboratorBrief).toContain(
      "- CLI check: oh-my-ontology workspace-brief [vault] --limit 5",
    );
    expect(copiedCollaboratorBrief).toContain(
      '- MCP check: query_ontology({"operation":"workspace_brief","limit":5})',
    );
    await collaboratorBrief.getByRole("button", { name: "Copy vocabulary review" }).click();
    const copiedVocabularyReview = await page.evaluate(
      () => (window as typeof window & { __lastCopiedAgentText?: string }).__lastCopiedAgentText,
    );
    expect(copiedVocabularyReview).toContain("# Review vocabulary");
    expect(copiedVocabularyReview).toContain("## Decision lane");
    expect(copiedVocabularyReview).toContain("## Review questions");
    expect(copiedVocabularyReview).toContain("## Hub handoff");
    expect(copiedVocabularyReview).not.toContain("## Handoff");
    expect(copiedVocabularyReview).not.toContain("- MCP check:");
    await collaboratorBrief.getByRole("button", { name: "Copy MCP check" }).click();
    const copiedCollaboratorMcpCheck = await page.evaluate(
      () => (window as typeof window & { __lastCopiedAgentText?: string }).__lastCopiedAgentText,
    );
    expect(copiedCollaboratorMcpCheck).toBe(
      'query_ontology({"operation":"workspace_brief","limit":5})',
    );

    await page.getByRole("tab", { name: "Agent" }).click();
    const panel = page.getByTestId("insights-agent-readiness");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Agent graph readiness");
    await expect(panel).toContainText("Ready");
    await expect(panel).toContainText("Recommended next actions");
    await expect(panel).toContainText("workspace_brief");
    await expect(panel.getByRole("button", { name: "Copy sync gate" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Copy repair prompt" })).toBeVisible();
    await panel.getByRole("button", { name: "Copy sync gate" }).click();
    const copiedSyncGate = await page.evaluate(
      () => (window as typeof window & { __lastCopiedAgentText?: string }).__lastCopiedAgentText,
    );
    expect(copiedSyncGate).toContain("# Post-change ontology sync gate");
    expect(copiedSyncGate).toContain("## Run when");
    expect(copiedSyncGate).toContain(
      "a domain, capability, element, or relation was introduced, renamed, split, merged, or made more explicit",
    );
    expect(copiedSyncGate).toContain('"operation": "health"');
    expect(copiedSyncGate).toContain('"operation": "cycles"');
    expect(copiedSyncGate).toContain('"operation": "growth_plan"');
    expect(copiedSyncGate).toContain('"operation": "maintenance_plan"');
    expect(copiedSyncGate).toContain('"tool": "validate_vault"');
    expect(copiedSyncGate).toContain("oh-my-ontology validate [vault]");
    const readinessCli = page.getByTestId("insights-agent-readiness-cli");
    await expect(readinessCli).toBeVisible();
    await expect(readinessCli).toContainText("Terminal fallback");
    await expect(readinessCli).toContainText("oh-my-ontology agent-brief [vault]");
    await expect(readinessCli).toContainText("oh-my-ontology agent-brief [vault] --graph-db-pack");
    await expect(readinessCli).toContainText(
      "oh-my-ontology agent-brief [vault] --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4",
    );
    await expect(readinessCli).toContainText("oh-my-ontology workspace-brief [vault]");
    await expect(readinessCli).toContainText("oh-my-ontology cycles [vault] --max-hops 8");
    await expect(readinessCli).toContainText("oh-my-ontology growth [vault] --limit 20");
    await expect(readinessCli).toContainText("oh-my-ontology maintenance [vault] --limit 20");
    await readinessCli.getByRole("button", { name: "Copy CLI checks" }).click();
    const copiedReadinessCli = await page.evaluate(
      () => (window as typeof window & { __lastCopiedAgentText?: string }).__lastCopiedAgentText,
    );
    expect(copiedReadinessCli).toContain("oh-my-ontology agent-brief [vault]");
    expect(copiedReadinessCli).toContain("oh-my-ontology agent-brief [vault] --graph-db-pack");
    expect(copiedReadinessCli).toContain(
      "oh-my-ontology agent-brief [vault] --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4",
    );
    expect(copiedReadinessCli).toContain("oh-my-ontology cycles [vault] --max-hops 8");
    expect(copiedReadinessCli).toContain("oh-my-ontology growth [vault] --limit 20");
    expect(copiedReadinessCli).toContain("oh-my-ontology maintenance [vault] --limit 20");
    expect(copiedReadinessCli).toContain("oh-my-ontology validate [vault]");

    await page.getByRole("tab", { name: "Distribution" }).click();
    const domainCoupling = page.getByTestId("insights-domain-coupling");
    await expect(domainCoupling).toBeVisible();
    await expect(page.getByText("Domain coupling matrix")).toBeVisible();
    await expect(domainCoupling).toContainText("Cross");
    await expect(domainCoupling).toContainText("Inside");
    await expect(domainCoupling).toContainText("Unassigned");
    await expect(domainCoupling).toContainText("Re-run this semantic matrix");
    const domainCouplingPathLink = domainCoupling.getByRole("link", { name: "Path" }).first();
    await expect(domainCouplingPathLink).toBeVisible();
    await expect(domainCouplingPathLink).toHaveAttribute(
      "href",
      /\/en\/topology\/\?mode=path&pathFrom=.+&pathTo=.+/,
    );
    await domainCoupling.getByRole("button", { name: "Copy path check" }).first().click();
    const copiedPathCheck = await page.evaluate(
      () => (window as typeof window & { __lastCopiedAgentText?: string }).__lastCopiedAgentText,
    );
    expect(copiedPathCheck).toContain("# Domain coupling path check");
    expect(copiedPathCheck).toContain("/topology/?mode=path&pathFrom=");
    expect(copiedPathCheck).toContain("oh-my-ontology all-paths");
    expect(copiedPathCheck).toContain('query_ontology({"operation":"query_plan"');
    expect(copiedPathCheck).toContain('"targetOperation":"all_paths"');
    expect(copiedPathCheck).toContain('query_ontology({"operation":"all_paths"');
    expect(copiedPathCheck).toContain("evidence.pathsComplete");
    await domainCoupling.getByRole("button", { name: "Copy CLI matrix" }).click();
    const copiedCli = await page.evaluate(
      () => (window as typeof window & { __lastCopiedAgentText?: string }).__lastCopiedAgentText,
    );
    expect(copiedCli).toContain(
      "oh-my-ontology domain-matrix [vault] --limit 6 --types depends_on,relates,describes",
    );
    await domainCoupling.getByRole("button", { name: "Copy MCP check" }).click();
    const copiedMcp = await page.evaluate(
      () => (window as typeof window & { __lastCopiedAgentText?: string }).__lastCopiedAgentText,
    );
    expect(copiedMcp).toContain('query_ontology({"operation":"domain_matrix"');
    expect(copiedMcp).toContain('"relates"');

    await page.getByRole("tab", { name: "Agent" }).click();
    const recipes = page.getByTestId("insights-agent-query-recipes");
    await expect(recipes).toBeVisible();
    await expect(recipes).toContainText("Agent handoff prompt");
    await recipes.getByRole("button", { name: "Copy handoff" }).click();
    await expect(recipes.getByRole("button", { name: "Copied" })).toBeVisible();
    const copiedText = await page.evaluate(
      () => (window as typeof window & { __lastCopiedAgentText?: string }).__lastCopiedAgentText,
    );
    expect(copiedText).toContain("Use the oh-my-ontology MCP server");
    expect(copiedText).toContain("query_ontology");
    await expect(recipes.getByTestId("insights-agent-run-order")).toContainText("Run order");
    await expect(recipes.getByTestId("insights-agent-run-order")).toContainText("agent_brief");
    await expect(recipes.getByTestId("insights-agent-run-order")).toContainText("node_profile");
    await expect(recipes.getByTestId("insights-agent-run-order")).toContainText(
      "oh-my-ontology agent-brief",
    );
    await expect(recipes.getByTestId("insights-agent-run-order")).toContainText(
      "oh-my-ontology node",
    );
    await expect(recipes.getByTestId("insights-agent-run-order")).toContainText(
      "oh-my-ontology blast-radius",
    );
    await expect(recipes.getByTestId("insights-agent-traversal-contract")).toContainText(
      "all_paths result contract",
    );
    await expect(recipes.getByTestId("insights-agent-traversal-contract")).toContainText(
      "totalPathsExact",
    );
    await expect(recipes.getByTestId("insights-agent-traversal-contract")).toContainText(
      "evidence.status",
    );
    await expect(recipes.getByTestId("insights-agent-traversal-contract")).toContainText(
      "evidence.pathsComplete",
    );
    await expect(recipes.getByTestId("insights-agent-traversal-contract")).toContainText(
      "budget-truncated",
    );
    await expect(recipes.getByTestId("insights-agent-recipe-stats")).toContainText("Primary");
    await expect(recipes.getByTestId("insights-agent-recipe-stats")).toContainText("Playbooks");
    await expect(recipes.getByTestId("insights-agent-recipe-stats")).toContainText("Gates");
    await expect(recipes).toContainText("Suggested starting slugs");
    await expect(recipes.getByTestId("insights-agent-entrypoints")).toContainText("project");
    await expect(recipes.getByTestId("insights-agent-entrypoints")).toContainText(
      "project:oh-my-ontology · project",
    );
    await expect(recipes).toContainText("Investigation playbooks");
    await expect(recipes.getByTestId("insights-agent-traversal-strategy")).toContainText(
      "Traversal strategy",
    );
    await expect(recipes.getByTestId("insights-agent-traversal-strategy")).toContainText(
      "plan_before_enumeration",
    );
    await expect(recipes.getByTestId("insights-agent-traversal-strategy")).toContainText(
      "bounded_path_evidence",
    );
    await expect(recipes.getByTestId("insights-agent-traversal-strategy")).toContainText(
      "containment_cross_check",
    );
    await expect(recipes.getByTestId("insights-agent-traversal-strategy")).toContainText(
      "query_plan",
    );
    await expect(recipes.getByTestId("insights-agent-traversal-strategy")).toContainText(
      "project_map",
    );
    const playbookPanel = recipes.getByTestId("insights-agent-playbooks");
    await expect(recipes).toContainText("Refactor impact");
    await expect(recipes).toContainText("Coupling audit");
    await expect(recipes).toContainText("Graph traversal");
    await expect(recipes.getByTestId("insights-agent-traversal-guard").first()).toContainText(
      "Traversal guard",
    );
    await expect(recipes).toContainText("budget 1000");
    await expect(recipes).toContainText("report evidence.status");
    await expect(recipes).toContainText("check pathsComplete");
    await expect(recipes.getByTestId("insights-agent-result-contracts")).toContainText(
      "match_nodes / match_edges scan contract",
    );
    await expect(recipes.getByTestId("insights-agent-scan-contract")).toContainText(
      "totalMatches",
    );
    await expect(recipes.getByTestId("insights-agent-scan-contract")).toContainText(
      "followUp",
    );
    await expect(recipes.getByTestId("insights-agent-scan-contract")).toContainText(
      "relation_check",
    );
    await expect(playbookPanel.getByRole("tab")).toHaveCount(4);
    await expect(playbookPanel).toContainText("CLI command");
    await expect(playbookPanel).toContainText("oh-my-ontology blast-radius");
    await playbookPanel.getByRole("tab", { name: /Onboarding map/ }).click();
    await expect(playbookPanel).toContainText("workspace_brief");
    await expect(playbookPanel).toContainText("domain_matrix");
    await expect(playbookPanel).toContainText("oh-my-ontology match-nodes [vault] --plan");
    await expect(playbookPanel).toContainText("oh-my-ontology match-nodes");
    await playbookPanel.getByRole("tab", { name: /Coupling audit/ }).click();
    await expect(playbookPanel).toContainText("oh-my-ontology hubs");
    await expect(playbookPanel).toContainText("oh-my-ontology match-edges [vault] --plan");
    await expect(playbookPanel).toContainText("oh-my-ontology match-edges");
    await playbookPanel.getByRole("tab", { name: /Graph traversal/ }).click();
    await expect(playbookPanel).toContainText("maxHops 3");
    await expect(playbookPanel).toContainText("oh-my-ontology all-paths");
    await expect(playbookPanel).toContainText("oh-my-ontology pattern-walk");
    await expect(playbookPanel).toContainText("oh-my-ontology project-map");
    await expect(recipes.getByTestId("insights-agent-graph-db-self-check")).toContainText(
      "oh-my-ontology agent-brief [vault] --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4",
    );
    await expect(recipes.getByTestId("insights-agent-graph-db-self-check")).toContainText(
      "pnpm dogfood:graph-db",
    );
    const graphDbModeGuide = recipes.getByTestId("insights-agent-graph-db-mode-guide");
    await expect(graphDbModeGuide).toContainText("CLI-only");
    await expect(graphDbModeGuide).toContainText("MCP-connected");
    await expect(graphDbModeGuide).toContainText("Graph DB pack");
    await expect(graphDbModeGuide).toContainText("Setup gate");
    await expect(graphDbModeGuide).toContainText("performanceOk");
    await expect(recipes).toContainText("--plan");
    await expect(recipes).toContainText("blast_radius");
    await expect(recipes).toContainText("all_paths");
    await expect(recipes).toContainText("pattern_walk");
    await expect(recipes).toContainText("match_nodes");
    await expect(recipes).toContainText("match_edges");
    await expect(playbookPanel.getByRole("button", { name: "Copy playbook" })).toBeVisible();
    await expect(recipes.getByRole("button", { name: "Copy strategy" })).toHaveCount(3);
    await expect(recipes.getByRole("button", { name: "Copy traversal packet" })).toBeVisible();
    await expect(recipes).toContainText("5 MCP calls");
    await expect(recipes).toContainText("MCP calls 4");
    await expect(recipes).toContainText("CLI fallbacks 3");
    await recipes.getByRole("button", { name: "Copy CLI pack" }).click();
    const copiedGraphDbCliPack = await page.evaluate(
      () => (window as typeof window & { __lastCopiedAgentText?: string }).__lastCopiedAgentText,
    );
    expect(copiedGraphDbCliPack).toContain(
      "0. [self_check] oh-my-ontology agent-brief [vault] --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4",
    );
    expect(copiedGraphDbCliPack).toContain("Mode guide:");
    expect(copiedGraphDbCliPack).toContain("MCP-connected: Claude Code, Codex, or Cursor can call local read/write tools");
    expect(copiedGraphDbCliPack).toContain("[node_scan] oh-my-ontology match-nodes [vault] --plan");
    await recipes.getByRole("button", { name: "Copy traversal packet" }).click();
    const copiedTraversalPacket = await page.evaluate(
      () => (window as typeof window & { __lastCopiedAgentText?: string }).__lastCopiedAgentText,
    );
    expect(copiedTraversalPacket).toContain("Execution gates:");
    expect(copiedTraversalPacket).toContain("plan_before_enumeration (first)");
    expect(copiedTraversalPacket).toContain("bounded_path_evidence (evidence)");
    expect(copiedTraversalPacket).toContain("containment_cross_check (confirm)");
    expect(copiedTraversalPacket).toContain("Stop and narrow before writing if:");
    await expect(recipes.getByRole("button", { name: "Copy run order" })).toBeVisible();
    await expect(recipes.getByTestId("insights-agent-guardrails")).toContainText(
      "Write safety gates",
    );
    await expect(recipes.getByTestId("insights-agent-guardrails")).toContainText(
      "Before add_relation",
    );
    await expect(recipes.getByTestId("insights-agent-relation-decisions")).toContainText(
      "relation_check recommendation",
    );
    await expect(recipes.getByTestId("insights-agent-relation-decisions")).toContainText(
      "review_inverse",
    );
    await expect(recipes.getByTestId("insights-agent-relation-decisions")).toContainText(
      "review_new_schema",
    );
    await expect(recipes.getByTestId("insights-agent-guardrails")).toContainText(
      "find_backlinks",
    );
    const syncGuardrail = recipes.locator('[data-guardrail="post_change_sync"]');
    await expect(syncGuardrail).toContainText(
      "health, cycles, growth_plan, maintenance_plan, and validate_vault",
    );
    await expect(syncGuardrail).toContainText("query_ontology.cycles");
    await expect(syncGuardrail).toContainText("query_ontology.growth_plan");
    await expect(syncGuardrail).toContainText("oh-my-ontology cycles [vault] --max-hops 8");
    await syncGuardrail.getByRole("button", { name: "Copy gate" }).click();
    const copiedSyncGuardrail = await page.evaluate(
      () => (window as typeof window & { __lastCopiedAgentText?: string }).__lastCopiedAgentText,
    );
    expect(copiedSyncGuardrail).toContain("query_ontology.maintenance_plan");
    expect(copiedSyncGuardrail).toContain("CLI fallback:");
    expect(copiedSyncGuardrail).toContain("oh-my-ontology validate [vault]");
    await expect(recipes.getByRole("button", { name: "Copy gate" })).toHaveCount(3);
    await expect(recipes.getByRole("button", { name: "Copy handoff" })).toBeVisible();
    await expect(recipes).toContainText("query_ontology.agent_brief");
    await expect(recipes).toContainText("query_ontology.workspace_brief");
    await expect(recipes).toContainText("query_ontology.query_plan");
    await expect(recipes).toContainText("query_ontology.health");
    await expect(recipes).toContainText("query_ontology.components");
    await expect(recipes).toContainText("query_ontology.cycles");
    await expect(recipes).toContainText("query_ontology.topological_order");
    await expect(recipes).toContainText("query_ontology.growth_plan");
    await expect(recipes).toContainText("query_ontology.maintenance_plan");
    await expect(recipes).toContainText("query_ontology.node_profile");
    await expect(recipes).toContainText("query_ontology.path");
    await expect(recipes).toContainText("query_ontology.explain_relation");
    await expect(recipes).toContainText("query_ontology.similar_nodes");
    await expect(recipes).toContainText("query_ontology.relation_check");
    await expect(recipes).toContainText("query_ontology.all_paths");
    await expect(recipes).toContainText("query_ontology.pattern_walk");
    await expect(recipes).not.toContainText("<project-slug>");
    await expect(recipes).toContainText("Secondary");
    await expect(recipes).toContainText('"tool": "query_ontology"');
    await expect(recipes.getByRole("button", { name: "Copy JSON" })).toHaveCount(18);
    await expect(recipes.getByRole("button", { name: "Copy step" })).toHaveCount(5);
    await expect(recipes.getByRole("button", { name: "Copy CLI" })).toHaveCount(24);
    await expect(recipes.getByRole("button", { name: "Copy slug" }).first()).toBeVisible();
  });

  test("mobile: insights readiness panel fits without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/ontology/insights/");

    await expect(page.getByTestId("insights-agent-readiness")).toBeVisible();
    await expect(page.getByTestId("insights-agent-query-recipes")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test("mobile: bottom tab ontology link is active", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/ontology/");

    const tabBar = page.locator('[data-tabbar="primary"]');
    const ontologyTab = tabBar.getByRole("link", { name: "Ontology", exact: true });
    await expect(ontologyTab).toBeVisible();
    await expect(ontologyTab).toHaveAttribute("aria-current", "page");
    await expect(ontologyTab).toHaveAttribute("data-active", "true");
    await expect(tabBar.getByRole("link", { name: "Topology", exact: true })).toHaveAttribute(
      "data-active",
      "false",
    );

    const activeIndicator = ontologyTab.locator('[data-active-indicator="true"]');
    await expect(activeIndicator).toBeVisible();
    const activeIconShell = ontologyTab.locator('[data-tab-icon-shell="active"]');
    const shellBox = await activeIconShell.boundingBox();
    const indicatorBox = await activeIndicator.boundingBox();
    expect(shellBox).not.toBeNull();
    expect(indicatorBox).not.toBeNull();
    expect(shellBox?.width).toBeLessThanOrEqual(26);
    expect(shellBox?.height).toBeLessThanOrEqual(26);
    expect(indicatorBox?.width).toBeGreaterThanOrEqual(20);
    expect(indicatorBox?.height).toBeLessThanOrEqual(3);
  });

  test("mobile: operations demo badge names the current mode", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/ontology/");

    const demoBadge = page.getByRole("link", {
      name: "Demo mode — install the macOS app to start local vault work",
    });
    await expect(demoBadge).toBeVisible();
    await expect(demoBadge).toContainText("demo");
    await expect(demoBadge).toHaveAttribute("href", "/en/download/");

    const box = await demoBadge.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width).toBeGreaterThanOrEqual(48);
  });

  test("mobile: agent status popover stays inside the viewport", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/en/ontology/");

    await page.getByTestId("agent-status-trigger").click();
    const agentStatus = page.getByTestId("agent-status-popover");
    await expect(agentStatus).toContainText("MCP connection");

    const overflowingElements = await agentStatus.locator("*").evaluateAll((els) => {
      const viewport = document.documentElement.clientWidth;
      return els
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            label: el.textContent || el.getAttribute("aria-label") || "",
            tag: el.tagName,
            left: rect.left,
            right: rect.right,
            width: rect.width,
            viewport,
          };
        })
        .filter(
          (item) =>
            item.width > 0.5 &&
            (item.left < -0.5 || item.right > item.viewport + 0.5),
        );
    });

    expect(overflowingElements).toEqual([]);
  });

  test("mobile: projects page exposes ontology shortcut", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/projects/");

    const ontologyCardCta = page.getByRole("link", {
      name: /Open ontology tree/,
    });
    await expect(ontologyCardCta).toBeVisible();
    await expect(ontologyCardCta).toContainText("Open ontology map");
    await expect(ontologyCardCta).toContainText("ontology nodes");
    const ctaBox = await ontologyCardCta.boundingBox();
    expect(ctaBox).not.toBeNull();
    expect(ctaBox?.height).toBeGreaterThanOrEqual(32);
    await ontologyCardCta.click();
    await expect(page).toHaveURL(/\/en\/ontology\/?(\?|$)/);
  });

  test("desktop: 데이터가 없으면 detail 패널은 노출되지 않음 (빈 상태 회귀 방지)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/en/ontology/");
    // 빈 상태에서는 트리에 row 가 없으므로 클릭할 게 없고, 패널도 처음부터 숨김.
    await expect(page.getByTestId("ontology-node-detail")).toHaveCount(0);
  });

  test("mobile: dogfood tree content is visible without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/ontology/");

    await expect(page.getByText("oh-my-ontology").first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
});
