import { formatQueryOntologyCall } from "@/shared/lib/ontology-query-call";

/**
 * 도메인 커플링 인사이트에서 "이 두 도메인이 정말 연결돼 있나" 를 agent 가
 * 검증하도록, all_paths 기반 증거 수집 패킷(MCP plan/exec + CLI fallback +
 * evidence-contract 체크리스트)을 만든다. labels 는 i18n 문자열을 주입받아
 * 순수 함수로 유지 — UI 마운트 없이 단위 테스트 가능.
 */
export const DOMAIN_COUPLING_PATH_MAX_HOPS = 5;
export const DOMAIN_COUPLING_PATH_LIMIT = 10;
export const DOMAIN_COUPLING_PATH_SEARCH_BUDGET = 1000;

export interface DomainCouplingPathCheckLabels {
  title: string;
  source: string;
  target: string;
  relation: string;
  topology: string;
  cli: string;
  mcpPlan: string;
  mcp: string;
  evidenceContract: string;
}

export function formatDomainCouplingPathCheck({
  from,
  labels,
  relationType,
  to,
  topologyPathHref,
}: {
  from: string;
  labels: DomainCouplingPathCheckLabels;
  relationType: string;
  to: string;
  topologyPathHref: string;
}): string {
  const mcpPlanPayload = formatQueryOntologyCall({
    operation: "query_plan",
    targetOperation: "all_paths",
    from,
    to,
    maxHops: DOMAIN_COUPLING_PATH_MAX_HOPS,
    limit: DOMAIN_COUPLING_PATH_LIMIT,
    searchBudget: DOMAIN_COUPLING_PATH_SEARCH_BUDGET,
  });
  const mcpPayload = formatQueryOntologyCall({
    operation: "all_paths",
    from,
    to,
    maxHops: DOMAIN_COUPLING_PATH_MAX_HOPS,
    limit: DOMAIN_COUPLING_PATH_LIMIT,
    searchBudget: DOMAIN_COUPLING_PATH_SEARCH_BUDGET,
  });
  const cliCommand =
    `ontology-atlas all-paths ${from} ${to} [vault] --plan ` +
    `--max-hops ${DOMAIN_COUPLING_PATH_MAX_HOPS} ` +
    `--limit ${DOMAIN_COUPLING_PATH_LIMIT} ` +
    `--search-budget ${DOMAIN_COUPLING_PATH_SEARCH_BUDGET}`;

  return [
    `# ${labels.title}`,
    `- ${labels.source}: ${from}`,
    `- ${labels.target}: ${to}`,
    `- ${labels.relation}: ${relationType}`,
    `- ${labels.topology}: ${topologyPathHref}`,
    `- ${labels.cli}: ${cliCommand}`,
    `- ${labels.mcpPlan}: ${mcpPlanPayload}`,
    `- ${labels.mcp}: ${mcpPayload}`,
    `- ${labels.evidenceContract}: report limit, searchBudget, expandedStates, exhaustive, truncatedByBudget, totalPathsExact, evidence.status, evidence.reason, and evidence.pathsComplete before using paths as coupling evidence`,
  ].join("\n");
}
