"use client";

import type { ReactNode } from "react";
import type { VaultDoc } from "@/entities/docs-vault";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  useAdaptiveRecentChanges,
  useMapEvidenceStates,
  useVaultConceptFacts,
  type MapEvidence,
} from "@/features/vault-ontology";
import { useProjectReviewRows, type ProjectReviewRows } from "../../model/use-project-review-rows";

export interface ProjectNowFacts {
  evidence: MapEvidence;
  recentChanges: ReturnType<typeof useAdaptiveRecentChanges>;
  review: ProjectReviewRows;
  conceptFacts: ReturnType<typeof useVaultConceptFacts>;
}

/**
 * Reads what the band and the composition marks need: the Git walk, the recent window, the review
 * queue and the definition gaps. Mounted only under a found project, so a loading, missing or
 * invalid page walks and reads nothing.
 */
export function ProjectNowFactsReader({
  nodes,
  docs,
  children,
}: {
  nodes: readonly KnowledgeGraphNode[] | undefined;
  docs: readonly VaultDoc[];
  children: (facts: ProjectNowFacts) => ReactNode;
}) {
  // The map's own walk and window, so the page and the map name the same states and days.
  const evidence = useMapEvidenceStates({ nodes, enabled: true });
  const recentChanges = useAdaptiveRecentChanges();
  const review = useProjectReviewRows(docs);
  const conceptFacts = useVaultConceptFacts();
  return children({ evidence, recentChanges, review, conceptFacts });
}
