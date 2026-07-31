/**
 * Builds v2's per-mount "world" — deterministic layout + adjacency + bow
 * control points + brightness ranking — from the adapter's node/edge props
 * (`docs/TOPOLOGY-V2-DESIGN.md` §4 P2/P3). Recomputed only when the graph
 * itself changes (mount, `relayoutToken`, or a new `nodes`/`edges` reference)
 * — never per animation frame, matching the prototype's "layout precomputed
 * once" invariant (`model/layout.ts`'s own contract).
 */

import { computeDensityGate, type DensityGateParentGeometry } from "../model/density-gate";
import { computeConcentricLayout, type LayoutGraphNode, type LayoutRings } from "../model/layout";
import { computeBowControlPoint, computeDependsBowControlPoint } from "../render/traces";
import { fireflySeed } from "../render/edge-fireflies";
import type { TopologyV2Tokens } from "../tokens/read-topology-v2-tokens";
import type { TopologyV2Edge, TopologyV2Node } from "./TopologyMapV2";

export type WorldNodeKind = "project" | "domain" | "capability" | "element";

export interface WorldNode {
  id: string;
  kind: WorldNodeKind;
  label: string;
  x: number;
  y: number;
  /**
   * C1 B3 — the deterministic layout coordinate from THIS build pass, cached
   * once and never mutated by drag/force-sim writes to `x`/`y`. Auto-arrange
   * springs every node back to its own `homeX`/`homeY` (`use-topology-loop.ts`'s
   * `relayoutToken` effect) — the "canonical layout" contract.
   */
  homeX: number;
  homeY: number;
  /** contains 단일(1차) 부모 id — 밀도 게이트의 접힘 귀속처. 다중 부모 공유
   *  노드는 마지막 contains edge 의 부모 하나만 담는다 (영역 언클러스터
   *  규칙이 "접은 부모가 영역 밖인가" 판정에 사용). */
  parentId: string | null;
  isHub: boolean;
  fresh: boolean;
  /** Adapter contract (`TopologyV2Node`) has no staleness signal yet — always false until a follow-up adds one. */
  stale: boolean;
  /**
   * Transitive descendant count — engraved as a numeral on project/domain chips
   * in circuit range (0 = skip). 패널3-S6 숫자 계약: 이 **노드 뱃지 = 하위 전체
   * 자손 수**(`TopologyV2Node.descendantCount` = census total). 클러스터 칩 호버
   * 툴팁의 "하위 전체 N"과 같은 출처라 두 표면의 숫자가 drift 없이 일치한다.
   */
  count: number;
  /**
   * 규모 배율 (빌드 시 1회). domain/capability 만 ≠1. draw·히트테스트·분리
   * 완화가 전부 이 값을 곱해 셋이 절대 어긋나지 않는다. Shneiderman
   * overview-first: overview 의 첫 질문 "어디가 큰가"에 마크가 답하게 한다.
   * S2 파트 2 — **직속 자식 수**의 √스케일(항상 base 이상, +40% 상한). 뱃지
   * 숫자(descendantCount)와는 다른 채널: 크기=사전주의, 뱃지=판독.
   */
  magnitudeScale: number;
}

export interface WorldEdge {
  sourceId: string;
  targetId: string;
  kind: "contains" | "depends";
  ax: number;
  ay: number;
  bx: number;
  by: number;
  controlX: number;
  controlY: number;
  /** Ambient comet-tail progress 0..1, `depends` edges only — mutated per frame by the caller (`use-topology-loop.ts`). */
  t: number;
  /**
   * P3a — containment 깊이 (엔드포인트 kind 로 유도): 0 = project 가 낀 뼈대,
   * 1 = domain 이 낀 중간 구조, 2 = capability/element 잔가지. 렌더는 이
   * 값으로 잉크 강도(굵기×명도) 사다리를 탄다 — 계층은 순서(ordinal)라
   * hue 가 아니라 명도/크기 채널이 옳다 (`edge-hierarchy-ink.md`).
   * `depends` 엣지는 타입 채널(파선) 소속이라 이 값을 쓰지 않는다.
   */
  level: 0 | 1 | 2;
  /** P3b — 원 관계 타입 (contains/depends 2치로 뭉개기 전의 의미). */
  relationType: string;
  /** P3b — 이 관계를 선언한 vault 문서 slug (엣지 팝오버의 출처 표시). */
  declaredBySlug: string | null;
}

