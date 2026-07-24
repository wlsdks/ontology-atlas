import { deriveDisplayTitle } from '@/shared/lib/derive-display-title';
import { humanizeCodePathTitle } from '@/shared/lib/humanize-code-path-title';
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
 * - `contains` — string[] (contains edge 후보, CLI/MCP add_relation 이 쓰는 키)
 * - `broader` — string[] (is_a edge 후보 — 상위 개념 / SKOS skos:broader)
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
  /**
   * 표시용 짧은 제목 — 과제 ⑩. `deriveDisplayTitle` 로 계산 (frontmatter
   * `display:` 필드 우선, 없으면 title 의 괄호 부연 설명 컷). 토폴로지
   * 라벨 / INDEX 행 / 팝오버 / 상세 헤더는 이 필드를 렌더한다. 검색/매칭은
   * 여전히 `title` 전체로 — 이 필드는 렌더 전용이라 매칭 범위를 줄이지
   * 않는다.
   */
  display: string;
  /**
   * 어권별 표시 이름 (소유자 지시 2026-07-24) — frontmatter 의
   * `display_ko:` / `display_en:` 등 `display_<locale>` 키를 그대로 수집.
   * 해석(어느 로케일을 보여줄지)은 렌더 경계(`derivationToInsight`)가
   * 담당 — derive 는 로케일을 모른다(모듈-로드 캐시와 충돌 방지).
   * 검색/매칭은 여전히 `title` 전체로.
   */
  displayLocales?: Readonly<Record<string, string>>;
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
  /** 'contains' | 'depends_on' | 'describes' | 'related_to' | 'is_a' (V1.0 7-relation 부분집합 + is-a 상위개념 축). */
  type: 'contains' | 'depends_on' | 'describes' | 'related_to' | 'is_a';
  source: OntologyStubSource;
  sourceSlug: string;
  /** P6 — 이 관계의 근거 한 줄 (`relation_notes: {ref: why}`). 엣지 팝오버가 문장 아래 보여준다. */
  label?: string;
}

export interface VaultOntologyDerivation {
  nodes: OntologyStubNode[];
  edges: OntologyStubEdge[];
  /** Frontmatter `kind:` docs before relation-derived stubs are added. */
  sourceConceptCount: number;
  /** Frontmatter `kind:` docs by kind before relation-derived stubs are added. */
  sourceKindCounts: Record<string, number>;
  /** vault 의 어떤 doc 도 ontology 후보가 안 만들어진 경우 진단 메시지 — UI 빈 상태에 노출. */
  warnings: string[];
}

const VALID_RELATION_TYPES = new Set([
  'contains',
  'depends_on',
  'describes',
  'related_to',
  'is_a',
]);

