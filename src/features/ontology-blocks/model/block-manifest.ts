import { nodeUrn } from '@/shared/lib/interop-format';

/**
 * 온톨로지 블록 사이드카 매니페스트 — export 폴더 루트에 남는 단 하나의
 * 비-마크다운 파일. 블록 = 그냥 .md 폴더(AGENTS.md 신뢰 헌장 — 새 파일
 * 포맷 금지)이고, 이 JSON 은 "어디서 온 묶음인지"를 말하는 명함일 뿐이다.
 * 노드 identity 는 `interop-format.ts` 의 영구 UID URN 규약
 * (`urn:uuid:<uid>`) 을 재사용한다. slug 는 읽을 수 있는 현재 주소다.
 */
export const BLOCK_MANIFEST_FILENAME = 'block-manifest.json';
export const BLOCK_MANIFEST_SCHEMA_VERSION = 2;

export interface BlockManifestNode {
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
  /** ISO 8601 — 앱 코드라 Date.now 기반 직렬화 허용. */
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

/** 순수·결정적 — slug 정렬 + 중복 slug 제거 (interop 직렬화기와 같은 규율). */
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
 * import 측 관대한 파서 — 매니페스트가 깨졌거나 없어도 블록 import 자체는
 * .md 만으로 가능해야 하므로(마크다운=진실원) 실패 시 null 만 반환한다.
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
    if ((node.urn !== undefined && node.urn !== urn) || seenUids.has(node.uid)) return null;
    seenUids.add(node.uid);
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
