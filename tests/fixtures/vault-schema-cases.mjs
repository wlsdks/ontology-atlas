/**
 * Vault kind schema fixtures — buildFrontmatter / missingExpectedFields /
 * folderForKind produce the same result in both the mcp and cli packages —
 * shared input matrix.
 *
 * if either schema module drifts, the contract test fails immediately.
 */

export const BUILD_FM_CASES = [
  {
    name: 'project — arrayDefaults 빈 배열로 채워짐',
    input: { uid: '01890f3e-7b5d-4c0a-8f14-123456789abc', slug: 'demo', kind: 'project', title: 'Demo' },
    expected: {
      uid: '01890f3e-7b5d-4c0a-8f14-123456789abc',
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
      uid: '01890f3e-7b5d-4c0a-8f14-123456789abd',
      slug: 'demo',
      kind: 'project',
      title: 'Demo',
      capabilities: [' cap-b ', 'cap-a', 'cap-b', ''],
    },
    expected: {
      uid: '01890f3e-7b5d-4c0a-8f14-123456789abd',
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
      uid: '01890f3e-7b5d-4c0a-8f14-123456789abe',
      slug: 'demo',
      kind: 'project',
      title: 'Demo',
      domains: ['domains/z', 'domains/a', 'domains/z'],
      dependencies: ['capabilities/b', 'capabilities/a', 'capabilities/b'],
      relates: ['docs/rfc', 'docs/adr', 'docs/rfc'],
    },
    expected: {
      uid: '01890f3e-7b5d-4c0a-8f14-123456789abe',
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
    input: { uid: '01890f3e-7b5d-4c0a-8f14-123456789abf', slug: 'domains/auth', kind: 'domain', title: 'Auth' },
    expected: {
      uid: '01890f3e-7b5d-4c0a-8f14-123456789abf',
      slug: 'domains/auth',
      kind: 'domain',
      title: 'Auth',
      capabilities: [],
    },
  },
  {
    // After preferredOrder, a capability's domain should precede elements for
    // readability (slug → kind → title → domain → arrays). vitest's toEqual does not
    // compare key order, but the fixture keeps the intended order so a reviewer sees
    // it at a glance.
    name: 'capability — domain 명시 + elements 빈 배열 (domain 이 elements 앞)',
    input: {
      uid: '11890f3e-7b5d-4c0a-8f14-123456789abc',
      slug: 'capabilities/login',
      kind: 'capability',
      title: 'Login',
      domain: 'domains/auth',
    },
    expected: {
      uid: '11890f3e-7b5d-4c0a-8f14-123456789abc',
      slug: 'capabilities/login',
      kind: 'capability',
      title: 'Login',
      domain: 'domains/auth',
      elements: [],
    },
  },
  {
    name: 'capability — domain 미지정 (orphan, validator 가 warn)',
    input: { uid: '11890f3e-7b5d-4c0a-8f14-123456789abd', slug: 'capabilities/checkout', kind: 'capability', title: 'Checkout' },
    expected: {
      uid: '11890f3e-7b5d-4c0a-8f14-123456789abd',
      slug: 'capabilities/checkout',
      kind: 'capability',
      title: 'Checkout',
      elements: [],
    },
  },
  {
    name: 'element — domain 명시',
    input: {
      uid: '11890f3e-7b5d-4c0a-8f14-123456789abe',
      slug: 'elements/jwt-token',
      kind: 'element',
      title: 'JWT token',
      domain: 'domains/auth',
    },
    expected: {
      uid: '11890f3e-7b5d-4c0a-8f14-123456789abe',
      slug: 'elements/jwt-token',
      kind: 'element',
      title: 'JWT token',
      domain: 'domains/auth',
    },
  },
  {
    name: 'document — minimal',
    input: { uid: '11890f3e-7b5d-4c0a-8f14-123456789abf', slug: 'docs/decision-1', kind: 'document', title: 'Decision 1' },
    expected: {
      uid: '11890f3e-7b5d-4c0a-8f14-123456789abf',
      slug: 'docs/decision-1',
      kind: 'document',
      title: 'Decision 1',
    },
  },
  {
    // `display` is optional and is not emitted automatically, but passing it
    // explicitly places it right after title per preferredOrder and preserves it
    // (normalisation neither drops nor moves it).
    name: 'capability — display 필드 명시 시 title 바로 뒤 순서로 보존',
    input: {
      uid: '21890f3e-7b5d-4c0a-8f14-123456789abc',
      slug: 'capabilities/cli-developer-entry',
      kind: 'capability',
      title: 'CLI Developer Entry (52 commands — vault + MCP verify + ...)',
      display: 'CLI Developer Entry',
      domain: 'domains/cli',
    },
    expected: {
      uid: '21890f3e-7b5d-4c0a-8f14-123456789abc',
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
  // Unknown kind — `''` (no prefix), so the CLI passes the raw slug through.
  { kind: 'no-such', expected: '' },
];

/**
 * Slug flatness (2026-08-01 verdict: a slug is a flat identifier).
 * `expected: null` = passes; `expected: 'issue'` = flatSlugIssue returns a message.
 */
export const FLAT_SLUG_CASES = [
  // Schema folder plus a flat name — correct.
  { name: 'element flat', kind: 'element', slug: 'elements/jwt-token', expected: null },
  { name: 'capability flat', kind: 'capability', slug: 'capabilities/token-issue', expected: null },
  { name: 'domain flat', kind: 'domain', slug: 'domains/auth', expected: null },
  // Nested inside a schema folder — the defect shape a regenerated vault really produced. Rejected.
  { name: 'element path-style', kind: 'element', slug: 'elements/src/views/home', expected: 'issue' },
  { name: 'element deep file', kind: 'element', slug: 'elements/scripts/build-vault.mjs', expected: 'issue' },
  { name: 'capability nested', kind: 'capability', slug: 'capabilities/auth/token-issue', expected: 'issue' },
  { name: 'domain nested', kind: 'domain', slug: 'domains/a/b', expected: 'issue' },
  { name: 'element backslash', kind: 'element', slug: 'elements/src\\views\\home', expected: 'issue' },
  // Outside a schema folder — the user's own vault convention. Not this gate's business.
  { name: 'foreign nesting untouched', kind: 'element', slug: 'services/auth/api', expected: null },
  { name: 'bare name untouched', kind: 'element', slug: 'jwt-token', expected: null },
  // Kinds with no folder (project/document) — the root is not measured.
  { name: 'project any', kind: 'project', slug: 'projects/auth-platform', expected: null },
  { name: 'document any', kind: 'document', slug: 'notes/2026/plan', expected: null },
  // Input that is not of this shape at all — passes silently (other validation catches it).
  { name: 'unknown kind', kind: 'no-such', slug: 'elements/a/b', expected: null },
  { name: 'non-string kind', kind: undefined, slug: 'elements/a/b', expected: null },
];
