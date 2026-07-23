/**
 * "영역 전개" 런타임 — 전환 시작 시점에 서브트리·재배치 좌표·결계 기하·이탈
 * 시작 좌표를 한 번에 계산해 `ui/use-topology-loop.ts` 에 넘긴다. 순수 모델
 * (`model/realm.ts`)과 라이브 월드(`topology-world.ts`) 사이의 얇은 어댑터 —
 * 루프가 매 프레임 하는 일(FLIP·fling 좌표 적용)은 여기서 계산한 데이터를
 * `model/realm-transition.ts` 의 evaluate 함수에 먹이는 것뿐이다.
 */

import type { CameraTarget } from "../engine/camera";
import { fitWorldTarget } from "./topology-camera-math";
import {
  computeRealmLayout,
  computeVisibleBounds,
  computeVisibleWardingRadius,
  extractRealmSubtree,
  realmMaxDepth,
  realmRingsForDepth,
  type RealmBounds,
} from "../model/realm";
import type { LayoutRadii, LayoutRings } from "../model/layout";
import { computeTopologyClusterState } from "./topology-cluster-state";
import { radiusForKind, type TopologyWorld } from "./topology-world";
import type { TopologyV2Tokens } from "../tokens/read-topology-v2-tokens";

/** 콘텐츠 bbox 여유(월드 유닛) — 카메라 fit 이 가장 바깥 노드를 넉넉히 담게. */
const CONTENT_BOUNDS_MARGIN = 40;

const EMPTY_EXPANDED = new Set<string>();

export interface RealmRuntimeData {
  rootId: string;
  /** 영역 멤버 id (루트 포함). */
  memberIds: ReadonlySet<string>;
  /** 영역 밖 노드 id — 전환 후 하드 컬 대상. */
  outsideIds: ReadonlySet<string>;
  /** 각 멤버의 재배치 목표 좌표(루트=원점). */
  insideTargets: ReadonlyMap<string, { x: number; y: number }>;
  /** 각 멤버의 전환 시작 좌표(FLIP 출발점). */
  insideFrom: ReadonlyMap<string, { x: number; y: number }>;
  /** 각 밖 노드의 전환 시작 좌표(fling 출발점). */
  outsideFrom: ReadonlyMap<string, { x: number; y: number }>;
  /** fling 이 밀어내는 중력 중심 = 루트의 원래(원본 레이아웃) 위치. */
  flingCenter: { x: number; y: number };
  /** 결계 원 중심(월드) — 재배치 원점 (0,0). */
  wardingCenter: { x: number; y: number };
  /** 결계 반경(월드). */
  wardingRadius: number;
  /** 영역 재배치 bbox — 카메라 fit 대상. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /**
   * 멤버별 **깊이 기반 티어 kind** — 영역 세계에선 재배치 깊이가 곧 티어다
   * (루트=project, 1단계=domain, 2단계=capability, 3단계+=element). 원래
   * kind 로 티어 게이트를 돌리면 element 자식이 스파인 줌에서 숨어 영역이
   * 텅 비어 보인다 (실화면 실증).
   */
  tierKindById: ReadonlyMap<string, "project" | "domain" | "capability" | "element">;
  /**
   * 멤버별 루트로부터의 깊이(루트=0). S5 깊이 연출(FLIP 계단 지연 · 시차 밴드 ·
   * 선명도 차등)이 읽는 런타임 데이터 — `tierKindById` 와 같은 방식으로 노출한다.
   * (`tierKindById` 는 깊이를 4-티어로 뭉개므로 depth5 를 depth3 과 구분 못 한다;
   * 순차 지연/시차 계수는 원본 깊이로 판정하는 게 더 정확하다.)
   */
  depthById: ReadonlyMap<string, number>;
  /**
   * S8 결함 2 — 영역 진입 직전의 카메라 키프레임(x,y,scale). 영역 해제 시
   * overview fit 이 아니라 **이 좌표**로 트윈해 "원래 보던 곳"으로 복귀한다
   * (소유자 실보고). 진입 effect 가 채운다(빌드 시엔 카메라 미상이라 null 시작);
   * 카메라 미초기화(딥링크 마운트) 시엔 null 로 남아 해제가 overview 로 폴백한다.
   */
  entryCamera: CameraTarget | null;
}

