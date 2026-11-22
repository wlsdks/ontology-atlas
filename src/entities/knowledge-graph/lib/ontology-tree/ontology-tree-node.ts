import type { KnowledgeGraphNode } from "../../model";

export interface OntologyTreeNode {
  node: KnowledgeGraphNode;
  depth: number;
  children: OntologyTreeNode[];
  /** A node repeated in a `contains` chain is skipped and recorded in `warnings`. */
}

export interface OntologyTreeBuildResult {
  roots: OntologyTreeNode[];
  orphans: KnowledgeGraphNode[];
  warnings: string[];
}
