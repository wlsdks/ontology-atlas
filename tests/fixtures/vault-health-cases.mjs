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
];
