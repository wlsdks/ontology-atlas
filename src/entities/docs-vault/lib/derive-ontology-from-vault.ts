import type { VaultDoc, VaultManifest } from '../model/types';

/**
 * 로컬 vault 의 frontmatter 가 명시한 ontology 후보를 *AI 추출 거치지 않고*
 * 즉시 stub 으로 변환. mission 의 "글을 쓰면 ontology 가 자라난다" 약속의
 * **로컬 모드 fast path** — V2 spec 의 V1.x ActionType 도입 전에도 사용자가
 * 작성한 frontmatter 만으로 ontology surface 가 보이도록.
 *
 * 입력 frontmatter 인식 키 (KnowledgeDocumentNewPage template 과 동일):
 * - `kind` — 노드 종류 (project / capability / element / decision / workflow / …)
 * - `title` — 노드 제목 (없으면 firstHeading 또는 slug 의 마지막 segment)
 * - `domain` — 단일 domain 노드 후보 (string)
 * - `capabilities` — string[] (capability 노드 후보)
 * - `elements` — string[] (element 노드 후보)
 * - `relates` — string[] (related_to edge 후보)
 * - `dependencies` — string[] (depends_on edge 후보)
 *
 * mission v2: vault frontmatter 자체가 진실원이라 별도 promote / 승격 단계
 * 없음. 출력 stub 은 즉시 ontology 그래프로 surface (\`/ontology\` 트리,
 * 빌더 캔버스, /insights / /relations 등). cloud Firestore 와의 sync 는
 * 옵션 — \`useDataSourceMode\` 가 cloud 일 때만 mutation 이 cloud 로.
 */

export type OntologyStubSource = 'frontmatter';

export interface OntologyStubNode {
  /** `<kind>:<slug>` 또는 fallback `unknown:<slug>`. */
  id: string;
  title: string;
  kind: string;
  /** 어느 vault 문서 (slug) 에서 유래했는지 — evidence chain 의 시작점. */
  sourceSlug: string;
  source: OntologyStubSource;
  /** 자유 요약 — 본문 첫 단락 또는 description 키. */
  summary?: string;
}

export interface OntologyStubEdge {
  /** `<from>--<type>-->|<to>` */
  id: string;
  from: string;
  to: string;
  /** 'contains' | 'depends_on' | 'describes' | 'related_to' (V1.0 7-relation 부분집합). */
  type: 'contains' | 'depends_on' | 'describes' | 'related_to';
  source: OntologyStubSource;
  sourceSlug: string;
}

export interface VaultOntologyDerivation {
  nodes: OntologyStubNode[];
  edges: OntologyStubEdge[];
  /** vault 의 어떤 doc 도 ontology 후보가 안 만들어진 경우 진단 메시지 — UI 빈 상태에 노출. */
  warnings: string[];
}

const VALID_RELATION_TYPES = new Set([
  'contains',
  'depends_on',
  'describes',
  'related_to',
]);