/**
 * S2 파트 2 — 규모 비례 노드 크기. domain/capability 반지름을 **직속 자식 수**
 * 의 √스케일로 보간한다: `1 + k×(√childCount − 1)/√maxChildCount`, 최대 +40%
 * 상한(1.4)으로 clamp. childCount ≤ 1 이면 base(1.0) — 항상 base 이상(구 로그
 * 압축은 중앙값 미만 노드를 base 아래로 줄였다). element/project 는 불변(1).
 * √라 큰 격차를 압축하되 순위 단서는 유지(막대그래프 아님, Shneiderman
 * overview-first). 뱃지 숫자(descendantCount)와는 다른 채널 — 크기는 사전주의
 * "어디가 큰가", 뱃지는 판독.
 */
export function computeMagnitudeScale(
  kind: WorldNodeKind,
  childCount: number,
  maxChildCount: number,
  k: number,
): number {
  if (kind !== "domain" && kind !== "capability") return 1;
  if (maxChildCount <= 0 || childCount <= 0 || k <= 0) return 1;
  const raw = 1 + (k * (Math.sqrt(childCount) - 1)) / Math.sqrt(maxChildCount);
  return Math.min(1.4, Math.max(1, raw));
}

/** P3a — 두 엔드포인트 kind 에서 containment 잉크 레벨을 유도한다. */
export function containmentLevelFor(aKind: WorldNodeKind, bKind: WorldNodeKind): 0 | 1 | 2 {
  if (aKind === "project" || bKind === "project") return 0;
  if (aKind === "domain" || bKind === "domain") return 1;
  return 2;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * 밀도 게이트 슬라이스 (fable 설계) — 부모별 클러스터 칩 배치 메타. angle 은
 * 레이아웃 부채꼴 방향(home 좌표에서 유도, 정적), ring 은 칩을 앉힐 자식 링
 * 반지름. 칩의 실제 월드 anchor 는 매 프레임 부모의 *라이브* 위치 + 이 정적
 * 방향으로 다시 계산한다 (`topology-cluster-state.ts`).
 */
export interface ClusterParentMeta {
  angle: number;
  ring: number;
}

export interface TopologyWorld {
  nodes: readonly WorldNode[];
  nodeById: ReadonlyMap<string, WorldNode>;
  edges: WorldEdge[];
  neighborMap: ReadonlyMap<string, ReadonlySet<string>>;
  /** contains 부모 id → 직속 자식 id 배열 (밀도 게이트 입력, 정적). */
  childrenByParent: ReadonlyMap<string, readonly string[]>;
  /** 밀도 게이트 칩 배치 메타 (자식 있는 부모만, 정적). */
  clusterMetaByParent: ReadonlyMap<string, ClusterParentMeta>;
  /** Top `starCount` nodes by magnitude — get the far-field diffraction-spike overlay. */
  brightStarIds: ReadonlySet<string>;
  /** Bbox of ALL nodes — used for pan clamping and focus-mode context. */
  bounds: Bounds;
  /**
   * Bbox of just the level-0 SPINE (project + domain + hub) — what the overview
   * camera fits to. The overview only DRAWS the spine (tier gating in
   * `model/tier-visibility.ts`), so fitting the full `bounds` — which the
   * de-pileup deliberately spreads wide across all 295 nodes — zooms the ~8
   * visible spine nodes down to a dot (the fit regression). Recomputed with
   * `bounds` whenever geometry changes.
   */
  spineBounds: Bounds;
}

export function radiusForKind(kind: WorldNodeKind, tokens: TopologyV2Tokens): number {
  if (kind === "project") return tokens.radiusProject;
  if (kind === "domain") return tokens.radiusDomain;
  if (kind === "capability") return tokens.radiusCapability;
  return tokens.radiusElement;
}

const FALLBACK_BOUNDS: Bounds = { minX: -100, minY: -100, maxX: 100, maxY: 100 };

/**
 * A "spine" node is one shown at the overview entry (tier alpha = 1 at zoom
 * ratio 1): the project root, every domain, and any hub node. MUST mirror
 * `nodeTierAlpha`'s always-visible branch in `model/tier-visibility.ts` — if
 * that gate changes, this must too, or the fit and the visible set drift apart.
 */
export function isSpineNode(node: Pick<WorldNode, "kind" | "isHub">): boolean {
  return node.isHub || node.kind === "project" || node.kind === "domain";
}

/**
 * Radius-padded bbox of the nodes matching `include` (all nodes when omitted).
 * Returns `null` when nothing matched so callers can pick their own fallback.
 */
function accumulateBounds(
  nodes: readonly WorldNode[],
  tokens: TopologyV2Tokens,
  include?: (node: WorldNode) => boolean,
): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    if (include && !include(node)) continue;
    const r = radiusForKind(node.kind, tokens);
    minX = Math.min(minX, node.x - r);
    maxX = Math.max(maxX, node.x + r);
    minY = Math.min(minY, node.y - r);
    maxY = Math.max(maxY, node.y + r);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/** Radius-padded bbox of all nodes, with a finite fallback for an empty graph. */
export function computeFullBounds(nodes: readonly WorldNode[], tokens: TopologyV2Tokens): Bounds {
  return accumulateBounds(nodes, tokens) ?? { ...FALLBACK_BOUNDS };
}

/**
 * Overview-fit bbox: just the spine (project + domain + hub). Falls back to the
 * full-graph bounds when no spine node exists (degenerate vault), then to a
 * finite default for an empty graph. Pure — the overview camera + its altitude/
 * zoom-ratio anchor both fit to THIS, not the full 295-node bounds.
 */
export function computeSpineBounds(nodes: readonly WorldNode[], tokens: TopologyV2Tokens): Bounds {
  return accumulateBounds(nodes, tokens, isSpineNode) ?? computeFullBounds(nodes, tokens);
}

/**
 * Radius-padded bbox of a focused node + its 1-hop neighbors (the ego cluster).
 * Returns `null` when `focusedSlug` doesn't resolve. Shared by the focus camera
 * fit (`topology-camera-math.ts#computeFocusCameraTarget`, which adds its own
 * fit margin) and the focus-aware pan clamp (`topology-physics-step.ts`, which
 * adds `--topology-v2-camera-focus-pan-margin`) so the "ego cluster" is defined
 * in exactly one place. Pure — derived from `nodeById` + `neighborMap`.
 */
export function computeEgoBounds(
  world: Pick<TopologyWorld, "nodeById" | "neighborMap">,
  tokens: TopologyV2Tokens,
  focusedSlug: string,
  /**
   * S8 결함 4 — 영역 전개 중 ego bbox 를 영역 멤버로 제한한다. 영역 active 중엔
   * 결계 밖 이웃이 fling 좌표(원점에서 수천 유닛 밖)에 앉아 있어, 제한 없이
   * bbox 를 재면 그 밖 이웃까지 감싸느라 카메라가 극단적으로 축소돼 "화면이
   * 사라진다"(소유자 실보고). 이 Set 이 주어지면 focus 노드 + **그 안에 있는**
   * 이웃만 bbox 에 넣는다(포커스 다이브가 결계 안에서만 움직인다). 생략 시 전역.
   */
  restrictIds?: ReadonlySet<string> | null,
): Bounds | null {
  const focusNode = world.nodeById.get(focusedSlug);
  if (!focusNode) return null;
  const egoIds = new Set<string>([focusedSlug]);
  for (const id of world.neighborMap.get(focusedSlug) ?? []) {
    if (restrictIds && !restrictIds.has(id)) continue;
    egoIds.add(id);
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of egoIds) {
    const n = world.nodeById.get(id);
    if (!n) continue;
    const r = radiusForKind(n.kind, tokens);
    minX = Math.min(minX, n.x - r);
    maxX = Math.max(maxX, n.x + r);
    minY = Math.min(minY, n.y - r);
    maxY = Math.max(maxY, n.y + r);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * S2 파트 5B — 펼친 클러스터 "디스크"(부모 + 그 직속 자식 부챗살)의 반지름
 * 패딩 bbox. 칩을 클릭해 부모를 펼치면 카메라가 이 bbox 로 다이브해 "펼쳐졌다"가
 * 뷰포트에 보이게 한다(소유자 실보고 #2: "확장해도 아무 변화가 안 보임"). ego
 * bbox(`computeEgoBounds`)와 같은 패턴 — 여기선 이웃이 아니라 contains 직속
 * 자식을 담는다. `parentId` 미해결/자식 없음이면 `null`.
 */
export function computeClusterDiscBounds(
  world: Pick<TopologyWorld, "nodeById" | "childrenByParent">,
  tokens: TopologyV2Tokens,
  parentId: string,
  /**
   * 고팬아웃 배치-공개(2026-07) — 주어지면 이 집합에 속한 노드만 bbox 에
   * 포함한다(부모 + 이번 배치 자식). null/생략 = 부모 + 직속 자식 전체(회귀 0).
   */
  restrictIds?: ReadonlySet<string> | null,
): Bounds | null {
  const parent = world.nodeById.get(parentId);
  if (!parent) return null;
  const ids = new Set<string>([parentId]);
  for (const id of world.childrenByParent.get(parentId) ?? []) {
    if (!restrictIds || restrictIds.has(id)) ids.add(id);
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of ids) {
    const n = world.nodeById.get(id);
    if (!n) continue;
    const r = radiusForKind(n.kind, tokens) * n.magnitudeScale;
    minX = Math.min(minX, n.x - r);
    maxX = Math.max(maxX, n.x + r);
    minY = Math.min(minY, n.y - r);
    maxY = Math.max(maxY, n.y + r);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * 완화(de-pileup) 대상 = **밀도 게이트가 접지 않는 노드**.
 *
 * `computeDensityGate` 의 `clusteredIds` 는 기하가 필요 없다 — 부모별 자식
 * 수와 임계만 본다. 그래서 배치 **전에** 계산할 수 있고, 그 결과로 "이 볼트에서
 * 절대 안 그려지는 노드" 를 미리 안다. 칩 앵커만 기하를 요구하는데 그건 배치
 * 뒤에 `computeTopologyClusterState` 가 따로 만든다(순환 없음).
 *
 * 여기서는 `expandedParents` 를 빈 집합으로 본다 — 월드는 그래프가 바뀔 때만
 * 지어지고 펼침 상태를 모른다. 펼침으로 드러나는 자식은 씨앗 좌표를 갖고 있어
 * 좌표 구멍이 생기지 않는다.
 */
function computeRelaxScope(layoutInput: readonly LayoutGraphNode[]): ReadonlySet<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const n of layoutInput) {
    if (n.parentId === null) continue;
    const siblings = childrenByParent.get(n.parentId);
    if (siblings) siblings.push(n.id);
    else childrenByParent.set(n.parentId, [n.id]);
  }
  const kindById = new Map(layoutInput.map((n) => [n.id, n.kind as string]));
  const { clusteredIds } = computeDensityGate({
    childrenByParent,
    expandedParents: EMPTY_EXPANDED_PARENTS,
    // 칩 앵커는 여기서 안 쓴다 — `clusteredIds` 만 필요하고 그건 기하 무관.
    parentGeometry: EMPTY_PARENT_GEOMETRY,
    kindOf: (id) => kindById.get(id),
  });
  const scope = new Set<string>();
  for (const n of layoutInput) if (!clusteredIds.has(n.id)) scope.add(n.id);
  return scope;
}

const EMPTY_EXPANDED_PARENTS: ReadonlySet<string> = new Set();
const EMPTY_PARENT_GEOMETRY: ReadonlyMap<string, DensityGateParentGeometry> = new Map();

export function buildTopologyWorld(
  nodes: readonly TopologyV2Node[],
  edges: readonly TopologyV2Edge[],
  tokens: TopologyV2Tokens,
): TopologyWorld {
  const containsParentById = new Map<string, string>();
  for (const edge of edges) {
    if (edge.kind === "contains") containsParentById.set(edge.target, edge.source);
  }

  const layoutInput: LayoutGraphNode[] = nodes.map((n) => ({
    id: n.id,
    kind: n.kind,
    parentId: containsParentById.get(n.id) ?? null,
  }));
  const rings: LayoutRings = {
    domain: tokens.layoutRingDomain,
    capability: tokens.layoutRingCapability,
    element: tokens.layoutRingElement,
  };
  // 완화 범위 = **이 볼트에서 그려질 수 있는 노드**. 밀도 게이트가 접는
  // 서브트리(자식 12개 초과 부모 아래)는 칩 뒤에 숨어 한 번도 그려지지
  // 않으므로, 그것들의 겹침을 푸는 데 시간을 쓰지 않는다. 씨앗 좌표는
  // 여전히 전부 계산되므로 티어가 열리거나 칩을 펼칠 때 좌표 구멍이 없다.
  //
  // `expandedParents` 는 일부러 넘기지 않는다 — 월드는 그래프가 바뀔 때만
  // 다시 지어지고(`use-topology-loop.ts` 의 `useEffect`), 펼침마다 재구축하면
  // 등장 램프와 스프링이 초기화돼 화면이 튄다. 펼친 자식은 씨앗 자리에
  // 나타나고, 국소 재완화는 후속 슬라이스가 맡는다.
  const relaxScope = computeRelaxScope(layoutInput);
  // Feed the real §2.3 node radii into the deterministic de-pileup so its
  // collision min-distance matches what actually gets drawn.
  const pointById = new Map(
    computeConcentricLayout(layoutInput, rings, {
      radii: {
        project: tokens.radiusProject,
        domain: tokens.radiusDomain,
        capability: tokens.radiusCapability,
        element: tokens.radiusElement,
      },
      relaxScope,
    }).map((p) => [p.id, p]),
  );

  const worldNodes: WorldNode[] = nodes.map((n) => {
    const point = pointById.get(n.id);
    const x = point?.x ?? 0;
    const y = point?.y ?? 0;
    return {
      id: n.id,
      kind: n.kind,
      label: n.label,
      x,
      y,
      homeX: x,
      homeY: y,
      parentId: containsParentById.get(n.id) ?? null,
      isHub: n.isHub,
      fresh: n.recentlyUpdated,
      // 살아있는 지도 드리프트 — 어댑터가 vault mtime 으로 판정한 dusty 를
      // 기존 stale 시각 채널(freshness.ts: dash [3,3] + 불투명 토큰)에 배선.
      stale: n.stale ?? false,
      count: n.descendantCount,
      magnitudeScale: 1, // 아래 2차 패스에서 maxCount 확정 후 채움

    };
  });
  const nodeById = new Map(worldNodes.map((n) => [n.id, n]));

  const neighborMap = new Map<string, Set<string>>();
  for (const n of worldNodes) neighborMap.set(n.id, new Set());
  const addNeighbor = (a: string, b: string) => {
    neighborMap.get(a)?.add(b);
    neighborMap.get(b)?.add(a);
  };

  // 밀도 게이트 슬라이스 (fable 설계) — contains 부모→자식 맵과 칩 배치 메타를
  // 정적으로 구축한다. 자식 순서는 `nodes` 순서(결정론)를 따른다.
  const childrenByParent = new Map<string, string[]>();
  for (const node of worldNodes) {
    const parentId = containsParentById.get(node.id);
    if (parentId === undefined) continue;
    const list = childrenByParent.get(parentId);
    if (list) list.push(node.id);
    else childrenByParent.set(parentId, [node.id]);
  }
  const clusterMetaByParent = new Map<string, ClusterParentMeta>();
  for (const [parentId, childIds] of childrenByParent) {
    const parent = nodeById.get(parentId);
    if (!parent) continue;
    // outward 방향 = 부모의 부모 → 부모 (home 좌표, 정적). 도메인은
    // 조부모=프로젝트(원점 근처)라 원점에서 도메인으로의 방향과 같다.
    const grandParentId = containsParentById.get(parentId);
    const gp = grandParentId ? nodeById.get(grandParentId) : undefined;
    const gx = gp?.homeX ?? 0;
    const gy = gp?.homeY ?? 0;
    const angle = Math.atan2(parent.homeY - gy, parent.homeX - gx);
    const firstChild = nodeById.get(childIds[0]);
    const ring =
      firstChild?.kind === "capability" ? tokens.layoutRingCapability : tokens.layoutRingElement;
    clusterMetaByParent.set(parentId, { angle, ring });
  }

  // S2 파트 2 — 규모 배율 2차 패스: 직속 자식 수(childrenByParent) 기반 √스케일.
  // maxChildCount 는 배율 대상(domain/capability)만 본다 — project 의 자식 수는
  // 정규화 분모를 왜곡하므로 제외한다.
  {
    const childCountOf = (id: string) => childrenByParent.get(id)?.length ?? 0;
    let maxChildCount = 0;
    for (const node of worldNodes) {
      if (node.kind === "domain" || node.kind === "capability") {
        maxChildCount = Math.max(maxChildCount, childCountOf(node.id));
      }
    }
    for (const node of worldNodes) {
      node.magnitudeScale = computeMagnitudeScale(node.kind, childCountOf(node.id), maxChildCount, tokens.radiusMagnitudeK);
    }
  }

  const worldEdges: WorldEdge[] = [];
  for (const edge of edges) {
    const a = nodeById.get(edge.source);
    const b = nodeById.get(edge.target);
    if (!a || !b) continue;
    addNeighbor(a.id, b.id);
    const control =
      edge.kind === "depends"
        ? computeDependsBowControlPoint({ x: a.x, y: a.y }, { x: b.x, y: b.y }, tokens.edgeBowDepends)
        : computeBowControlPoint(
            { x: a.x, y: a.y },
            { x: b.x, y: b.y },
            tokens.edgeBowContains,
            tokens.edgeBlendContains,
          );
    worldEdges.push({
      sourceId: a.id,
      targetId: b.id,
      kind: edge.kind,
      ax: a.x,
      ay: a.y,
      bx: b.x,
      by: b.y,
      controlX: control.x,
      controlY: control.y,
      // R6 상시 혜성 — 결정론 시드로 위상을 어긋내 lockstep(모든 코멧이 같은
      // 위상으로 동시에 흐르는 파도)을 피한다. contains 는 코멧이 없어 무의미.
      t: fireflySeed(a.id, b.id),
      level: containmentLevelFor(a.kind, b.kind),
      relationType: edge.relationType,
      declaredBySlug: edge.declaredBySlug ?? null,
    });
  }

  // magnitude = size + fullDegree*18, ported from the prototype's `count +
  // degree*18` — the adapter has no separate "count" field, `size` is its
  // closest analog (follow-up: confirm with the HomePage adapter contract).
  const ranked = [...nodes].sort((x, y) => y.size + y.fullDegree * 18 - (x.size + x.fullDegree * 18));
  const brightStarIds = new Set(ranked.slice(0, Math.max(0, Math.round(tokens.starCount))).map((n) => n.id));

  return {
    nodes: worldNodes,
    nodeById,
    edges: worldEdges,
    neighborMap,
    childrenByParent,
    clusterMetaByParent,
    brightStarIds,
    bounds: computeFullBounds(worldNodes, tokens),
    spineBounds: computeSpineBounds(worldNodes, tokens),
  };
}

/**
 * Writes live force-simulation positions back into the (mutable) world nodes.
 * Positions the sim didn't produce (non-finite, guarded out in
 * `force-layout.ts#positions`) leave the node's last-good coordinate intact.
 */
export function applyForcePositions(world: TopologyWorld, positions: ReadonlyMap<string, { x: number; y: number }>): void {
  for (const node of world.nodes) {
    const p = positions.get(node.id);
    if (p) {
      node.x = p.x;
      node.y = p.y;
    }
  }
}

/**
 * Recomputes every edge's endpoints + bow control point and the world bounds
 * from the current (force-updated) node positions. Called each frame while the
 * sim is warm — the "layout precomputed once" invariant only held while
 * positions were static; a living graph refreshes derived geometry per frame.
 */
export function recomputeWorldGeometry(world: TopologyWorld, tokens: TopologyV2Tokens): void {
  for (const edge of world.edges) {
    const a = world.nodeById.get(edge.sourceId);
    const b = world.nodeById.get(edge.targetId);
    if (!a || !b) continue;
    edge.ax = a.x;
    edge.ay = a.y;
    edge.bx = b.x;
    edge.by = b.y;
    const control =
      edge.kind === "depends"
        ? computeDependsBowControlPoint({ x: a.x, y: a.y }, { x: b.x, y: b.y }, tokens.edgeBowDepends)
        : computeBowControlPoint(
            { x: a.x, y: a.y },
            { x: b.x, y: b.y },
            tokens.edgeBowContains,
            tokens.edgeBlendContains,
          );
    edge.controlX = control.x;
    edge.controlY = control.y;
  }

  const full = accumulateBounds(world.nodes, tokens);
  if (full) {
    world.bounds.minX = full.minX;
    world.bounds.minY = full.minY;
    world.bounds.maxX = full.maxX;
    world.bounds.maxY = full.maxY;
  }
  const spine = computeSpineBounds(world.nodes, tokens);
  world.spineBounds.minX = spine.minX;
  world.spineBounds.minY = spine.minY;
  world.spineBounds.maxX = spine.maxX;
  world.spineBounds.maxY = spine.maxY;
}
