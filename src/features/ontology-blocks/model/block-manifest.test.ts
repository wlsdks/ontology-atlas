import { describe, expect, it } from 'vitest';
import {
  BLOCK_MANIFEST_FILENAME,
  BLOCK_MANIFEST_SCHEMA_VERSION,
  buildBlockManifest,
  parseBlockManifest,
} from './block-manifest';

const census = { elementCount: 3, capabilityCount: 2, depth: 2 };

describe('buildBlockManifest', () => {
  it('stamps schema version, block identity, and the interop URN per node', () => {
    const manifest = buildBlockManifest({
      blockName: '인증 영역',
      sourceProject: 'ontology-atlas',
      exportedAt: '2026-07-23T00:00:00.000Z',
      census,
      nodes: [
        { slug: 'capabilities/mcp-server', kind: 'capability', title: 'MCP Server' },
      ],
    });

    expect(manifest.schemaVersion).toBe(BLOCK_MANIFEST_SCHEMA_VERSION);
    expect(manifest.blockName).toBe('인증 영역');
    expect(manifest.sourceProject).toBe('ontology-atlas');
    expect(manifest.exportedAt).toBe('2026-07-23T00:00:00.000Z');
    expect(manifest.census).toEqual(census);
    expect(manifest.nodes).toEqual([
      {
        // interop-format.ts 의 urn:ontology-atlas:<kind>:<slug> 규약 재사용.
        urn: 'urn:ontology-atlas:capability:capabilities/mcp-server',
        slug: 'capabilities/mcp-server',
        kind: 'capability',
        title: 'MCP Server',
      },
    ]);
  });

  it('sorts nodes by slug and dedupes repeated slugs (deterministic output)', () => {
    const manifest = buildBlockManifest({
      blockName: 'b',
      sourceProject: 'p',
      exportedAt: '2026-07-23T00:00:00.000Z',
      census,
      nodes: [
        { slug: 'domains/views', kind: 'domain', title: 'Views' },
        { slug: 'capabilities/render', kind: 'capability', title: 'Render' },
        { slug: 'domains/views', kind: 'domain', title: 'Views dup' },
      ],
    });

    expect(manifest.nodes.map((n) => n.slug)).toEqual([
      'capabilities/render',
      'domains/views',
    ]);
  });
});

describe('parseBlockManifest', () => {
  it('round-trips a built manifest through JSON', () => {
    const manifest = buildBlockManifest({
      blockName: 'b',
      sourceProject: 'p',
      exportedAt: '2026-07-23T00:00:00.000Z',
      census,
      nodes: [{ slug: 'a', kind: 'element', title: 'A' }],
    });
    const parsed = parseBlockManifest(JSON.stringify(manifest));
    expect(parsed).toEqual(manifest);
  });

  it('returns null for malformed or shape-mismatched JSON', () => {
    expect(parseBlockManifest('not json')).toBeNull();
    expect(parseBlockManifest('{"blockName": 42}')).toBeNull();
    expect(parseBlockManifest('null')).toBeNull();
  });

  it('exposes the canonical sidecar filename', () => {
    expect(BLOCK_MANIFEST_FILENAME).toBe('block-manifest.json');
  });
});
