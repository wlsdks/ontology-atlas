import type { LayoutGraphNode, LayoutPoint, LayoutRings } from "./layout";

/**
 * Galaxy is a three-arm sky, not the Flat containment fan with different paint.
 * These constants are exported so the procedural backdrop and the real-node
 * layout follow one curve without duplicating its geometry.
 */
export const GALAXY_ARM_COUNT = 3;
export const GALAXY_VERTICAL_FLATTEN = 0.68;

const GALAXY_SPIRAL_TURN_RADIANS = 4.7;
const GALAXY_SPIRAL_ROTATION = -0.35;

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const DOMAIN_START_T = 0.34;
const DOMAIN_END_T = 0.98;
const LOCAL_SCATTER_FLATTEN = 0.78;

export interface GalaxyLayout {
  /** Existing ontology node ids mapped to their Galaxy-only world positions. */
  readonly points: ReadonlyMap<string, LayoutPoint>;
  /** World-space radius used by the aligned procedural sky. */
  readonly radius: number;
  /** Exact point bounds; the camera adds its own canonical safe-area padding. */
  readonly bounds: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number };
  /** Existing containment-derived domain membership; null means ungrouped. */
  readonly domainByNodeId: ReadonlyMap<string, string | null>;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** A point on the shared, flattened three-arm spiral. */
export function galaxySpiralPoint(
  t: number,
  arm: number,
  radius: number,
): { x: number; y: number } {
  const progress = clamp01(t);
  const normalizedArm = ((arm % GALAXY_ARM_COUNT) + GALAXY_ARM_COUNT) % GALAXY_ARM_COUNT;
  const theta =
    progress * GALAXY_SPIRAL_TURN_RADIANS +
    (normalizedArm * TAU) / GALAXY_ARM_COUNT +
    GALAXY_SPIRAL_ROTATION;
  const distance = progress * Math.max(0, radius);
  return {
    x: Math.cos(theta) * distance,
    y: Math.sin(theta) * distance * GALAXY_VERTICAL_FLATTEN,
  };
}

