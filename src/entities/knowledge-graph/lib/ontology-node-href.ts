import type { KnowledgeGraphNode } from "../model";
import { translateOntologyDeeplinkToTopologyParam } from "./translate-ontology-deeplink";

/**
 * Ontology view 의 노드 deeplink 빌더 — `/ontology/?node=<encoded-id>`.
 *
 * 호출자: NodeDetailPanel "노드 링크 복사" / OntologyInsightsPage 의 카드
 * 링크 / GlobalSearch 결과 / ProjectDrawer 의 'open in ontology' / docs
 * viewer 의 kind chip 등 7+ surface. 한 곳에서 정의해 형식이 흩어지지
 * 않게 한다 — `?node=` query key 와 encodeURIComponent 가짜의 일관성을
 * OntologyRedirectPage 의 딥링크 번역(translateOntologyDeeplinkToTopologyParam)과 깨지지 않게 보장.
 *
 * `options.via` — 출처 마커 (`?via=insights:<tab>`). 인사이트 페이지가 지도
 * 딥링크에 자기 탭을 새겨 두면, 지도(`/topology`, HomePage)가 그 마커를 읽어
 * "인사이트로 돌아가기" 복귀 칩을 렌더한다. OntologyRedirectPage 가 이 키를
 * `/topology` 로 그대로 전달한다 — 마커 문법의 진실원은 아래
 * build/parseInsightsReturnMarker 한 쌍.
 */
export function buildOntologyNodeHref(
  nodeId: string,
  options?: { via?: string; reviewId?: string; ask?: string },
): string {
  const base = `/ontology/?node=${encodeURIComponent(nodeId)}`;
  const params: string[] = [];
  if (options?.via) {
    params.push(
      `${ONTOLOGY_DEEPLINK_VIA_KEY}=${encodeURIComponent(options.via)}`,
    );
  }
  if (options?.via && options.reviewId) {
    params.push(
      `${ONTOLOGY_DEEPLINK_REVIEW_KEY}=${encodeURIComponent(options.reviewId)}`,
    );
  }
  // S7 이음새 — 큐 행에서 「에이전트에게 말로 시키기」로 건너올 때 실려 오는
  // **의도의 종류**다. 문장 자체를 URL 에 싣지 않는 이유: 문장은 도착지에서
  // 첫 마디 생성기가 화면 언어로 짓는다. 종류만 나르면 두 입구가 같은 함수를
  // 지나므로 갈라질 자리가 없고, 주소에 사람이 읽을 문장이 남지도 않는다.
  if (options?.ask) {
    params.push(`${ONTOLOGY_DEEPLINK_ASK_KEY}=${encodeURIComponent(options.ask)}`);
  }
  return params.length > 0 ? `${base}&${params.join("&")}` : base;
}

/** 딥링크 출처 마커의 query key — insights → redirect → topology 3-hop 공유. */
export const ONTOLOGY_DEEPLINK_VIA_KEY = "via";
/** 인사이트 `할 일`의 정확한 검토 행 id — 유효한 via 마커와 함께만 소비한다. */
export const ONTOLOGY_DEEPLINK_REVIEW_KEY = "review";
/** 에이전트에게 건넬 첫 마디의 **종류** — 도착 즉시 소비하고 주소에서 지운다. */
export const ONTOLOGY_DEEPLINK_ASK_KEY = "ask";

const INSIGHTS_RETURN_MARKER_PATTERN = /^insights:([a-z][a-z0-9-]*)$/;

/** `via=insights:<tab>` 마커 직렬화 — 인사이트 페이지(생산자) 전용. */
export function buildInsightsReturnMarker(tab: string): string {
  return `insights:${tab}`;
}

/**
 * `via` raw 값 → 인사이트 탭 slug. 마커 문법(`insights:<slug>`)이 아니면
 * null — 지도는 칩을 렌더하지 않고 마커를 무시한다. 탭 slug 자체의 유효성은
 * 도착지(`parseInsightsTab`)가 검증한다(모르는 탭 → 기본 탭 fallback).
 */
export function parseInsightsReturnMarker(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const match = INSIGHTS_RETURN_MARKER_PATTERN.exec(raw);
  return match ? match[1] : null;
}

