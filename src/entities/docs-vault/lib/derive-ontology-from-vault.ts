import type { VaultDoc, VaultManifest } from '../model/types';

/**
 * 로컬 vault 의 frontmatter 가 명시한 ontology 후보를 *AI 추출 거치지 않고*
 * 즉시 stub 으로 변환. mission 의 "글을 쓰면 ontology 가 자라난다" 약속의
 * **로컬 모드 fast path** — V2 spec 의 V1.x ActionType 도입 전에도 사용자가
 * 작성한 frontmatter 만으로 ontology surface 가 보이도록.
 *
 * 입력 frontmatter 인식 키:
 * - `kind` — 노드 종류 (project / domain / capability / element / document)
 * - `title` — 노드 제목 (없으면 firstHeading 또는 slug 의 마지막 segment)
 * - `domain` — 단일 domain 노드 후보 (string). docNode 의 부모로 매달림.
 * - `domains` — string[] domain 노드 후보. 보통 project.md 가 자기가 포함하는
 *   도메인 목록을 노출할 때. docNode 가 도메인의 부모로 매달림.
 * - `capabilities` — string[] (capability 노드 후보)
 * - `elements` — string[] (element 노드 후보)
 * - `relates` — string[] (related_to edge 후보)
 * - `dependencies` — string[] (depends_on edge 후보)
 *
 * mission v2: vault frontmatter 자체가 진실원이라 별도 promote / 승격 단계
 * 없음. 출력 stub 은 즉시 ontology 그래프로 surface (\`/ontology\` 트리,
 * 빌더 캔버스, /insights / /relations 등).
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

// vault folder 이름 → kind 매핑. \`relates: [capabilities/mcp-server]\` 같은
// folder-prefixed 슬러그를 단수 kind 로 정확히 변환할 때 사용.
const FOLDER_TO_KIND: Record<string, string> = {
  projects: 'project',
  domains: 'domain',
  capabilities: 'capability',
  elements: 'element',
  documents: 'document',
};

/**
 * \`relates: ['capabilities/mcp-server', 'auth-platform']\` 같은 ref 를 기존
 * 노드 ID 로 resolve. 형식:
 * - \`folder/slug\` → \`${kind}:${slug}\` (folder 가 알려진 vault 폴더면)
 * - 그 외 → \`unknown:${slugified}\` fallback
 */
function resolveRelatesRef(
  rel: string,
  existingNodes: Map<string, OntologyStubNode>,
): string | null {
  const trimmed = rel.trim();
  if (!trimmed) return null;
  const slashIdx = trimmed.indexOf('/');
  if (slashIdx > 0) {
    const folder = trimmed.slice(0, slashIdx);
    const tailSlug = slugifyName(trimmed.slice(slashIdx + 1));
    if (!tailSlug) return null;
    const kind = FOLDER_TO_KIND[folder];
    if (kind) {
      const candidate = `${kind}:${tailSlug}`;
      // existing 노드가 있으면 그대로, 없어도 같은 ID 반환 (caller 가
      // unknown stub 으로 잠시 등록 — 미래에 같은 vault doc 가 생기면
      // overwrite 으로 정확한 kind 를 잡는다).
      return existingNodes.has(candidate)
        ? candidate
        : `unknown:${tailSlug}`;
    }
  }
  const slug = slugifyName(trimmed);
  if (!slug) return null;
  return `unknown:${slug}`;
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

  // Pass 1: 모든 docNode 를 먼저 등록 — relates 처리 시 (Pass 2 안 inline)
  // 다른 doc 의 noderef 를 정확히 resolve 할 수 있게 한다 (\`relates:
  // [capabilities/mcp-server]\` → \`capability:mcp-server\` 정확 매칭).
  for (const doc of manifest.docs) {
    const docNode = deriveDocNode(doc);
    if (docNode) nodes.set(docNode.id, docNode);
  }

  // Pass 2: 각 doc 의 frontmatter array/relation 키를 순회하며 edge / 합성
  // 노드 추가.
  for (const doc of manifest.docs) {
    const docNode = deriveDocNode(doc);
    if (!docNode) continue;

    const fm = doc.frontmatter;

    // domain (단일 string) — \`domain: X\` 는 \"이 문서가 X 도메인에 속한다\"
    // 의미. \`contains\` edge 의 from 이 부모 (parent), to 가 자식 (child) 이라
    // edge 는 domain → docNode 방향이어야 트리에서 도메인 아래에 capability /
    // element 가 매달리는 기대 구조가 만들어진다.
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
          id: `${domainId}--contains-->${docNode.id}`,
          from: domainId,
          to: docNode.id,
          type: 'contains',
          source: 'frontmatter',
          sourceSlug: doc.slug,
        });
      }
    }

    // domains[] — \`domains: ['auth', 'billing']\` 식 plural array. 보통
    // project.md 가 자기가 포함하는 도메인 목록을 노출할 때. \`contains\` edge
    // 의 from = parent (docNode = project), to = child (domain). \`domain:\`
    // singular 와 방향이 반대 — 주체가 누가 누구를 포함하는지가 다르다.
    for (const dom of asStringArray(fm.domains)) {
      const domSlug = slugifyName(dom);
      if (!domSlug) continue;
      const domId = `domain:${domSlug}`;
      if (!nodes.has(domId)) {
        nodes.set(domId, {
          id: domId,
          title: dom,
          kind: 'domain',
          sourceSlug: doc.slug,
          source: 'frontmatter',
        });
      }
      edges.push({
        id: `${docNode.id}--contains-->${domId}`,
        from: docNode.id,
        to: domId,
        type: 'contains',
        source: 'frontmatter',
        sourceSlug: doc.slug,
      });
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

    // relates[] — related_to edge. \`folder/slug\` 형태 (예:
    // \`capabilities/mcp-server\`) 면 기존 docNode (\`capability:mcp-server\`)
    // 와 연결하려고 시도하고, 실패하면 \`unknown:slug\` stub. 단순 slugify
    // 만 하면 \`/\` 가 사라져 \`capabilitiesmcp-server\` 같은 mangled ID 가
    // 됐던 회귀 차단.
    for (const rel of asStringArray(fm.relates)) {
      const relId = resolveRelatesRef(rel, nodes);
      if (!relId) continue;
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
      'vault 의 .md 어디에도 frontmatter `kind:` 가 없어 ontology 후보가 비어있습니다. 문서 상단 `---` 블록에 `kind: project` (또는 domain / capability / element / document) 추가 시 즉시 노드로 자랍니다.',
    );
  }

  // edge type 화이트리스트 검증 (방어) + id 기반 dedup.
  // vault 가 양방향으로 같은 관계를 표현하면 (예: domain.capabilities[] +
  // capability.domain:) 같은 edge id 가 두 번 push 된다. 그래프 입장에서는
  // 같은 edge 라 first-wins 로 합쳐 React duplicate-key 경고와 ego graph 의
  // silent edge 누락을 차단.
  const dedupedById = new Map<string, OntologyStubEdge>();
  for (const e of edges) {
    if (!VALID_RELATION_TYPES.has(e.type)) continue;
    if (!dedupedById.has(e.id)) dedupedById.set(e.id, e);
  }

  return {
    nodes: Array.from(nodes.values()),
    edges: Array.from(dedupedById.values()),
    warnings,
  };
}
