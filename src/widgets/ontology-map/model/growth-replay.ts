/**
 * A one-shot replay that grows the ontology in containment order (project, then each domain
 * with its capabilities and their elements), because nodes carry no creation dates. It only
 * drives each node's existing appear ramp; camera, focus and lenses are untouched. It is an
 * event, not a mode: no permanent scrub control. Deliberate stops only (second press, Escape,
 * a click, a canvas drag), wired in `ui/use-topology-loop.ts`; hover and wheel do not stop
 * it. Under reduced motion the caller ignores the request.
 */
export interface GrowthReplayNode {
  id: string;
  kind: "project" | "domain" | "capability" | "element";
  parentId: string | null;
}

export interface GrowthReplay {
  startMs: number;
  endMs: number;
  /** ms after `startMs` at which each node starts to appear. */
  bornAt: Map<string, number>;
}

export const GROWTH_REPLAY_MIN_MS = 6_000;
export const GROWTH_REPLAY_MAX_MS = 16_000;
/** 125 nodes ≈ 11 s; 250 and more hit the cap. */
const GROWTH_REPLAY_PER_NODE_MS = 40;
export const GROWTH_REPLAY_RISE_MS = 600;

const KIND_RANK: Record<GrowthReplayNode["kind"], number> = { project: 0, domain: 1, capability: 2, element: 3 };
const byIdAsc = (a: GrowthReplayNode, b: GrowthReplayNode) => (a.id < b.id ? -1 : 1);

/**
 * Projects, then per sorted domain: the domain, each capability followed by its elements,
 * then its direct elements; unparented nodes last by kind and id. O(N log N).
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

/** The same curve the assembly ramps use. */
function easeOutCubic(t: number): number {
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return 1 - Math.pow(1 - c, 3);
}

/** Writes each node's appear value into `out`; true once over. Nodes born after it started keep their ramp. */
export function stepGrowthReplay(replay: GrowthReplay, nowMs: number, out: Map<string, number>): boolean {
  const elapsed = nowMs - replay.startMs;
  for (const [id, born] of replay.bornAt) {
    out.set(id, easeOutCubic((elapsed - born) / GROWTH_REPLAY_RISE_MS));
  }
  return nowMs >= replay.endMs;
}
