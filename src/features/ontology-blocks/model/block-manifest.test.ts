import { describe, expect, it } from 'vitest';
import {
  BLOCK_MANIFEST_FILENAME,
  BLOCK_MANIFEST_SCHEMA_VERSION,
  buildBlockManifest,
  parseBlockManifest,
} from './block-manifest';

const census = { elementCount: 3, capabilityCount: 2, depth: 2 };
const UIDS = {
  mcp: '01890f3e-7b5d-4c0a-8f14-123456789abc',
  views: '11890f3e-7b5d-4c0a-8f14-123456789abc',
  render: '21890f3e-7b5d-4c0a-8f14-123456789abc',
  a: '31890f3e-7b5d-4c0a-8f14-123456789abc',
} as const;

describe('buildBlockManifest', () => {
  it('stamps schema version, block identity, and the interop URN per node', () => {
    const manifest = buildBlockManifest({
      blockName: '인증 영역',
      sourceProject: 'ontology-atlas',
      exportedAt: '2026-07-23T00:00:00.000Z',
      census,
      nodes: [
        { uid: UIDS.mcp, slug: 'capabilities/mcp-server', kind: 'capability', title: 'MCP Server' },
      ],
    });

    expect(manifest.schemaVersion).toBe(BLOCK_MANIFEST_SCHEMA_VERSION);
    expect(manifest.blockName).toBe('인증 영역');
    expect(manifest.sourceProject).toBe('ontology-atlas');
    expect(manifest.exportedAt).toBe('2026-07-23T00:00:00.000Z');
    expect(manifest.census).toEqual(census);
    expect(manifest.nodes).toEqual([
      {
        uid: UIDS.mcp,
        urn: `urn:uuid:${UIDS.mcp}`,
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
        { uid: UIDS.views, slug: 'domains/views', kind: 'domain', title: 'Views' },
        { uid: UIDS.render, slug: 'capabilities/render', kind: 'capability', title: 'Render' },
        { uid: UIDS.views, slug: 'domains/views', kind: 'domain', title: 'Views dup' },
      ],
    });

    expect(manifest.nodes.map((n) => n.slug)).toEqual([
      'capabilities/render',
      'domains/views',
    ]);
  });

  it('fails clearly when a node has no UID instead of exporting a slug URN', () => {
    expect(() =>
      buildBlockManifest({
        blockName: 'b',
        sourceProject: 'p',
        exportedAt: '2026-07-23T00:00:00.000Z',
        census,
        nodes: [{ slug: 'a', kind: 'element', title: 'A' }],
      } as unknown as Parameters<typeof buildBlockManifest>[0]),
    ).toThrow('Block manifest node "a" requires a valid lowercase UUIDv4 `uid`.');
  });
});

describe('parseBlockManifest', () => {
  it('round-trips a built manifest through JSON', () => {
    const manifest = buildBlockManifest({
      blockName: 'b',
      sourceProject: 'p',
      exportedAt: '2026-07-23T00:00:00.000Z',
      census,
      nodes: [{ uid: UIDS.a, slug: 'a', kind: 'element', title: 'A' }],
    });
    const parsed = parseBlockManifest(JSON.stringify(manifest));
    expect(parsed).toEqual(manifest);
  });

  it('returns null for malformed or shape-mismatched JSON', () => {
    expect(parseBlockManifest('not json')).toBeNull();
    expect(parseBlockManifest('{"blockName": 42}')).toBeNull();
    expect(parseBlockManifest('null')).toBeNull();
  });

  it('rejects a legacy slug-only manifest instead of treating its slug as a UID', () => {
    expect(
      parseBlockManifest(
        JSON.stringify({
          schemaVersion: 1,
          blockName: 'legacy',
          sourceProject: 'p',
          exportedAt: '2026-07-23T00:00:00.000Z',
          census,
          nodes: [{ slug: 'a', kind: 'element', title: 'A' }],
        }),
      ),
    ).toBeNull();
  });

  it('rejects duplicate slug claims instead of silently choosing one UID', () => {
    expect(
      parseBlockManifest(
        JSON.stringify({
          schemaVersion: 2,
          blockName: 'duplicate',
          sourceProject: 'p',
          exportedAt: '2026-07-23T00:00:00.000Z',
          census,
          nodes: [
            { uid: UIDS.a, urn: `urn:uuid:${UIDS.a}`, slug: 'a', kind: 'element', title: 'A' },
            { uid: UIDS.mcp, urn: `urn:uuid:${UIDS.mcp}`, slug: 'a', kind: 'element', title: 'Other A' },
          ],
        }),
      ),
    ).toBeNull();
  });

  it('exposes the canonical sidecar filename', () => {
    expect(BLOCK_MANIFEST_FILENAME).toBe('block-manifest.json');
  });
});
