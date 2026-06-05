import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildAgentReadinessSummary, type AgentReadinessSummary } from "./agent-readiness";
import {
  buildAgentGraphDbQueryPack,
  buildAgentHandoffPrompt,
  buildAgentQueryRecipes,
  buildAgentTraversalStrategies,
  buildAgentWriteGuardrails,
  selectAgentProjectEntrypoint,
  selectAgentQueryEntrypoints,
  type AgentQueryEntrypoint,
} from "./agent-query-recipes";
import type { OntologyTreeBuildResult } from "./types";

/**
 * 단일 "에이전트 온보딩 브리핑" — 개발자가 한 번 복사해 AI 코딩 에이전트
 * (Claude Code / Codex / Cursor)에 붙여넣으면, 그 에이전트가 이 코드베이스의
 * 온톨로지 메모리를 즉시 갖게 하는 완전한 1-paste 패킷.
 *
 * 흩어져 있던 ~10개의 개별 "Copy …" 패킷(run order / graph-DB pack / readiness /
 * guardrails …)을 하나로 묶는다. 새 로직을 만들지 않고 기존 certified composer
 * (buildAgentHandoffPrompt 등)를 조립하며, 맨 앞에 mental-model + readiness
 * 헤더만 덧붙여 "무엇을 보고 있는지"를 먼저 알린다.
 *
 * 브리핑 본문은 에이전트가 소비하는 영어 텍스트(buildAgentHandoffPrompt 와 동일
 * 톤). UI 버튼 라벨/토스트만 i18n.
 */
const BRIEFING_INTRO = [
  "# ontology-atlas — agent onboarding brief",
  "",
  "Paste this into your AI coding agent (Claude Code / Codex / Cursor) to load this",
  "codebase's ontology memory: the developer-maintained mental model — domains,",
  "capabilities, elements, and typed relations over the local markdown vault.",
  "Prefer the MCP query_ontology calls below; CLI fallbacks are listed for when the",
  "MCP connector is unavailable. Cite concrete slugs/edges and run query_plan before",
  "heavier traversal or impact queries.",
];

const CENSUS_KIND_ORDER = ["project", "domain", "capability", "element", "document", "unknown"];

function censusLine(nodes: readonly KnowledgeGraphNode[]): string {
  const counts = new Map<string, number>();
  for (const node of nodes) counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1);
  const ordered = [
    ...CENSUS_KIND_ORDER.filter((k) => counts.has(k)),
    ...[...counts.keys()].filter((k) => !CENSUS_KIND_ORDER.includes(k)).sort(),
  ];
  if (ordered.length === 0) return "empty vault";
  return ordered.map((k) => `${k} ${counts.get(k)}`).join(" · ");
}

export interface AgentBriefingPacket {
  /** 한 번에 복사할 완전한 브리핑 문자열. */
  briefing: string;
  /** readiness 요약 — 버튼 토스트/설명에 status·score 표시용. */
  readiness: AgentReadinessSummary;
  /** 추천 시작 노드(hub) — 호출자가 미리보기/설명에 쓸 수 있게 노출. */
  entrypoints: AgentQueryEntrypoint[];
}

/**
 * vault 그래프에서 완전한 에이전트 온보딩 브리핑을 조립한다.
 * 모든 입력은 기존 순수 composer 에서 derive — 동일 그래프면 동일 출력.
 */
export function buildAgentBriefingPacket(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  tree: Pick<OntologyTreeBuildResult, "orphans">,
): AgentBriefingPacket {
  const readiness = buildAgentReadinessSummary(nodes, edges, tree);
  const entrypoints = selectAgentQueryEntrypoints(nodes, edges, 4);
  const projectEntrypoint = selectAgentProjectEntrypoint(nodes, edges);
  const recipes = buildAgentQueryRecipes(readiness.status, entrypoints, projectEntrypoint);
  const traversalStrategies = buildAgentTraversalStrategies(entrypoints, projectEntrypoint);
  const graphDbQueryPack = buildAgentGraphDbQueryPack(entrypoints);
  const guardrails = buildAgentWriteGuardrails(entrypoints);

  const handoff = buildAgentHandoffPrompt(
    recipes,
    entrypoints,
    projectEntrypoint,
    traversalStrategies,
    graphDbQueryPack,
    guardrails,
  );

  const briefing = [
    ...BRIEFING_INTRO,
    "",
    "## Mental model & readiness",
    `- census: ${censusLine(nodes)}`,
    `- relations: ${readiness.relationCount} · hubs: ${readiness.hubCount} · avg degree: ${readiness.averageDegree}`,
    `- readiness: ${readiness.status} (score ${readiness.score}/100) — blockers: unknown ${readiness.unknownNodes}, orphans ${readiness.orphanCount}`,
    "",
    handoff,
  ].join("\n");

  return { briefing, readiness, entrypoints };
}
