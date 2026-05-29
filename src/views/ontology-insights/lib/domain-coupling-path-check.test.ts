import { describe, expect, it } from "vitest";
import {
  DOMAIN_COUPLING_PATH_LIMIT,
  DOMAIN_COUPLING_PATH_MAX_HOPS,
  DOMAIN_COUPLING_PATH_SEARCH_BUDGET,
  formatDomainCouplingPathCheck,
  type DomainCouplingPathCheckLabels,
} from "./domain-coupling-path-check";

const labels: DomainCouplingPathCheckLabels = {
  title: "Coupling path check",
  source: "Source",
  target: "Target",
  relation: "Relation",
  topology: "Topology",
  cli: "CLI",
  mcpPlan: "MCP plan",
  mcp: "MCP",
  evidenceContract: "Evidence contract",
};

const build = () =>
  formatDomainCouplingPathCheck({
    from: "domains/auth",
    to: "domains/billing",
    relationType: "depends_on",
    topologyPathHref: "/topology?from=auth&to=billing",
    labels,
  });

describe("formatDomainCouplingPathCheck", () => {
  it("주입된 i18n 라벨을 각 라인 prefix 로 쓴다", () => {
    const out = build();
    expect(out).toContain("# Coupling path check");
    expect(out).toContain("- Source: domains/auth");
    expect(out).toContain("- Target: domains/billing");
    expect(out).toContain("- Relation: depends_on");
    expect(out).toContain("- Topology: /topology?from=auth&to=billing");
  });

  it("CLI 명령에 bounded-traversal 상수를 박는다", () => {
    const out = build();
    expect(out).toContain(
      `- CLI: oh-my-ontology all-paths domains/auth domains/billing [vault] --plan ` +
        `--max-hops ${DOMAIN_COUPLING_PATH_MAX_HOPS} ` +
        `--limit ${DOMAIN_COUPLING_PATH_LIMIT} ` +
        `--search-budget ${DOMAIN_COUPLING_PATH_SEARCH_BUDGET}`,
    );
  });

  it("MCP plan/exec payload 가 query_ontology 호출 형태", () => {
    const out = build();
    expect(out).toContain('- MCP plan: query_ontology({"operation":"query_plan","targetOperation":"all_paths"');
    expect(out).toContain('- MCP: query_ontology({"operation":"all_paths"');
    expect(out).toContain(`"maxHops":${DOMAIN_COUPLING_PATH_MAX_HOPS}`);
    expect(out).toContain(`"searchBudget":${DOMAIN_COUPLING_PATH_SEARCH_BUDGET}`);
  });

  it("evidence-contract 라인은 path 를 증거로 쓰기 전 보고할 필드를 명시", () => {
    const out = build();
    expect(out).toContain("- Evidence contract:");
    expect(out).toContain("evidence.pathsComplete");
    expect(out).toContain("truncatedByBudget");
  });
});