function slugifyName(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w가-힣\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return value
      .split(/\s*,\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function deriveDocNode(doc: VaultDoc): OntologyStubNode | null {
  const fm = doc.frontmatter;
  const rawKind = typeof fm.kind === 'string' ? fm.kind.trim() : '';
  if (!rawKind) return null;
  const title = doc.title?.trim() || doc.slug.split('/').pop() || doc.slug;
  const id = `${rawKind}:${doc.slug.split('/').pop() || doc.slug}`;
  return {
    id,
    title,
    kind: rawKind,
    sourceSlug: doc.slug,
    source: 'frontmatter',
    summary: doc.description ?? doc.excerpt ?? undefined,
  };
}

export function deriveOntologyFromVault(
  manifest: VaultManifest,
): VaultOntologyDerivation {
  const nodes = new Map<string, OntologyStubNode>();
  const edges: OntologyStubEdge[] = [];
  const warnings: string[] = [];

  for (const doc of manifest.docs) {
    const docNode = deriveDocNode(doc);
    if (!docNode) continue;
    nodes.set(docNode.id, docNode);

    const fm = doc.frontmatter;

    // domain (단일 string)
    if (typeof fm.domain === 'string' && fm.domain.trim() !== '') {
      const domainSlug = slugifyName(fm.domain);
      if (domainSlug) {
        const domainId = `domain:${domainSlug}`;
        if (!nodes.has(domainId)) {
          nodes.set(domainId, {
            id: domainId,
            title: fm.domain.trim(),
            kind: 'domain',
            sourceSlug: doc.slug,
            source: 'frontmatter',
          });
        }
        edges.push({
          id: `${docNode.id}--contains-->${domainId}`,
          from: docNode.id,
          to: domainId,
          type: 'contains',
          source: 'frontmatter',
          sourceSlug: doc.slug,
        });
      }
    }

    // capabilities[]
    for (const cap of asStringArray(fm.capabilities)) {
      const capSlug = slugifyName(cap);
      if (!capSlug) continue;
      const capId = `capability:${capSlug}`;
      if (!nodes.has(capId)) {
        nodes.set(capId, {
          id: capId,
          title: cap,
          kind: 'capability',
          sourceSlug: doc.slug,
          source: 'frontmatter',
        });
      }
      edges.push({
        id: `${docNode.id}--contains-->${capId}`,
        from: docNode.id,
        to: capId,
        type: 'contains',
        source: 'frontmatter',
        sourceSlug: doc.slug,
      });
    }

    // elements[]
    for (const el of asStringArray(fm.elements)) {
      const elSlug = slugifyName(el);
      if (!elSlug) continue;
      const elId = `element:${elSlug}`;
      if (!nodes.has(elId)) {
        nodes.set(elId, {
          id: elId,
          title: el,
          kind: 'element',
          sourceSlug: doc.slug,
          source: 'frontmatter',
        });
      }
      edges.push({
        id: `${docNode.id}--contains-->${elId}`,
        from: docNode.id,
        to: elId,
        type: 'contains',
        source: 'frontmatter',
        sourceSlug: doc.slug,
      });
    }

    // relates[] — related_to edge (대상 노드는 별도 stub; promote 시 resolve)
    for (const rel of asStringArray(fm.relates)) {
      const relSlug = slugifyName(rel);
      if (!relSlug) continue;
      const relId = `unknown:${relSlug}`;
      if (!nodes.has(relId)) {
        nodes.set(relId, {
          id: relId,
          title: rel,
          kind: 'unknown',
          sourceSlug: doc.slug,
          source: 'frontmatter',
        });
      }
      edges.push({
        id: `${docNode.id}--related_to-->${relId}`,
        from: docNode.id,
        to: relId,
        type: 'related_to',
        source: 'frontmatter',
        sourceSlug: doc.slug,
      });
    }

    // dependencies[] — depends_on edge
    for (const dep of asStringArray(fm.dependencies)) {
      const depSlug = slugifyName(dep);
      if (!depSlug) continue;
      // dependencies 는 같은 종 (project) 사이를 가리키는 게 일반적이라 추측.
      const depId = `${docNode.kind}:${depSlug}`;
      if (!nodes.has(depId)) {
        nodes.set(depId, {
          id: depId,
          title: dep,
          kind: docNode.kind,
          sourceSlug: doc.slug,
          source: 'frontmatter',
        });
      }
      edges.push({
        id: `${docNode.id}--depends_on-->${depId}`,
        from: docNode.id,
        to: depId,
        type: 'depends_on',
        source: 'frontmatter',
        sourceSlug: doc.slug,
      });
    }
  }

  if (nodes.size === 0) {
    warnings.push(
      'vault 의 .md 어디에도 frontmatter `kind:` 가 없어 ontology 후보가 비어있습니다. 문서 상단 `---` 블록에 `kind: project` (또는 capability / element / workflow / decision) 추가 시 즉시 노드로 자랍니다.',
    );
  }

  // edge type 화이트리스트 검증 (방어)
  const validatedEdges = edges.filter((e) => VALID_RELATION_TYPES.has(e.type));

  return {
    nodes: Array.from(nodes.values()),
    edges: validatedEdges,
    warnings,
  };
}
