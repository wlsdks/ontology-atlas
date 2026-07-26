import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  buildOntologyHealthSignals,
  isEvidenceOnlyConcept,
  resolveNodeAgentTarget,
} from "@/entities/knowledge-graph";
import { rankAllByDegree } from "@/shared/lib/ontology-tree";

/**
 * "할 일" 탭 (S5, 전략 verdict B) — 인사이트를 재고 나열에서 "그래서 뭘
 * 해야 하는데?"로. 이 페이지에 이미 로드된 파생(healthSignals ·
 * rankAllByDegree · docFreshnessIndex)만 조합한다 — maintenance_plan 급
 * 정밀 순위의 client 재구현은 의도적으로 하지 않는다(패널 반대 의견 절충:
 * 단일 진실원 유지, 정밀 판정은 행별 에이전트 핸드오프로 위임).
 */

export type DoNextRowKind = "neglected-hub" | "orphan" | "promotion";

export interface DoNextRow {
  /** 행 고유 id — `${kind}:${nodeId}`. */
  id: string;
  rowKind: DoNextRowKind;
  nodeId: string;
  title: string;
  nodeKind: string;
  /** 연결도 (neglected-hub · promotion). */
  degree?: number;
  /** 마지막 갱신 후 일수 (neglected-hub). */
  agoDays?: number;
  /**
   * 근거로만 적힌 이름(자기 문서 없음)인가. 이 행의 첫 걸음은 다른 행과 다르다
   * — 고칠 문서가 아직 없으므로 「문서부터 만들기」다(`handoffPayload` 가 이미
   * 그렇게 쓰여 있는데 화면은 그 사실을 말하지 않았다).
   */
  evidenceOnly: boolean;
  /** 행별 에이전트 핸드오프 — MCP 호출 순서 제안 (복사용). */
  handoffPayload: string;
}

export interface DoNextQueue {
  rows: DoNextRow[];
  /** 표시 상한과 무관한 현재 전체 신호 id. 검토 종료 판정의 진실원. */
  activeRowIds: string[];
  counts: { neglectedHub: number; orphan: number; promotion: number };
}

