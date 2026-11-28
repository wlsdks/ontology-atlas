import { useMemo } from 'react';

import { resolveNodeAgentTarget, type KnowledgeGraphNode } from '@/entities/knowledge-graph';
import { useMapEvidenceStates } from '@/features/vault-ontology';

/**
 * Concepts whose cited file changed after their document, as agent slugs, from the map's own Git
 * walk; `null` until that walk has measured (the web, a folder without paths, a walk still reading).
 * Pass the nodes the map draws, so this joins the map's walk instead of starting another.
 */
export function useChangedSourceConcepts(nodes: readonly KnowledgeGraphNode[] | undefined): string[] | null {
  const evidence = useMapEvidenceStates({ nodes, enabled: true });
  return useMemo(() => {
    if (evidence.availability !== 'measured') return null;
    return (nodes ?? [])
      .filter((node) => evidence.stalePaths.has(node.id))
      .map((node) => resolveNodeAgentTarget(node).ref)
      .filter((ref): ref is string => Boolean(ref));
  }, [evidence, nodes]);
}
