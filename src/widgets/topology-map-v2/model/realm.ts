/**
 * "영역 전개" (Realm) — subtree extraction + depth-remapped re-root layout +
 * warding-circle geometry (S4, fable 설계).
 *
 * WHAT: 선택 노드를 임시 루트로 삼아 그 노드의 containment 서브트리만 남기고
 * 지도를 그 노드의 "세계"로 전환한다. 이 모듈은 그 전환의 **순수 기하**
 * 부분만 담는다 — 서브트리 추출(누가 영역에 속하나), 깊이 기준 재배치(루트=
 * 원점, 도메인 링에 1단계 자식), 결계(warding) 반경. 전환 모션(FLIP·중력
 * 재편·시차)은 `model/realm-transition.ts`, 카메라/드로우 배선은
 * `ui/use-topology-loop.ts` 소유.
 *
 * 왜 kind 무관 깊이 매핑인가: 영역 루트가 capability 든 domain 이든, 그
 * 노드의 세계 안에서는 루트가 곧 중심이고 1단계 자식이 곧 도메인 링에 앉아야
 * "그 노드의 지도"로 읽힌다. 그래서 재배치는 렌더 kind 가 아니라 **루트로부터의
 * 깊이**로 링을 매핑한다 (depth 0→project 링, 1→domain, 2→capability, 3+→
 * element). 렌더 kind(색/모양)는 원본 그대로 유지된다 — 이 모듈은 좌표만 낸다.
 *
 * 결정론: 같은 입력(같은 childrenByParent 순서)은 항상 같은 서브트리·좌표·반경을
 * 낸다 (`realm.test.ts` 계약). `computeConcentricLayout` 을 재사용하므로 그
 * 모듈의 결정론(고정 iteration·고정 순서·seed 없는 tie-break)을 그대로 물려받는다.
 */

import {
  computeConcentricLayout,
  type LayoutGraphNode,
  type LayoutNodeKind,
  type LayoutPoint,
  type LayoutRadii,
  type LayoutRings,
} from "./layout";

export interface RealmSubtree {
  /** 영역 루트 id (임시 원점이 될 노드). */
  rootId: string;
  /** 루트 포함 서브트리 전체 id (containment 하위 전이 폐포). */
  memberIds: ReadonlySet<string>;
  /** 각 멤버의 루트로부터의 깊이 (루트=0). */
  depthById: ReadonlyMap<string, number>;
  /** 각 비루트 멤버의 containment 부모 id (루트는 없음). */
  parentById: ReadonlyMap<string, string>;
}

/**
 * 영역 서브트리 추출 — `childrenByParent`(contains 부모→직속 자식) 를 루트에서
 * BFS 로 훑어 하위 전이 폐포를 모은다. 방문 표시(`depthById`)로 사이클을 안전히
 * 끊는다. 자식 순서는 입력 순서를 그대로 따라 결정론적이다.
 */
export function extractRealmSubtree(
  rootId: string,
  childrenByParent: ReadonlyMap<string, readonly string[]>,
): RealmSubtree {
  const depthById = new Map<string, number>([[rootId, 0]]);
  const parentById = new Map<string, string>();
  const queue: string[] = [rootId];
  let head = 0;
  while (head < queue.length) {
    const parent = queue[head];
    head += 1;
    const depth = depthById.get(parent) ?? 0;
    for (const child of childrenByParent.get(parent) ?? []) {
      if (depthById.has(child)) continue; // 사이클/재방문 차단
      depthById.set(child, depth + 1);
      parentById.set(child, parent);
      queue.push(child);
    }
  }
  return { rootId, memberIds: new Set(depthById.keys()), depthById, parentById };
}

/**
 * 깊이 → 레이아웃 kind. 재배치는 렌더 kind 가 아니라 루트로부터의 깊이로 링을
 * 고른다: 0=원점, 1=도메인 링, 2=capability 링, 3+=element 링. 깊이가 3 을
 * 넘으면 element 링을 공유한다(부모 기준 부채꼴이라 여전히 서로 분리된다).
 */
export function realmLayoutKind(depth: number): LayoutNodeKind {
  if (depth <= 0) return "project";
  if (depth === 1) return "domain";
  if (depth === 2) return "capability";
  return "element";
}

