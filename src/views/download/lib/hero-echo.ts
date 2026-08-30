import type { StageGraph } from './stage-graph';

/**
 * The typing echo — which dot lights for which typed character, and what a pointed-at dot says.
 *
 * Direction B (owner, 2026-08-30): the hero object does not assemble on a timer of its own; it
 * assembles **as the headline is typed**. Every keystroke lights the next dots of the real vault
 * graph, so the object's arrival has a visible cause, and the sentence and the object finish on
 * the same beat in every locale. That replaces the generic 450ms stage fade and the per-tier
 * delays the engine used to run on its own clock.
 *
 * Two pure decisions live here so they can be tested without a canvas:
 *
 * - `echoOrder` — the order dots light: apex first, then each plane top to bottom, clockwise
 *   from twelve o'clock. Tier by tier is what keeps the assembly legible as a *stack*; the
 *   clockwise sweep inside a tier is what makes each keystroke read as the next dot, not a
 *   random one.
 * - `echoCount` — how many dots a typed count has earned. The headline has 30 characters in
 *   Korean and 59 in English; the graph has however many nodes the vault has. Neither number is
 *   the other's, so the mapping is proportional and rounds *up*: the first character always
 *   lights at least one dot, and the last character lights the last dot. Nothing is left for a
 *   burst after the sentence ends.
 */

type EchoKind = 'project' | 'domain' | 'capability' | 'element';

export interface EchoNode {
  s: string;
  k: EchoKind;
  /** World coordinates on the node's plane, as `layoutHeroGraph` leaves them. */
  px?: number;
  pz?: number;
}

const TIER: Record<EchoKind, number> = { project: 0, domain: 1, capability: 2, element: 3 };

/** Angle from twelve o'clock, clockwise, in [0, 2π). The layout puts the first domain at −π/2. */
function clockwiseFromTop(px: number, pz: number): number {
  const a = Math.atan2(pz, px) + Math.PI / 2;
  return ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}

export function echoOrder(nodes: readonly EchoNode[]): string[] {
  return nodes
    .map((n) => ({ s: n.s, tier: TIER[n.k], angle: clockwiseFromTop(n.px ?? 0, n.pz ?? 0) }))
    .sort((a, b) => a.tier - b.tier || a.angle - b.angle || (a.s < b.s ? -1 : 1))
    .map((n) => n.s);
}

export function echoCount(typed: number, total: number, nodeCount: number): number {
  // No sentence reported yet is not a finished sentence: before the headline speaks, nothing is
  // lit. (Measured 2026-08-30: treating total 0 as "done" lit the whole object on the mount
  // frame, one commit before the typewriter's first report, and the echo never happened.)
  if (nodeCount <= 0 || total <= 0 || typed <= 0) return 0;
  if (typed >= total) return nodeCount;
  return Math.min(nodeCount, Math.ceil((typed / total) * nodeCount));
}

/**
 * The one fact a pointed-at dot states. A dot is a real node, so what it says is one real edge of
 * that node: the edge to its parent when it has one (that is the line drawn to it), otherwise the
 * first edge it owns. Both ends are the labels the evidence section prints for the same graph.
 */
export interface EchoFact {
  relation: 'contains' | 'depends';
  from: string;
  to: string;
}

/**
 * The one parent every consumer agrees on. An element is often contained twice, by its domain
 * and by a capability, and the layout fans elements under the capability because the fan comes
 * out denser; the hover line and the caption must point at that same parent, or the line drawn
 * to a dot and the sentence printed for it would name two different things. Measured 2026-08-30
 * (review): three separate first-match lookups agreed only because the manifest lists
 * capabilities before domains alphabetically. This is the contract instead of the coincidence.
 */
export function preferredParents(
  nodes: readonly { s: string; k: EchoKind }[],
  edges: readonly { a: string; b: string; y: 'contains' | 'depends' }[],
): Map<string, string> {
  const kindOf = new Map(nodes.map((n) => [n.s, n.k]));
  const parentOf = new Map<string, string>();
  for (const e of edges) {
    if (e.y !== 'contains' || !kindOf.has(e.a) || !kindOf.has(e.b)) continue;
    const prior = parentOf.get(e.b);
    if (prior !== undefined) {
      const keepPrior = kindOf.get(e.b) === 'element' && kindOf.get(prior) === 'capability';
      const takeThis = kindOf.get(e.b) === 'element' && kindOf.get(e.a) === 'capability';
      if (keepPrior || !takeThis) continue;
    }
    parentOf.set(e.b, e.a);
  }
  return parentOf;
}

export function echoFact(graph: StageGraph, slug: string): EchoFact | null {
  const labelOf = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id;
  const parents = preferredParents(
    graph.nodes.map((n) => ({ s: n.id, k: n.kind })),
    graph.edges
      .filter((e) => e.kind === 'contains' || e.kind === 'depends')
      .map((e) => ({ a: e.source, b: e.target, y: e.kind })),
  );
  const parentId = parents.get(slug);
  const parent =
    parentId !== undefined
      ? graph.edges.find((e) => e.kind === 'contains' && e.source === parentId && e.target === slug)
      : undefined;
  const own =
    parent ??
    graph.edges.find((e) => (e.kind === 'contains' || e.kind === 'depends') && e.source === slug) ??
    graph.edges.find((e) => e.kind === 'depends' && e.target === slug);
  if (!own) return null;
  return {
    relation: own.kind === 'depends' ? 'depends' : 'contains',
    from: labelOf(own.source),
    to: labelOf(own.target),
  };
}
