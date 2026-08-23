// Fixture vaults for the vault-health contract test (insights vs CLI health
// disagreement). Each case is a set of vault docs ({slug, frontmatter}) fed through
// BOTH the MCP engine health() and the src `computeVaultHealth` mirror; the
// contract asserts identical status + per-check counts. Single source of truth.
//
// The scenarios deliberately include the exact divergence codex-audit found:
// a capability with a `domain:` key whose domain never links back — the MCP
// compiler leaves it a disconnected island + missing-containment recommendation
// (needs_attention), while the old web derivation auto-healed it to "healthy".

export const VAULT_HEALTH_CASES = [
  {
    // Ordinary markdown (design documents, backlogs, release notes) is **not** an
    // ontology node — it has no `kind:`. The MCP compiler does not count those as nodes
    // while the web copy did, so for our own docs folder (83 of 163 files being ordinary
    // markdown) the screen reported "83 places to fix" while the CLI called the same
    // vault healthy (measured 2026-08-17).
    name: 'plain markdown without kind: is not a node',
    docs: [
      { slug: 'domains/auth', frontmatter: { kind: 'domain', title: 'Auth', capabilities: ['capabilities/login'] } },
      { slug: 'capabilities/login', frontmatter: { kind: 'capability', title: 'Login', domain: 'domains/auth' } },
      { slug: 'DESIGN-SYSTEM', frontmatter: { title: '디자인 시스템' } },
      { slug: 'BACKLOG', frontmatter: {} },
    ],
  },
  {
    // Checking a folder that is not a vault made both report healthy (measured
    // 2026-08-16: `health <empty folder>` → healthy), because every other check passed
    // with nothing to count — a check idling on an empty set is not a check.
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
      // because the domain back-links this one too? no — the domain lists only answer)
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
    // A strong case for checking that pruning in cycle enumeration (reverse
    // reachability) does not change the result: a length-4 cycle, a length-3 cycle
    // sharing two nodes with it, and a long chain that returns nowhere (the dead path
    // pruning must cut).
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
      // c → a also forms a 3-cycle (a → b → c → a) — the two cycles share nodes.
      { slug: 'capabilities/d', frontmatter: { kind: 'capability', title: 'D', domain: 'domains/core', depends_on: ['capabilities/a'] } },
      // Dead chain: e → f → g (no edge back)
      { slug: 'capabilities/e', frontmatter: { kind: 'capability', title: 'E', domain: 'domains/core', depends_on: ['capabilities/f'] } },
      { slug: 'capabilities/f', frontmatter: { kind: 'capability', title: 'F', domain: 'domains/core', depends_on: ['capabilities/g'] } },
      { slug: 'capabilities/g', frontmatter: { kind: 'capability', title: 'G', domain: 'domains/core' } },
    ],
  },
];
