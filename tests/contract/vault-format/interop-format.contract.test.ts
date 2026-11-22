import { describe, expect, it } from 'vitest';
import { INTEROP_CASES } from '../../fixtures/interop-format-cases.mjs';
import {
  buildGraphML as graphmlTs,
  buildJsonLd as jsonldTs,
  INTEROP_SCHEMA_VERSION as schemaVersionTs,
  type InteropGraph,
} from '@/shared/lib/ontology-graph/interop-format';

/**
 * Interop-format contract for the app's serializer (`src/shared/lib/ontology-graph/interop-format.ts`):
 * node identity is `urn:uuid:<uid>`, output does not depend on input order, edges whose ends were not
 * both emitted are dropped, and the schema version is published.
 */

type InteropCase = { name: string; input: InteropGraph };

function reversed(graph: InteropGraph): InteropGraph {
  return { nodes: [...graph.nodes].reverse(), edges: [...graph.edges].reverse() };
}

describe('interop-format contract', () => {
  it('publishes UID-based interop schema version 2', () => {
    expect(schemaVersionTs).toBe(2);
  });

  for (const { name, input } of INTEROP_CASES as InteropCase[]) {
    it(`JSON-LD names every node by its UID URN — ${name}`, () => {
      const graph = JSON.parse(jsonldTs(input))['@graph'] as Array<{ '@id': string; uid: string }>;
      expect(graph).toHaveLength(input.nodes.length);
      for (const node of graph) expect(node['@id']).toBe(`urn:uuid:${node.uid}`);
    });

    it(`GraphML carries the same nodes and only edges between them — ${name}`, () => {
      const graphml = graphmlTs(input);
      const slugs = new Set(input.nodes.map((node) => node.slug));
      const kept = input.edges.filter((edge) => slugs.has(edge.from) && slugs.has(edge.to));
      expect(graphml.match(/<node id="urn:uuid:/g) ?? []).toHaveLength(input.nodes.length);
      expect(graphml.match(/<edge /g) ?? []).toHaveLength(kept.length);
    });

    it(`output does not depend on input order — ${name}`, () => {
      expect(jsonldTs(reversed(input))).toBe(jsonldTs(input));
      expect(graphmlTs(reversed(input))).toBe(graphmlTs(input));
    });
  }

  it('JSON-LD is valid RDF-ish JSON with @context + @graph', () => {
    const doc = JSON.parse(
      jsonldTs({
        nodes: [
          { uid: '01890f3e-7b5d-4c0a-8f14-123456789abc', slug: 'p', kind: 'project', title: 'P' },
          { uid: '11890f3e-7b5d-4c0a-8f14-123456789abc', slug: 'c', kind: 'capability', title: 'C', domain: 'd' },
        ],
        edges: [{ from: 'p', to: 'c', via: 'capabilities' }],
      }),
    );
    expect(doc['@context']['@vocab']).toBe('https://schema.org/');
    expect(doc['@graph']).toHaveLength(2);
    const project = doc['@graph'].find((n: { kind: string }) => n.kind === 'project');
    expect(project['@id']).toBe('urn:uuid:01890f3e-7b5d-4c0a-8f14-123456789abc');
    expect(project.uid).toBe('01890f3e-7b5d-4c0a-8f14-123456789abc');
    expect(project.slug).toBe('p');
    expect(project.capabilities).toEqual({ '@id': 'urn:uuid:11890f3e-7b5d-4c0a-8f14-123456789abc' });
  });

  it('GraphML node id uses the permanent UID URN and keeps slug as data', () => {
    const out = graphmlTs({
      nodes: [{ uid: '21890f3e-7b5d-4c0a-8f14-123456789abc', slug: 'auth/login', kind: 'capability', title: 'Login' }],
      edges: [],
    });
    expect(out).toContain('<node id="urn:uuid:21890f3e-7b5d-4c0a-8f14-123456789abc">');
    expect(out).toContain('<data key="uid">21890f3e-7b5d-4c0a-8f14-123456789abc</data>');
    expect(out).toContain('<data key="slug">auth/login</data>');
    expect(out).toContain('<key id="via" for="edge"');
  });

  it('keeps external identity stable when only the readable slug changes', () => {
    const uid = '31890f3e-7b5d-4c0a-8f14-123456789abc';
    const before = JSON.parse(
      jsonldTs({ nodes: [{ uid, slug: 'login', kind: 'capability', title: 'Login' }], edges: [] }),
    );
    const after = JSON.parse(
      jsonldTs({ nodes: [{ uid, slug: 'sign-in', kind: 'capability', title: 'Sign in' }], edges: [] }),
    );

    expect(before['@graph'][0]['@id']).toBe(`urn:uuid:${uid}`);
    expect(after['@graph'][0]['@id']).toBe(`urn:uuid:${uid}`);
    expect(before['@graph'][0].slug).toBe('login');
    expect(after['@graph'][0].slug).toBe('sign-in');
  });

  it('fails closed instead of minting an interop identity when UID is missing', () => {
    const graph = {
      nodes: [{ slug: 'login', kind: 'capability', title: 'Login' }],
      edges: [],
    } as unknown as InteropGraph;

    expect(() => jsonldTs(graph)).toThrow(
      'Interop graph node "login" requires a valid lowercase UUIDv4 `uid`.',
    );
    expect(() => graphmlTs(graph)).toThrow(
      'Interop graph node "login" requires a valid lowercase UUIDv4 `uid`.',
    );
  });

  it('fails closed when two readable slugs claim one external UID', () => {
    const uid = '41890f3e-7b5d-4c0a-8f14-123456789abc';
    const graph: InteropGraph = {
      nodes: [
        { uid, slug: 'login', kind: 'capability', title: 'Login' },
        { uid, slug: 'sign-in', kind: 'capability', title: 'Sign in' },
      ],
      edges: [],
    };

    expect(() => jsonldTs(graph)).toThrow(
      `Interop graph UID "${uid}" is shared by "login" and "sign-in".`,
    );
  });
});
