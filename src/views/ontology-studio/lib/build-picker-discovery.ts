/**
 * 나침 무대(Compass Stage) 소켓 피커의 **발견 표면** 모델 — Slice 3 (피커
 * browse+추천). 검색어를 아직 모르는 첫 사용자가 노드 이름을 타이핑하지 않고도
 * "무엇을 이을지" 찾도록, 빈 피커에 두 존을 채운다:
 *
 *   1. 추천 (suggestions) — 이 소켓에 어울릴 만한 최대 N개 후보를, LLM 없이
 *      결정적 신호만으로 랭크한다: ① 초점 노드와 같은 도메인, ② 초점 노드와
 *      이름 유사(`titleSimilarity` 재사용), ③ 이웃의 이웃(초점의 직접 이웃과
 *      또 이어진 노드), ④ 방위별 kind 적합도. 가중 합산 + 안정 정렬.
 *   2. 둘러보기 (browse) — 도메인 드릴다운. 기본은 도메인 목록(이름 + 개수),
 *      도메인 클릭 시 그 도메인의 후보 노드 목록.
 *
 * `isA` 는 예외다. same-domain·이름 유사·이웃의 이웃은 direct subsumption의
 * 근거가 아니며 이 모델에는 정의 evidence + relation preflight가 없다. 따라서
 * `isA` 의 suggestions는 비워 두고, 후보는 중립적인 둘러보기에만 남긴다.
 *
 * 전부 순수 + 결정적 (Date/random 없음) — 컴포넌트는 렌더만 한다. 제외 대상은
 * 세 지점 공통: 초점 노드 자신 + 이미 어느 방위로든 직접 연결된 노드 + 아직
 * 저장 안 된 stage된 대상.
 *
 * FSD: `shared/lib/similar-node-title` 의 `titleSimilarity` 를 재사용해 유사도
 * 수식을 근접 중복 감지와 단일 진실원으로 둔다.
 */

import { titleSimilarity } from "@/shared/lib/similar-node-title";
import { candidateFromNode, type CreateCandidate } from "./build-create-node";
import type { StudioRelation, StudioSourceEdge, StudioSourceNode } from "./build-studio-item";

/** browse 그룹에서 "도메인 없음" 버킷을 가리키는 안정 키. */
export const NO_DOMAIN_KEY = "__no_domain__";

const DEFAULT_MAX_SUGGESTIONS = 5;
/** 이 아래의 제목 겹침은 잡음으로 본다(추천 신호로 세지 않음). */
const TITLE_SIMILARITY_FLOOR = 0.34;

// 블렌드 가중치 — 신호 우선순위(도메인 > 이름 > 이웃의 이웃)를 값으로 표현.
// kind 적합도는 단독으로는 추천을 만들지 못하고(이유 문구가 없다) 순위만 부스트.
const WEIGHT_SAME_DOMAIN = 2.2;
const WEIGHT_TITLE_SIMILAR = 1.6;
const WEIGHT_ADJACENT_OF_ADJACENT = 1.4;
const WEIGHT_KIND_FIT = 1.0;

/** project/domain 은 담는(컨테이너) kind — 기본 후보 풀에서 제외 대상. */
const CONTAINER_KINDS: ReadonlySet<string> = new Set(["project", "domain"]);

/**
 * 방위(관계)별 kind 적합도(0~1) — 하드 필터(`allowedKinds`) 안에서의 소프트
 * 선호. 예: 담는 것(contains) 소켓은 element 를 먼저 민다. `isA` 는 이
 * topology-only scorer가 추천하지 않으므로 적합도도 비워 둔다. 표에 없는
 * kind 는 적합도 0.
 */
const KIND_FIT: Record<StudioRelation, Record<string, number>> = {
  isA: {},
  dependsOn: { capability: 1, element: 0.7 },
  contains: { element: 1, capability: 0.6 },
  relates: { capability: 0.7, element: 0.7, domain: 0.5, project: 0.4 },
};

/** 추천 행에 붙는 평문 사유 — 컴포넌트가 i18n 라벨로 매핑한다. */
export type PickerSuggestionReason = "sameDomain" | "titleSimilar" | "adjacentOfAdjacent";

export interface PickerSuggestion {
  candidate: CreateCandidate;
  reason: PickerSuggestionReason;
}

export interface PickerBrowseDomain {
  /** 도메인 노드 id (예: `domain:ontology`), "도메인 없음" 버킷이면 null. */
  domainId: string | null;
  /** `nodesByDomain` 조회용 안정 키 — domainId 또는 `NO_DOMAIN_KEY`. */
  key: string;
  /** 표시 제목, "도메인 없음" 버킷이면 null(페이지가 라벨 공급). */
  title: string | null;
  count: number;
}