/**
 * 영역 로컬 좌표 — 서브트리를 깊이 기준으로 `computeConcentricLayout` 에 태워
 * 루트를 원점에 둔 재배치 좌표를 낸다. 렌더 kind 는 무시하고 깊이만 매핑하므로,
 * 예컨대 element 를 루트로 전개해도 그 직속 자식이 도메인 링에 앉는다.
 */
export function computeRealmLayout(
  subtree: RealmSubtree,
  rings: LayoutRings,
  radii: LayoutRadii,
): Map<string, LayoutPoint> {
  const layoutInput: LayoutGraphNode[] = [];
  for (const id of subtree.depthById.keys()) {
    const depth = subtree.depthById.get(id) ?? 0;
    layoutInput.push({
      id,
      kind: realmLayoutKind(depth),
      parentId: id === subtree.rootId ? null : subtree.parentById.get(id) ?? null,
    });
  }
  const points = computeConcentricLayout(layoutInput, rings, { radii });
  return new Map(points.map((p) => [p.id, p]));
}

/**
 * 결계(warding) 반경 — 영역 노드 중 중심에서 가장 먼 것까지의 거리 + 마진.
 * 순수·결정론: 같은 점 집합·같은 마진 → 같은 반경. 점이 없으면(루트만) 마진만
 * 남아 루트를 감싸는 최소 원이 된다.
 */
export function computeWardingRadius(
  points: readonly { x: number; y: number }[],
  center: { x: number; y: number },
  margin: number,
): number {
  let maxDist = 0;
  for (const p of points) {
    const d = Math.hypot(p.x - center.x, p.y - center.y);
    if (d > maxDist) maxDist = d;
  }
  return maxDist + margin;
}

/** 가시-멤버 결계 마진 = 콘텐츠 반경(가장 먼 엣지 도달거리)의 이 비율. */
export const WARDING_VISIBLE_MARGIN_RATIO = 0.15;
/** 가시-멤버 결계 마진 하한(월드 유닛) — 루트만 보일 때도 최소 이만큼 감싼다. */
export const WARDING_VISIBLE_MIN_MARGIN = 60;

/**
 * S9 결함 2 — **현재 렌더되는 멤버**만으로 낸 결계 반경. 밀도 게이트로 접혀
 * 그려지지 않는 자식(>12 자식 부모의 phyllotaxis 디스크 좌표)까지 세던
 * `computeWardingRadius` 는 보이는 세계보다 훨씬 큰 원을 만든다(콘텐츠는 화면
 * ~40%인데 결계는 화면 밖). 이 함수는 caller 가 이미 접힘을 걸러 넘긴 **가시
 * 멤버의 중심→엣지 도달거리(reach)** 만 받아, 그중 최대에 콘텐츠 반경 비례
 * 마진(≥ 하한)을 더한다. reach 는 `hypot(node - center) + nodeRadius` 로,
 * 결계가 가장 바깥 노드의 몸통을 자르지 않게 한다. 점이 없으면(루트만) 하한
 * 마진만 남는다. 순수·결정론.
 */
export function computeVisibleWardingRadius(reaches: readonly number[]): number {
  let outer = 0;
  for (const r of reaches) if (r > outer) outer = r;
  return outer + Math.max(WARDING_VISIBLE_MIN_MARGIN, outer * WARDING_VISIBLE_MARGIN_RATIO);
}

export interface RealmBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * S9 결함 2 — 가시 멤버 점집합의 bbox(+마진). 카메라 fit 이 결계 반경과 **같은
 * 가시-멤버 기준**을 쓰게 해 "작은 콘텐츠 + 거대 원" 불일치를 없앤다. 점이
 * 없으면 `fallback` 을 그대로 돌려준다(루트만 남은 퇴화 케이스). 순수.
 */
export function computeVisibleBounds(
  points: readonly { x: number; y: number }[],
  margin: number,
  fallback: RealmBounds,
): RealmBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) return fallback;
  return { minX: minX - margin, minY: minY - margin, maxX: maxX + margin, maxY: maxY + margin };
}
