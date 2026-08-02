/**
 * Interop-format contract fixtures — single source of truth for the
 * web-builder serializer (`src/shared/lib/interop-format.ts`) ↔ CLI serializer
 * (`cli/src/lib/interop-format.mjs`) drift guard.
 *
 * Each case is a compile-artifact-shaped graph:
 *   { nodes: [{ uid, slug, kind, title, domain? }], edges: [{ from, to, via }] }
 *
 * The contract test feeds every case to both serializers and asserts
 * byte-identical JSON-LD and GraphML. Add a case here (never inline in the
 * test) and both copies are exercised.
 */

export const INTEROP_CASES = [
  {
    name: 'empty graph',
    input: { nodes: [], edges: [] },
  },
  {
    name: 'single node, no edges',
    input: {
      nodes: [{ uid: '01890f3e-7b5d-4c0a-8f14-123456789abc', slug: 'auth', kind: 'domain', title: 'Auth' }],
      edges: [],
    },
  },
  {
    name: 'project → capability via capabilities',
    input: {
      nodes: [
        { uid: '11890f3e-7b5d-4c0a-8f14-123456789abc', slug: 'atlas', kind: 'project', title: 'Atlas' },
        { uid: '21890f3e-7b5d-4c0a-8f14-123456789abc', slug: 'auth/login', kind: 'capability', title: 'Login', domain: 'auth' },
      ],
      edges: [{ from: 'atlas', to: 'auth/login', via: 'capabilities' }],
    },
  },
  {
    name: 'multiple predicates + array form (same via repeated)',
    input: {
      nodes: [
        { uid: '31890f3e-7b5d-4c0a-8f14-123456789abc', slug: 'a', kind: 'capability', title: 'A', domain: 'core' },
        { uid: '41890f3e-7b5d-4c0a-8f14-123456789abc', slug: 'b', kind: 'element', title: 'B', domain: 'core' },
        { uid: '51890f3e-7b5d-4c0a-8f14-123456789abc', slug: 'c', kind: 'element', title: 'C', domain: 'core' },
      ],
      edges: [
        { from: 'a', to: 'b', via: 'dependencies' },
        { from: 'a', to: 'c', via: 'dependencies' },
        { from: 'a', to: 'b', via: 'relates' },
      ],
    },
  },
  {
    name: 'input order does not matter (sorted internally)',
    input: {
      nodes: [
        { uid: '61890f3e-7b5d-4c0a-8f14-123456789abc', slug: 'zeta', kind: 'element', title: 'Zeta' },
        { uid: '71890f3e-7b5d-4c0a-8f14-123456789abc', slug: 'alpha', kind: 'capability', title: 'Alpha' },
      ],
      edges: [
        { from: 'zeta', to: 'alpha', via: 'relates' },
        { from: 'alpha', to: 'zeta', via: 'contains' },
      ],
    },
  },
  {
    name: 'external / dangling edge endpoints dropped',
    input: {
      nodes: [{ uid: '81890f3e-7b5d-4c0a-8f14-123456789abc', slug: 'cap', kind: 'capability', title: 'Cap' }],
      edges: [
        { from: 'cap', to: 'src/does/not/exist.ts', via: 'elements' },
        { from: 'ghost', to: 'cap', via: 'relates' },
      ],
    },
  },
  {
    name: 'xml + json special chars escaped',
    input: {
      nodes: [
        {
          uid: '91890f3e-7b5d-4c0a-8f14-123456789abc',
          slug: 'x',
          kind: 'project',
          title: '<script>&"alert"</script>',
          domain: "a&b<c>d",
        },
      ],
      edges: [],
    },
  },
  {
    name: 'unicode / korean slug + title',
    input: {
      nodes: [
        { uid: 'a1890f3e-7b5d-4c0a-8f14-123456789abc', slug: 'domain/인증', kind: 'domain', title: '인증 도메인' },
        { uid: 'b1890f3e-7b5d-4c0a-8f14-123456789abc', slug: 'cap/토큰-발급', kind: 'capability', title: '토큰 발급', domain: 'domain/인증' },
      ],
      edges: [{ from: 'domain/인증', to: 'cap/토큰-발급', via: 'contains' }],
    },
  },
  {
    name: 'unknown via falls back to raw term',
    input: {
      nodes: [
        { uid: 'c1890f3e-7b5d-4c0a-8f14-123456789abc', slug: 'a', kind: 'capability', title: 'A' },
        { uid: 'd1890f3e-7b5d-4c0a-8f14-123456789abc', slug: 'b', kind: 'capability', title: 'B' },
      ],
      edges: [{ from: 'a', to: 'b', via: 'implements' }],
    },
  },
  {
    name: 'depends_on canonical (dependencies) predicate mapping',
    input: {
      nodes: [
        { uid: 'e1890f3e-7b5d-4c0a-8f14-123456789abc', slug: 'a', kind: 'element', title: 'A' },
        { uid: 'f1890f3e-7b5d-4c0a-8f14-123456789abc', slug: 'b', kind: 'element', title: 'B' },
      ],
      edges: [{ from: 'a', to: 'b', via: 'dependencies' }],
    },
  },
];
