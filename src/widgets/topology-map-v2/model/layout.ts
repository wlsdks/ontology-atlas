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

  placeRemainingByParentChain(nodes, rings, placed);
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
function relaxCollisions(
  nodes: readonly LayoutGraphNode[],
  placed: Map<string, PlacedPoint>,
  options: LayoutOptions,
): void {
  const radii = options.radii ?? DEFAULT_RADII;
  const iterations = options.relaxIterations ?? DEFAULT_RELAX_ITERATIONS;
  const padding = options.relaxPadding ?? DEFAULT_RELAX_PADDING;

  const items = nodes
    .map((n) => ({ id: n.id, kind: n.kind, point: placed.get(n.id), pinned: n.kind === "project" }))
    .filter((it): it is { id: string; kind: LayoutNodeKind; point: PlacedPoint; pinned: boolean } => it.point !== undefined);

  for (let iter = 0; iter < iterations; iter += 1) {
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const a = items[i];
        const b = items[j];
        const minDist = radii[a.kind] + radii[b.kind] + padding;
        let dx = b.point.x - a.point.x;
        let dy = b.point.y - a.point.y;
        let dist = Math.hypot(dx, dy);
        if (dist >= minDist) continue;
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
    }
  }
}