const DEPTH_TIER_KINDS = ["project", "domain", "capability", "element"] as const;

/** 결정론적 per-id 폴백 각도 — 중심과 겹친 밖 노드의 이탈 방향(seed 없음). */
function fallbackAngleForId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(hash) % 1000) / 1000) * Math.PI * 2;
}

export function fallbackAngleFor(id: string): number {
  return fallbackAngleForId(id);
}

/**
 * 가시 멤버(밀도 게이트로 접히지 않은) → 재배치 목표 좌표. 밀도 게이트는 결정론
 * (`density-gate.ts`)이므로 같은 world+expandedParents 는 항상 같은 가시 집합을
 * 낸다. 결계 반경·bbox 계산이 공유한다.
 */
function collectVisibleMemberTargets(
  world: TopologyWorld,
  memberIds: ReadonlySet<string>,
  insideTargets: ReadonlyMap<string, { x: number; y: number }>,
  expandedParents: ReadonlySet<string>,
): Array<[string, { x: number; y: number }]> {
  const { clusteredIds } = computeTopologyClusterState(world, expandedParents);
  const out: Array<[string, { x: number; y: number }]> = [];
  for (const id of memberIds) {
    if (clusteredIds.has(id)) {
      // 접은 부모가 영역 **안** 멤버일 때만 접힘 유지 — 바깥 부모(공유 요소의
      // 1차 귀속처 등)의 밀도 게이트는 영역 내부를 가리지 못한다.
      const parentId = world.nodeById.get(id)?.parentId ?? null;
      if (parentId && memberIds.has(parentId)) continue;
    }
    const t = insideTargets.get(id);
    if (t) out.push([id, t]);
  }
  return out;
}

/**
 * S9 결함 2 — 현재 펼침 상태 기준 가시 콘텐츠 bbox. deselect/entry 카메라 fit 이
 * 접힌 자식까지 세어 화면을 과대 축소하지 않게, `buildRealmRuntimeData` 와 **같은
 * 가시-멤버 기준**으로 프레이밍을 낸다. 가시 멤버가 없으면 `data.bounds` 폴백.
 */
export function realmVisibleBounds(
  world: TopologyWorld,
  data: RealmRuntimeData,
  expandedParents: ReadonlySet<string>,
  tokens: TopologyV2Tokens,
): RealmBounds {
  const points: { x: number; y: number }[] = [];
  const reaches: number[] = [];
  let maxNodeRadius = 0;
  for (const [id, t] of collectVisibleMemberTargets(world, data.memberIds, data.insideTargets, expandedParents)) {
    const n = world.nodeById.get(id);
    const nr = n ? radiusForKind(n.kind, tokens) * n.magnitudeScale : 0;
    if (nr > maxNodeRadius) maxNodeRadius = nr;
    points.push(t);
    reaches.push(Math.hypot(t.x, t.y) + nr);
  }
  const contentBounds = computeVisibleBounds(points, CONTENT_BOUNDS_MARGIN + maxNodeRadius, data.bounds);
  // 결계 원 포함 프레이밍 — 같은 가시 집합으로 잰 결계 반경과 합집합 (아래
  // `buildRealmRuntimeData` 의 프레이밍 계약과 동일).
  return unionWithWardingCircle(contentBounds, computeVisibleWardingRadius(reaches));
}

