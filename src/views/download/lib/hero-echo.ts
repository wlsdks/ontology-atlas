import type { StageGraph } from './stage-graph';

/**
 * The hero object assembles as the headline is typed: each keystroke lights the next dots, so
 * sentence and object finish on the same beat in every locale. `echoOrder` goes tier by tier,
 * clockwise from twelve, so it reads as a stack; `echoCount` is proportional and rounds up, so
 * the first character lights a dot and the last lights the last one.
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
  // total 0 means the typewriter has not reported yet, not a finished sentence.
  if (nodeCount <= 0 || total <= 0 || typed <= 0) return 0;
  if (typed >= total) return nodeCount;
  return Math.min(nodeCount, Math.ceil((typed / total) * nodeCount));
}

/** A pointed-at dot's one real edge: to its drawn parent, else the first edge it owns. */
export interface EchoFact {
  relation: 'contains' | 'depends';
  from: string;
  to: string;
}

/**
 * The one parent every consumer uses: an element contained by a domain and a capability hangs
 * under the capability, or the drawn line and the printed sentence name different parents.
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
