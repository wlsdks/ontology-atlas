/**
 * Concentric-ring layout — ported from the B2+ prototype's `layout()`
 * (`docs/prototypes/topology-b2plus.html` §4): vault graph (project ⊃ domain
 * ⊃ capability ⊃ element) → deterministic `{x, y}` world coordinates.
 *
 * Contract (`docs/TOPOLOGY-V2-DESIGN.md` §4 P2 — "layout.test.ts: 고정 vault
 * 픽스처 → 결정론적 좌표, 겹침 없음, aspectX 계열 왜곡 상수 부재"):
 * - The project sits at the origin.
 * - Domains are placed evenly around a circle of radius
 *   `--topology-v2-layout-ring-domain` (250) centered on the project.
 * - Each domain's capabilities fan out around a circle of radius
 *   `--topology-v2-layout-ring-capability` (145) centered on that domain, at
 *   an angular spread proportional to sibling count
 *   (`spread = min(0.95, 0.32 + count*0.22)`, prototype `layout()`).
 * - Each capability's elements fan out similarly around
 *   `--topology-v2-layout-ring-element` (90), `spread = min(1.05, 0.26 + count*0.26)`.
 * - This is a **structural regression fix**: Design Guardian verdict a1
 *   flagged an earlier `aspectX`-style distortion constant that stretched x
 *   independently of y. This layout must use the same effective radius on
 *   both axes at every ring — `layout.test.ts` asserts this by checking that
 *   domain nodes sit exactly `layoutRingDomain` world-units from the origin
 *   (not some x-stretched ellipse).
 * - Positions never change with zoom/camera — only their *rendered
 *   expression* does (shape morph, label fade). This module has zero camera
 *   knowledge.
 *
 * Pure function — same input always produces the same output (the prototype
 * seeds a PRNG only for node breathe-phase offsets, which is NOT part of
 * this module's contract; phase offsets belong to `model/freshness.ts` /
 * `render/node-shapes.ts`, not layout).
 */

import { DENSITY_GATE_THRESHOLD } from "./density-gate";
import { rankEgoNeighborsByDOI } from "./focus-state";

export type LayoutNodeKind = "project" | "domain" | "capability" | "element";

export interface LayoutGraphNode {
  id: string;
  kind: LayoutNodeKind;
  /** `domain.id` for capabilities, `capability.id` for elements, `null` otherwise. */
  parentId: string | null;
}

export interface LayoutRings {
  /** `--topology-v2-layout-ring-domain` = 250 */
  domain: number;
  /** `--topology-v2-layout-ring-capability` = 145 */
  capability: number;
  /** `--topology-v2-layout-ring-element` = 90 */
  element: number;
}

export interface LayoutPoint {
  id: string;
  x: number;
  y: number;
}

/** Per-kind collision radius for the deterministic de-pileup pass. Defaults mirror the §2.3 node radius tokens. */
export interface LayoutRadii {
  project: number;
  domain: number;
  capability: number;
  element: number;
}

export interface LayoutOptions {
  /** Node radii used for the collision-relax min-distance. Defaults to the prototype's §2.3 radii. */
  radii?: LayoutRadii;
  /** Fixed collision-relax iteration count. Deterministic — same input + count → identical output. Default 60. */
  relaxIterations?: number;
  /** Extra gap (world units) added on top of the two nodes' radii before they count as colliding. Default 6. */
  relaxPadding?: number;
  /**
   * Collision de-pileup strategy. `"grid"` (default) uses spatial-hash
   * bucketing to skip the O(n²) all-pairs scan; `"bruteforce"` keeps the
   * original all-pairs double loop as the reference oracle. Both produce
   * **byte-identical** output — `layout.test.ts` pins the equivalence. Only
   * tests (and a manual escape hatch) set this; production always runs `"grid"`.
   */
  relaxStrategy?: "grid" | "bruteforce";
}

const DEFAULT_RADII: LayoutRadii = { project: 25, domain: 17, capability: 11, element: 7 };
const DEFAULT_RELAX_ITERATIONS = 60;
const DEFAULT_RELAX_PADDING = 6;