/**
 * 카메라 fit bbox = 콘텐츠 bbox ∪ 결계 원 bbox. 결계 원은 영역 표면의 프레임
 * (하단 센서스 각인 포함)이라 잘리면 "우연한 호" 로 읽힌다 (소유자 실보고
 * 2026-07-23 "원이 왜 존재하는지 모르겠다"). S9 의 "콘텐츠가 주인공(결계는
 * 화면 밖 가장자리에 걸려도 좋다)" 은 접힌 자식까지 세던 유령 반경 시절의
 * 계약 — 가시-멤버 반경(S9 결함 2)이 된 지금 결계는 콘텐츠 +10% 여백이라
 * 원을 담아도 과대 축소가 없다. 순수.
 */
function unionWithWardingCircle(bounds: RealmBounds, wardingRadius: number): RealmBounds {
  return {
    minX: Math.min(bounds.minX, -wardingRadius),
    minY: Math.min(bounds.minY, -wardingRadius),
    maxX: Math.max(bounds.maxX, wardingRadius),
    maxY: Math.max(bounds.maxY, wardingRadius),
  };
}

/**
 * 전환 시작 데이터 구축 — 루트에서 서브트리를 추출하고 깊이 기준으로 재배치한
 * 좌표를 낸 뒤, 라이브 월드의 현재 좌표를 FLIP/fling 출발점으로 캡처한다.
 * `rootId` 가 월드에 없으면 null.
 */
export function buildRealmRuntimeData(
  world: TopologyWorld,
  rootId: string,
  tokens: TopologyV2Tokens,
  /**
   * S9 결함 2 — 진입 시점의 펼침 부모 Set(영역 루트 포함 권장). 결계 반경·카메라
   * bbox 를 **밀도 게이트로 접히지 않은 가시 멤버**만으로 잡아, 접힌 자식의
   * phyllotaxis 좌표가 원/프레이밍을 부풀리는 것을 막는다. 생략 시 전부 가시 취급.
   */
  expandedParents: ReadonlySet<string> = EMPTY_EXPANDED,
): RealmRuntimeData | null {
  if (!world.nodeById.has(rootId)) return null;
  // 멤버십은 원장/데이터시트와 같은 의미론 — **모든 contains edge** 를 걸어
  // 공유(다중 부모) 요소도 데려온다. `childrenByParent` 는 밀도 게이트용
  // 단일-부모 맵(마지막 edge 승자독식)이라 다른 역량에 주로 귀속된 공유
  // 요소가 빠져 "요소 2 인데 영역이 텅 빈 링" 이 됐다 (소유자 실보고
  // 2026-07-23, capability:builder-deep-link-focus 실증).
  const containsChildren = new Map<string, string[]>();
  for (const e of world.edges) {
    if (e.kind !== "contains") continue;
    const list = containsChildren.get(e.sourceId);
    if (list) list.push(e.targetId);
    else containsChildren.set(e.sourceId, [e.targetId]);
  }
  const subtree = extractRealmSubtree(rootId, containsChildren);
  const rings: LayoutRings = realmRingsForDepth(
    realmMaxDepth(subtree),
    { domain: tokens.layoutRingDomain, capability: tokens.layoutRingCapability, element: tokens.layoutRingElement },
    { depth1: tokens.realmFillRadius1, depth2: tokens.realmFillRadius2, depth3: tokens.realmFillRadius3 },
  );
  const radii: LayoutRadii = {
    project: tokens.radiusProject,
    domain: tokens.radiusDomain,
    capability: tokens.radiusCapability,
    element: tokens.radiusElement,
  };
  const layout = computeRealmLayout(subtree, rings, radii);

  const insideTargets = new Map<string, { x: number; y: number }>();
  const insideFrom = new Map<string, { x: number; y: number }>();
  const outsideFrom = new Map<string, { x: number; y: number }>();
  const outsideIds = new Set<string>();

  for (const node of world.nodes) {
    if (subtree.memberIds.has(node.id)) {
      const target = layout.get(node.id) ?? { x: 0, y: 0 };
      insideTargets.set(node.id, { x: target.x, y: target.y });
      insideFrom.set(node.id, { x: node.x, y: node.y });
    } else {
      outsideIds.add(node.id);
      outsideFrom.set(node.id, { x: node.x, y: node.y });
    }
  }

  const root = world.nodeById.get(rootId);
  const flingCenter = { x: root?.homeX ?? 0, y: root?.homeY ?? 0 };

  // S9 결함 2 — 결계 반경·카메라 bbox 는 **가시 멤버**(밀도 게이트로 접히지 않은
  // 것)만으로 잡는다. 접힌 자식(>12 자식 부모의 phyllotaxis 디스크)까지 세면 원은
  // 화면 밖까지, 콘텐츠 프레임은 과대 축소돼 "작은 콘텐츠 + 거대 원" 이 된다.
  const visibleMemberPoints: { x: number; y: number }[] = [];
  const reaches: number[] = [];
  let maxNodeRadius = 0;
  for (const [id, t] of collectVisibleMemberTargets(world, subtree.memberIds, insideTargets, expandedParents)) {
    const n = world.nodeById.get(id);
    const nr = n ? radiusForKind(n.kind, tokens) * n.magnitudeScale : 0;
    if (nr > maxNodeRadius) maxNodeRadius = nr;
    visibleMemberPoints.push(t);
    reaches.push(Math.hypot(t.x, t.y) + nr);
  }
  const wardingRadius = computeVisibleWardingRadius(reaches);

  // 카메라 fit = 가시 콘텐츠 bbox ∪ 결계 원 bbox (`unionWithWardingCircle` 주석
  // 참조 — 결계 원은 영역 표면의 프레임이므로 잘리지 않게 담는다).
  const bounds = unionWithWardingCircle(
    computeVisibleBounds(visibleMemberPoints, CONTENT_BOUNDS_MARGIN + maxNodeRadius, {
      minX: -wardingRadius,
      minY: -wardingRadius,
      maxX: wardingRadius,
      maxY: wardingRadius,
    }),
    wardingRadius,
  );

  return {
    rootId,
    memberIds: subtree.memberIds,
    outsideIds,
    insideTargets,
    insideFrom,
    outsideFrom,
    flingCenter,
    wardingCenter: { x: 0, y: 0 },
    wardingRadius,
    bounds,
    // 진입 effect 가 카메라 현재값으로 채운다(여기선 아직 카메라 미상).
    entryCamera: null,
    tierKindById: new Map(
      [...subtree.depthById].map(([id, depth]) => [
        id,
        DEPTH_TIER_KINDS[Math.min(depth, DEPTH_TIER_KINDS.length - 1)],
      ]),
    ),
    depthById: new Map(subtree.depthById),
  };
}