/** Stable 0..1 phase; layout never depends on mount order or random state. */
function phaseForId(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function resolveOwningDomain(
  node: LayoutGraphNode,
  byId: ReadonlyMap<string, LayoutGraphNode>,
): string | null {
  if (node.kind === "domain") return node.id;
  let cursor = node.parentId;
  const seen = new Set<string>();
  while (cursor !== null && !seen.has(cursor)) {
    seen.add(cursor);
    const parent = byId.get(cursor);
    if (!parent) return null;
    if (parent.kind === "domain") return parent.id;
    cursor = parent.parentId;
  }
  return null;
}

/**
 * Places actual ontology concepts in stable Galaxy-only coordinates.
 *
 * Domains occupy staggered positions along three spiral arms. Their real
 * containment descendants form compact local star clouds around the owning
 * domain. No synthetic graph nodes or relations are introduced, and ungrouped
 * concepts remain visible at the outer edge rather than being assigned a
 * fictional domain.
 */
export function computeGalaxyLayout(
  nodes: readonly LayoutGraphNode[],
  rings: LayoutRings,
): GalaxyLayout {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const domains = nodes
    .filter((node) => node.kind === "domain")
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id));
  const projects = nodes
    .filter((node) => node.kind === "project")
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id));

  // The existing ring tokens establish the map's world-unit scale. Galaxy
  // spreads farther because each arm must hold complete domain clouds rather
  // than one thin hierarchy fan.
  const radius = Math.max(rings.domain * 3.15, 420 + Math.sqrt(Math.max(1, nodes.length)) * 24);
  const points = new Map<string, LayoutPoint>();
  const domainByNodeId = new Map<string, string | null>();

  projects.forEach((project, index) => {
    // A normal vault has one project at the core. Extra real projects stay
    // present in a small deterministic core cloud.
    if (index === 0) {
      points.set(project.id, { id: project.id, x: 0, y: 0 });
      domainByNodeId.set(project.id, null);
      return;
    }
    const angle = phaseForId(project.id) * TAU;
    const distance = 34 + Math.sqrt(index) * 28;
    points.set(project.id, {
      id: project.id,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance * LOCAL_SCATTER_FLATTEN,
    });
    domainByNodeId.set(project.id, null);
  });

  const anchorByDomain = new Map<string, { x: number; y: number; tangent: number }>();
  domains.forEach((domain, index) => {
    const denominator = Math.max(1, domains.length - 1);
    const t = DOMAIN_START_T + (DOMAIN_END_T - DOMAIN_START_T) * (index / denominator);
    const arm = index % GALAXY_ARM_COUNT;
    const anchor = galaxySpiralPoint(t, arm, radius);
    const tangent =
      t * GALAXY_SPIRAL_TURN_RADIANS +
      (arm * TAU) / GALAXY_ARM_COUNT +
      GALAXY_SPIRAL_ROTATION +
      Math.PI / 2;
    anchorByDomain.set(domain.id, { ...anchor, tangent });
    points.set(domain.id, { id: domain.id, x: anchor.x, y: anchor.y });
    domainByNodeId.set(domain.id, domain.id);
  });

  const membersByDomain = new Map<string, LayoutGraphNode[]>();
  const ungrouped: LayoutGraphNode[] = [];
  for (const node of nodes) {
    if (node.kind === "project" || node.kind === "domain") continue;
    const domainId = resolveOwningDomain(node, byId);
    domainByNodeId.set(node.id, domainId);
    if (domainId === null || !anchorByDomain.has(domainId)) {
      ungrouped.push(node);
      continue;
    }
    const members = membersByDomain.get(domainId);
    if (members) members.push(node);
    else membersByDomain.set(domainId, [node]);
  }

  for (const domain of domains) {
    const anchor = anchorByDomain.get(domain.id);
    if (!anchor) continue;
    const members = (membersByDomain.get(domain.id) ?? []).slice().sort((left, right) => {
      const kindRank = (kind: LayoutGraphNode["kind"]) =>
        kind === "capability" ? 0 : kind === "element" ? 1 : 2;
      return kindRank(left.kind) - kindRank(right.kind) || left.id.localeCompare(right.id);
    });
    const phase = phaseForId(domain.id) * TAU + anchor.tangent;
    // Golden-angle placement is a cloud rather than an orbit. Spacing stays
    // above the canonical element/capability diameters used by hit testing.
    const spacing = Math.max(38, Math.min(rings.element * 0.48, rings.capability * 0.33));
    members.forEach((member, index) => {
      const angle = phase + GOLDEN_ANGLE * index;
      const distance = spacing * Math.sqrt(index + 1);
      points.set(member.id, {
        id: member.id,
        x: anchor.x + Math.cos(angle) * distance,
        y: anchor.y + Math.sin(angle) * distance * LOCAL_SCATTER_FLATTEN,
      });
    });
  }

  ungrouped
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .forEach((node, index) => {
      const arm = index % GALAXY_ARM_COUNT;
      const base = galaxySpiralPoint(1, arm, radius);
      const angle = phaseForId(node.id) * TAU;
      const distance = 50 + 36 * Math.sqrt(1 + Math.floor(index / GALAXY_ARM_COUNT));
      points.set(node.id, {
        id: node.id,
        x: base.x + Math.cos(angle) * distance,
        y: base.y + Math.sin(angle) * distance * LOCAL_SCATTER_FLATTEN,
      });
      domainByNodeId.set(node.id, null);
    });

  // Defensive completeness for malformed/cyclic containment: every real id
  // still receives a stable visible point.
  for (const node of nodes) {
    if (points.has(node.id)) continue;
    const angle = phaseForId(node.id) * TAU;
    const distance = radius * 0.92;
    points.set(node.id, {
      id: node.id,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance * GALAXY_VERTICAL_FLATTEN,
    });
    if (!domainByNodeId.has(node.id)) domainByNodeId.set(node.id, null);
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points.values()) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const boundsPad = Math.max(30, rings.element * 0.34);
  const bounds = Number.isFinite(minX)
    ? { minX: minX - boundsPad, minY: minY - boundsPad, maxX: maxX + boundsPad, maxY: maxY + boundsPad }
    : { minX: -radius, minY: -radius * GALAXY_VERTICAL_FLATTEN, maxX: radius, maxY: radius * GALAXY_VERTICAL_FLATTEN };

  return { points, radius, bounds, domainByNodeId };
}

export interface GalaxyEdgeAttention {
  readonly focusedNodeId: string | null;
  readonly hoveredNodeId: string | null;
  readonly selected: boolean;
  readonly path: boolean;
  readonly walked: boolean;
}

/**
 * The Galaxy overview is carried by star groups. Relations appear only when
 * the person points at a real neighbourhood or explicitly asks for a path/
 * relation; invisible overview edges therefore cannot surface hover cards.
 */
export function isGalaxyEdgeVisible(
  edge: { readonly sourceId: string; readonly targetId: string },
  attention: GalaxyEdgeAttention,
): boolean {
  if (attention.selected || attention.path || attention.walked) return true;
  if (
    attention.focusedNodeId !== null &&
    (edge.sourceId === attention.focusedNodeId || edge.targetId === attention.focusedNodeId)
  ) {
    return true;
  }
  return (
    attention.hoveredNodeId !== null &&
    (edge.sourceId === attention.hoveredNodeId || edge.targetId === attention.hoveredNodeId)
  );
}