/**
 * Density thresholds — the count at/below which a fan keeps the base ring
 * radius and base spread cap (so small vaults, and the tiny layout.test
 * fixture, land on EXACTLY the ring token, `layout.test.ts`'s contract). Above
 * the threshold the ring is pushed out and the arc widened, proportional to the
 * child count, so a high-child-count domain's arc has room before the
 * collision-relax even runs (Design Guardian 충실도 반려: 295 concepts vs the
 * prototype's 40 overflow the base arcs).
 */
const CAP_DENSITY_THRESHOLD = 4;
const ELEMENT_DENSITY_THRESHOLD = 4;
/** Base angular spread caps (radians) — raised from the prototype's tighter caps so wide fans don't wrap onto themselves. */
const CAP_SPREAD_MAX = 1.5;
const ELEMENT_SPREAD_MAX = 1.6;

/**
 * 밀도 게이트 슬라이스 (fable 설계) — 자식 수가 이 값을 **초과**하는 부모는
 * 폭주하는 부채꼴(반지름이 n 에 비례: n=100 → r 2250) 대신 **phyllotaxis
 * 디스크**(황금각 나선)로 자식을 배치해 풋프린트를 유계로 만든다. 임계는
 * `density-gate.ts` 와 공유한다 — 접히는 부모와 디스크로 배치되는 부모는 정확히
 * 같아야 "접힌 칩을 펼치면 유계 디스크가 나온다"가 성립한다. 임계 이하 부모는
 * 기존 부채꼴 경로를 **바이트 동일**하게 탄다 (`layout.test.ts` 계약).
 */
const PHYLLOTAXIS_THRESHOLD = DENSITY_GATE_THRESHOLD;
/**
 * 나선 점 간 간격(월드 유닛). Vogel 나선 `r = spacing·√i` 의 최근접 이웃
 * 거리 ≈ spacing 이므로, element 지름(14) + 여유를 덮도록 26 으로 둔다.
 * 디스크 최대 반지름 = shift + spacing·√(n−0.5) → n=108, shift=145 기준
 * ≈ 145 + 26·10.35 ≈ 414 로 유계(부채꼴의 2250 대비 극적 축소).
 */
const PHYLLOTAXIS_SPACING = 26;

/**
 * Computes world coordinates for every node in `nodes`. Exactly one node of
 * kind `"project"` is expected (placed at the origin); its `parentId` is
 * ignored. Domains must have `parentId` pointing at the project id (or any
 * shared root — this module does not validate that it's literally the
 * project, only that siblings sharing a `parentId` fan out together).
 */
const TAU = Math.PI * 2;

interface PlacedPoint {
  x: number;
  y: number;
  /** Angle from this node's own parent — only domains/capabilities need it, to seed their children's fan. */
  angle: number;
}

