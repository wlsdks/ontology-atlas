/**
 * The full set of frontmatter keys MCP reads as graph edges (`GRAPH_ARRAY_KEYS` in `mcp/src/vault/`)
 * and the edge type each must produce in the web derive. A new MCP key fails
 * `tests/contract/derive-relation-keys.contract.test.ts` until it is added here.
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
    // The canonical schema key (`mcp/src/schema.mjs`): MCP folds it into dependencies as an alias, and the
    // web derive must read it at the same place.
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
