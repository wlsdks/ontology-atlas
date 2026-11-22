/**
 * Texture, not data: it draws no count, title or link that exists, so nothing can be mistaken for a
 * fact about the user's files. Plain numbers in and out, no canvas, React or DOM, so the field is
 * testable without a browser.
 */

export interface SynapseNode {
  x: number;
  y: number;
  /** Units per millisecond. */
  vx: number;
  vy: number;
}

export interface SynapseLink {
  a: number;
  b: number;
  /** 1 at touching distance, 0 at the reach limit. What the host turns into alpha. */
  strength: number;
}

export interface SynapseFieldOptions {
  /** How many points. */
  count: number;
  /** Farthest two points can be and still be linked, in the same units as positions. */
  reach: number;
  /** Field extent: positions live in `[0,width] × [0,height]`. */
  width: number;
  height: number;
  /** Deterministic start, so a reload is the same field and a test can name a point. */
  seed?: number;
}

/** A small deterministic generator: `Math.random` would reseed the field on every mount and defeat a screenshot comparison. */
function rng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100_000) / 100_000;
  };
}

/** Speed range, units per millisecond. Slow enough that nothing crosses the eye. */
const SPEED_MIN = 0.0016;
const SPEED_MAX = 0.0052;

/** Seeds the field on a jittered grid: independent random picks clump, one point per cell guarantees coverage. */
export function createSynapseField(options: SynapseFieldOptions): SynapseNode[] {
  const random = rng(options.seed ?? 0x5eed);
  const count = Math.max(0, Math.floor(options.count));
  const nodes: SynapseNode[] = [];
  if (count === 0) return nodes;

  // Cells as square as the field allows; tall cells put the points in visible rows.
  const columns = Math.max(1, Math.round(Math.sqrt((count * options.width) / Math.max(1, options.height))));
  const rows = Math.max(1, Math.ceil(count / columns));
  const cellWidth = options.width / columns;
  const cellHeight = options.height / rows;

  for (let i = 0; i < count; i += 1) {
    const column = i % columns;
    const row = Math.floor(i / columns);
    const angle = random() * Math.PI * 2;
    const speed = SPEED_MIN + random() * (SPEED_MAX - SPEED_MIN);
    nodes.push({
      x: Math.min(options.width, (column + random()) * cellWidth),
      y: Math.min(options.height, (row + random()) * cellHeight),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    });
  }
  return nodes;
}

/** Advances the field by `dtMs`, in place. Points wrap at the edges: a bounce would draw a visible box; the host's rim fade hides the crossing. */
export function stepSynapseField(
  nodes: SynapseNode[],
  dtMs: number,
  width: number,
  height: number,
): void {
  const dt = Math.min(64, Math.max(0, dtMs));
  for (const node of nodes) {
    node.x += node.vx * dt;
    node.y += node.vy * dt;
    if (node.x < 0) node.x += width;
    else if (node.x > width) node.x -= width;
    if (node.y < 0) node.y += height;
    else if (node.y > height) node.y -= height;
  }
}

/**
 * Every pair within `reach`, with the weight the host paints them at. Linear falloff, so a link
 * never flickers on at full strength. O(n²): `count` is in the tens, too few for a quadtree.
 */
export function synapseLinks(nodes: readonly SynapseNode[], reach: number): SynapseLink[] {
  const links: SynapseLink[] = [];
  if (reach <= 0) return links;
  const reachSquared = reach * reach;
  for (let a = 0; a < nodes.length; a += 1) {
    for (let b = a + 1; b < nodes.length; b += 1) {
      const dx = nodes[a]!.x - nodes[b]!.x;
      const dy = nodes[a]!.y - nodes[b]!.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared >= reachSquared) continue;
      links.push({ a, b, strength: 1 - Math.sqrt(distanceSquared) / reach });
    }
  }
  return links;
}