export function computeConcentricLayout(
  nodes: readonly LayoutGraphNode[],
  rings: LayoutRings,
  options: LayoutOptions = {},
): LayoutPoint[] {
  const placed = new Map<string, PlacedPoint>();

  // 각 노드의 containment 자식 수 — phyllotaxis 디스크 자식을 DOI 로 정렬할 때
  // "허브도(度)" 프록시로 쓴다(layout 은 전체 엣지를 모르므로 자식 수가 유일한
  // 구조적 허브 신호). i=0(중심 최근접)에 최고 DOI 허브 capability 가 오도록.
  const childCount = new Map<string, number>();
  for (const n of nodes) {
    if (n.parentId !== null) childCount.set(n.parentId, (childCount.get(n.parentId) ?? 0) + 1);
  }
  /**
   * phyllotaxis 디스크에 얹기 직전 자식을 rankEgoNeighborsByDOI(domain3 >
   * capability2 > element1 → degree → slug)로 안정 정렬한다. Vogel 나선
   * r=spacing·√i 라 중심 최근접(i=0)=최고 DOI 허브, rim=저차수 leaf → 중심→바깥
   * 자연 읽기 순서. slug tiebreak 로 결정론(byte-identical). 임계 이하 부채꼴
   * 경로는 이 정렬을 타지 않아 종전 좌표와 바이트 동일.
   */
  const rankDiscChildren = (children: readonly LayoutGraphNode[]): LayoutGraphNode[] => {
    const byId = new Map(children.map((c) => [c.id, c]));
    return rankEgoNeighborsByDOI(
      children.map((c) => ({ id: c.id, kind: c.kind, degree: childCount.get(c.id) ?? 0 })),
    ).map((id) => byId.get(id) as LayoutGraphNode);
  };

  const project = nodes.find((n) => n.kind === "project");
  if (project) {
    placed.set(project.id, { x: 0, y: 0, angle: 0 });
  }

  const domainNodes = nodes.filter((n) => n.kind === "domain");
  domainNodes.forEach((domain, i) => {
    const angle = (i / domainNodes.length) * TAU - Math.PI / 2;
    placed.set(domain.id, {
      x: Math.cos(angle) * rings.domain,
      y: Math.sin(angle) * rings.domain,
      angle,
    });
  });

  domainNodes.forEach((domain) => {
    const domainPoint = placed.get(domain.id);
    if (!domainPoint) return;
    const caps = nodes.filter((n) => n.kind === "capability" && n.parentId === domain.id);
    // 도메인이 element 를 직접 담는 vault(capability 경유 없음)도 실존한다 —
    // 이들을 빼먹으면 (0,0) 적층 후 라이브 물리가 허브 쪽으로 끌어가 "블롭"
    // 결함이 된다 (2026-07 소유자 실보고). capability 팬과 한 부채꼴로 합쳐
    // 배치하되, 직접 element 가 없으면 기존 출력과 바이트 동일하다.
    const directElements = nodes.filter((n) => n.kind === "element" && n.parentId === domain.id);
    const fan = [...caps, ...directElements];
    // 밀도 게이트: 초대형 부채꼴은 반지름이 폭주하므로 phyllotaxis 디스크로
    // 유계 배치한다 (임계 이하 부모는 아래 부채꼴 경로를 바이트 동일하게 탄다).
    if (fan.length > PHYLLOTAXIS_THRESHOLD) {
      placePhyllotaxisDisk(domainPoint, rankDiscChildren(fan), rings.capability, placed);
      return;
    }
    // High-child-count de-pileup: push the ring out and widen the arc
    // proportionally so a dense fan starts spread apart (small fans keep the
    // exact base ring — `layout.test.ts`).
    const capR = rings.capability * Math.max(1, fan.length / CAP_DENSITY_THRESHOLD);
    const elR = rings.element * Math.max(1, fan.length / ELEMENT_DENSITY_THRESHOLD);
    const spread = Math.min(CAP_SPREAD_MAX, 0.32 + fan.length * 0.22);
    fan.forEach((child, i) => {
      const t = fan.length === 1 ? 0 : i / (fan.length - 1) - 0.5;
      const angle = domainPoint.angle + t * spread;
      const r = child.kind === "capability" ? capR : elR;
      placed.set(child.id, {
        x: domainPoint.x + Math.cos(angle) * r,
        y: domainPoint.y + Math.sin(angle) * r,
        angle,
      });
    });
  });

  const capabilityNodes = nodes.filter((n) => n.kind === "capability");
  capabilityNodes.forEach((cap) => {
    const capPoint = placed.get(cap.id);
    if (!capPoint) return;
    const elements = nodes.filter((n) => n.kind === "element" && n.parentId === cap.id);
    if (!elements.length) return;
    // 밀도 게이트: element 도 임계 초과 시 phyllotaxis 디스크 (부채꼴 폭주 방지).
    if (elements.length > PHYLLOTAXIS_THRESHOLD) {
      placePhyllotaxisDisk(capPoint, rankDiscChildren(elements), rings.element, placed);
      return;
    }
    const elR = rings.element * Math.max(1, elements.length / ELEMENT_DENSITY_THRESHOLD);
    const spread = Math.min(ELEMENT_SPREAD_MAX, 0.26 + elements.length * 0.26);
    elements.forEach((element, i) => {
      const t = elements.length === 1 ? 0 : i / (elements.length - 1) - 0.5;
      const angle = capPoint.angle + t * spread;
      placed.set(element.id, {
        x: capPoint.x + Math.cos(angle) * elR,
        y: capPoint.y + Math.sin(angle) * elR,
        angle,
      });
    });
  });

  placeRemainingByParentChain(nodes, rings, placed, rankDiscChildren);
  placeOrphans(nodes, rings, placed);

  relaxCollisions(nodes, placed, options);

  return nodes.map((n) => {
    const point = placed.get(n.id);
    return { id: n.id, x: point?.x ?? 0, y: point?.y ?? 0 };
  });
}

