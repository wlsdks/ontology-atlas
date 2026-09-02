/**
 * **Growth replay** (2026-09-02) — a one-shot replay in which the ontology
 * appears piece by piece, so the shape of the vault reads as something that was
 * built rather than as a finished picture.
 *
 * The map draws only "now"; time reached the screen only through the recent
 * lens and the footprint trail. Graph tools that replay a corpus in creation
 * order (Gource for repositories, the graph views of note apps) exist because
 * the *order* things arrived in is itself a fact about the structure. This
 * vault carries no creation dates on its nodes, so the order is **the
 * containment order** instead — the project, then each domain with its own
 * capabilities and their elements before the next domain begins. That is the
 * order a person explains the ontology in, and in the 3D cone tree it grows
 * one cone at a time. When creation dates exist later, they slot in as an
 * alternative ordering without touching the playback.
 *
 * Why not a mode. A slider or a scrub bar is a permanent control that turns
 * "when" into a second axis the map must keep answering. A replay is a twelve
 * second event: it starts on request, cannot be steered, ends on its own or on
 * the first input, and leaves nothing behind. Camera, focus and lenses are
 * untouched — the replay only drives each node's appear ramp, the same ramp a
 * newly created node already uses to swell into view, so nothing new is drawn.
 *
 * Reduced motion: a replay is app-generated motion with no direct-manipulation
 * exemption, so the request is ignored there (the caller decides).
 */
export interface GrowthReplayNode {
  id: string;
  kind: "project" | "domain" | "capability" | "element";
  parentId: string | null;
}

export interface GrowthReplay {
  startMs: number;
  /** When the last node has fully appeared — the replay ends here. */
  endMs: number;
  /** id → ms after `startMs` at which the node begins to appear. */
  bornAt: Map<string, number>;
}

/** Shortest and longest whole replay (ms) — six seconds for a tiny vault, sixteen for a large one. */
export const GROWTH_REPLAY_MIN_MS = 6_000;
export const GROWTH_REPLAY_MAX_MS = 16_000;
/** Added per node before clamping — 125 nodes ≈ 11 s, 250+ nodes hit the cap. */
const GROWTH_REPLAY_PER_NODE_MS = 40;
/** How long one node takes to swell from 0 to 1 once its turn comes. */
export const GROWTH_REPLAY_RISE_MS = 600;
/** An input this long after the start cancels the replay (the first 300 ms is the click that started it). */
export const GROWTH_REPLAY_CANCEL_GRACE_MS = 300;

const KIND_RANK: Record<GrowthReplayNode["kind"], number> = { project: 0, domain: 1, capability: 2, element: 3 };
const byIdAsc = (a: GrowthReplayNode, b: GrowthReplayNode) => (a.id < b.id ? -1 : 1);

/**
 * Containment order: projects, then for each domain (sorted) the domain, each
 * of its capabilities (sorted) followed by that capability's elements, then
 * the domain's direct elements; finally anything unparented, by kind then id.
 * Deterministic — the same vault always replays the same way.
 */
export function growthReplayOrder(nodes: readonly GrowthReplayNode[]): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const kids = new Map<string, GrowthReplayNode[]>();
  for (const n of nodes) {
    if (n.parentId === null || !byId.has(n.parentId) || n.parentId === n.id) continue;
    const list = kids.get(n.parentId);
    if (list) list.push(n);
    else kids.set(n.parentId, [n]);
  }
  for (const list of kids.values()) list.sort(byIdAsc);
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (n: GrowthReplayNode): void => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    order.push(n.id);
    const children = kids.get(n.id) ?? [];
    // Capabilities (each with its elements) before the parent's direct elements.
    for (const c of children) if (c.kind === "capability") visit(c);
    for (const c of children) if (c.kind !== "capability") visit(c);
  };
  for (const p of nodes.filter((n) => n.kind === "project").sort(byIdAsc)) visit(p);
  for (const d of nodes.filter((n) => n.kind === "domain").sort(byIdAsc)) visit(d);
  for (const n of [...nodes].sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || (a.id < b.id ? -1 : 1))) visit(n);
  return order;
}

export function growthReplayDurationMs(nodeCount: number): number {
  return Math.min(GROWTH_REPLAY_MAX_MS, Math.max(GROWTH_REPLAY_MIN_MS, GROWTH_REPLAY_MIN_MS + nodeCount * GROWTH_REPLAY_PER_NODE_MS));
}

export function createGrowthReplay(nodes: readonly GrowthReplayNode[], startMs: number): GrowthReplay {
  const order = growthReplayOrder(nodes);
  const span = growthReplayDurationMs(order.length) - GROWTH_REPLAY_RISE_MS;
  const bornAt = new Map<string, number>();
  const last = Math.max(1, order.length - 1);
  order.forEach((id, i) => bornAt.set(id, (i / last) * span));
  return { startMs, endMs: startMs + span + GROWTH_REPLAY_RISE_MS, bornAt };
}

/** ease-out cubic — the same curve the assembly ramps use. */
function easeOutCubic(t: number): number {
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return 1 - Math.pow(1 - c, 3);
}

/**
 * Writes this frame's appear value (0..1) for every replayed node into `out`
 * and returns true once the replay is over. Nodes unknown to the replay (born
 * after it started) are left untouched, so they keep whatever ramp they have.
 */
export function stepGrowthReplay(replay: GrowthReplay, nowMs: number, out: Map<string, number>): boolean {
  const elapsed = nowMs - replay.startMs;
  for (const [id, born] of replay.bornAt) {
    out.set(id, easeOutCubic((elapsed - born) / GROWTH_REPLAY_RISE_MS));
  }
  return nowMs >= replay.endMs;
}
