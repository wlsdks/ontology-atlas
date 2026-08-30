import { nodeUrn } from '@/shared/lib/interop-format';

/**
 * The ontology block's sidecar manifest — the only non-markdown file left at the export
 * folder's root. A block is just a folder of `.md` (the trust charter in AGENTS.md forbids
 * new file formats), and this JSON is only a calling card saying where the bundle came from.
 * Node identity reuses the permanent UID URN convention from `interop-format.ts`
 * (`urn:uuid:<uid>`); the slug is the readable current address.
 */
export const BLOCK_MANIFEST_FILENAME = 'block-manifest.json';
export const BLOCK_MANIFEST_SCHEMA_VERSION = 2;

interface BlockManifestNode {
  uid: string;
  urn: string;
  slug: string;
  kind: string;
  title: string;
}

export interface BlockCensus {
  elementCount: number;
  capabilityCount: number;
  depth: number;
}

export interface BlockManifest {
  schemaVersion: number;
  blockName: string;
  sourceProject: string;
  /** ISO 8601 — app code, so serializing from Date.now is allowed. */
  exportedAt: string;
  census: BlockCensus;
  nodes: BlockManifestNode[];
}

export interface BuildBlockManifestInput {
  blockName: string;
  sourceProject: string;
  exportedAt: string;
  census: BlockCensus;
  nodes: { uid: string; slug: string; kind: string; title: string }[];
}

/** Pure and deterministic — sorted by slug with duplicate slugs removed (same discipline as the interop serializer). */
export function buildBlockManifest(input: BuildBlockManifestInput): BlockManifest {
  const bySlug = new Map<string, BlockManifestNode>();
  const slugByUid = new Map<string, string>();
  for (const n of input.nodes) {
    const slug = n.slug.trim();
    if (!slug || bySlug.has(slug)) continue;
    const uid = typeof n.uid === 'string' ? n.uid.trim() : '';
    let urn: string;
    try {
      urn = nodeUrn(uid);
    } catch {
      throw new Error(
        `Block manifest node "${slug}" requires a valid lowercase UUIDv4 \`uid\`.`,
      );
    }
    const priorSlug = slugByUid.get(uid);
    if (priorSlug && priorSlug !== slug) {
      throw new Error(`Block manifest UID "${uid}" is shared by "${priorSlug}" and "${slug}".`);
    }
    slugByUid.set(uid, slug);
    bySlug.set(slug, {
      uid,
      urn,
      slug,
      kind: n.kind,
      title: n.title,
    });
  }
  const nodes = [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  return {
    schemaVersion: BLOCK_MANIFEST_SCHEMA_VERSION,
    blockName: input.blockName,
    sourceProject: input.sourceProject,
    exportedAt: input.exportedAt,
    census: input.census,
    nodes,
  };
}

/**
 * The lenient parser on the import side. A block import must work from the `.md` alone even
 * when the manifest is broken or absent (markdown is the source of truth), so failure
 * returns null.
 */
export function parseBlockManifest(raw: string): BlockManifest | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const m = parsed as Record<string, unknown>;
  if (typeof m.blockName !== 'string' || typeof m.sourceProject !== 'string') return null;
  if (typeof m.exportedAt !== 'string' || m.schemaVersion !== BLOCK_MANIFEST_SCHEMA_VERSION) {
    return null;
  }
  const censusRaw =
    m.census !== null && typeof m.census === 'object'
      ? (m.census as Record<string, unknown>)
      : null;
  if (!censusRaw) return null;
  const census: BlockCensus = {
    elementCount: typeof censusRaw.elementCount === 'number' ? censusRaw.elementCount : 0,
    capabilityCount:
      typeof censusRaw.capabilityCount === 'number' ? censusRaw.capabilityCount : 0,
    depth: typeof censusRaw.depth === 'number' ? censusRaw.depth : 0,
  };
  const nodesRaw = Array.isArray(m.nodes) ? m.nodes : [];
  const nodes: BlockManifestNode[] = [];
  const seenUids = new Set<string>();
  const seenSlugs = new Set<string>();
  for (const n of nodesRaw) {
    if (n === null || typeof n !== 'object') continue;
    const node = n as Record<string, unknown>;
    if (typeof node.uid !== 'string' || typeof node.slug !== 'string' || typeof node.kind !== 'string') {
      return null;
    }
    let urn: string;
    try {
      urn = nodeUrn(node.uid);
    } catch {
      return null;
    }
    if (
      (node.urn !== undefined && node.urn !== urn) ||
      seenUids.has(node.uid) ||
      seenSlugs.has(node.slug)
    ) {
      return null;
    }
    seenUids.add(node.uid);
    seenSlugs.add(node.slug);
    nodes.push({
      uid: node.uid,
      urn,
      slug: node.slug,
      kind: node.kind,
      title: typeof node.title === 'string' ? node.title : node.slug,
    });
  }
  return {
    schemaVersion: m.schemaVersion,
    blockName: m.blockName,
    sourceProject: m.sourceProject,
    exportedAt: m.exportedAt,
    census,
    nodes,
  };
}
