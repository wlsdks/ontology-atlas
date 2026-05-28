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
    await page.goto("/en/ontology/");

    await expect(page.getByRole("heading", { name: "Ontology workbench" })).toBeVisible();
    await expect(page.getByLabel("Ontology hierarchy browse view")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByLabel("Ontology tree role and source status")).toContainText(
      "Hierarchy index",
    );
    await expect(page.getByLabel(/Tree projection warnings/)).toContainText(
      "Tree projection",
    );
    await page.getByLabel(/Tree projection warnings/).click();
    const projectionWarnings = page.locator("#tree-data-warnings");
    await expect(projectionWarnings).toBeVisible();
    await expect(projectionWarnings).toContainText("not a vault error");
    await expect(projectionWarnings).toContainText("The graph is still queryable");
    await expect(
      projectionWarnings.getByRole("link", { name: "Open query cockpit" }),
    ).toHaveAttribute("href", "/en/ontology/insights/");
    await expect(
      projectionWarnings.getByRole("link", { name: "Review in builder" }),
    ).toHaveAttribute("href", "/en/ontology/edit/");
    await expect(page.getByRole("link", { name: "Open Graph DB query pack insights" })).toBeVisible();
    await expect(page.locator('button[title="oh-my-ontology"]')).toBeVisible();
    await expect(page.locator('button[title="AI Agent Partner"]')).toBeVisible();
    await expect(page.getByRole("link", { name: "Browse", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
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
    await expect(page.getByText("active concept · capabilities/topology-analysis-modes")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Graph DB query pack insights" })).toHaveAttribute(
      "href",
      "/en/ontology/insights/?node=capabilities%2Ftopology-analysis-modes",
    );

    const brief = page.getByTestId("ontology-review-brief");
    await expect(brief).toBeVisible();
    await expect(brief).toContainText("Collaborator brief");
    await expect(brief).toContainText("Review questions");
    await expect(brief).toContainText("Change impact");
    await expect(brief).toContainText("Direct relation preview");
    await expect(brief.getByRole("link", { name: "Open topology" })).toHaveAttribute(
      "href",
      /\/en\/topology\/\?mode=focus&p=capability%3Atopology-analysis-modes/,
    );
    await expect(brief.getByRole("link", { name: "Focus in builder" })).toHaveAttribute(
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

    const queryCockpit = page.getByTestId("insights-query-cockpit");
    await expect(queryCockpit).toBeVisible();
    await expect(queryCockpit).toContainText("Run the local graph like a small database");
    await expect(queryCockpit).toContainText("Readiness");
    await expect(queryCockpit).toContainText("Pack");
    await expect(queryCockpit).toContainText("MCP");
    await expect(queryCockpit).toContainText("CLI");
    await expect(queryCockpit).toContainText("MATCH graph RETURN");
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

    const collaboratorBrief = page.getByTestId("insights-collaborator-brief");
    await expect(collaboratorBrief).toBeVisible();
    await expect(collaboratorBrief).toContainText("Collaborator insight brief");
    await expect(collaboratorBrief).toContainText("Review questions");
    await expect(collaboratorBrief.getByTestId("insights-collaborator-decision-lane")).toBeVisible();
    await expect(collaboratorBrief).toContainText("Expected decision");
    await expect(collaboratorBrief).toContainText("Graph handoff");
    await expect(
      collaboratorBrief.getByTestId("insights-collaborator-impact-handoffs"),
    ).toBeVisible();
    await expect(collaboratorBrief).toContainText("Impact handoff");
    await expect(collaboratorBrief.getByRole("link", { name: "Path" }).first()).toBeVisible();
    await expect(collaboratorBrief.getByRole("link", { name: "Ontology" }).first()).toBeVisible();
    await expect(collaboratorBrief.getByRole("link", { name: "Topology" }).first()).toBeVisible();
    await expect(collaboratorBrief.getByRole("link", { name: "Builder" }).first()).toBeVisible();
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
    await expect(recipes).toContainText("estimate rankingWorkUnits");
    await expect(recipes).toContainText("report danglingNodes");
    await expect(recipes).toContainText("maxHops 3");
    await expect(recipes).toContainText("CLI command");
    await expect(recipes).toContainText("oh-my-ontology hubs");
    await expect(recipes).toContainText("oh-my-ontology match-nodes [vault] --plan");
    await expect(recipes).toContainText("oh-my-ontology match-nodes");
    await expect(recipes).toContainText("oh-my-ontology match-edges [vault] --plan");
    await expect(recipes).toContainText("oh-my-ontology match-edges");
    await expect(recipes).toContainText("oh-my-ontology explain");
    await expect(recipes).toContainText("oh-my-ontology all-paths");
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
    await expect(recipes.getByRole("button", { name: "Copy playbook" })).toHaveCount(4);
    await expect(recipes.getByRole("button", { name: "Copy strategy" })).toHaveCount(3);
    await expect(recipes.getByRole("button", { name: "Copy traversal packet" })).toBeVisible();
    await expect(recipes).toContainText("5 MCP calls");
    await expect(recipes).toContainText("MCP calls 4");
    await expect(recipes).toContainText("CLI fallbacks 1");
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

    const ontologyTab = page.getByRole("link", { name: "Ontology" }).last();
    await expect(ontologyTab).toBeVisible();
    await expect(ontologyTab).toHaveAttribute("aria-current", "page");
  });

  test("mobile: projects page exposes ontology shortcut", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/projects/");

    const ontologyCardCta = page.getByRole("link", {
      name: /Open ontology tree/,
    });
    await expect(ontologyCardCta).toBeVisible();
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
