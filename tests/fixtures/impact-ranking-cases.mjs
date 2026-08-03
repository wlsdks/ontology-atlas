// Fixture vaults for the impact-ranking contract test (S2 — 영향 랭킹).
//
// The `/ontology/insights` 「바꾸면 멀리 퍼지는 개념」 card counts, for each
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
 * 영향의 유일한 include-list. 공개 alias와 frontmatter key를 함께 적어 엔진
 * 어휘 drift 계약에서 둘 다 빠지지 않게 한다.
 */
export const IMPACT_INCLUDED_GRAPH_KEYS = [
  'dependencies',
  'depends_on',
];

/**
 * 인라인 `domain:` 키는 **양쪽이 반대 방향으로 읽는다** — 웹 파생은
 * `도메인 → 문서`(contains, 도메인 아래 역량이 매달리는 트리), 컴파일러는
 * `문서 → 도메인`(belongs-to). 그래서 파급 include-list 에서 뺀다.
 *
 * 도그푸드 실측(2026-07-26, 문서 노드 95개 기준):
 *   - 이 키를 빼면 화면 == 에이전트가 **91/95**
 *   - 넣으면 4/95 (담기 관계가 양방향이 되어 거의 모든 노드가 87 로 수렴 —
 *     순위가 변별력을 잃는다)
 *   - 필터 없이 엔진 기본값이면 1/95 (전부 ~95, 완전히 무의미)
 *
 * contract 의 「알려진 비대칭」 테스트가 이 방향 차이를 못 박아 둔다. 언젠가
 * 한쪽을 맞추면 그 테스트가 깨지고, 여기 include-list 로 옮기면 된다.
 */
export const IMPACT_DIRECTION_DIVERGENT_GRAPH_KEYS = ['domain'];

/** 구조 탐색에는 유효하지만 인과 영향에는 들어가지 않는 관계. */
export const IMPACT_STRUCTURAL_GRAPH_KEYS = [
  'domains',
  'capabilities',
  'elements',
  'contains',
];

/** 엔진 어휘에서 파급으로 세지 않는 소프트 연관 — 웹의 제외 목록과 같은 뜻. */
export const IMPACT_SOFT_GRAPH_KEYS = ['relates', 'describes'];
