/**
 * Interop-format contract fixtures — single source of truth for the
 * web-builder serializer (`src/shared/lib/interop-format.ts`) ↔ CLI serializer
 * (`cli/src/lib/interop-format.mjs`) drift guard.
 *
 * Each case is a compile-artifact-shaped graph:
 *   { nodes: [{ slug, kind, title, domain? }], edges: [{ from, to, via }] }
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
      nodes: [{ slug: 'auth', kind: 'domain', title: 'Auth' }],
      edges: [],
    },
  },
  {
    name: 'project → capability via capabilities',
    input: {
      nodes: [
        { slug: 'atlas', kind: 'project', title: 'Atlas' },
        { slug: 'auth/login', kind: 'capability', title: 'Login', domain: 'auth' },
      ],
      edges: [{ from: 'atlas', to: 'auth/login', via: 'capabilities' }],
    },
  },
  {
    name: 'multiple predicates + array form (same via repeated)',
    input: {
      nodes: [
        { slug: 'a', kind: 'capability', title: 'A', domain: 'core' },
        { slug: 'b', kind: 'element', title: 'B', domain: 'core' },
        { slug: 'c', kind: 'element', title: 'C', domain: 'core' },
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
        { slug: 'zeta', kind: 'element', title: 'Zeta' },
        { slug: 'alpha', kind: 'capability', title: 'Alpha' },
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
      nodes: [{ slug: 'cap', kind: 'capability', title: 'Cap' }],
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
        { slug: 'domain/인증', kind: 'domain', title: '인증 도메인' },
        { slug: 'cap/토큰-발급', kind: 'capability', title: '토큰 발급', domain: 'domain/인증' },
      ],
      edges: [{ from: 'domain/인증', to: 'cap/토큰-발급', via: 'contains' }],
    },
  },
  {
    name: 'unknown via falls back to raw term',
    input: {
      nodes: [
        { slug: 'a', kind: 'capability', title: 'A' },
        { slug: 'b', kind: 'capability', title: 'B' },
      ],
      edges: [{ from: 'a', to: 'b', via: 'implements' }],
    },
  },
  {
    name: 'depends_on canonical (dependencies) predicate mapping',
    input: {
      nodes: [
        { slug: 'a', kind: 'element', title: 'A' },
        { slug: 'b', kind: 'element', title: 'B' },
      ],
      edges: [{ from: 'a', to: 'b', via: 'dependencies' }],
    },
  },
];
