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
    name: 'project — 호출자가 capabilities 명시하면 canonical set 으로 보존',
    input: {
      slug: 'demo',
      kind: 'project',
      title: 'Demo',
      capabilities: [' cap-b ', 'cap-a', 'cap-b', ''],
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
    name: 'project — graph arrays 는 모두 dedup + sort',
    input: {
      slug: 'demo',
      kind: 'project',
      title: 'Demo',
      domains: ['domains/z', 'domains/a', 'domains/z'],
      dependencies: ['capabilities/b', 'capabilities/a', 'capabilities/b'],
      relates: ['docs/rfc', 'docs/adr', 'docs/rfc'],
    },
    expected: {
      slug: 'demo',
      kind: 'project',
      title: 'Demo',
      dependencies: ['capabilities/a', 'capabilities/b'],
      domains: ['domains/a', 'domains/z'],
      capabilities: [],
      elements: [],
      relates: ['docs/adr', 'docs/rfc'],
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
  {
    // 과제 ⑩ (표시 이름 레이어) — `display` 는 optional 이라 자동 emit 되지
    // 않지만, 명시적으로 넘기면 preferredOrder 대로 title 바로 뒤에 놓여
    // 그대로 보존된다 (normalize 시 사라지거나 이동하지 않음).
    name: 'capability — display 필드 명시 시 title 바로 뒤 순서로 보존',
    input: {
      slug: 'capabilities/cli-developer-entry',
      kind: 'capability',
      title: 'CLI Developer Entry (52 commands — vault + MCP verify + ...)',
      display: 'CLI Developer Entry',
      domain: 'domains/cli',
    },
    expected: {
      slug: 'capabilities/cli-developer-entry',
      kind: 'capability',
      title: 'CLI Developer Entry (52 commands — vault + MCP verify + ...)',
      display: 'CLI Developer Entry',
      domain: 'domains/cli',
      elements: [],
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

/**
 * 슬러그 평면성 (2026-08-01 판정 「슬러그는 평평한 식별자다」).
 * `expected: null` = 통과, `expected: 'issue'` = flatSlugIssue 가 메시지 반환.
 */
export const FLAT_SLUG_CASES = [
  // 스키마 폴더 + 평평한 이름 — 정상.
  { name: 'element flat', kind: 'element', slug: 'elements/jwt-token', expected: null },
  { name: 'capability flat', kind: 'capability', slug: 'capabilities/token-issue', expected: null },
  { name: 'domain flat', kind: 'domain', slug: 'domains/auth', expected: null },
  // 스키마 폴더 안 중첩 — 재생성 볼트가 실제로 낳은 결함 형태. 거부.
  { name: 'element path-style', kind: 'element', slug: 'elements/src/views/home', expected: 'issue' },
  { name: 'element deep file', kind: 'element', slug: 'elements/scripts/build-vault.mjs', expected: 'issue' },
  { name: 'capability nested', kind: 'capability', slug: 'capabilities/auth/token-issue', expected: 'issue' },
  { name: 'domain nested', kind: 'domain', slug: 'domains/a/b', expected: 'issue' },
  { name: 'element backslash', kind: 'element', slug: 'elements/src\\views\\home', expected: 'issue' },
  // 스키마 폴더 밖 — 사용자 볼트 자체의 관습. 게이트 소관 아님.
  { name: 'foreign nesting untouched', kind: 'element', slug: 'services/auth/api', expected: null },
  { name: 'bare name untouched', kind: 'element', slug: 'jwt-token', expected: null },
  // 폴더 없는 kind (project/document) — root 는 재지 않는다.
  { name: 'project any', kind: 'project', slug: 'projects/auth-platform', expected: null },
  { name: 'document any', kind: 'document', slug: 'notes/2026/plan', expected: null },
  // 형태가 아예 아닌 입력 — 조용히 통과 (다른 검증이 잡는다).
  { name: 'unknown kind', kind: 'no-such', slug: 'elements/a/b', expected: null },
  { name: 'non-string kind', kind: undefined, slug: 'elements/a/b', expected: null },
];
