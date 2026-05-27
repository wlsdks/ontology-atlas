import type { KnowledgeGraphNode } from "../model";

/**
 * Ontology view 의 노드 deeplink 빌더 — `/ontology/?node=<encoded-id>`.
 *
 * 호출자: NodeDetailPanel "노드 링크 복사" / OntologyInsightsPage 의 카드
 * 링크 / GlobalSearch 결과 / ProjectDrawer 의 'open in ontology' / docs
 * viewer 의 kind chip 등 7+ surface. 한 곳에서 정의해 형식이 흩어지지
 * 않게 한다 — `?node=` query key 와 encodeURIComponent 가짜의 일관성을
 * OntologyViewPage 의 deeplinkNodeId 파서와 깨지지 않게 보장.
 */
export function buildOntologyNodeHref(nodeId: string): string {
  return `/ontology/?node=${encodeURIComponent(nodeId)}`;
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

export function buildOntologyBuilderNodeHrefFromGraphId(nodeId: string): string {
  return `/ontology/edit/?node=${encodeURIComponent(
    resolveOntologyBuilderNodeSlugFromGraphId(nodeId),
  )}`;
}

export function resolveOntologyBuilderNodeSlug(
  node: KnowledgeGraphNode,
): string {
  const sourceSlug = node.evidenceIds[0]?.replace(/^ontology\//, "").trim();
  if (sourceSlug) return sourceSlug;

  return resolveOntologyBuilderNodeSlugFromGraphId(node.id);
}

export function buildOntologyBuilderNodeHref(
  node: KnowledgeGraphNode,
): string {
  return `/ontology/edit/?node=${encodeURIComponent(
    resolveOntologyBuilderNodeSlug(node),
  )}`;
}

export function buildOntologyInsightsNodeHref(
  node: KnowledgeGraphNode,
): string {
  return `/ontology/insights/?node=${encodeURIComponent(
    resolveOntologyBuilderNodeSlug(node),
  )}`;
}
