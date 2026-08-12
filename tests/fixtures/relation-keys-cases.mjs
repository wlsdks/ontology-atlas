/**
 * 관계 키 매트릭스 — MCP 가 그래프 엣지로 읽는 frontmatter 키 전집합
 * (`mcp/src/vault.mjs` GRAPH_ARRAY_KEYS = NEIGHBOR_KEYS + alias `depends_on`)
 * 과, 각 키가 웹 derive (`derive-ontology-from-vault`) 에서 만들어야 하는
 * 엣지 타입의 표. 이 표 하나만 진실원이다.
 *
 * 계약 (`tests/contract/derive-relation-keys.contract.test.ts`):
 *   1. MCP 가 키를 새로 들이면 이 표가 그 키를 모를 것이므로 즉시 fail —
 *      웹 derive 가 조용히 그 키를 흘리는 회귀(describes 2026-07-27,
 *      depends_on 2026-08-12)를 구조적으로 차단한다.
 *   2. 표의 각 행을 MCP `collectNeighborRefs` 와 웹 derive 양쪽에 넣어
 *      둘 다 그 키를 실제로 읽는지 대조한다.
 */
export const RELATION_KEY_CASES = [
  {
    key: 'domains',
    frontmatter: { kind: 'project', domains: ['billing'] },
    /** 웹 derive 가 이 키에서 만들어야 하는 OntologyStubEdge.type */
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
    // 스키마 정본 키 (capability/element 캐논, mcp/src/schema.mjs) —
    // MCP 는 alias 로 dependencies 에 접는다. 웹 derive 도 같은 자리에서
    // 읽어야 한다 (2026-08-12: 이 키만 웹에서 소실되던 구멍).
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
 * 합집합 계약 — 같은 대상이 `dependencies` 와 `depends_on` 두 키에 다 있으면
 * 한 번만 센다. MCP `collectNeighborRefs` 는 canonical-key+ref 로 dedupe 해
 * 3개의 ref 를, 웹 derive 는 3개의 depends_on 엣지를 내야 한다.
 */
export const DEPENDS_UNION_CASE = {
  frontmatter: {
    kind: 'capability',
    dependencies: ['shared-target', 'only-dep'],
    depends_on: ['shared-target', 'only-alias'],
  },
  expectedRefs: ['only-alias', 'only-dep', 'shared-target'],
};