/**
 * 잔여 배치 1 — 부모는 배치됐지만 위 표준 팬(project→domain→capability→element)
 * 이 다루지 않는 계보(element ⊃ element, project 직속 element, capability ⊃
 * capability 등)를 부모 기준 부채꼴로 배치한다. 표준형 vault 에서는 아무것도
 * 남지 않아 no-op — 기존 픽스처 좌표가 바이트 동일하게 유지된다.
 */
function placeRemainingByParentChain(
  nodes: readonly LayoutGraphNode[],
  rings: LayoutRings,
  placed: Map<string, PlacedPoint>,
  rankDiscChildren: (children: readonly LayoutGraphNode[]) => LayoutGraphNode[],
): void {
  // 깊은 체인도 수렴하도록 진행이 있는 동안 반복 (입력 순서 고정 → 결정론).
  for (let pass = 0; pass < nodes.length; pass += 1) {
    const pending = nodes.filter((n) => !placed.has(n.id) && n.parentId !== null && placed.has(n.parentId));
    if (pending.length === 0) return;
    const byParent = new Map<string, LayoutGraphNode[]>();
    for (const n of pending) {
      const list = byParent.get(n.parentId as string) ?? [];
      list.push(n);
      byParent.set(n.parentId as string, list);
    }
    for (const [parentId, kids] of byParent) {
      const parentPoint = placed.get(parentId);
      if (!parentPoint) continue;
      // 밀도 게이트: 비표준 계보의 대량 자식도 phyllotaxis 디스크로 유계 배치.
      if (kids.length > PHYLLOTAXIS_THRESHOLD) {
        placePhyllotaxisDisk(parentPoint, rankDiscChildren(kids), rings.element, placed);
        continue;
      }
      const r = rings.element * Math.max(1, kids.length / ELEMENT_DENSITY_THRESHOLD);
      const spread = Math.min(ELEMENT_SPREAD_MAX, 0.26 + kids.length * 0.26);
      kids.forEach((kid, i) => {
        const t = kids.length === 1 ? 0 : i / (kids.length - 1) - 0.5;
        const angle = parentPoint.angle + t * spread;
        placed.set(kid.id, {
          x: parentPoint.x + Math.cos(angle) * r,
          y: parentPoint.y + Math.sin(angle) * r,
          angle,
        });
      });
    }
  }
}

/** 황금각 — 고아 나선 배치의 각 간격 (phyllotaxis, 결정론). */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * 밀도 게이트 슬라이스 (fable 설계) — 임계 초과 부모의 자식을 황금각
 * phyllotaxis 디스크에 얹는다. 디스크 중심은 부모 outward 방향으로
 * `ringRadius` 만큼 밀어(부모의 부모 쪽을 피함), 각 자식은
 * `r = spacing·√(i+0.5)` (부모 부채꼴 폭주 대신 √ 성장이라 풋프린트 유계).
 * 결정론: 입력 순서 고정 → 바이트 동일. 겹침은 상위 `relaxCollisions` 가
 * 마무리한다.
 */
