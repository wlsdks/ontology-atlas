// Fixture vaults for the duplicate-pairs contract test.
//
// The `/ontology/insights` 「Similar names — are they the same thing?」 card scores concept
// pairs the same way the agent does with
// `query_ontology({operation:'similar_nodes'})`. Duplicates are the #1 failure
// mode of a growing vault, so a screen that flags a different pair than the
// agent does is worse than no card at all — the user merges the wrong two docs.
//
// Each case is fed through BOTH pipelines by
// `tests/contract/duplicate-pairs.contract.test.ts`:
//   web  : manifest → deriveOntologyFromVault → derivationToInsight
//          → scoreNodeSimilarity / buildDuplicatePairs
//   agent: docs → compileOntology → queryCompiledOntology(similar_nodes)
//
// Every fixture declares domain membership with the inline `domain:` key. That
// is deliberate: the compiler reads `node.domain` straight off the frontmatter,
// while the web graph has no frontmatter and resolves the owning domain by
// walking containment. The two agree exactly when the key is on the child —
// which is how the schema writes it (`add_concept`, `ontology-atlas add`) and
// how all 78 capability/element docs of this repo's own vault are written.
// A vault that ONLY declares membership from the domain side (`capabilities:`
// array, no inline key) leaves the agent's `domain` empty while the web still
// finds the parent; the gap is bounded by the 0.1 domain signal. Assert the
// strict form here and let a real divergence break the build.

export const DUPLICATE_PAIR_CASES = [
  {
    name: 'near-dup — 같은 개념이 접미사만 다르게 두 번',
    docs: [
      { slug: 'domains/topology', frontmatter: { kind: 'domain', title: 'Topology' } },
      {
        slug: 'elements/ontology-drawer',
        frontmatter: { kind: 'element', title: 'Ontology drawer', domain: 'domains/topology' },
      },
      {
        slug: 'elements/ontology-drawer-model',
        frontmatter: {
          kind: 'element',
          title: 'Ontology drawer model',
          domain: 'domains/topology',
        },
      },
      {
        slug: 'elements/camera-easing',
        frontmatter: { kind: 'element', title: 'Camera easing', domain: 'domains/topology' },
      },
    ],
  },
  {
    name: 'kind 가 다르면 종류 점수가 빠진다',
    docs: [
      { slug: 'domains/product', frontmatter: { kind: 'domain', title: 'Product' } },
      {
        slug: 'capabilities/vault-validator',
        frontmatter: { kind: 'capability', title: 'Vault validator', domain: 'domains/product' },
      },
      {
        slug: 'elements/vault-validator-cli',
        frontmatter: { kind: 'element', title: 'Vault validator cli', domain: 'domains/product' },
      },
    ],
  },
  {
    name: '도메인이 다르면 소속 점수가 빠진다',
    docs: [
      { slug: 'domains/left', frontmatter: { kind: 'domain', title: 'Left' } },
      { slug: 'domains/right', frontmatter: { kind: 'domain', title: 'Right' } },
      {
        slug: 'capabilities/relation-write',
        frontmatter: { kind: 'capability', title: 'Relation write', domain: 'domains/left' },
      },
      {
        slug: 'capabilities/relation-write-confirm',
        frontmatter: {
          kind: 'capability',
          title: 'Relation write confirm',
          domain: 'domains/right',
        },
      },
    ],
  },
  {
    name: '이웃이 겹치면 이웃 점수가 올라간다',
    docs: [
      { slug: 'domains/graph', frontmatter: { kind: 'domain', title: 'Graph' } },
      {
        slug: 'elements/shared-anchor',
        frontmatter: { kind: 'element', title: 'Shared anchor', domain: 'domains/graph' },
      },
      {
        slug: 'capabilities/path-finder',
        frontmatter: {
          kind: 'capability',
          title: 'Path finder',
          domain: 'domains/graph',
          dependencies: ['elements/shared-anchor'],
        },
      },
      {
        slug: 'capabilities/path-finder-cache',
        frontmatter: {
          kind: 'capability',
          title: 'Path finder cache',
          domain: 'domains/graph',
          dependencies: ['elements/shared-anchor'],
        },
      },
    ],
  },
  {
    name: '이름이 안 겹치면 의심하지 않는다',
    docs: [
      { slug: 'domains/misc', frontmatter: { kind: 'domain', title: 'Misc' } },
      {
        slug: 'capabilities/token-issue',
        frontmatter: { kind: 'capability', title: 'Token issue', domain: 'domains/misc' },
      },
      {
        slug: 'capabilities/invoice-export',
        frontmatter: { kind: 'capability', title: 'Invoice export', domain: 'domains/misc' },
      },
    ],
  },
];
