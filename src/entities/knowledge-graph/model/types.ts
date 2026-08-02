/**
 * Canonical edge type union — vault frontmatter array key (capabilities /
 * elements / dependencies / relates / contains / describes 등) 와 ontology
 * relation 의 7 종 표준값.
 *
 * 카테고리 (참고용):
 *   structure: `contains`, `belongs_to` (트리 구조)
 *   behavior:  `depends_on`, `implements`, `uses` (동작)
 *   evidence:  `describes` (document → 개념)
 *   weak:      `related_to` (약 연관)
 *   taxonomy:  `is_a` (상위 개념 — SKOS skos:broader, frontmatter `broader:`)
 *
 * `KnowledgeGraphEdge.type` 자체는 backwards-compat 으로 `string` 을 유지.
 * 타입드 writer / typed reader 가 필요한 경우 이 union 을 사용한다.
 */
export type KnowledgeEdgeType =
  | 'contains'
  | 'belongs_to'
  | 'depends_on'
  | 'implements'
  | 'uses'
  | 'describes'
  | 'related_to'
  | 'is_a';

/** Runtime 검증·iteration 용 — 위 union 과 1:1 일치. */
export const KNOWLEDGE_EDGE_TYPES: readonly KnowledgeEdgeType[] = [
  'contains',
  'belongs_to',
  'depends_on',
  'implements',
  'uses',
  'describes',
  'related_to',
  'is_a',
] as const;

/**
 * 나침 무대(`/ontology/studio` CREATE) 가 손으로 만들 수 있는 ontology 노드
 * kind. document kind 는 frontmatter 진실원에서 derive 되므로 사용자가 직접
 * 만드는 대상이 아니다 — 본 union 에 포함되지 않는다.
 */
export type ManualNodeKind = 'project' | 'domain' | 'capability' | 'element';

export interface KnowledgeGraphNode {
  id: string;
  title: string;
  /**
   * 표시용 짧은 제목 — 과제 ⑩ (표시 이름 레이어). `deriveDisplayTitle` 로
   * 파생 (frontmatter `display:` 필드 우선, 없으면 title 의 괄호 부연
   * 설명 컷). 토폴로지 라벨 / INDEX 행 / 팝오버 / 상세 헤더 렌더 표면은
   * `node.display ?? node.title` 로 읽는다. 매칭의 단일 진실원은 여전히
   * `title` 이지만, 화면에 보이는 이름은 검색 범위에 **더해진다**
   * (`shared/lib/node-name-match`) — 눈으로 읽은 이름을 그대로 쳤을 때 0건이
   * 나오면 사용자는 데이터가 없다고 믿는다. optional 인 이유:
   * `derivationToInsight` 를 거치지 않고 직접 만든 노드(테스트 픽스처, 빌더
   * 등)와의 하위 호환.
   */
  display?: string;
  /**
   * `display_<locale>` 원본 전체 (locale → 이름). `display` 는 현재 화면
   * 로케일 하나로 좁혀진 값이라, 다른 언어 이름으로도 찾히려면 원본이
   * 필요하다 — 검색은 여기 값 전부를 이름으로 취급한다.
   */
  displayLocales?: Readonly<Record<string, string>>;
  kind: string;
  projectIds: string[];
  summary?: string;
  evidenceIds: string[];
  /**
   * 이 노드가 자기 `.md` 문서를 가졌는지. `evidenceIds[0]` 은 문서 노드면
   * 자기 slug, 관계에서만 이름이 불린 파생 노드면 *자기를 인용한 남의 문서*
   * slug 라 그 값만으로는 둘을 구분할 수 없다 — "이 노드의 문서 열기" 를
   * 그리는 표면은 반드시 이 필드로 갈라야 남의 문서를 자기 문서인 양 열지
   * 않는다(`resolveNodeDocument` 참조).
   *
   * optional 인 이유: `derivationToInsight` 를 거치지 않고 직접 만든 노드
   * (테스트 픽스처, 수동 조립 등)와의 하위 호환 — 미지정은 `true` 로 읽는다.
   */
  hasOwnDocument?: boolean;
  /**
   * 이 노드를 **에이전트에게 가리켜 보일 때 쓰는 이름** — MCP/CLI 가 그대로
   * 받아들이는 볼트 기준 문자열.
   *
   * 문서가 있는 노드면 볼트 뿌리 기준 문서 slug, 문서가 없는 파생 노드면
   * 볼트가 적어 둔 참조 원문(`src/entities/…​.ts`)이다. `evidenceIds[0]` 을
   * 그대로 쓰면 안 되는 이유가 둘 있다: ① 번들 샘플 매니페스트는 `docs/` 를
   * 뿌리로 빌드돼 온톨로지 문서가 `ontology/` 아래에 있고 에이전트가 물린
   * 볼트 뿌리는 `docs/ontology` 라 한 조각이 남는다(2026-07-26 실측: 화면이
   * 복사해 준 `merge_concepts` 가 그 한 조각 때문에 즉시 실패했다) ②
   * 파생 노드에서는 그 값이 *남의 문서* 라 엉뚱한 노드를 가리킨다.
   *
   * optional 인 이유: `derivationToInsight` 를 거치지 않고 직접 만든 노드
   * (테스트 픽스처 · 수동 조립)와의 하위 호환 — 미지정은 종전대로
   * `evidenceIds[0]` 로 읽는다(`resolveNodeAgentTarget` 참조).
   */
  agentSlug?: string | null;
  /**
   * 문서가 없는 파생 노드가 볼트에 적혀 있는 참조 원문. 문서 노드는 비어 있다.
   * `derive-ontology-from-vault.ts` 의 같은 이름 필드가 그대로 넘어온다.
   */
  ref?: string;
  lastApprovedAt: Date;
  lastApprovedBy: string;
  /**
   * **누가 이 노드를 썼나** — `human` 또는 `agent:<name>` (2026-07-31 원장의
   * 값 규약, `mcp/src/schema.mjs`).
   *
   * 부재는 결함이 아니라 **unknown** 이다. 소급 추론(「로그 없음 = 사람」·git
   * blame)으로는 출처가 존재하지 않으므로, 어떤 경로도 부재를 `human` 으로
   * 기본값 처리하지 않는다 — 화면은 값이 **정확히** `human` 일 때만 검수
   * 표시를 그린다.
   */
  createdBy?: string;
}

export interface KnowledgeGraphEdge {
  id: string;
  from: string;
  to: string;
  type: string;
  label?: string;
  projectIds: string[];
  evidenceIds: string[];
  lastApprovedAt: Date;
  lastApprovedBy: string;
}

export interface KnowledgeProjectInsight {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  sourceConceptCount?: number;
  sourceKindCounts?: Record<string, number>;
}
