import { describe, expect, it } from 'vitest';
import { INTEROP_CASES } from '../fixtures/interop-format-cases.mjs';
import {
  buildGraphML as graphmlTs,
  buildJsonLd as jsonldTs,
  INTEROP_SCHEMA_VERSION as schemaVersionTs,
  type InteropGraph,
} from '@/shared/lib/interop-format';
import {
  buildGraphML as graphmlCli,
  buildJsonLd as jsonldCli,
  INTEROP_SCHEMA_VERSION as schemaVersionCli,
} from '../../cli/src/lib/interop-format.mjs';

/**
 * Interop-format contract — the web ERD builder export (`src/shared/lib`) and
 * the CLI `export` command (`cli/src/lib`) serialize the *same* compile
 * artifact through two physical copies of the serializer. This contract keeps
 * them byte-identical: same input → identical JSON-LD + GraphML. If one copy
 * changes and the other doesn't, every case here fails. Same pattern as the
 * parser / validator drift guards (R11).
 *
 * The CLI copy is the node/mjs source; the TS copy is what the browser bundles.
 * They can't be one physical module (the CLI ships as a separate npm package,
 * the web copy is TypeScript bundled by Next), so the contract test is the
 * effective single-source enforcement.
 */

describe('interop-format contract (web ↔ CLI serializer drift)', () => {
  it('publishes UID-based interop schema version 2 on both surfaces', () => {
    expect(schemaVersionCli).toBe(2);
    expect(schemaVersionTs).toBe(2);
  });

  for (const { name, input } of INTEROP_CASES as Array<{ name: string; input: InteropGraph }>) {
    it(`JSON-LD identical — ${name}`, () => {
      expect(jsonldCli(input)).toBe(jsonldTs(input));
    });

    it(`GraphML identical — ${name}`, () => {
      expect(graphmlCli(input)).toBe(graphmlTs(input));
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

    expect(() => jsonldCli(graph)).toThrow(
      'Interop graph node "login" requires a valid lowercase UUIDv4 `uid`.',
    );
    expect(() => jsonldTs(graph)).toThrow(
      'Interop graph node "login" requires a valid lowercase UUIDv4 `uid`.',
    );
    expect(() => graphmlCli(graph)).toThrow(
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
