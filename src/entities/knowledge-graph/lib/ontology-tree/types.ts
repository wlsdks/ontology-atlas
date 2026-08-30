import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../../model";

/** One neighbour in an ego graph, with its hop distance from the centre. */
export interface OntologyEgoNeighbor {
  /** `null` when the edge points at a node that does not exist. */
  node: KnowledgeGraphNode | null;
  /** Kept even when `node` is null, so the dangling reference stays visible. */
  neighborId: string;
  edge: KnowledgeGraphEdge;
  /**
   * `outgoing` means centre → neighbour. For a 2-hop neighbour this is the
   * direction of the edge between the intermediate node and it, not from the
   * centre.
   */
  direction: "outgoing" | "incoming";
  hop: 1 | 2;
  /** The intermediate node for `hop: 2`; undefined at hop 1. */
  viaNeighborId?: string;
}

export interface OntologyEgoSubgraph {
  centerId: string;
  /**
   * Ordered hop 1 (outgoing then incoming) before hop 2; within a group, input
   * edge order.
   */
  neighbors: OntologyEgoNeighbor[];
}

export interface OntologyTreeNode {
  node: KnowledgeGraphNode;
  /** 0 at a root. */
  depth: number;
  children: OntologyTreeNode[];
  /**
   * A node appearing twice in a `contains` chain is a data error: the repeat is
   * skipped and recorded in `warnings`.
   */
}

export interface OntologyTreeBuildResult {
  /** Tree roots, typically `kind: project`. */
  roots: OntologyTreeNode[];
  /**
   * Nodes no tree reached — usually `kind: document`, or a broken
   * contains/belongs_to chain. A surface can show these as their own section.
   */
  orphans: KnowledgeGraphNode[];
  /** Data problems found while building: cycles, multiple parents, disconnects. */
  warnings: string[];
}
