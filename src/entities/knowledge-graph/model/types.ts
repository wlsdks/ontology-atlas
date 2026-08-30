/**
 * The canonical edge-type union: the seven standard ontology relations, matching
 * the vault frontmatter array keys (capabilities / elements / dependencies /
 * relates / contains / describes …).
 *
 * By category, for orientation:
 *   structure: `contains`, `belongs_to`
 *   behaviour: `depends_on`, `implements`, `uses`
 *   evidence:  `describes` (document → concept)
 *   weak:      `related_to`
 *   taxonomy:  `is_a` (SKOS skos:broader, frontmatter `broader:`)
 *
 * `KnowledgeGraphEdge.type` itself stays `string` for backwards compatibility;
 * typed writers and readers use this union.
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

/** For runtime validation and iteration — must stay 1:1 with the union above. */
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
  /**
   * Short title for display, derived by `deriveDisplayTitle` (frontmatter
   * `display:` wins, otherwise the parenthetical tail of `title` is cut). Render
   * surfaces read `node.display ?? node.title`.
   *
   * `title` remains the single source of truth for matching, but the visible name
   * is **added** to what search covers (`shared/lib/node-name-match`) — typing the
   * name you just read and getting zero results reads as "there is no data".
   *
   * Optional for backwards compatibility with nodes built without going through
   * `derivationToInsight` (test fixtures and the like).
   */
  display?: string;
  /**
   * The full `display_<locale>` map (locale → name). `display` has already been
   * narrowed to the current screen locale, so the original is needed for a node to
   * be findable by its name in another language — search treats every value here
   * as a name.
   */
  displayLocales?: Readonly<Record<string, string>>;
  kind: string;
  projectIds: string[];
  summary?: string;
  evidenceIds: string[];
  /**
   * Whether this node has its own `.md` document. `evidenceIds[0]` cannot answer
   * that: for a document node it is that node's own slug, and for a node named
   * only by a relation it is *the slug of whichever other document cited it*. A
   * surface rendering "open this node's document" must branch on this field or it
   * opens someone else's document (see `resolveNodeDocument`).
   *
   * Optional for backwards compatibility with hand-assembled nodes; absent reads
   * as `true`.
   */
  hasOwnDocument?: boolean;
  /**
   * **The name to use when pointing an agent at this node** — the vault-relative
   * string MCP and the CLI accept verbatim.
   *
   * For a node with a document that is the doc slug relative to the vault root;
   * for a derived node it is the reference string the vault wrote
   * (`src/entities/….ts`). Two reasons `evidenceIds[0]` cannot be used directly:
   * ① the bundled sample manifest is built with `docs/` as its root, so ontology
   * documents sit under `ontology/` while the agent's vault root is `docs/ontology`,
   * leaving one segment over — measured 2026-07-26, the `merge_concepts` command
   * the screen offered to copy failed immediately because of that segment; ② for a
   * derived node the value is *someone else's document* and would point at the
   * wrong node.
   *
   * Optional for backwards compatibility; absent falls back to `evidenceIds[0]`
   * as before (see `resolveNodeAgentTarget`).
   */
  agentSlug?: string | null;
  /**
   * For a node with no document, the reference string as written in the vault;
   * empty for document nodes. Carried straight through from the field of the same
   * name in `derive-ontology-from-vault.ts`.
   */
  ref?: string;
  lastApprovedAt: Date;
  lastApprovedBy: string;
  /**
   * Who wrote this node — `human` or `agent:<name>` (the value convention from the
   * 2026-07-31 ledger entry, `mcp/src/schema.mjs`).
   *
   * Absence is **unknown**, not a defect. Retroactive inference ("no log, therefore
   * a person"; git blame) would invent a provenance that does not exist, so no path
   * defaults absence to `human` and screens draw the reviewed marker only when the
   * value is exactly `human`.
   */
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
