/**
 * The relation-key matrix — the full set of frontmatter keys MCP reads as graph edges
 * (`mcp/src/vault.mjs` GRAPH_ARRAY_KEYS = NEIGHBOR_KEYS + alias `depends_on`)
 * and the edge type each key must produce in the web derive
 * (`derive-ontology-from-vault`). This table is the only source of truth.
 *
 * The contract (`tests/contract/derive-relation-keys.contract.test.ts`):
 *   1. If MCP admits a new key, this table will not know it and the test fails
 *      immediately — structurally blocking the regression where the web derive
 *      silently drops that key (describes, 2026-07-27; depends_on, 2026-08-12).
 *   2. Each row is fed to both MCP's `collectNeighborRefs` and the web derive to
 *      confirm both really read that key.
 */
export const RELATION_KEY_CASES = [
  {
    key: 'domains',
    frontmatter: { kind: 'project', domains: ['billing'] },
    /** The OntologyStubEdge.type the web derive must produce from this key */
    expectedEdgeType: 'contains',
  },
  {
    key: 'capabilities',
    frontmatter: { kind: 'project', capabilities: ['checkout'] },
    expectedEdgeType: 'contains',
  },
  {
    key: 'elements',
    frontmatter: { kind: 'capability', elements: ['jwt-signer'] },
    expectedEdgeType: 'contains',
  },
  {
    key: 'contains',
    frontmatter: { kind: 'domain', contains: ['sub-area'] },
    expectedEdgeType: 'contains',
  },
  {
    key: 'dependencies',
    frontmatter: { kind: 'project', dependencies: ['user-store'] },
    expectedEdgeType: 'depends_on',
  },
  {
    // The canonical schema key (the capability/element canon in mcp/src/schema.mjs) —
    // MCP folds it into dependencies as an alias, and the web derive must read it at the
    // same place (2026-08-12: the hole where only this key was lost on the web).
    key: 'depends_on',
    frontmatter: { kind: 'capability', depends_on: ['key-store'] },
    expectedEdgeType: 'depends_on',
  },
  {
    key: 'relates',
    frontmatter: { kind: 'capability', relates: ['sibling-cap'] },
    expectedEdgeType: 'related_to',
  },
  {
    key: 'describes',
    frontmatter: { kind: 'document', describes: ['capabilities/checkout'] },
    expectedEdgeType: 'describes',
  },
  {
    key: 'broader',
    frontmatter: { kind: 'capability', broader: ['parent-concept'] },
    expectedEdgeType: 'is_a',
  },
];

/**
 * The union contract — a target present under both `dependencies` and `depends_on`
 * counts once. MCP's `collectNeighborRefs` deduplicates by canonical key + ref and
 * must emit 3 refs; the web derive must emit 3 depends_on edges.
 */
export const DEPENDS_UNION_CASE = {
  frontmatter: {
    kind: 'capability',
    dependencies: ['shared-target', 'only-dep'],
    depends_on: ['shared-target', 'only-alias'],
  },
  expectedRefs: ['only-alias', 'only-dep', 'shared-target'],
};
