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
 * 스튜디오 딥링크 발신자 (지도·인사이트·팝오버 → `/ontology/studio`) — URL
 * 계약의 공통 id 문법인 canonical `<kind>:<slug>` 를 실어 보낸다. 은퇴한 ERD
 * 빌더(`/ontology/edit`)를 대체한 나침 무대(Compass Stage)가 이 `?node=` 를
 * 받아 해당 노드를 ENHANCE 모드로 열고 관계 소켓을 채우게 한다.
 *
 * `translateOntologyDeeplinkToTopologyParam` 로 정규화하는 이유: 입력이 이미
 * canonical(`capability:foo`)이면 그대로, 복수-슬래시(`capabilities/foo`)면
 * `capability:foo` 로 승격, bare/evidence-path 는 통과 — 스튜디오의
 * `n.id === requestedNode` 매칭이 두 문법 모두에서 성립하도록 한 문법으로
 * 수렴한다(지도 `?p=`·온톨로지 리다이렉트와 같은 정규화기 재사용).
 */
export function buildOntologyStudioNodeHrefFromGraphId(nodeId: string): string {
  return `/ontology/studio/?node=${encodeURIComponent(
    translateOntologyDeeplinkToTopologyParam(nodeId),
  )}`;
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
