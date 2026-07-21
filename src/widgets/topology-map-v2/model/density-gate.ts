/**
 * 밀도 게이트 (density gate) — fable 설계 "밀도 게이트 + 클러스터 칩 + 클릭
 * 확장" 슬라이스의 순수 모델 계층 (`docs/TOPOLOGY-V2-DESIGN.md` semantic-zoom
 * 헌장 "나머지는 클릭 시 expand" 의 대량-자식 대응).
 *
 * 문제: 수백 자식이 한 부모에 몰리면 (dogfood 샘플: Onboarding & UX 도메인
 * 108 capability) 전부 상시 노출 시 라벨/노드가 서로 뭉개져 지도 가독성이
 * 붕괴한다. 해법(하이브리드): 자식 수가 임계 이하인 부모는 지금처럼 줌 티어에
 * 따라 자식을 노출하고, 임계 초과 부모는 자식(과 그 서브트리)을 "클러스터 칩"
 * 하나(+N 카운트)로 접어 두었다가 칩 클릭 시 그 부모만 펼친다. 확장 상태는
 * URL(`?open=`) 에 살아 공유·에이전트 가독성을 얻는다.
 *
 * 이 모듈은 좌표/캔버스/카메라를 전혀 모르는 **순수 결정론 함수**다: contains
 * 부모→자식 맵 + 확장된 부모 Set + 부모 지오메트리(좌표+outward angle) 만
 * 보고, 노드별 clustered 여부와 부모별 클러스터 칩 데이터를 낸다. anchor 는
 * 부모의 outward 방향(레이아웃 부채꼴 방향 재사용)으로 자식 링 반지름만큼
 * 밀어낸 지점이다.
 */

/**
 * 자식 수가 이 값을 **초과**하면 부모는 클러스터로 접힌다.
 *
 * rationale: 12개까지는 부모 노드를 중심으로 한 부채꼴에 라벨을 세워도 서로
 * 겹치지 않는 실측 상한이다(dogfood 295노드 라이브 관측). 13개째부터 인접
 * 라벨의 수평 폭이 부채꼴 간격을 넘어 서로 침범하기 시작한다 — 그 지점에서
 * 상시 노출 대신 접기로 전환한다.
 */
export const DENSITY_GATE_THRESHOLD = 12;

/** 자식 kind 별 기본 칩 반지름(월드 유닛) — 부모 지오메트리에 명시가 없을 때. */
export const DEFAULT_CHIP_RING = 120;

export type NodeDensityState = "visible" | "clustered";

/** 칩 anchor 계산에 필요한 부모 좌표 + outward 방향(라디안, 레이아웃 부채꼴 방향). */
export interface DensityGateParentGeometry {
  x: number;
  y: number;
  /** outward 방향(라디안) — 레이아웃이 자식을 부챗살로 펼친 그 방향. */
  angle: number;
  /** 이 부모의 칩을 앉힐 자식 링 반지름(월드 유닛). 생략 시 `DEFAULT_CHIP_RING`. */
  ring?: number;
}

/** 렌더러/히트테스트가 소비하는 클러스터 칩 한 개. */
export interface ClusterChip {
  /** 접힌(또는 펼쳐진) 부모의 노드 id. */
  parentId: string;
  /** 직속 자식 수 — 칩에 `+N` 으로 새긴다. */
  count: number;
  /** 이 부모가 현재 펼쳐져 있으면 true(칩은 접기 `−` 어포던스). */
  expanded: boolean;
  /** 칩 월드 좌표(부모 outward 방향 × 자식 링). */
  anchor: { x: number; y: number };
}

export interface DensityGateInput {
  /** contains 부모 id → 직속 자식 id 배열. */
  childrenByParent: ReadonlyMap<string, readonly string[]>;
  /** 사용자가 펼친 부모 slug Set(칩 클릭 상태). */
  expandedParents: ReadonlySet<string>;
  /** 부모별 좌표 + outward 방향 — 칩 anchor 계산에만 쓰인다. */
  parentGeometry: ReadonlyMap<string, DensityGateParentGeometry>;
  /** 접기 임계(초과 시 접힘). 기본 `DENSITY_GATE_THRESHOLD`. */
  threshold?: number;
}

export interface DensityGateResult {
  /**
   * 접힌 부모의 서브트리에 속해 **그리지 않을** 노드 id 집합. 접힌 부모
   * 자신은 포함되지 않는다(부모는 스파인/티어대로 계속 보이고, 칩이 그
   * 옆에 선다).
   */
  clusteredIds: Set<string>;
  /** 밀집 부모(자식 > 임계)마다 한 개씩 — 접힘/펼침 모두 칩을 낸다. */
  chips: ClusterChip[];
}

/**
 * 밀도 게이트 판정. 결정론: 같은 입력 → 같은 출력(칩 순서는
 * `childrenByParent` 삽입 순서 = 월드 빌드의 결정론적 순서를 따른다).
 */
export function computeDensityGate(input: DensityGateInput): DensityGateResult {
  const threshold = input.threshold ?? DENSITY_GATE_THRESHOLD;
  const { childrenByParent, expandedParents, parentGeometry } = input;

  // 1. 밀집 부모 = 직속 자식 수 > 임계.
  // 2. 접힌 부모 = 밀집 && 미확장.
  const collapsedParents = new Set<string>();
  for (const [parentId, children] of childrenByParent) {
    if (children.length > threshold && !expandedParents.has(parentId)) {
      collapsedParents.add(parentId);
    }
  }

  // 3. clusteredIds = 접힌 부모들의 서브트리 전체(자식·손자…). 티어 줌이
  //    element 를 드러내도 부모가 접혀 있으면 손자까지 숨겨야 "부모 없는
  //    떠도는 노드" 가 생기지 않는다.
  const clusteredIds = new Set<string>();
  for (const parentId of collapsedParents) {
    const stack = [...(childrenByParent.get(parentId) ?? [])];
    while (stack.length > 0) {
      const id = stack.pop() as string;
      if (clusteredIds.has(id)) continue;
      clusteredIds.add(id);
      const grandChildren = childrenByParent.get(id);
      if (grandChildren) stack.push(...grandChildren);
    }
  }

  // 4. 칩 = 밀집 부모 중 자신이 클러스터되지 않은(= 화면에 보이는) 것.
  //    접힌 부모의 자식인 밀집 부모(중첩)는 부모가 접혀 있어 보이지 않으므로
  //    칩도 내지 않는다 — 상위를 먼저 펼쳐야 그 칩이 등장한다.
  const chips: ClusterChip[] = [];
  for (const [parentId, children] of childrenByParent) {
    if (children.length <= threshold) continue;
    if (clusteredIds.has(parentId)) continue;
    const geometry = parentGeometry.get(parentId);
    if (!geometry) continue;
    const ring = geometry.ring ?? DEFAULT_CHIP_RING;
    chips.push({
      parentId,
      count: children.length,
      expanded: expandedParents.has(parentId),
      anchor: {
        x: geometry.x + Math.cos(geometry.angle) * ring,
        y: geometry.y + Math.sin(geometry.angle) * ring,
      },
    });
  }

  return { clusteredIds, chips };
}