function placePhyllotaxisDisk(
  parent: PlacedPoint,
  children: readonly LayoutGraphNode[],
  ringRadius: number,
  placed: Map<string, PlacedPoint>,
): void {
  const cx = parent.x + Math.cos(parent.angle) * ringRadius;
  const cy = parent.y + Math.sin(parent.angle) * ringRadius;
  children.forEach((child, i) => {
    const a = i * GOLDEN_ANGLE;
    const r = PHYLLOTAXIS_SPACING * Math.sqrt(i + 0.5);
    placed.set(child.id, {
      x: cx + Math.cos(a) * r,
      y: cy + Math.sin(a) * r,
      angle: parent.angle,
    });
  });
}

/**
 * 잔여 배치 2 — 부모가 끝내 배치되지 않는 고아(containment 밖 노드)를
 * 도메인 링 바깥의 황금각 나선에 얹는다. 종전에는 전원 (0,0) 적층 →
 * 라이브 물리가 끌어간 자리에서 라벨까지 겹치는 블롭이 됐다.
 */
function placeOrphans(
  nodes: readonly LayoutGraphNode[],
  rings: LayoutRings,
  placed: Map<string, PlacedPoint>,
): void {
  const orphans = nodes.filter((n) => !placed.has(n.id));
  if (orphans.length === 0) return;
  const baseR = rings.domain + rings.capability;
  orphans.forEach((orphan, i) => {
    const angle = i * GOLDEN_ANGLE;
    const r = baseR + rings.element * 0.35 * Math.sqrt(i);
    placed.set(orphan.id, {
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
      angle,
    });
  });
}