export interface PickerDiscovery {
  suggestions: PickerSuggestion[];
  domains: PickerBrowseDomain[];
  /** 도메인 키 → 그 도메인의 후보 노드(제목 asc). */
  nodesByDomain: Record<string, CreateCandidate[]>;
}

export interface BuildPickerDiscoveryInput {
  focalId: string;
  nodes: readonly StudioSourceNode[];
  edges: readonly StudioSourceEdge[];
  relation: StudioRelation;
  /** 이 관계가 허용하는 후보 kind (하드 필터). null = 컨테이너 아닌 모든 kind. */
  allowedKinds: ReadonlySet<string> | null;
  /** 아직 저장 안 된, 어느 방위로든 stage된 add 대상 id. */
  stagedTargetIds?: ReadonlySet<string>;
  /** 추천 최대 개수 (기본 5). */
  maxSuggestions?: number;
}

function compareString(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function titleOf(node: StudioSourceNode): string {
  return node.display ?? node.title;
}

/** contains/belongs_to 엣지를 childId → parentId 맵으로(첫 부모 우선). */
function buildParentOf(
  knownIds: ReadonlySet<string>,
  edges: readonly StudioSourceEdge[],
): Map<string, string> {
  const parentOf = new Map<string, string>();
  for (const edge of edges) {
    let parentId: string | undefined;
    let childId: string | undefined;
    if (edge.type === "contains") {
      parentId = edge.from;
      childId = edge.to;
    } else if (edge.type === "belongs_to") {
      parentId = edge.to;
      childId = edge.from;
    } else {
      continue;
    }
    if (!knownIds.has(parentId) || !knownIds.has(childId) || parentId === childId) continue;
    if (parentOf.has(childId)) continue;
    parentOf.set(childId, parentId);
  }
  return parentOf;
}

/** 컨테이너 부모를 타고 올라가 가장 가까운 domain 조상 id (domain 자신은 자기). */
function nearestDomainId(
  nodeId: string,
  kindOf: ReadonlyMap<string, string>,
  parentOf: ReadonlyMap<string, string>,
): string | null {
  if (kindOf.get(nodeId) === "domain") return nodeId;
  const visited = new Set<string>([nodeId]);
  let current = parentOf.get(nodeId);
  while (current) {
    if (visited.has(current)) return null;
    visited.add(current);
    if (kindOf.get(current) === "domain") return current;
    current = parentOf.get(current);
  }
  return null;
}

/** 무방향 인접 맵 (from↔to). */
function buildAdjacency(edges: readonly StudioSourceEdge[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    let set = adjacency.get(a);
    if (!set) {
      set = new Set<string>();
      adjacency.set(a, set);
    }
    set.add(b);
  };
  for (const edge of edges) {
    if (edge.from === edge.to) continue;
    link(edge.from, edge.to);
    link(edge.to, edge.from);
  }
  return adjacency;
}

/**
 * 빈 피커의 발견 표면을 조립한다. 초점 노드가 그래프에 없으면 빈 결과.
 */
export function buildPickerDiscovery(input: BuildPickerDiscoveryInput): PickerDiscovery {
  const { focalId, nodes, edges, relation, allowedKinds } = input;
  const maxSuggestions = input.maxSuggestions ?? DEFAULT_MAX_SUGGESTIONS;
  const staged = input.stagedTargetIds ?? new Set<string>();

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const kindOf = new Map(nodes.map((n) => [n.id, n.kind]));
  const knownIds = new Set(nodes.map((n) => n.id));
  const parentOf = buildParentOf(knownIds, edges);

  const focal = nodeById.get(focalId) ?? null;
  if (!focal) return { suggestions: [], domains: [], nodesByDomain: {} };

  const focalDomainId = nearestDomainId(focalId, kindOf, parentOf);
  const focalTitle = titleOf(focal);

  const adjacency = buildAdjacency(edges);
  const directNeighbors = adjacency.get(focalId) ?? new Set<string>();

  // 이웃의 이웃 — 초점의 직접 이웃과 몇 개나 공유하는지(공유 수가 클수록 상위).
  const sharedNeighborCount = new Map<string, number>();
  for (const neighborId of directNeighbors) {
    const second = adjacency.get(neighborId);
    if (!second) continue;
    for (const candidateId of second) {
      if (candidateId === focalId || directNeighbors.has(candidateId)) continue;
      sharedNeighborCount.set(candidateId, (sharedNeighborCount.get(candidateId) ?? 0) + 1);
    }
  }

  const kindAllowed = (kind: string): boolean =>
    allowedKinds ? allowedKinds.has(kind) : !CONTAINER_KINDS.has(kind);
  const isExcluded = (id: string): boolean =>
    id === focalId || directNeighbors.has(id) || staged.has(id);

  const pool = nodes.filter((n) => kindAllowed(n.kind) && !isExcluded(n.id));

  // ── 추천 ──────────────────────────────────────────────────────────────
  const kindFitTable = KIND_FIT[relation];
  const scored = pool
    .map((node) => {
      const domainId = nearestDomainId(node.id, kindOf, parentOf);
      const sameDomain = focalDomainId != null && domainId === focalDomainId;
      const similarity = focalTitle ? titleSimilarity(focalTitle, titleOf(node)) : 0;
      const titleClose = similarity >= TITLE_SIMILARITY_FLOOR;
      const shared = sharedNeighborCount.get(node.id) ?? 0;

      const contribSameDomain = sameDomain ? WEIGHT_SAME_DOMAIN : 0;
      const contribTitle = titleClose ? WEIGHT_TITLE_SIMILAR * similarity : 0;
      const contribAdjacent = shared > 0 ? WEIGHT_ADJACENT_OF_ADJACENT : 0;
      const kindFit = kindFitTable[node.kind] ?? 0;

      const reasoned = contribSameDomain > 0 || contribTitle > 0 || contribAdjacent > 0;
      const score = contribSameDomain + contribTitle + contribAdjacent + WEIGHT_KIND_FIT * kindFit;

      // 가장 크게 기여한 신호를 사유로(동점은 도메인 > 이름 > 이웃의 이웃 순).
      const contributions: Array<[PickerSuggestionReason, number]> = [
        ["sameDomain", contribSameDomain],
        ["titleSimilar", contribTitle],
        ["adjacentOfAdjacent", contribAdjacent],
      ];
      let reason: PickerSuggestionReason = contributions[0][0];
      let best = contributions[0][1];
      for (const [candidateReason, contribution] of contributions) {
        if (contribution > best) {
          reason = candidateReason;
          best = contribution;
        }
      }

      return { node, score, reasoned, reason, shared };
    })
    .filter((entry) => entry.reasoned);

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.shared - a.shared ||
      compareString(titleOf(a.node), titleOf(b.node)) ||
      compareString(a.node.id, b.node.id),
  );

  // O1.1 — `is_a` needs semantic evidence that every narrower instance
  // satisfies the broader definition plus a candidate-specific preflight.
  // This topology-only scorer has neither. Keeping the browse pool below is
  // useful; calling any of it a recommendation would turn proximity into fact.
  const suggestions: PickerSuggestion[] =
    relation === "isA"
      ? []
      : scored
          .slice(0, maxSuggestions)
          .map((entry) => ({ candidate: candidateFromNode(entry.node), reason: entry.reason }));

  // ── 둘러보기 (도메인 드릴다운) ─────────────────────────────────────────
  const nodesByDomainMap = new Map<string, CreateCandidate[]>();
  const domainMeta = new Map<string, { domainId: string | null; title: string | null }>();
  for (const node of pool) {
    // 컨테이너(domain/project) 후보는 자기 자신을 담는 그룹을 만들지 않도록
    // "도메인 없음" 버킷으로 보낸다.
    const domainId =
      node.kind === "domain" || node.kind === "project"
        ? null
        : nearestDomainId(node.id, kindOf, parentOf);
    const key = domainId ?? NO_DOMAIN_KEY;
    let bucket = nodesByDomainMap.get(key);
    if (!bucket) {
      bucket = [];
      nodesByDomainMap.set(key, bucket);
      const domainNode = domainId ? nodeById.get(domainId) : null;
      domainMeta.set(key, {
        domainId,
        title: domainNode ? titleOf(domainNode) : null,
      });
    }
    bucket.push(candidateFromNode(node));
  }

  for (const bucket of nodesByDomainMap.values()) {
    bucket.sort((a, b) => compareString(a.title, b.title) || compareString(a.id, b.id));
  }

  const domains: PickerBrowseDomain[] = [...nodesByDomainMap.entries()].map(([key, bucket]) => {
    const meta = domainMeta.get(key)!;
    return { domainId: meta.domainId, key, title: meta.title, count: bucket.length };
  });
  domains.sort((a, b) => {
    if (a.key === NO_DOMAIN_KEY && b.key !== NO_DOMAIN_KEY) return 1;
    if (b.key === NO_DOMAIN_KEY && a.key !== NO_DOMAIN_KEY) return -1;
    return (
      b.count - a.count ||
      compareString(a.title ?? "", b.title ?? "") ||
      compareString(a.key, b.key)
    );
  });

  const nodesByDomain: Record<string, CreateCandidate[]> = {};
  for (const [key, bucket] of nodesByDomainMap) nodesByDomain[key] = bucket;

  return { suggestions, domains, nodesByDomain };
}
