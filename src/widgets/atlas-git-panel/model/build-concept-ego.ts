import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";

/**
 * 한 개념의 **바로 옆 이웃**(1-depth)과 그 개념이 가진 타입 있는 사실.
 *
 * 기록 화면이 이걸 그리는 이유: 「이 걸음이 무엇을 바꿨나」의 답이 커밋 제목이
 * 아니라 개념이어야 하고, 개념을 봤으면 그 자리에서 **성질과 이웃까지** 보여야
 * 지도로 나가지 않는다(소유자 지시 2026-08-02).
 *
 * ⚠️ **없는 필드는 슬롯을 만들지 않는다.** 시안 단계에서 `status:` 칸을 뒀다가
 * 지웠다 — 볼트 70노드 중 그 키를 쓰는 노드가 **0개**였고, 아무도 안 채우는
 * 칸은 규격이 아니라 오정보였다. 같은 이유로 여기서는 `created_by`/`path` 를
 * 쓰지 않는다: 그 둘은 `KnowledgeGraphNode` 가 나르지 않으므로 이 화면에서
 * 그리면 영원히 빈 칸이 된다. 대신 **파생이 보장하는 사실**만 싣는다.
 */
export type EgoBearing = "belongsTo" | "contains" | "dependsOn" | "usedBy";

/** 네 방위의 고정 순서 — 개념을 바꿔도 자리가 흔들리지 않게. */
export const EGO_BEARINGS: readonly EgoBearing[] = [
  "belongsTo",
  "contains",
  "dependsOn",
  "usedBy",
] as const;

export interface EgoNeighbor {
  id: string;
  label: string;
  kind: string;
}

export interface ConceptEgo {
  id: string;
  label: string;
  kind: string;
  /** 소속 도메인의 표시 이름 — 도메인/프로젝트 노드에는 없다(`null`). */
  domainLabel: string | null;
  /** 이 개념의 근거 문서(볼트 안 slug). 파생이 항상 하나는 보장한다. */
  docSlug: string | null;
  /** 사람이 쓴 한 줄 설명. 이 카드에서 **사람이 가장 먼저 읽는 사실**이다. */
  summary: string | null;
  /**
   * 에이전트에게 이 개념을 가리킬 때 쓰는 이름 — MCP/CLI 가 그대로 받는다.
   * 이 제품의 사용자는 사람과 에이전트 둘이므로, 사람이 읽는 이름만 싣고
   * 에이전트가 쓰는 이름을 빼면 절반만 보여 준 것이다.
   */
  agentSlug: string | null;
  /** 속한 프로젝트 이름들 — 볼트에 여럿이면 여기서 갈린다. */
  projectLabels: readonly string[];
  neighbors: Readonly<Record<EgoBearing, readonly EgoNeighbor[]>>;
  /** 네 방위를 합친 이웃 수 — 0 이면 그림을 그리지 않는다. */
  total: number;
}

function emptyNeighbors(): Record<EgoBearing, EgoNeighbor[]> {
  return { belongsTo: [], contains: [], dependsOn: [], usedBy: [] };
}

/**
 * 엣지 타입 → 방위. **방향이 관계의 절반이다.**
 *
 * 들어오는 `contains` 는 「내가 담은 것」이 아니라 **「나를 담은 곳」**이다 —
 * 시안 배선에서 이 둘을 한 칸에 넣었더니 도메인 노드에서 ↑17 과 ↓16 이 거의
 * 같은 집합이 됐다(실측).
 */
function outgoingBearing(type: KnowledgeGraphEdge["type"]): EgoBearing {
  if (type === "is_a") return "belongsTo";
  if (type === "contains") return "contains";
  return "dependsOn";
}

function incomingBearing(type: KnowledgeGraphEdge["type"]): EgoBearing {
  if (type === "contains" || type === "is_a") return "belongsTo";
  return "usedBy";
}

/**
 * 노드 하나의 ego 를 만든다. `nodeId` 가 그래프에 없으면 `null` — 볼트에
 * 개념으로 등록되지 않은 마크다운(예: 루트 `README.md`)이 그렇다. 그 경우
 * 화면은 그림 대신 「아직 개념으로 등록되지 않았어요」를 그린다.
 */
export function buildConceptEgo(
  nodeId: string,
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): ConceptEgo | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const self = byId.get(nodeId);
  if (!self) return null;

  const seen = new Set<string>();
  const neighbors = emptyNeighbors();
  const push = (bearing: EgoBearing, otherId: string) => {
    if (otherId === nodeId) return;
    const key = `${bearing}:${otherId}`;
    if (seen.has(key)) return;
    const other = byId.get(otherId);
    if (!other) return;
    seen.add(key);
    neighbors[bearing].push({
      id: other.id,
      label: other.display || other.title,
      kind: other.kind,
    });
  };

  for (const edge of edges) {
    if (edge.from === nodeId) push(outgoingBearing(edge.type), edge.to);
    else if (edge.to === nodeId) push(incomingBearing(edge.type), edge.from);
  }

  const total = EGO_BEARINGS.reduce((sum, b) => sum + neighbors[b].length, 0);

  return {
    id: self.id,
    label: self.display || self.title,
    kind: self.kind,
    domainLabel: neighbors.belongsTo.find((n) => n.kind === "domain")?.label ?? null,
    docSlug: self.evidenceIds[0] ?? null,
    summary: self.summary?.trim() || null,
    agentSlug: self.agentSlug ?? self.evidenceIds[0] ?? null,
    projectLabels: self.projectIds
      .map((id) => byId.get(id))
      .map((n) => (n ? n.display || n.title : null))
      .filter((v): v is string => Boolean(v)),
    neighbors,
    total,
  };
}

/**
 * 커밋이 건드린 파일의 `slug` 를 그래프 노드 id 로 맞춘다.
 *
 * Rust 는 frontmatter 의 `kind`/`slug` 를 실어 보내고(#842), 파생은 노드 id 를
 * `<kind>:<슬러그 꼬리>` 로 만든다. 둘의 문법이 달라 **문자열이 그대로 맞지
 * 않으므로**, 꼬리와 kind 로 맞춘다. 맞는 노드가 없으면 `null` — 그건 볼트의
 * 개념이 아니라 그냥 마크다운이다.
 */
export function matchNodeId(
  file: { slug: string; kind: string | null },
  nodes: readonly KnowledgeGraphNode[],
): string | null {
  const tail = file.slug.split("/").pop() ?? file.slug;
  const exact = nodes.find(
    (n) => n.kind === file.kind && (n.evidenceIds[0] === file.slug || n.id.endsWith(`:${tail}`)),
  );
  if (exact) return exact.id;
  const byEvidence = nodes.find((n) => n.evidenceIds[0] === file.slug);
  return byEvidence?.id ?? null;
}