// export — 부트스트랩(도메인 파일화)이 같은 규칙으로 파일 tail 을 만들어야
// derive 의 ref resolve(`domain:slugifyName(name)`)와 그래프가 이어진다.
export function slugifyName(input: string): string {
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

function resolveFolderPrefixedRef(ref: string): { id: string; kind: string; title: string } | null {
  const trimmed = ref.trim();
  const slashIdx = trimmed.indexOf('/');
  if (slashIdx <= 0) return null;
  const folder = trimmed.slice(0, slashIdx);
  const tailRaw = trimmed.slice(slashIdx + 1);
  const tailSlug = slugifyName(tailRaw);
  if (!tailSlug) return null;
  const kind = FOLDER_TO_KIND[folder];
  if (!kind) return null;
  return {
    id: `${kind}:${tailSlug}`,
    kind,
    title: tailRaw.trim() || tailSlug,
  };
}

/**
 * \`relates: ['capabilities/mcp-server', 'auth-platform']\` 같은 ref 를 기존
 * 노드 ID 로 resolve. 형식:
 * - \`folder/slug\` → \`${kind}:${slug}\` (folder 가 알려진 vault 폴더면)
 * - 그 외 → \`unknown:${slugified}\` fallback
 */
function resolveRelatesRef(rel: string): string | null {
  const trimmed = rel.trim();
  if (!trimmed) return null;
  const folderRef = resolveFolderPrefixedRef(trimmed);
  if (folderRef) {
    return folderRef.id;
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
  // project kind 는 *user-facing slug* (frontmatter.slug 우선) 로 id 형성 —
  // computeProjectSlug 와 정합. 그래서 PR #253 의 BFS 가 매다는 projectIds
  // 값이 Project.slug 와 match → /projects 카드 fact strip / /ontology/
  // insights projectRows 모두 정확한 매핑. 다른 kind 는 file slug 그대로
  // (relates/depends_on 의 외부 ref 호환).
  let idSlug: string;
  const fmSlug = typeof fm.slug === 'string' ? fm.slug.trim() : '';
  if (rawKind === 'project' && fmSlug) {
    idSlug = fmSlug;
  } else {
    idSlug = doc.slug.split('/').pop() || doc.slug;
  }
  const id = `${rawKind}:${idSlug}`;
  const baseDisplay = deriveDisplayTitle(fm, title);
  // element 노드는 title 이 코드 경로 원문(`src/foo/bar-baz.ts`)인 경우가
  // 많아 비개발자에게 그대로 노출하면 가독성이 떨어진다. display 필드도
  // 괄호 컷도 없어 baseDisplay 가 title 그대로일 때만 경로 → 사람 이름
  // 변환을 시도한다 (명시적 display: 는 여전히 최우선).
  const display =
    rawKind === 'element' && baseDisplay === title
      ? humanizeCodePathTitle(title) ?? baseDisplay
      : baseDisplay;
  // 어권별 표시 이름 — `display_ko:` 처럼 `display_` 뒤 2글자 로케일 키만
  // 수집(그 외 키는 무시, 값은 trim 비어있지 않은 문자열만).
  let displayLocales: Record<string, string> | undefined;
  for (const [key, value] of Object.entries(fm)) {
    const match = /^display_([a-z]{2})$/.exec(key);
    if (!match || typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    (displayLocales ??= {})[match[1]] = trimmed;
  }
  return {
    id,
    title,
    display,
    displayLocales,
    kind: rawKind,
    sourceSlug: doc.slug,
    source: 'frontmatter',
    summary: doc.description ?? doc.excerpt ?? undefined,
  };
}

function deriveOntologyFromVaultUncached(
  manifest: VaultManifest,
): VaultOntologyDerivation {
  const nodes = new Map<string, OntologyStubNode>();
  const edges: OntologyStubEdge[] = [];
  const warnings: string[] = [];

  // Pass 1: 모든 docNode 를 먼저 등록 — relates 처리 시 (Pass 2 안 inline)
  // 다른 doc 의 noderef 를 정확히 resolve 할 수 있게 한다 (\`relates:
  // [capabilities/mcp-server]\` → \`capability:mcp-server\` 정확 매칭).
  let sourceConceptCount = 0;
  const sourceKindCounts: Record<string, number> = {};
  for (const doc of manifest.docs) {
    const docNode = deriveDocNode(doc);
    if (docNode) {
      nodes.set(docNode.id, docNode);
      sourceConceptCount += 1;
      sourceKindCounts[docNode.kind] = (sourceKindCounts[docNode.kind] ?? 0) + 1;
    }
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
      const folderRef = resolveFolderPrefixedRef(fm.domain);
      const domainSlug = folderRef?.kind === 'domain'
        ? folderRef.id.slice('domain:'.length)
        : slugifyName(fm.domain);
      if (domainSlug) {
        const domainId = `domain:${domainSlug}`;
        if (!nodes.has(domainId)) {
          nodes.set(domainId, {
            id: domainId,
            title: folderRef?.kind === 'domain' ? folderRef.title : fm.domain.trim(),
            display: deriveDisplayTitle(undefined, folderRef?.kind === 'domain' ? folderRef.title : fm.domain.trim()),
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
      // 리텐션 라운드 P4-①: folder-prefixed ref('domains/tasks' — init 스타터
      // 의 기본 형식)가 이 분기에서만 미해석돼 slugify 가 슬래시까지 뭉갠
      // `domain:domainstasks` 팬텀을 민팅했다 (실 노드 `domain:tasks` 와
      // 병합 실패 → 신규 vault 전원 count 왜곡). 단수 `domain:` 분기와
      // 같은 resolveFolderPrefixedRef 우선 규칙을 적용한다.
      const folderRef = resolveFolderPrefixedRef(dom);
      const domId = folderRef?.kind === 'domain' ? folderRef.id : `domain:${slugifyName(dom)}`;
      if (domId === 'domain:') continue;
      if (!nodes.has(domId)) {
        nodes.set(domId, {
          id: domId,
          title: folderRef?.kind === 'domain' ? folderRef.title : dom,
          display: deriveDisplayTitle(undefined, folderRef?.kind === 'domain' ? folderRef.title : dom),
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
      const folderRef = resolveFolderPrefixedRef(cap);
      const capSlug = folderRef?.kind === 'capability'
        ? folderRef.id.slice('capability:'.length)
        : slugifyName(cap);
      if (!capSlug) continue;
      const capId = `capability:${capSlug}`;
      if (!nodes.has(capId)) {
        nodes.set(capId, {
          id: capId,
          title: folderRef?.kind === 'capability' ? folderRef.title : cap,
          display: deriveDisplayTitle(undefined, folderRef?.kind === 'capability' ? folderRef.title : cap),
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
      const folderRef = resolveFolderPrefixedRef(el);
      const elSlug = folderRef?.kind === 'element'
        ? folderRef.id.slice('element:'.length)
        : slugifyName(el);
      if (!elSlug) continue;
      const elId = `element:${elSlug}`;
      if (!nodes.has(elId)) {
        nodes.set(elId, {
          id: elId,
          title: folderRef?.kind === 'element' ? folderRef.title : el,
          display:
            humanizeCodePathTitle(el) ??
            deriveDisplayTitle(undefined, folderRef?.kind === 'element' ? folderRef.title : el),
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

    // contains[] — CLI/MCP add_relation({type:'contains'}) 가 쓰는 direct
    // parent→child 관계. `capabilities/foo` 같은 folder-prefixed ref 는
    // 실제 kind 로 resolve 해야 웹이 duplicate unknown 노드를 만들지 않는다.
    for (const contained of asStringArray(fm.contains)) {
      const folderRef = resolveFolderPrefixedRef(contained);
      const containedSlug = folderRef
        ? folderRef.id.split(':').at(-1)
        : slugifyName(contained);
      if (!containedSlug) continue;
      const containedId = folderRef?.id ?? `unknown:${containedSlug}`;
      if (!nodes.has(containedId)) {
        nodes.set(containedId, {
          id: containedId,
          title: folderRef?.title ?? contained,
          display: deriveDisplayTitle(undefined, folderRef?.title ?? contained),
          kind: folderRef?.kind ?? 'unknown',
          sourceSlug: doc.slug,
          source: 'frontmatter',
        });
      }
      edges.push({
        id: `${docNode.id}--contains-->${containedId}`,
        from: docNode.id,
        to: containedId,
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
      const relId = resolveRelatesRef(rel);
      if (!relId) continue;
      if (!nodes.has(relId)) {
        nodes.set(relId, {
          id: relId,
          title: rel,
          display: deriveDisplayTitle(undefined, rel),
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
      const folderRef = resolveFolderPrefixedRef(dep);
      const depSlug = folderRef
        ? folderRef.id.split(':').at(-1)
        : slugifyName(dep);
      if (!depSlug) continue;
      // dependencies 는 같은 종 (project) 사이를 가리키는 게 일반적이라 추측.
      const depId = folderRef?.id ?? `${docNode.kind}:${depSlug}`;
      if (!nodes.has(depId)) {
        nodes.set(depId, {
          id: depId,
          title: folderRef?.title ?? dep,
          display: deriveDisplayTitle(undefined, folderRef?.title ?? dep),
          kind: folderRef?.kind ?? docNode.kind,
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

    // broader[] — is_a edge (상위 개념 / SKOS skos:broader). `이 노드 IS-A 상위`
    // 이므로 from = docNode, to = 상위 개념. Studio 나침 무대의 UP 방위가
    // 채워지면 이 키가 쓰이고, 채워진 뒤엔 실선 strut + 위성으로 그려진다.
    // folder-prefixed ref(`capabilities/foo`)는 실 kind 로 resolve.
    for (const broaderRef of asStringArray(fm.broader)) {
      const folderRef = resolveFolderPrefixedRef(broaderRef);
      const broaderSlug = folderRef
        ? folderRef.id.split(':').at(-1)
        : slugifyName(broaderRef);
      if (!broaderSlug) continue;
      const broaderId = folderRef?.id ?? `${docNode.kind}:${broaderSlug}`;
      if (!nodes.has(broaderId)) {
        nodes.set(broaderId, {
          id: broaderId,
          title: folderRef?.title ?? broaderRef,
          display: deriveDisplayTitle(undefined, folderRef?.title ?? broaderRef),
          kind: folderRef?.kind ?? docNode.kind,
          sourceSlug: doc.slug,
          source: 'frontmatter',
        });
      }
      edges.push({
        id: `${docNode.id}--is_a-->${broaderId}`,
        from: docNode.id,
        to: broaderId,
        type: 'is_a',
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

  // P6 — relation_notes: {ref: "왜"} 를 해당 엣지의 label 로 승격. 키는
  // 선언 문서의 frontmatter ref 표기(canonical slug)와 tail 양쪽을 본다.
  {
    const noteByDoc = new Map<string, Record<string, string>>();
    for (const doc of manifest.docs) {
      const fm = doc.frontmatter as Record<string, unknown>;
      const notes = fm.relation_notes;
      if (notes && typeof notes === 'object' && !Array.isArray(notes)) {
        noteByDoc.set(doc.slug, notes as Record<string, string>);
      }
    }
    if (noteByDoc.size > 0) {
      for (const edge of edges) {
        const notes = noteByDoc.get(edge.sourceSlug);
        if (!notes) continue;
        const toTail = edge.to.split(':').pop() ?? '';
        for (const [ref, why] of Object.entries(notes)) {
          if (typeof why !== 'string' || !why.trim()) continue;
          const refTail = ref.split('/').pop();
          if (ref === toTail || refTail === toTail || slugifyName(ref) === toTail || (refTail && slugifyName(refTail) === toTail)) {
            (edge as { label?: string }).label = why.trim();
            break;
          }
        }
      }
    }
  }



  return {
    nodes: Array.from(nodes.values()),
    edges: Array.from(dedupedById.values()),
    sourceConceptCount,
    sourceKindCounts,
    warnings,
  };
}

// Module-level memoization keyed by `manifest` object identity (perf sweep,
// 2026-07). `useVaultOntology`/`useOntologyInsight` used to wrap this call in
// a component-scoped `useMemo` only — every route that mounts a fresh
// component tree (`/`, `/topology`, `/projects`, `/ontology/insights`, …)
// lost that cache on unmount and re-ran the full doc scan/BFS from scratch
// even when navigating back to the SAME loaded vault (`vault.manifest`
// reference unchanged). A `WeakMap` keyed by the manifest reference survives
// across mounts while staying leak-free (entry drops once the manifest
// itself is GC'd) and preserves the freshness contract for free — a new
// vault load / file edit produces a NEW manifest object, so the cache misses
// and recomputes exactly when the data actually changed. Static dogfood mode
// keeps its own already-eager `STATIC_DERIVATION` (see
// `use-ontology-insight.ts`) which naturally hits this same cache too.
const derivationCache = new WeakMap<VaultManifest, VaultOntologyDerivation>();

export function deriveOntologyFromVault(
  manifest: VaultManifest,
): VaultOntologyDerivation {
  const cached = derivationCache.get(manifest);
  if (cached) return cached;
  const derivation = deriveOntologyFromVaultUncached(manifest);
  derivationCache.set(manifest, derivation);
  return derivation;
}
