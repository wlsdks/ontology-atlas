import { describe, expect, it } from 'vitest';
import { INTEROP_CASES } from '../fixtures/interop-format-cases.mjs';
import {
  buildGraphML as graphmlTs,
  buildJsonLd as jsonldTs,
  type InteropGraph,
} from '@/shared/lib/interop-format';
import {
  buildGraphML as graphmlCli,
  buildJsonLd as jsonldCli,
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
          { slug: 'p', kind: 'project', title: 'P' },
          { slug: 'c', kind: 'capability', title: 'C', domain: 'd' },
        ],
        edges: [{ from: 'p', to: 'c', via: 'capabilities' }],
      }),
    );
    expect(doc['@context']['@vocab']).toBe('https://schema.org/');
    expect(doc['@graph']).toHaveLength(2);
    const project = doc['@graph'].find((n: { kind: string }) => n.kind === 'project');
    expect(project['@id']).toBe('urn:ontology-atlas:project:p');
    expect(project.capabilities).toEqual({ '@id': 'urn:ontology-atlas:capability:c' });
  });

  it('GraphML node id uses the slug-based URN', () => {
    const out = graphmlTs({
      nodes: [{ slug: 'auth/login', kind: 'capability', title: 'Login' }],
      edges: [],
    });
    expect(out).toContain('<node id="urn:ontology-atlas:capability:auth/login">');
    expect(out).toContain('<key id="via" for="edge"');
  });
});