/** Deterministic per-id unit direction for separating two exactly-coincident points (no `Math.random`). */
function coincidentSeparation(id: string): { x: number; y: number } {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const angle = ((Math.abs(hash) % 1000) / 1000) * TAU;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

/**
 * DETERMINISTIC collision de-pileup (`docs/prototypes/topology-b2plus.html` §4
 * invariant — node positions never change on their own). This is a ONE-SHOT
 * post-process, NOT a live force tick: a fixed iteration count, a fixed node
 * order, and a seeded (id-hashed) tie-break for coincident points, so the same
 * graph always yields byte-identical coordinates (`layout.test.ts` pins this).
 *
 * It resolves only actual overlaps (pair distance < r_a + r_b + padding),
 * pushing the two nodes symmetrically apart along their connecting axis. The
 * project stays pinned at the origin. Because the concentric seed keeps domains
 * far apart, only local siblings / cross-fan boundaries move — the aligned
 * "circuit" star-chart survives, the dense fans stop piling.
 */
interface RelaxItem {
  id: string;
  kind: LayoutNodeKind;
  point: PlacedPoint;
  pinned: boolean;
}

/**
 * Resolves a single (a, b) collision, mutating `a.point`/`b.point` in place.
 * Shared by BOTH the grid and brute-force paths so the two can never drift —
 * byte-identity depends on the push arithmetic being literally the same code.
 * Returns after a no-op when the pair is already ≥ `minDist` apart, so an
 * over-included grid candidate that isn't actually colliding costs nothing and
 * changes nothing (this is what lets the grid be a superset of the pairs the
 * brute force would push).
 */
function resolveCollisionPair(
  a: RelaxItem,
  b: RelaxItem,
  radii: LayoutRadii,
  padding: number,
): void {
  const minDist = radii[a.kind] + radii[b.kind] + padding;
  let dx = b.point.x - a.point.x;
  let dy = b.point.y - a.point.y;
  // Conservative squared-distance fast-reject: only skips pairs whose squared
  // separation is a hair beyond `minDist²` (the `+ 1` swamps float rounding),
  // so every pair that could possibly collide still falls through to the exact
  // `Math.hypot >= minDist` guard below. This drops the sqrt on the ~99% of
  // grid candidates that sit in a different disk without ever changing a
  // push decision — output stays byte-identical to the pure-`hypot` path.
  const d2 = dx * dx + dy * dy;
  const minDistPlus = minDist + 1;
  if (d2 >= minDistPlus * minDistPlus) return;
  let dist = Math.hypot(dx, dy);
  if (dist >= minDist) return;
  if (dist === 0) {
    const dir = coincidentSeparation(`${a.id}|${b.id}`);
    dx = dir.x;
    dy = dir.y;
    dist = 1;
  }
  const push = (minDist - dist) / 2;
  const nx = (dx / dist) * push;
  const ny = (dy / dist) * push;
  // Both pinned (can't happen — only project is pinned and it's unique)
  // still handled: skip the pinned side, give the full push to the other.
  if (a.pinned && !b.pinned) {
    b.point.x += nx * 2;
    b.point.y += ny * 2;
  } else if (b.pinned && !a.pinned) {
    a.point.x -= nx * 2;
    a.point.y -= ny * 2;
  } else if (!a.pinned && !b.pinned) {
    a.point.x -= nx;
    a.point.y -= ny;
    b.point.x += nx;
    b.point.y += ny;
  }
}

function relaxCollisions(
  nodes: readonly LayoutGraphNode[],
  placed: Map<string, PlacedPoint>,
  options: LayoutOptions,
): void {
  const radii = options.radii ?? DEFAULT_RADII;
  const iterations = options.relaxIterations ?? DEFAULT_RELAX_ITERATIONS;
  const padding = options.relaxPadding ?? DEFAULT_RELAX_PADDING;
  const strategy = options.relaxStrategy ?? "grid";

  const items: RelaxItem[] = nodes
    .map((n) => ({ id: n.id, kind: n.kind, point: placed.get(n.id), pinned: n.kind === "project" }))
    .filter((it): it is RelaxItem => it.point !== undefined);

  if (items.length < 2) return;

  if (strategy === "bruteforce") {
    relaxBruteForce(items, radii, padding, iterations);
    return;
  }
  relaxGrid(items, radii, padding, iterations);
}

/**
 * Reference oracle — the original O(n²) all-pairs de-pileup. Processes pairs
 * in strict `(i, j)` lexicographic order, each pair re-reading the current
 * (possibly already-pushed-this-iteration) positions. `relaxGrid` reproduces
 * this output byte-for-byte on realistic vaults; `layout.test.ts` pins it.
 */
function relaxBruteForce(
  items: readonly RelaxItem[],
  radii: LayoutRadii,
  padding: number,
  iterations: number,
): void {
  for (let iter = 0; iter < iterations; iter += 1) {
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        resolveCollisionPair(items[i], items[j], radii, padding);
      }
    }
  }
}

/**
 * 공간 그리드 해싱 de-pileup (topology-map-v2 S1) — `relaxBruteForce` 의
 * O(n²)×iterations 를 O(n)×iterations 근처로 낮춘다 (실측: n=5000 ~20s → 수백 ms).
 *
 * 바이트 동일 계약: 매 iteration 시작 시점 좌표로 그리드를 재구축하고, 행 `i`
 * 오름차순으로 3×3 셀 이웃에서 파트너 `j > i` 를 모아 **`j` 오름차순 정렬** 후
 * `resolveCollisionPair` 로 즉시 처리한다. 이는 브루트포스의 `for i: for j>i`
 * 와 동일한 lexicographic 순서다(바깥 i 오름차순 · 안쪽 j 오름차순, 앞 행의
 * push 가 이미 반영된 좌표에서 처리). 각 쌍은 처리 시점 거리를 다시 검사하므로,
 * 그리드가 **브루트포스가 실제로 밀어내는 쌍의 상위집합**이기만 하면 결과가
 * 바이트 동일하다 — 초과 포함 후보는 no-op.
 *
 * 셀 크기 = 최대 충돌거리(`2·maxRadius + padding`) + 이동 마진(같은 값 한 번 더,
 * 총 `2×`). 3×3 이웃은 시작 좌표 체비쇼프 거리 < cellSize 인 모든 쌍을 포착하므로,
 * 한 iteration 안에서 노드가 (대략) 최대 충돌거리만큼 움직여 새로 충돌하게 되는
 * 쌍까지 여유롭게 상위집합에 포함된다.
 *
 * 성능: 전역 쌍 배열/전역 정렬 대신 행별 스크래치 버퍼(재사용)로 후보를 모아
 * 짧은 로컬 정렬만 하고, 정수 셀 키(문자열 할당 없음)와 제곱거리 fast-reject 로
 * 상수 인자를 낮춘다.
 */
