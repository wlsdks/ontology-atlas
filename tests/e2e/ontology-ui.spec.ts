import { expect, test } from "@playwright/test";

/**
 * /ontology surface smoke (T-6 / T-9 / UX 정정).
 *
 * Static dogfood vault has ontology nodes, so verify the current local-first
 * browse surface rather than the removed knowledge/review queue surfaces.
 */
test.describe("ontology view UI", () => {
  test("desktop: landing CTA 로 ontology browse 진입 가능", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/en/");
    const demoLink = page.getByRole("link", { name: "See the demo first" });
    await expect(demoLink).toBeVisible();
    await demoLink.click();
    await expect(page).toHaveURL(/\/en\/ontology\/?$/);
  });

  test("desktop: ontology tree renders dogfood nodes", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/en/ontology/");

    await expect(page.getByRole("heading", { name: "Ontology tree" })).toBeVisible();
    await expect(page.locator('button[title="oh-my-ontology"]')).toBeVisible();
    await expect(page.locator('button[title="AI Agent Partner"]')).toBeVisible();
    await expect(page.getByRole("link", { name: "Browse" })).toHaveAttribute(
      "aria-current",
      "page",
    );
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

    const panel = page.getByTestId("insights-agent-readiness");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Agent graph readiness");
    await expect(panel).toContainText("Ready");
    await expect(panel).toContainText("Recommended next actions");
    await expect(panel).toContainText("workspace_brief");
    await expect(panel.getByRole("button", { name: "Copy repair prompt" })).toBeVisible();
    const readinessCli = page.getByTestId("insights-agent-readiness-cli");
    await expect(readinessCli).toBeVisible();
    await expect(readinessCli).toContainText("Terminal fallback");
    await expect(readinessCli).toContainText("oh-my-ontology agent-brief [vault]");
    await expect(readinessCli).toContainText("oh-my-ontology agent-brief [vault] --graph-db-pack");
    await expect(readinessCli).toContainText("oh-my-ontology workspace-brief [vault]");
    await readinessCli.getByRole("button", { name: "Copy CLI checks" }).click();
    const copiedReadinessCli = await page.evaluate(
      () => (window as typeof window & { __lastCopiedAgentText?: string }).__lastCopiedAgentText,
    );
    expect(copiedReadinessCli).toContain("oh-my-ontology agent-brief [vault]");
    expect(copiedReadinessCli).toContain("oh-my-ontology agent-brief [vault] --graph-db-pack");
    expect(copiedReadinessCli).toContain("oh-my-ontology validate [vault]");

    const domainCoupling = page.getByTestId("insights-domain-coupling");
    await expect(domainCoupling).toBeVisible();
    await expect(page.getByText("Domain coupling matrix")).toBeVisible();
    await expect(domainCoupling).toContainText("Cross");
    await expect(domainCoupling).toContainText("Inside");
    await expect(domainCoupling).toContainText("Unassigned");
    await expect(domainCoupling).toContainText("Re-run this semantic matrix");
    await domainCoupling.getByRole("button", { name: "Copy CLI matrix" }).click();
    const copiedCli = await page.evaluate(
      () => (window as typeof window & { __lastCopiedAgentText?: string }).__lastCopiedAgentText,
    );
    expect(copiedCli).toContain(
      "oh-my-ontology domain-matrix [vault] --limit 6 --types depends_on,relates,describes",
    );
    await domainCoupling.getByRole("button", { name: "Copy MCP JSON" }).click();
    const copiedMcp = await page.evaluate(
      () => (window as typeof window & { __lastCopiedAgentText?: string }).__lastCopiedAgentText,
    );
    expect(copiedMcp).toContain('"operation": "domain_matrix"');
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
      "oh-my-ontology agent-brief [vault] --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000",
    );
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
      "0. [self_check] oh-my-ontology agent-brief [vault] --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000",
    );
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
    await expect(recipes.getByRole("button", { name: "Copy gate" })).toHaveCount(3);
    await expect(recipes.getByRole("button", { name: "Copy handoff" })).toBeVisible();
    await expect(recipes).toContainText("query_ontology.agent_brief");
    await expect(recipes).toContainText("query_ontology.workspace_brief");
    await expect(recipes).toContainText("query_ontology.query_plan");
    await expect(recipes).toContainText("query_ontology.health");
    await expect(recipes).toContainText("query_ontology.node_profile");
    await expect(recipes).toContainText("query_ontology.path");
    await expect(recipes).toContainText("query_ontology.explain_relation");
    await expect(recipes).toContainText("query_ontology.relation_check");
    await expect(recipes).toContainText("query_ontology.all_paths");
    await expect(recipes).toContainText("query_ontology.pattern_walk");
    await expect(recipes).not.toContainText("<project-slug>");
    await expect(recipes).toContainText("Secondary");
    await expect(recipes).toContainText('"tool": "query_ontology"');
    await expect(recipes.getByRole("button", { name: "Copy JSON" })).toHaveCount(12);
    await expect(recipes.getByRole("button", { name: "Copy step" })).toHaveCount(5);
    await expect(recipes.getByRole("button", { name: "Copy CLI" })).toHaveCount(17);
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
