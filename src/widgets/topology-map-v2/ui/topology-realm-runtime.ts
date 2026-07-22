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
  computeWardingRadius,
  extractRealmSubtree,
} from "../model/realm";
import type { LayoutRadii, LayoutRings } from "../model/layout";
import { radiusForKind, type TopologyWorld } from "./topology-world";
import type { TopologyV2Tokens } from "../tokens/read-topology-v2-tokens";

/** 결계 링과 노드 사이 여유(월드 유닛) — 결계가 가장 바깥 노드를 넉넉히 감싼다. */
const WARDING_MARGIN = 64;

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
 * 전환 시작 데이터 구축 — 루트에서 서브트리를 추출하고 깊이 기준으로 재배치한
 * 좌표를 낸 뒤, 라이브 월드의 현재 좌표를 FLIP/fling 출발점으로 캡처한다.
 * `rootId` 가 월드에 없으면 null.
 */
export function buildRealmRuntimeData(
  world: TopologyWorld,
  rootId: string,
  tokens: TopologyV2Tokens,
): RealmRuntimeData | null {
  if (!world.nodeById.has(rootId)) return null;
  const subtree = extractRealmSubtree(rootId, world.childrenByParent);
  const rings: LayoutRings = {
    domain: tokens.layoutRingDomain,
    capability: tokens.layoutRingCapability,
    element: tokens.layoutRingElement,
  };
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

  // 결계 반경 = 재배치 원점에서 가장 먼 멤버까지 + 그 노드 반지름 + 여유.
  let maxNodeRadius = 0;
  for (const id of subtree.memberIds) {
    const n = world.nodeById.get(id);
    if (n) maxNodeRadius = Math.max(maxNodeRadius, radiusForKind(n.kind, tokens) * n.magnitudeScale);
  }
  const wardingRadius = computeWardingRadius(
    [...insideTargets.values()],
    { x: 0, y: 0 },
    WARDING_MARGIN + maxNodeRadius,
  );

  const root = world.nodeById.get(rootId);
  const flingCenter = { x: root?.homeX ?? 0, y: root?.homeY ?? 0 };

  // 카메라 fit 은 결계(여유 포함 큰 원)가 아니라 **콘텐츠 bbox** 기준 —
  // 결계에 맞추면 세계가 화면 중앙에 조그맣게 보인다 (녹화 프레임 검수).
  // 결계는 화면 밖 가장자리에 걸려도 좋다: 콘텐츠가 주인공.
  let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
  for (const t of insideTargets.values()) {
    bMinX = Math.min(bMinX, t.x); bMaxX = Math.max(bMaxX, t.x);
    bMinY = Math.min(bMinY, t.y); bMaxY = Math.max(bMaxY, t.y);
  }
  const contentMargin = 40 + maxNodeRadius;
  const bounds = Number.isFinite(bMinX)
    ? { minX: bMinX - contentMargin, minY: bMinY - contentMargin, maxX: bMaxX + contentMargin, maxY: bMaxY + contentMargin }
    : { minX: -wardingRadius, minY: -wardingRadius, maxX: wardingRadius, maxY: wardingRadius };

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
 * 영역 재배치 bbox 로의 카메라 fit 타깃 — 안전 인셋을 고려한 가시 영역 기준.
 * `computeOverviewCameraTarget` 과 같은 계약(가시 영역 중심 정렬)을 결계 원에
 * 적용한다.
 */
export function realmCameraTarget(
  data: RealmRuntimeData,
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
  const fit = fitWorldTarget(data.bounds, effW, effH, tokens.cameraScaleMax, tokens.cameraScaleMin);
  return {
    tx: fit.tx - (insetLeft - insetRight) / (2 * fit.tscale),
    ty: fit.ty - (insetTop - insetBottom) / (2 * fit.tscale),
    tscale: fit.tscale,
  };
}