function relaxGrid(
  items: readonly RelaxItem[],
  radii: LayoutRadii,
  padding: number,
  iterations: number,
): void {
  const n = items.length;
  const maxRadius = Math.max(radii.project, radii.domain, radii.capability, radii.element);
  const maxMinDist = 2 * maxRadius + padding;
  // 셀 크기 = 최대 충돌거리 + 이동 마진. maxMinDist 가 0 이하로 떨어질 일은
  // 없지만(반지름·padding 모두 ≥0, 최소 1), 방어적으로 하한을 둔다.
  const cellSize = Math.max(1, maxMinDist * 2);

  // 정수 셀 키: (cx, cy) 를 하나의 정수 `cx*STRIDE + cy` 로 접는다. 셀 좌표는
  // 유계라(coord/cellSize, 실측 수백 이하) |cy| ≪ STRIDE → 서로 다른 (cx,cy)
  // 가 항상 다른 키를 준다(문자열 키 대비 GC 압력 제거). cx/cy 는 따로 보관해
  // 이웃 키 계산 시 디코딩(음수에서 깨짐)을 피한다.
  const CELL_STRIDE = 1 << 22;
  const cellX = new Int32Array(n);
  const cellY = new Int32Array(n);
  const grid = new Map<number, number[]>();
  const neighbors: number[] = []; // 행별 후보 스크래치(재사용)

  for (let iter = 0; iter < iterations; iter += 1) {
    // 1) 매 iteration 시작 좌표로 그리드 재구축.
    grid.clear();
    for (let i = 0; i < n; i += 1) {
      const cx = Math.floor(items[i].point.x / cellSize);
      const cy = Math.floor(items[i].point.y / cellSize);
      cellX[i] = cx;
      cellY[i] = cy;
      const key = cx * CELL_STRIDE + cy;
      const bucket = grid.get(key);
      if (bucket) bucket.push(i);
      else grid.set(key, [i]);
    }

    // 2) 행 i 오름차순 — 3×3 이웃에서 j>i 후보를 모아 j 오름차순 정렬 후 즉시 처리.
    //    이웃 대칭성 덕분에 파트너>현재 조건만으로 각 쌍이 정확히 한 번 처리된다.
    for (let i = 0; i < n; i += 1) {
      const baseX = cellX[i];
      const baseY = cellY[i];
      neighbors.length = 0;
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          const bucket = grid.get((baseX + dx) * CELL_STRIDE + (baseY + dy));
          if (!bucket) continue;
          for (let b = 0; b < bucket.length; b += 1) {
            const j = bucket[b];
            if (j > i) neighbors.push(j);
          }
        }
      }
      if (neighbors.length === 0) continue;
      neighbors.sort((a, b) => a - b);
      const a = items[i];
      const ar = radii[a.kind];
      for (let k = 0; k < neighbors.length; k += 1) {
        const b = items[neighbors[k]];
        // Inline conservative fast-reject (same guard as resolveCollisionPair's,
        // the `+1` swamps float rounding) so the ~99% of non-colliding candidates
        // never pay the function-call overhead. Only genuine (or borderline)
        // overlaps fall through to the shared push routine — byte-identical.
        const dx = b.point.x - a.point.x;
        const dy = b.point.y - a.point.y;
        const minDistPlus = ar + radii[b.kind] + padding + 1;
        if (dx * dx + dy * dy >= minDistPlus * minDistPlus) continue;
        resolveCollisionPair(a, b, radii, padding);
      }
    }
  }
}
