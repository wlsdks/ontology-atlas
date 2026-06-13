import { isContainmentRelation } from "@/shared/lib/ontology-tree";
import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import type { OntologySkeleton } from "./topology-ontology-skeleton";

const MAX_DOMAIN_REVEAL_CAPABILITIES = 8;

/**
 * 클릭-레벨 확장(semantic zoom)의 가시성 상태 — 순수 함수 계산 결과.
 *
 * 점진 드릴다운(누적형)이라 한 단계 내려가도 위 레이어가 사라지지 않는다:
 * - overview: 골격(anchor+landmark)만.
 * - 도메인 클릭: 골격 + 그 도메인의 *모든* 역량.
 * - 역량 클릭: 골격 + 소속 도메인의 역량 레이어 유지 + 그 역량의 요소.
 * - 요소 클릭: 부모 역량 scope 와 동일(시야 붕괴 없음).
 * 좌표는 buildRevealRadialLayout 이 결정론적으로 찍는다(FA2/물리 없음).
 */
export interface RevealState {
  /** 펼쳐진 도메인 (없으면 overview). */
  scopeDomainSlug: string | null;
  /** 요소까지 펼친 역량 (도메인 단계까지면 null). */
  scopeCapabilitySlug: string | null;
  /** 골격 ∪ 펼쳐진 노드 — 진입 그래프에 남길 전체 집합. */
  visibleSlugs: Set<string>;
  /** 골격 밖에서 새로 드러난 노드(랜드마크가 아니던 역량·요소). */
  revealedSlugs: Set<string>;
  /** scope 도메인의 가시 역량(가중치 desc → slug asc) — 레이아웃 입력. */
  domainCapabilitySlugs: string[];
  /** scope 역량의 요소(slug asc) — 레이아웃 입력. */
  capabilityElementSlugs: string[];
  /** project → 클릭 노드 containment 경로 (breadcrumb 용). */
  crumbSlugs: string[];
}

interface ContainmentLookup {
  childrenByParent: Map<string, string[]>;
  parentBySlug: Map<string, string>;
}

/**
 * containment 엣지에서 parent→children / child→parent 룩업 빌드.
 * 다중 부모는 slug 오름차순 첫 항목으로 결정론 고정.
 */
function buildContainmentLookup(
  edges: readonly KnowledgeGraphEdge[],
): ContainmentLookup {
  const childrenByParent = new Map<string, string[]>();
  const parentCandidates = new Map<string, string[]>();
  const push = (parent: string, child: string) => {
    if (parent === child) return;
    const list = childrenByParent.get(parent);
    if (list) list.push(child);
    else childrenByParent.set(parent, [child]);
    const parents = parentCandidates.get(child);
    if (parents) parents.push(parent);
    else parentCandidates.set(child, [parent]);
  };
  for (const edge of edges) {
    if (!isContainmentRelation(edge.type)) continue;
    if (edge.type === "belongs_to") push(edge.to, edge.from);
    else push(edge.from, edge.to);
  }
  const parentBySlug = new Map<string, string>();
  for (const [child, parents] of parentCandidates) {
    parentBySlug.set(child, parents.slice().sort()[0]);
  }
  return { childrenByParent, parentBySlug };
}

function overviewState(skeleton: OntologySkeleton): RevealState {
  return {
    scopeDomainSlug: null,
    scopeCapabilitySlug: null,
    visibleSlugs: new Set(skeleton.skeletonSlugs),
    revealedSlugs: new Set(),
    domainCapabilitySlugs: [],
    capabilityElementSlugs: [],
    crumbSlugs: [],
  };
}

export function computeRevealState(params: {
  skeleton: OntologySkeleton;
  nodes: readonly KnowledgeGraphNode[];
  edges: readonly KnowledgeGraphEdge[];
  selectedSlug: string | null;
}): RevealState {
  const { skeleton, nodes, edges, selectedSlug } = params;
  const kindBySlug = new Map(nodes.map((n) => [n.id, n.kind]));

  const selectedKind = selectedSlug ? kindBySlug.get(selectedSlug) : undefined;
  if (
    !selectedSlug ||
    selectedKind === undefined ||
    selectedKind === "project"
  ) {
    return overviewState(skeleton);
  }

  const { childrenByParent, parentBySlug } = buildContainmentLookup(edges);

  // 클릭 노드에서 scope 도메인/역량을 해석 — 요소는 부모 역량으로 승격.
  let scopeDomainSlug: string | null = null;
  let scopeCapabilitySlug: string | null = null;
  if (selectedKind === "domain") {
    scopeDomainSlug = selectedSlug;
  } else if (selectedKind === "capability") {
    scopeCapabilitySlug = selectedSlug;
    const parent = parentBySlug.get(selectedSlug);
    scopeDomainSlug =
      parent && kindBySlug.get(parent) === "domain" ? parent : null;
  } else if (selectedKind === "element") {
    const parent = parentBySlug.get(selectedSlug);
    if (parent && kindBySlug.get(parent) === "capability") {
      scopeCapabilitySlug = parent;
      const grand = parentBySlug.get(parent);
      scopeDomainSlug =
        grand && kindBySlug.get(grand) === "domain" ? grand : null;
    } else if (parent && kindBySlug.get(parent) === "domain") {
      scopeDomainSlug = parent;
    } else {
      return overviewState(skeleton);
    }
  } else {
    return overviewState(skeleton);
  }

  const visibleSlugs = new Set(skeleton.skeletonSlugs);
  const revealedSlugs = new Set<string>();
  const show = (slug: string) => {
    if (!visibleSlugs.has(slug)) revealedSlugs.add(slug);
    visibleSlugs.add(slug);
  };

  // 도메인 레이어 — scope 도메인의 모든 역량(가중치 desc → slug asc 정렬).
  let domainCapabilitySlugs: string[] = [];
  if (scopeDomainSlug) {
    const children = childrenByParent.get(scopeDomainSlug) ?? [];
    domainCapabilitySlugs = [...new Set(children)]
      .filter((child) => kindBySlug.get(child) === "capability")
      .sort((a, b) => {
        const wa = skeleton.subtreeWeightBySlug.get(a) ?? 0;
        const wb = skeleton.subtreeWeightBySlug.get(b) ?? 0;
        if (wa !== wb) return wb - wa;
        return a.localeCompare(b);
      })
      .slice(0, MAX_DOMAIN_REVEAL_CAPABILITIES);
    for (const slug of domainCapabilitySlugs) show(slug);
  }

  // 역량 레이어 — scope 역량 자신 + 그 요소(slug asc).
  let capabilityElementSlugs: string[] = [];
  if (scopeCapabilitySlug) {
    show(scopeCapabilitySlug);
    const children = childrenByParent.get(scopeCapabilitySlug) ?? [];
    capabilityElementSlugs = [...new Set(children)]
      .filter((child) => kindBySlug.get(child) === "element")
      .sort();
    for (const slug of capabilityElementSlugs) show(slug);
  }

  // breadcrumb — project 까지 containment 경로 역추적(cycle 가드).
  const crumbSlugs: string[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined = selectedSlug;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    crumbSlugs.unshift(cursor);
    if (kindBySlug.get(cursor) === "project") break;
    cursor = parentBySlug.get(cursor);
  }

  return {
    scopeDomainSlug,
    scopeCapabilitySlug,
    visibleSlugs,
    revealedSlugs,
    domainCapabilitySlugs,
    capabilityElementSlugs,
    crumbSlugs,
  };
}