/**
 * 영역 콘텐츠 bbox 로의 카메라 fit 타깃 — 안전 인셋을 고려한 가시 영역 기준.
 * `computeOverviewCameraTarget` 과 같은 계약(가시 영역 중심 정렬)을 영역 bbox 에
 * 적용한다. `bounds` 는 `realmVisibleBounds` / `data.bounds`(둘 다 가시-멤버 기준)를
 * 넘긴다 — S9 결함 2 에서 결계 원과 프레이밍이 같은 가시-멤버 기준을 공유하도록.
 */
export function realmCameraTarget(
  bounds: RealmBounds,
  tokens: TopologyV2Tokens,
  viewportWidth: number,
  viewportHeight: number,
): CameraTarget {
  const insetLeft = tokens.safeInsetLeft;
  const insetRight = tokens.safeInsetRight;
  const insetTop = tokens.safeInsetTop;
  const insetBottom = tokens.safeInsetBottom;
  const effW = Math.max(1, viewportWidth - insetLeft - insetRight);
  const effH = Math.max(1, viewportHeight - insetTop - insetBottom);
  const fit = fitWorldTarget(bounds, effW, effH, tokens.cameraScaleMax, tokens.cameraScaleMin);
  return {
    tx: fit.tx - (insetLeft - insetRight) / (2 * fit.tscale),
    ty: fit.ty - (insetTop - insetBottom) / (2 * fit.tscale),
    tscale: fit.tscale,
  };
}
