import type { StageGraph } from './stage-graph';

/**
 * Data for the evidence section's right-hand rail — **all of it derived from the same `StageGraph`
 * as the map on the left** (owner report 2026-08-18: 80% of the section was empty black —
 * *"반 자르고 우측에는 뭔가 다른걸"*, cut it in half and put something else on the right). It is
 * evidence rather than decoration, so nothing here is invented: the numbers, relations, and names
 * count the same object as the caption and the map, and copy the same frontmatter relations verbatim.
 *
 * Every selection is deterministic (frequency descending, then name ascending) — the same vault
 * yields the same three lines on any build. It is derived rather than a snapshot, so the screen
 * grows as the vault does.
 */

export interface EvidenceCensusRow {
  kind: 'project' | 'domain' | 'capability' | 'element';
  count: number;
}

export interface EvidenceRelationLine {
  source: string;
  type: string;
  target: string;
}

export interface EvidenceImpact {
  name: string;
  count: number;
}

export interface EvidenceRailModel {
  census: EvidenceCensusRow[];
  relations: EvidenceRelationLine[];
  impact: EvidenceImpact | null;
}

const KIND_ORDER = ['project', 'domain', 'capability', 'element'] as const;

export function buildEvidenceRailModel(graph: StageGraph): EvidenceRailModel {
  const labelById = new Map(graph.nodes.map((node) => [node.id, node.label]));

  const kindCounts = new Map<string, number>();
  for (const node of graph.nodes) {
    kindCounts.set(node.kind, (kindCounts.get(node.kind) ?? 0) + 1);
  }
  const census: EvidenceCensusRow[] = [];
  for (const kind of KIND_ORDER) {
    const count = kindCounts.get(kind) ?? 0;
    if (count > 0) census.push({ kind, count });
  }

  // Three relation lines — pick the three most common relation types, and from each copy the
  // alphabetically first edge by (source, target). Common types come first because what this vault
  // is actually woven from is the evidence, not a display of rare types.
  // ⚠️ Every sort is a **code-point comparison**. `localeCompare` orders mixed Korean and latin
  // differently on the server (Node ICU) and in the browser, which splits SSR hydration (measured
  // 2026-08-18: server "Agent Connect…" vs client "그래프 모델…"). The comparison key is the
  // **node id (slug)** rather than the display label — labels differ per locale, ids are the same
  // ASCII everywhere, so the same lines are picked in either locale.
  const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  const byType = new Map<string, { sourceId: string; targetId: string }[]>();
  for (const edge of graph.edges) {
    if (!labelById.has(edge.source) || !labelById.has(edge.target)) continue;
    const list = byType.get(edge.relationType) ?? [];
    list.push({ sourceId: edge.source, targetId: edge.target });
    byType.set(edge.relationType, list);
  }
  const rankedTypes = [...byType.entries()].sort(
    (a, b) => b[1].length - a[1].length || cmp(a[0], b[0]),
  );
  const relations: EvidenceRelationLine[] = rankedTypes.slice(0, 3).map(([type, list]) => {
    const first = [...list].sort(
      (a, b) => cmp(a.sourceId, b.sourceId) || cmp(a.targetId, b.targetId),
    )[0];
    return {
      source: labelById.get(first.sourceId) as string,
      type,
      target: labelById.get(first.targetId) as string,
    };
  });

  // Impact radius — the single node that the most non-containment (depends-family) edges point at.
  // "How many places shake if I change this" is a question an agent really asks of this graph
  // (`find_backlinks`), so that one answer is this section's strongest evidence.
  const incoming = new Map<string, number>();
  for (const edge of graph.edges) {
    if (edge.kind !== 'depends') continue;
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  }
  let impact: EvidenceImpact | null = null;
  let impactId: string | null = null;
  for (const [id, count] of incoming) {
    const name = labelById.get(id);
    if (!name) continue;
    if (
      impact === null ||
      count > impact.count ||
      (count === impact.count && impactId !== null && id < impactId)
    ) {
      impact = { name, count };
      impactId = id;
    }
  }

  return { census, relations, impact };
}