export interface BuildDoNextQueueOptions {
  /** 허브로 볼 최소 연결도. 기본 4. */
  hubMinDegree?: number;
  /** "방치"로 볼 최소 경과 일수. 기본 30. */
  neglectMinDays?: number;
  /** 유형별 최대 행 수. 기본 5. */
  perKindLimit?: number;
  now?: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DO_NEXT_VERIFICATION_GATE =
  'query_ontology({operation:"health"}) 로 변경 결과 재확인';

/**
 * 행별 핸드오프는 "무엇을 바꿀지"에서 끝나지 않고 같은 그래프의 health
 * 재조회로 닫힌다. UI의 "에이전트로 검증" 라벨과 복사되는 실제 계약을 맞춘다.
 */
export function withDoNextVerification(
  instruction: string,
  resultProof: string,
): string {
  return `${instruction} → ${resultProof} → ${DO_NEXT_VERIFICATION_GATE}`;
}

/**
 * 행별 인계문은 **붙여넣으면 동작해야** 한다. 그래서 이름은 화면의 그래프 id
 * 가 아니라 볼트가 아는 이름(`resolveNodeAgentTarget`)으로 쓰고, 아직 문서가
 * 없는 개념에는 조회·수정 호출 대신 **문서를 먼저 만드는 호출**을 준다 —
 * `patch_concept` / `get_concept` 은 문서가 있어야 성립하므로, 없는 개념에
 * 그 호출을 주면 인계가 아니라 숙제가 된다.
 */
function agentNameOf(node: KnowledgeGraphNode | undefined, fallbackId: string): {
  ref: string;
  documented: boolean;
} {
  const target = resolveNodeAgentTarget(node);
  return {
    ref: target.ref ?? fallbackId.split(":").pop() ?? fallbackId,
    documented: target.documented && target.ref !== null,
  };
}

/** 문서가 없는 개념에 붙는 공통 첫 걸음 — 문서 신설. */
function createDocFirst(ref: string, kind: string): string {
  return `이 개념은 아직 볼트에 "${ref}" 라는 참조로만 적혀 있어요(문서 없음) → add_concept({slug:"${ref}", kind:"${kind}"}) 로 문서부터 만들기`;
}

function buildDoNextHandoff(node: KnowledgeGraphNode): string {
  const { ref, documented } = agentNameOf(node, node.id);
  if (!documented) {
    return withDoNextVerification(
      createDocFirst(ref, node.kind),
      `get_concept({slug:"${ref}"}) 로 새 문서 확인`,
    );
  }
  return withDoNextVerification(
    `query_ontology({operation:"blast_radius", slug:"${ref}"}) 로 영향권 확인 → 문서 내용 검토 후 patch_concept({slug:"${ref}", …}) 로 갱신`,
    `get_concept({slug:"${ref}"}) 로 갱신된 원문 확인`,
  );
}

function buildOrphanHandoff(node: KnowledgeGraphNode | undefined, fallbackId: string): string {
  const { ref, documented } = agentNameOf(node, fallbackId);
  if (!documented) {
    return withDoNextVerification(
      `${createDocFirst(ref, node?.kind ?? "element")} → add_relation({from:"${ref}", to:"<대상>", type:"relates", why:"<근거 한 줄>"})`,
      `find_neighbors({slug:"${ref}"}) 로 새 관계 확인`,
    );
  }
  return withDoNextVerification(
    `find_neighbors({slug:"${ref}"}) 로 이웃 후보 확인 → relation_check 사전 점검 → add_relation({from:"${ref}", to:"<대상>", type:"relates", why:"<근거 한 줄>"})`,
    `find_neighbors({slug:"${ref}"}) 로 새 관계 확인`,
  );
}

function buildPromotionHandoff(node: KnowledgeGraphNode | undefined, fallbackId: string): string {
  const { ref, documented } = agentNameOf(node, fallbackId);
  if (!documented) {
    return withDoNextVerification(
      `${createDocFirst(ref, node?.kind ?? "element")} → 승격이 맞으면 그 문서의 kind 를 상향`,
      `query_ontology({operation:"node_profile", slug:"${ref}"}) 로 kind와 fan-in 재확인`,
    );
  }
  return withDoNextVerification(
    `query_ontology({operation:"node_profile", slug:"${ref}"}) 로 fan-in 확인 → 승격이 맞으면 patch_concept 로 kind 상향 또는 add_concept 로 상위 개념 신설`,
    `query_ontology({operation:"node_profile", slug:"${ref}"}) 로 kind와 fan-in 재확인`,
  );
}

/** 갱신일 조회용 문서 slug — 매니페스트 기준 값이라 접두사를 그대로 둔다. */
function nodeSlug(node: KnowledgeGraphNode): string | null {
  return node.evidenceIds[0] ?? null;
}

export function buildDoNextQueue(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  freshnessIndex: ReadonlyMap<string, string>,
  options: BuildDoNextQueueOptions = {},
): DoNextQueue {
  const hubMinDegree = options.hubMinDegree ?? 4;
  const neglectMinDays = options.neglectMinDays ?? 30;
  const perKindLimit = options.perKindLimit ?? 5;
  const nowMs = (options.now ?? new Date()).getTime();

  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  // ① 방치된 허브 — degree 높음 × 갱신 오래됨. 둘 다 이미 페이지에 있는
  // 신호의 곱이라 계산 비용은 랭킹 한 번이다.
  const neglectedHubs: DoNextRow[] = [];
  for (const { node, degree } of rankAllByDegree(nodes, edges)) {
    if (degree < hubMinDegree) break; // 내림차순 — 임계 밑이면 종료
    // 문서가 없는 노드의 `evidenceIds[0]` 은 *자기를 인용한 남의 문서* 라,
    // 그 날짜를 이 노드의 갱신일로 읽으면 남의 방치를 이 개념 탓으로 돌린다.
    if (resolveNodeAgentTarget(node).documented === false) continue;
    const slug = nodeSlug(node);
    const iso = slug ? freshnessIndex.get(slug) : undefined;
    if (!iso) continue; // 갱신 시점을 모르면 "방치"라 단정하지 않는다
    const agoDays = Math.floor((nowMs - Date.parse(iso)) / DAY_MS);
    if (!Number.isFinite(agoDays) || agoDays < neglectMinDays) continue;
    neglectedHubs.push({
      id: `neglected-hub:${node.id}`,
      rowKind: "neglected-hub",
      nodeId: node.id,
      // 과제 ⑩ — "할 일" 큐 행도 표시용 짧은 제목.
      title: node.display ?? node.title,
      nodeKind: node.kind,
      degree,
      agoDays,
      evidenceOnly: isEvidenceOnlyConcept(node),
      handoffPayload: buildDoNextHandoff(node),
    });
  }
  neglectedHubs.sort((a, b) => (b.degree ?? 0) * (b.agoDays ?? 0) - (a.degree ?? 0) * (a.agoDays ?? 0));

  // ②③ 고아 · 승격 후보 — 지도 health 칩과 같은 entities 함수 재사용
  // (진실원 1벌 — 지도 칩과 이 큐의 숫자가 갈라질 수 없다).
  const signals = buildOntologyHealthSignals(nodes, edges, { now: options.now });

  const orphans: DoNextRow[] = signals.orphan.map(({ slug, name }) => ({
    id: `orphan:${slug}`,
    rowKind: "orphan",
    nodeId: slug,
    title: name,
    nodeKind: nodeById.get(slug)?.kind ?? "unknown",
    evidenceOnly: isEvidenceOnlyConcept(nodeById.get(slug)),
    handoffPayload: buildOrphanHandoff(nodeById.get(slug), slug),
  }));

  const promotions: DoNextRow[] = signals.promotion.map(({ slug, name, fanIn }) => ({
    id: `promotion:${slug}`,
    rowKind: "promotion",
    nodeId: slug,
    title: name,
    nodeKind: nodeById.get(slug)?.kind ?? "unknown",
    // "왜 뽑혔나"의 근거 — 들어오는 참조 수. 행 metric("참조 N개")으로 그대로 노출.
    degree: fanIn,
    evidenceOnly: isEvidenceOnlyConcept(nodeById.get(slug)),
    handoffPayload: buildPromotionHandoff(nodeById.get(slug), slug),
  }));

  const rows = [
    ...neglectedHubs.slice(0, perKindLimit),
    ...orphans.slice(0, perKindLimit),
    ...promotions.slice(0, perKindLimit),
  ];

  return {
    rows,
    activeRowIds: [...neglectedHubs, ...orphans, ...promotions].map(
      (row) => row.id,
    ),
    counts: {
      neglectedHub: neglectedHubs.length,
      orphan: orphans.length,
      promotion: promotions.length,
    },
  };
}
