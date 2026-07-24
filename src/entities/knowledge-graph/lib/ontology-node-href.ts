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
  options?: { via?: string },
): string {
  const base = `/ontology/?node=${encodeURIComponent(nodeId)}`;
  return options?.via
    ? `${base}&${ONTOLOGY_DEEPLINK_VIA_KEY}=${encodeURIComponent(options.via)}`
    : base;
}

/** 딥링크 출처 마커의 query key — insights → redirect → topology 3-hop 공유. */
export const ONTOLOGY_DEEPLINK_VIA_KEY = "via";

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

/** 복귀 칩 클릭이 향하는 곳 — 원래 보던 인사이트 탭. */
export function buildOntologyInsightsReturnHref(tab: string): string {
  return `/ontology/insights/?tab=${encodeURIComponent(tab)}`;
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
 * 공방 딥링크 발신자 (지도·인사이트·팝오버 → `/ontology/studio`) — URL
 * 계약의 공통 id 문법인 canonical `<kind>:<slug>` 를 실어 보낸다. 은퇴한 ERD
 * 빌더(`/ontology/edit`)를 대체한 나침 무대(Compass Stage)가 이 `?node=` 를
 * 받아 해당 노드를 ENHANCE 모드로 열고 관계 소켓을 채우게 한다.
 *
 * `translateOntologyDeeplinkToTopologyParam` 로 정규화하는 이유: 입력이 이미
 * canonical(`capability:foo`)이면 그대로, 복수-슬래시(`capabilities/foo`)면
 * `capability:foo` 로 승격, bare/evidence-path 는 통과 — 공방의
 * `n.id === requestedNode` 매칭이 두 문법 모두에서 성립하도록 한 문법으로
 * 수렴한다(지도 `?p=`·온톨로지 리다이렉트와 같은 정규화기 재사용).
 */
export function buildOntologyStudioNodeHrefFromGraphId(nodeId: string): string {
  return `/ontology/studio/?node=${encodeURIComponent(
    translateOntologyDeeplinkToTopologyParam(nodeId),
  )}`;
}

/**
 * 공방(Compass Stage) 편집 딥링크의 canonical 관계 키 — 네 개의 편집 가능한
 * 나침 방향(bearing). `views/ontology-studio` 의 `StudioRelation` 과 문자열이
 * 동일하다: 지도(`views/home`)와 공방(`views/ontology-studio`) 두 뷰가 서로를
 * import 하지 않고 이 entity 레이어의 브리지를 통해 같은 어휘를 공유하도록
 * 여기(한 단계 아래)에 정의한다 (FSD view→view import 금지).
 */
export type StudioEditRelation = "isA" | "dependsOn" | "contains" | "relates";
const STUDIO_EDIT_RELATIONS: readonly StudioEditRelation[] = [
  "isA",
  "dependsOn",
  "contains",
  "relates",
];

/**
 * 지도 엣지의 relationType(derive-ontology edge `type`)을 공방의 편집 가능한
 * bearing 관계로 매핑한다. 네 bearing 밖의 타입(`describes`, `belongs_to`,
 * 도메인 멤버십 등)은 null → "공방에서 고치기" 액션을 노출하지 않는다(dead
 * affordance 금지). `dependencies`/`relates` 등 프론트매터 키 별칭도 관용적으로 흡수.
 */
export function studioEditRelationForEdgeType(
  edgeType: string,
): StudioEditRelation | null {
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
export const ONTOLOGY_STUDIO_EDIT_KEY = "edit";

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
 * 공방 엣지 딥링크 발신자 (지도 엣지 선택 → `/ontology/studio`). Focal(`?node=`)
 * 은 관계를 authored 한 노드(네 bearing 모두 엣지의 `from`), `edit=<relation>:
 * <targetId>` 은 공방에 "그 관계의 편집 카드를 열고 위성을 강조하라"고 지시한다.
 * 두 id 는 노드 변형과 동일하게 canonical `<kind>:<slug>` 로 정규화한다.
 *
 * `edit` 값은 target id 안의 `kind:slug` 콜론과 구분되도록 relation 뒤 첫
 * 콜론으로만 나뉜다(소비자 `parseOntologyStudioEditParam` 가 첫 콜론 split).
 */
export function buildOntologyStudioEdgeHref(
  fromId: string,
  toId: string,
  relation: StudioEditRelation,
): string {
  const focal = translateOntologyDeeplinkToTopologyParam(fromId);
  const target = translateOntologyDeeplinkToTopologyParam(toId);
  return `/ontology/studio/?node=${encodeURIComponent(
    focal,
  )}&${ONTOLOGY_STUDIO_EDIT_KEY}=${relation}:${encodeURIComponent(target)}`;
}

/**
 * `edit=<relation>:<targetId>` 파싱 (공방 소비자). target 자신의 `kind:slug`
 * 콜론을 보존하도록 **첫 콜론**으로만 나눈다. 값이 없거나(null) 형식이
 * 어긋나거나 relation 이 네 bearing 밖이면 null — 공방은 그때 카드 없이 focal
 * 노드만 보여준다.
 */
export function parseOntologyStudioEditParam(
  raw: string | null | undefined,
): { relation: StudioEditRelation; targetId: string } | null {
  if (!raw) return null;
  const colon = raw.indexOf(":");
  if (colon <= 0) return null;
  const relation = raw.slice(0, colon);
  const targetId = raw.slice(colon + 1).trim();
  if (!targetId) return null;
  if (!STUDIO_EDIT_RELATIONS.includes(relation as StudioEditRelation)) return null;
  return { relation: relation as StudioEditRelation, targetId };
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
