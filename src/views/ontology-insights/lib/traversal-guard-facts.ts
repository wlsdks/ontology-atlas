/**
 * 인사이트 쿼리팩의 bounded-traversal / centrality-plan 호출에 대해, agent 가
 * 결과를 안전하게 쓰기 위해 확인해야 할 "가드 fact" 목록을 만든다.
 * (plan-first, budget/maxHops/limit/iterations, evidence.status·pathsComplete 등)
 *
 * query_ontology 인자 payload 만 보고 결정하는 순수 함수 — OntologyInsightsPage
 * (3000+줄)에서 분리해 단위 테스트 가능하게 함.
 */
export interface TraversalGuardFact {
  key: string;
  label: string;
}

export function getTraversalGuardFacts(
  argumentsPayload?: Record<string, unknown>,
): TraversalGuardFact[] {
  if (!argumentsPayload) return [];
  const operation = argumentsPayload.operation;
  const targetOperation = argumentsPayload.targetOperation;
  const isCentralityPlan = operation === "query_plan" && targetOperation === "centrality";
  const isBoundedTraversal =
    operation === "all_paths" || (operation === "query_plan" && targetOperation === "all_paths");
  if (!isBoundedTraversal && !isCentralityPlan) return [];

  const facts: TraversalGuardFact[] = [];
  const searchBudget = positiveInteger(argumentsPayload.searchBudget);
  const maxHops = nonNegativeInteger(argumentsPayload.maxHops);
  const limit = positiveInteger(argumentsPayload.limit);
  const iterations = positiveInteger(argumentsPayload.iterations);
  const types = Array.isArray(argumentsPayload.types)
    ? argumentsPayload.types.filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      )
    : [];

  if (operation === "query_plan") facts.push({ key: "plan", label: "plan first" });
  if (isCentralityPlan) {
    facts.push({ key: "ranking-work", label: "estimate rankingWorkUnits" });
    facts.push({ key: "dangling", label: "report danglingNodes" });
  }
  if (operation === "all_paths") {
    facts.push({ key: "evidence-status", label: "report evidence.status" });
    facts.push({ key: "paths-complete", label: "check pathsComplete" });
  }
  if (searchBudget !== null) facts.push({ key: "budget", label: `budget ${searchBudget}` });
  if (maxHops !== null) facts.push({ key: "maxHops", label: `maxHops ${maxHops}` });
  if (iterations !== null) facts.push({ key: "iterations", label: `iterations ${iterations}` });
  if (limit !== null) facts.push({ key: "limit", label: `limit ${limit}` });
  if (types.length > 0) facts.push({ key: "types", label: `types ${types.join(", ")}` });
  return facts;
}

function positiveInteger(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}
