/**
 * The canonical edge types: structure (`contains`, `belongs_to`), behaviour (`depends_on`,
 * `implements`, `uses`), evidence (`describes`), weak (`related_to`), taxonomy (`is_a`).
 */
export type KnowledgeEdgeType =
  | 'contains'
  | 'belongs_to'
  | 'depends_on'
  | 'implements'
  | 'uses'
  | 'describes'
  | 'related_to'
  | 'is_a';

/** Must stay 1:1 with the union. */
export const KNOWLEDGE_EDGE_TYPES: readonly KnowledgeEdgeType[] = [
  'contains',
  'belongs_to',
  'depends_on',
  'implements',
  'uses',
  'describes',
  'related_to',
  'is_a',
] as const;

export interface KnowledgeGraphNode {
  id: string;
  title: string;
  /** `deriveDisplayTitle` output; renderers read `display ?? title`, and search matches both. */
  display?: string;
  /** Every `display_<locale>`, so a node is findable by name in any language. */
  displayLocales?: Readonly<Record<string, string>>;
  kind: string;
  projectIds: string[];
  summary?: string;
  evidenceIds: string[];
  /** Whether the node has its own `.md`; absent reads as true. See `resolveNodeDocument`. */
  hasOwnDocument?: boolean;
  /**
     * The vault-relative name MCP and the CLI accept; `evidenceIds[0]` may carry a bundle-root prefix
     * or another document's slug. Absent falls back to it (`resolveNodeAgentTarget`).
     */
  agentSlug?: string | null;
  /** The reference as written, for a node without a document. */
  ref?: string;
  lastApprovedAt: Date;
  lastApprovedBy: string;
  /** `human` or `agent:<name>`; absence is unknown, never `human`. */
  createdBy?: string;
}

export interface KnowledgeGraphEdge {
  id: string;
  from: string;
  to: string;
  type: string;
  label?: string;
  projectIds: string[];
  evidenceIds: string[];
  lastApprovedAt: Date;
  lastApprovedBy: string;
}

export interface KnowledgeProjectInsight {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  sourceConceptCount?: number;
  sourceKindCounts?: Record<string, number>;
}