/** 복귀 칩 클릭이 향하는 곳 — 원래 보던 인사이트 탭과 검토 행. */
export function buildOntologyInsightsReturnHref(
  tab: string,
  reviewId?: string | null,
): string {
  const params = new URLSearchParams({ tab });
  if (reviewId) params.set(ONTOLOGY_DEEPLINK_REVIEW_KEY, reviewId);
  return `/ontology/insights/?${params.toString()}`;
}

const KIND_TO_VAULT_FOLDER: Record<string, string> = {
  domain: "domains",
  capability: "capabilities",
  element: "elements",
};

export function resolveOntologyBuilderNodeSlugFromGraphId(nodeId: string): string {
  const normalized = nodeId.trim().replace(/^\/+/, "").replace(/^ontology\//, "");
  if (!normalized) return normalized;
  if (normalized.includes("/")) return normalized;

  const [kind, ...tailParts] = normalized.split(":");
  const tail = tailParts.join(":").trim();
  if (!tail) return normalized;
  if (kind === "project") return tail;

  const folder = KIND_TO_VAULT_FOLDER[kind];
  return folder ? `${folder}/${tail}` : normalized;
}

/**
 * 지도 contextual editor 딥링크 발신자 — URL 계약의 공통 id 문법인
 * canonical `<kind>:<slug>` 를 `?p=`에 싣고 `workbench=edit`를 연다.
 *
 * `translateOntologyDeeplinkToTopologyParam` 로 정규화하는 이유: 입력이 이미
 * canonical(`capability:foo`)이면 그대로, 복수-슬래시(`capabilities/foo`)면
 * `capability:foo` 로 승격, bare/evidence-path 는 통과 — 지도의
 * `n.id === requestedNode` 매칭이 두 문법 모두에서 성립하도록 한 문법으로
 * 수렴한다(지도 `?p=`·온톨로지 리다이렉트와 같은 정규화기 재사용).
 */
export function buildTopologyMeaningEditorNodeHref(
  nodeId: string,
  options?: { via?: string | null; reviewId?: string | null },
): string {
  const base = `/topology/?p=${encodeURIComponent(
    translateOntologyDeeplinkToTopologyParam(nodeId),
  )}&workbench=edit`;
  const params: string[] = [];
  if (options?.via) {
    params.push(
      `${ONTOLOGY_DEEPLINK_VIA_KEY}=${encodeURIComponent(options.via)}`,
    );
  }
  if (options?.via && options.reviewId) {
    params.push(
      `${ONTOLOGY_DEEPLINK_REVIEW_KEY}=${encodeURIComponent(options.reviewId)}`,
    );
  }
  return params.length > 0 ? `${base}&${params.join("&")}` : base;
}

/**
 * 지도 contextual editor가 다루는 네 관계. URL, 미리보기, frontmatter 쓰기가
 * 이 entity 레이어의 한 어휘를 공유하므로 서로 다른 표면이 병렬 정의하지 않는다.
 */
export type MeaningEditRelation = "isA" | "dependsOn" | "contains" | "relates";
const MEANING_EDIT_RELATIONS: readonly MeaningEditRelation[] = [
  "isA",
  "dependsOn",
  "contains",
  "relates",
];

/**
 * 지도 엣지의 relationType(derive-ontology edge `type`)을 편집 가능한 관계로
 * 매핑한다. 네 타입 밖의 값(`describes`, `belongs_to`, 도메인 멤버십 등)은
 * null → "지도에서 고치기" 액션을 노출하지 않는다(dead
 * affordance 금지). `dependencies`/`relates` 등 프론트매터 키 별칭도 관용적으로 흡수.
 */
export function meaningEditRelationForEdgeType(
  edgeType: string,
): MeaningEditRelation | null {
  switch (edgeType) {
    case "is_a":
      return "isA";
    case "depends_on":
    case "dependencies":
      return "dependsOn";
    case "contains":
      return "contains";
    case "related_to":
    case "relates":
    case "uses":
    case "implements":
      return "relates";
    default:
      return null;
  }
}

/** 딥링크 편집 타깃의 query key — `edit=<relation>:<targetId>`. */
export const ONTOLOGY_MEANING_EDIT_KEY = "edit";

/**
 * 엣지 A→B 가 정말 `from` 노드의 프론트매터에서 authored 됐는가 —
 * `declaredBySlug`(선언 doc slug = edge.evidenceIds[0])가 `from` 노드의 source
 * slug(node.evidenceIds[0])와 일치하는가. 네 bearing 관계는 canonical edge
 * 방향의 `from` 이 저자다. 유일한 예외는 자식의 `domain:` 에서 역파생된
 * `contains` 엣지(저자 = `to` = 자식)로, 이건 `contains:` bearing 으로 편집할
 * 수 없으니 액션을 노출하면 안 된다 — 이 함수가 그 경우를 걸러낸다. 두 slug
 * 모두 `ontology/` prefix 를 벗겨 비교(도그푸드 `ontology/…` 와 로컬 vault
 * `…` 형식이 일치하도록).
 */
export function edgeAuthoredByFromNode(
  declaredBySlug: string | null | undefined,
  fromEvidenceSlug: string | null | undefined,
): boolean {
  if (!declaredBySlug || !fromEvidenceSlug) return false;
  const a = declaredBySlug.replace(/^ontology\//, "").trim();
  const b = fromEvidenceSlug.replace(/^ontology\//, "").trim();
  return a !== "" && a === b;
}

/**
 * 지도 엣지 딥링크 발신자. Focal(`?p=`)은 관계를 authored 한 노드,
 * `edit=<relation>:<targetId>` 은 같은 지도 안 편집기에 관계와 타깃을 전달한다.
 * 두 id 는 노드 변형과 동일하게 canonical `<kind>:<slug>` 로 정규화한다.
 *
 * `edit` 값은 target id 안의 `kind:slug` 콜론과 구분되도록 relation 뒤 첫
 * 콜론으로만 나뉜다(소비자 `parseOntologyMeaningEditParam` 가 첫 콜론 split).
 */
export function buildTopologyMeaningEditorEdgeHref(
  fromId: string,
  toId: string,
  relation: MeaningEditRelation,
): string {
  const focal = translateOntologyDeeplinkToTopologyParam(fromId);
  const target = translateOntologyDeeplinkToTopologyParam(toId);
  return `/topology/?p=${encodeURIComponent(
    focal,
  )}&workbench=edit&${ONTOLOGY_MEANING_EDIT_KEY}=${relation}:${encodeURIComponent(target)}`;
}

export function buildTopologyMeaningCreateHref(): string {
  return "/topology/?workbench=create";
}

/**
 * `edit=<relation>:<targetId>` 파싱. target 자신의 `kind:slug`
 * 콜론을 보존하도록 **첫 콜론**으로만 나눈다. 값이 없거나(null) 형식이
 * 어긋나거나 relation 이 네 편집 타입 밖이면 null이다.
 */
export function parseOntologyMeaningEditParam(
  raw: string | null | undefined,
): { relation: MeaningEditRelation; targetId: string } | null {
  if (!raw) return null;
  const colon = raw.indexOf(":");
  if (colon <= 0) return null;
  const relation = raw.slice(0, colon);
  const targetId = raw.slice(colon + 1).trim();
  if (!targetId) return null;
  if (!MEANING_EDIT_RELATIONS.includes(relation as MeaningEditRelation)) return null;
  return { relation: relation as MeaningEditRelation, targetId };
}

export function resolveOntologyBuilderNodeSlug(
  node: KnowledgeGraphNode,
): string {
  if (node.kind === "project" && node.id.startsWith("project:")) {
    return resolveOntologyBuilderNodeSlugFromGraphId(node.id);
  }

  const sourceSlug = node.evidenceIds[0]?.replace(/^ontology\//, "").trim();
  if (sourceSlug) return sourceSlug;

  return resolveOntologyBuilderNodeSlugFromGraphId(node.id);
}

export function buildOntologyInsightsNodeHref(
  node: KnowledgeGraphNode,
): string {
  return `/ontology/insights/?node=${encodeURIComponent(
    resolveOntologyBuilderNodeSlug(node),
  )}`;
}
