/**
 * Vault kind schema fixtures — buildFrontmatter / missingExpectedFields /
 * folderForKind 가 mcp/cli 두 패키지에서 같은 결과를 낸다는 걸 강제하기 위한
 * shared input matrix.
 *
 * 한 쪽 schema 모듈이 drift 하면 contract test 가 즉시 fail.
 */

export const BUILD_FM_CASES = [
  {
    name: 'project — arrayDefaults 빈 배열로 채워짐',
    input: { slug: 'demo', kind: 'project', title: 'Demo' },
    expected: {
      slug: 'demo',
      kind: 'project',
      title: 'Demo',
      domains: [],
      capabilities: [],
      elements: [],
    },
  },
  {
    name: 'project — 호출자가 capabilities 명시하면 그 값 보존',
    input: {
      slug: 'demo',
      kind: 'project',
      title: 'Demo',
      capabilities: ['cap-a', 'cap-b'],
    },
    expected: {
      slug: 'demo',
      kind: 'project',
      title: 'Demo',
      domains: [],
      capabilities: ['cap-a', 'cap-b'],
      elements: [],
    },
  },
  {
    name: 'domain — capabilities 빈 배열만',
    input: { slug: 'domains/auth', kind: 'domain', title: 'Auth' },
    expected: {
      slug: 'domains/auth',
      kind: 'domain',
      title: 'Auth',
      capabilities: [],
    },
  },
  {
    // R14 — preferredOrder 적용 후 capability 의 domain 이 elements 보다
    // 앞에 와야 가독성 좋음 (slug → kind → title → domain → arrays).
    // vitest toEqual 은 키 순서를 비교 안 하지만, fixture 도 의도된 순서로
    // 둬서 코드 리뷰 때 한눈에 들어오게.
    name: 'capability — domain 명시 + elements 빈 배열 (domain 이 elements 앞)',
    input: {
      slug: 'capabilities/login',
      kind: 'capability',
      title: 'Login',
      domain: 'domains/auth',
    },
    expected: {
      slug: 'capabilities/login',
      kind: 'capability',
      title: 'Login',
      domain: 'domains/auth',
      elements: [],
    },
  },
  {
    name: 'capability — domain 미지정 (orphan, validator 가 warn)',
    input: { slug: 'capabilities/checkout', kind: 'capability', title: 'Checkout' },
    expected: {
      slug: 'capabilities/checkout',
      kind: 'capability',
      title: 'Checkout',
      elements: [],
    },
  },
  {
    name: 'element — domain 명시',
    input: {
      slug: 'elements/jwt-token',
      kind: 'element',
      title: 'JWT token',
      domain: 'domains/auth',
    },
    expected: {
      slug: 'elements/jwt-token',
      kind: 'element',
      title: 'JWT token',
      domain: 'domains/auth',
    },
  },
  {
    name: 'document — minimal',
    input: { slug: 'docs/decision-1', kind: 'document', title: 'Decision 1' },
    expected: {
      slug: 'docs/decision-1',
      kind: 'document',
      title: 'Decision 1',
    },
  },
];

export const MISSING_FIELDS_CASES = [
  {
    name: 'capability without domain → ["domain"]',
    kind: 'capability',
    frontmatter: { slug: 'capabilities/x', kind: 'capability', title: 'X', elements: [] },
    expected: ['domain'],
  },
  {
    name: 'capability with domain → []',
    kind: 'capability',
    frontmatter: {
      slug: 'capabilities/x',
      kind: 'capability',
      title: 'X',
      domain: 'domains/auth',
    },
    expected: [],
  },
  {
    name: 'element without domain → ["domain"]',
    kind: 'element',
    frontmatter: { slug: 'elements/x', kind: 'element', title: 'X' },
    expected: ['domain'],
  },
  {
    name: 'element with empty-string domain → ["domain"]',
    kind: 'element',
    frontmatter: { slug: 'elements/x', kind: 'element', title: 'X', domain: '   ' },
    expected: ['domain'],
  },
  {
    name: 'project never requires extras → []',
    kind: 'project',
    frontmatter: { slug: 'demo', kind: 'project', title: 'Demo' },
    expected: [],
  },
  {
    name: 'unknown kind → []',
    kind: 'no-such',
    frontmatter: { slug: 'x', kind: 'no-such', title: 'X' },
    expected: [],
  },
];

export const FOLDER_CASES = [
  { kind: 'project', expected: '' },
  { kind: 'domain', expected: 'domains/' },
  { kind: 'capability', expected: 'capabilities/' },
  { kind: 'element', expected: 'elements/' },
  { kind: 'document', expected: '' },
  // unknown kind — `''` (no prefix), CLI 가 raw slug 로 통과시키게.
  { kind: 'no-such', expected: '' },
];
