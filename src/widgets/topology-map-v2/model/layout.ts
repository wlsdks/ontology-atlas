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
    const spread = Math.min(0.95, 0.32 + caps.length * 0.22);
    caps.forEach((cap, i) => {
      const t = caps.length === 1 ? 0 : i / (caps.length - 1) - 0.5;
      const angle = domainPoint.angle + t * spread;
      placed.set(cap.id, {
        x: domainPoint.x + Math.cos(angle) * rings.capability,
        y: domainPoint.y + Math.sin(angle) * rings.capability,
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
    const spread = Math.min(1.05, 0.26 + elements.length * 0.26);
    elements.forEach((element, i) => {
      const t = elements.length === 1 ? 0 : i / (elements.length - 1) - 0.5;
      const angle = capPoint.angle + t * spread;
      placed.set(element.id, {
        x: capPoint.x + Math.cos(angle) * rings.element,
        y: capPoint.y + Math.sin(angle) * rings.element,
        angle,
      });
    });
  });

  return nodes.map((n) => {
    const point = placed.get(n.id);
    return { id: n.id, x: point?.x ?? 0, y: point?.y ?? 0 };
  });
}
