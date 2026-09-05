import type { AnalysisFinding } from '@/entities/analysis-record';
import { buildChatNodeIndex, resolveNodeAgentTarget, type KnowledgeProjectInsight } from '@/entities/knowledge-graph';
import { presentationRelationKeysForGraphEdge } from '@/features/acp-session';

/** Locate the recorded typed relationship before falling back to a still-existing target node. */
export function resolveAnalysisFindingTarget(finding: AnalysisFinding, insight: KnowledgeProjectInsight | null | undefined) {
  if (!insight) return null;
  const index = buildChatNodeIndex(insight.nodes);
  if (finding.relation) {
    const nodes = new Map(insight.nodes.map((node) => [node.id, node]));
    const relation = finding.relation;
    const key = `${relation.from}\0${relation.type}\0${relation.to}`;
    const edge = insight.edges.find((candidate) => presentationRelationKeysForGraphEdge({
      from: resolveNodeAgentTarget(nodes.get(candidate.from)).ref ?? candidate.from,
      to: resolveNodeAgentTarget(nodes.get(candidate.to)).ref ?? candidate.to,
      type: candidate.type,
      toKind: nodes.get(candidate.to)?.kind ?? null,
    }).includes(key));
    if (edge) return { kind: 'edge' as const, edge: { sourceId: edge.from, targetId: edge.to, relationType: edge.type, declaredBySlug: edge.evidenceIds[0] ?? null } };
  }
  const nodeId = finding.targetSlugs.map((slug) => index.get(slug)).find(Boolean);
  return nodeId ? { kind: 'node' as const, nodeId } : null;
}
