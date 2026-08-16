// Fixture vaults for the vault-health contract test (C1 — 인사이트↔CLI 건강도
// 불일치). Each case is a set of vault docs ({slug, frontmatter}) fed through
// BOTH the MCP engine health() and the src `computeVaultHealth` mirror; the
// contract asserts identical status + per-check counts. Single source of truth.
//
// The scenarios deliberately include the exact divergence codex-audit found:
// a capability with a `domain:` key whose domain never links back — the MCP
// compiler leaves it a disconnected island + missing-containment recommendation
// (needs_attention), while the old web derivation auto-healed it to "healthy".

export const VAULT_HEALTH_CASES = [
  {
    // 볼트가 아닌 폴더를 검사하면 둘 다 「정상」이라고 답했다 (2026-08-16 실측:
    // `health <빈 폴더>` → healthy). 나머지 검사가 전부 셀 것이 없어 통과했기
    // 때문이다 — 빈 집합 위에서 헛도는 검사는 검사가 아니다.
    name: 'empty folder is not a healthy vault',
    docs: [],
  },
  {
    name: 'fully-linked healthy vault',
    docs: [
      {
        slug: 'project',
        frontmatter: { kind: 'project', slug: 'demo', title: 'Demo', domains: ['domains/auth'] },
      },
      {
        slug: 'domains/auth',
        frontmatter: { kind: 'domain', title: 'Auth', capabilities: ['capabilities/login'] },
      },
      {
        slug: 'capabilities/login',
        frontmatter: { kind: 'capability', title: 'Login', domain: 'domains/auth' },
      },
    ],
  },
  {
    name: 'capability domain never links back → missing containment + island',
    docs: [
      {
        slug: 'project',
        frontmatter: { kind: 'project', slug: 'demo', title: 'Demo', domains: ['domains/auth'] },
      },
      {
        slug: 'domains/auth',
        frontmatter: { kind: 'domain', title: 'Auth', capabilities: ['capabilities/login'] },
      },
      {
        slug: 'capabilities/login',
        frontmatter: { kind: 'capability', title: 'Login', domain: 'domains/auth' },
      },
      // isolated domain + capability — capB declares `domain: billing` but the
      // billing domain has no back-link and nothing connects it to the project.
      {
        slug: 'domains/billing',
        frontmatter: { kind: 'domain', title: 'Billing' },
      },
      {
        slug: 'capabilities/invoice',
        frontmatter: { kind: 'capability', title: 'Invoice', domain: 'domains/billing' },
      },
    ],
  },
  {
    name: 'both serialization forms of domain ref resolve the same',
    docs: [
      {
        slug: 'domains/문의-처리',
        frontmatter: { kind: 'domain', title: '문의 처리', capabilities: ['capabilities/답변'] },
      },
      // folder-prefixed form
      {
        slug: 'capabilities/답변',
        frontmatter: { kind: 'capability', title: '답변', domain: 'domains/문의-처리' },
      },
      // bare-slug form — must resolve to the same domain (no missing containment
      // because the domain back-links this one too? no — domain only lists 답변)
      {
        slug: 'capabilities/문의-접수',
        frontmatter: { kind: 'capability', title: '문의 접수', domain: '문의-처리' },
      },
    ],
  },
  {
    name: 'dependency cycle → fail',
    docs: [
      {
        slug: 'domains/core',
        frontmatter: {
          kind: 'domain',
          title: 'Core',
          capabilities: ['capabilities/a', 'capabilities/b'],
        },
      },
      {
        slug: 'capabilities/a',
        frontmatter: {
          kind: 'capability',
          title: 'A',
          domain: 'domains/core',
          depends_on: ['capabilities/b'],
        },
      },
      {
        slug: 'capabilities/b',
        frontmatter: {
          kind: 'capability',
          title: 'B',
          domain: 'domains/core',
          depends_on: ['capabilities/a'],
        },
      },
    ],
  },
  {
    name: 'dangling reference → unresolved edge + compile issue',
    docs: [
      {
        slug: 'domains/core',
        frontmatter: { kind: 'domain', title: 'Core', capabilities: ['capabilities/ghost'] },
      },
    ],
  },
  {
    name: 'malformed frontmatter diagnostics → compile issue + needs attention',
    docs: [
      {
        slug: 'domains/broken',
        frontmatter: { kind: 'domain', title: 'Broken' },
        diagnostics: [
          { code: 'malformed-frontmatter-line' },
          { code: 'malformed-frontmatter-line' },
        ],
      },
    ],
  },
  {
    // opus5 검수 — 사이클 열거 가지치기(역방향 도달성)가 결과를 바꾸지 않는지
    // 강하게 잡는 케이스: 길이 4 순환 + 그와 두 노드를 공유하는 길이 3 순환 +
    // 아무 데도 못 돌아오는 긴 사슬(가지치기가 잘라야 하는 죽은 경로).
    name: 'overlapping cycles + dead chain → engine and app agree on the count',
    docs: [
      {
        slug: 'domains/core',
        frontmatter: {
          kind: 'domain',
          title: 'Core',
          capabilities: [
            'capabilities/a',
            'capabilities/b',
            'capabilities/c',
            'capabilities/d',
            'capabilities/e',
            'capabilities/f',
            'capabilities/g',
          ],
        },
      },
      // 4-cycle: a → b → c → d → a
      { slug: 'capabilities/a', frontmatter: { kind: 'capability', title: 'A', domain: 'domains/core', depends_on: ['capabilities/b'] } },
      { slug: 'capabilities/b', frontmatter: { kind: 'capability', title: 'B', domain: 'domains/core', depends_on: ['capabilities/c'] } },
      { slug: 'capabilities/c', frontmatter: { kind: 'capability', title: 'C', domain: 'domains/core', depends_on: ['capabilities/d', 'capabilities/a'] } },
      // c → a 는 3-cycle (a → b → c → a) 도 만든다 — 두 순환이 노드를 공유.
      { slug: 'capabilities/d', frontmatter: { kind: 'capability', title: 'D', domain: 'domains/core', depends_on: ['capabilities/a'] } },
      // 죽은 사슬: e → f → g (돌아오는 간선 없음)
      { slug: 'capabilities/e', frontmatter: { kind: 'capability', title: 'E', domain: 'domains/core', depends_on: ['capabilities/f'] } },
      { slug: 'capabilities/f', frontmatter: { kind: 'capability', title: 'F', domain: 'domains/core', depends_on: ['capabilities/g'] } },
      { slug: 'capabilities/g', frontmatter: { kind: 'capability', title: 'G', domain: 'domains/core' } },
    ],
  },
];
