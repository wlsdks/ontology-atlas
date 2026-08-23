// Fixture vaults for the impact-ranking contract test.
//
// The `/ontology/insights` 「Concepts that spread far when changed」 card counts, for each
// concept, how many concepts must be re-checked when it changes. That is the
// same question the agent asks with
// `query_ontology({operation:'blast_radius', direction:'incoming'})`, so the two
// answers must be the same number on the same vault — a screen that says 9
// while the agent says 4 is a trust hole, not a rounding difference.
//
// Each case is fed through BOTH pipelines by
// `tests/contract/impact-ranking.contract.test.ts`:
//   web  : manifest → deriveOntologyFromVault → derivationToInsight
//          → computeOntologyDependents(node)
//   agent: docs → compileOntology → queryCompiledOntology(blast_radius)
//
// Both surfaces follow only declared dependency relations. Structure and soft
// association remain available to reachability/subgraph, never impact.
//
// Single source of truth: add a scenario here and both pipelines get it.

export const IMPACT_RANKING_CASES = [
  {
    name: 'chain — 잎에서 뿌리까지 전이 도달',
    docs: [
      {
        slug: 'domains/auth',
        frontmatter: { kind: 'domain', title: 'Auth', capabilities: ['capabilities/login'] },
      },
      {
        slug: 'capabilities/login',
        frontmatter: { kind: 'capability', title: 'Login', elements: ['elements/token'] },
      },
      { slug: 'elements/token', frontmatter: { kind: 'element', title: 'Token' } },
    ],
  },
  {
    name: 'fan-in — 한 요소에 여러 역량이 기댄다',
    docs: [
      {
        slug: 'domains/core',
        frontmatter: {
          kind: 'domain',
          title: 'Core',
          capabilities: ['capabilities/a', 'capabilities/b', 'capabilities/c'],
        },
      },
      {
        slug: 'capabilities/a',
        frontmatter: { kind: 'capability', title: 'A', dependencies: ['elements/shared'] },
      },
      {
        slug: 'capabilities/b',
        frontmatter: { kind: 'capability', title: 'B', dependencies: ['elements/shared'] },
      },
      {
        slug: 'capabilities/c',
        frontmatter: { kind: 'capability', title: 'C', dependencies: ['capabilities/a'] },
      },
      { slug: 'elements/shared', frontmatter: { kind: 'element', title: 'Shared' } },
    ],
  },
  {
    name: 'soft associations — 연관/설명은 파급이 아니다',
    docs: [
      {
        slug: 'domains/docs',
        frontmatter: { kind: 'domain', title: 'Docs', capabilities: ['capabilities/guide'] },
      },
      {
        slug: 'capabilities/guide',
        frontmatter: {
          kind: 'capability',
          title: 'Guide',
          relates: ['capabilities/tour'],
          describes: ['elements/page'],
        },
      },
      {
        slug: 'capabilities/tour',
        frontmatter: { kind: 'capability', title: 'Tour', domains: ['domains/docs'] },
      },
      { slug: 'elements/page', frontmatter: { kind: 'element', title: 'Page' } },
    ],
  },
  {
    name: 'cycle — 순환 의존에서도 닫힌 집합을 센다',
    docs: [
      {
        slug: 'capabilities/x',
        frontmatter: { kind: 'capability', title: 'X', dependencies: ['capabilities/y'] },
      },
      {
        slug: 'capabilities/y',
        frontmatter: { kind: 'capability', title: 'Y', dependencies: ['capabilities/z'] },
      },
      {
        slug: 'capabilities/z',
        frontmatter: { kind: 'capability', title: 'Z', dependencies: ['capabilities/x'] },
      },
    ],
  },
  {
    name: 'is-a — 상위개념(broader)도 되짚어야 한다',
    docs: [
      {
        slug: 'capabilities/base',
        frontmatter: { kind: 'capability', title: 'Base' },
      },
      {
        slug: 'capabilities/special',
        frontmatter: { kind: 'capability', title: 'Special', broader: ['capabilities/base'] },
      },
      {
        slug: 'capabilities/extra-special',
        frontmatter: {
          kind: 'capability',
          title: 'Extra special',
          broader: ['capabilities/special'],
        },
      },
    ],
  },
  {
    name: 'isolated — 관계 없는 볼트는 양쪽 다 0',
    docs: [
      { slug: 'capabilities/lonely', frontmatter: { kind: 'capability', title: 'Lonely' } },
      { slug: 'elements/quiet', frontmatter: { kind: 'element', title: 'Quiet' } },
    ],
  },
];

/**
 * The single include-list for impact. It lists the public alias and the frontmatter
 * key together so the engine-vocabulary drift contract cannot lose either.
 */
export const IMPACT_INCLUDED_GRAPH_KEYS = [
  'dependencies',
  'depends_on',
];

/**
 * The inline `domain:` key is **read in opposite directions by the two sides**: the web
 * derivation reads `domain → document` (contains — a tree with capabilities hanging
 * under a domain), while the compiler reads `document → domain` (belongs-to). So it is
 * excluded from the propagation include-list.
 *
 * Dogfood measurement (2026-07-26, over 95 document nodes):
 *   - Excluding this key, screen == agent on **91/95**
 *   - Including it, 4/95 (containment becomes bidirectional and almost every node
 *     converges on 87 — the ranking loses all discrimination)
 *   - With no filter, i.e. the engine default, 1/95 (everything ~95, entirely
 *     meaningless)
 *
 * The contract's "known asymmetry" test pins this directional difference. Once one side
 * is aligned that test breaks, and the key moves into this include-list.
 */
export const IMPACT_DIRECTION_DIVERGENT_GRAPH_KEYS = ['domain'];

/** Relations valid for structural navigation but not part of causal impact. */
export const IMPACT_STRUCTURAL_GRAPH_KEYS = [
  'domains',
  'capabilities',
  'elements',
  'contains',
];

/** Soft associations the engine vocabulary does not count as propagation — the same meaning as the web's exclusion list. */
export const IMPACT_SOFT_GRAPH_KEYS = ['relates', 'describes'];
