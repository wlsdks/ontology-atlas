/**
 * A one-shot replay that grows the ontology in containment order (project, then each domain
 * with its capabilities and their elements), because nodes carry no creation dates. It only
 * drives each node's existing appear ramp; camera, focus and lenses are untouched. It is an
 * event, not a mode: no permanent scrub control. Deliberate stops only (second press, Escape,
 * a click, a canvas drag), wired in `use-topology-loop.ts`; hover and wheel do not stop
 * it. Under reduced motion the caller ignores the request. No presence ever cuts: the map
 * leaves over `GROWTH_REPLAY_CLEAR_MS` before it grows, and a stop lets it rise back together.
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
  /** Presence each node had at `startMs`: it leaves from there, or rises from there once stopped. */
  heldAt: ReadonlyMap<string, number>;
  /** A stopped replay: every node rises from `heldAt` together. */
  settling: boolean;
}

export const GROWTH_REPLAY_MIN_MS = 6_000;
export const GROWTH_REPLAY_MAX_MS = 16_000;
/** 125 nodes ≈ 11 s; 250 and more hit the cap. */
const GROWTH_REPLAY_PER_NODE_MS = 40;
export const GROWTH_REPLAY_RISE_MS = 600;
export const GROWTH_REPLAY_CLEAR_MS = 320;

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

const NO_PRESENCE: ReadonlyMap<string, number> = new Map();

/** `presence` is what each node shows at `startMs`; a node it does not name is fully shown. */
export function createGrowthReplay(
  nodes: readonly GrowthReplayNode[],
  startMs: number,
  presence: ReadonlyMap<string, number> = NO_PRESENCE,
): GrowthReplay {
  const order = growthReplayOrder(nodes);
  const span = growthReplayDurationMs(order.length) - GROWTH_REPLAY_RISE_MS;
  const bornAt = new Map<string, number>();
  const heldAt = new Map<string, number>();
  const last = Math.max(1, order.length - 1);
  order.forEach((id, i) => {
    bornAt.set(id, GROWTH_REPLAY_CLEAR_MS + (i / last) * span);
    heldAt.set(id, presence.get(id) ?? 1);
  });
  return { startMs, endMs: startMs + GROWTH_REPLAY_CLEAR_MS + span + GROWTH_REPLAY_RISE_MS, bornAt, heldAt, settling: false };
}

/** Stops `replay` at `nowMs`: every node rises together from the presence `shown` holds for it. */
export function settleGrowthReplay(replay: GrowthReplay, nowMs: number, shown: ReadonlyMap<string, number>): GrowthReplay {
  const bornAt = new Map<string, number>();
  const heldAt = new Map<string, number>();
  for (const id of replay.bornAt.keys()) {
    bornAt.set(id, 0);
    heldAt.set(id, shown.get(id) ?? 1);
  }
  return { startMs: nowMs, endMs: nowMs + GROWTH_REPLAY_RISE_MS, bornAt, heldAt, settling: true };
}

function clamp01(t: number): number {
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - clamp01(t), 3);
}

function easeInOutCubic(t: number): number {
  const c = clamp01(t);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/** Writes each node's appear value into `out`; true once over. Nodes born after it started keep their ramp. */
export function stepGrowthReplay(replay: GrowthReplay, nowMs: number, out: Map<string, number>): boolean {
  const elapsed = nowMs - replay.startMs;
  const leaving = replay.settling ? 0 : 1 - easeInOutCubic(elapsed / GROWTH_REPLAY_CLEAR_MS);
  for (const [id, born] of replay.bornAt) {
    const held = replay.heldAt.get(id) ?? 1;
    const risen = easeOutCubic((elapsed - born) / GROWTH_REPLAY_RISE_MS);
    out.set(id, replay.settling ? held + (1 - held) * risen : Math.max(held * leaving, risen));
  }
  return nowMs >= replay.endMs;
}
