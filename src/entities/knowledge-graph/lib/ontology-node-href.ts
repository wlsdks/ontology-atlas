import type { KnowledgeGraphNode } from "../model";
import { translateOntologyDeeplinkToTopologyParam } from "./translate-ontology-deeplink";

/**
 * `/ontology/?node=<encoded-id>`, encoded like `translateOntologyDeeplinkToTopologyParam`.
 * `options.via` is an origin marker from `buildInsightsReturnMarker`.
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
  // Only the ask kind travels in the URL; the destination writes the sentence in its language.
  if (options?.ask) {
    params.push(`${ONTOLOGY_DEEPLINK_ASK_KEY}=${encodeURIComponent(options.ask)}`);
  }
  return params.length > 0 ? `${base}&${params.join("&")}` : base;
}

/** The `ask` value meaning "explain the whole product". */
export const BUSINESS_FLOW_ASK_VALUE = "business-flow";

/** Query key for the deeplink origin marker. */
export const ONTOLOGY_DEEPLINK_VIA_KEY = "via";
/** The insights review row id; read only with a valid `via` marker. */
export const ONTOLOGY_DEEPLINK_REVIEW_KEY = "review";
/** The kind of opening line for the agent; stripped from the address on arrival. */
export const ONTOLOGY_DEEPLINK_ASK_KEY = "ask";

const INSIGHTS_RETURN_MARKER_PATTERN = /^insights:([a-z][a-z0-9-]*)$/;

export function buildInsightsReturnMarker(tab: string): string {
  return `insights:${tab}`;
}

/** `insights:<slug>` → slug, else null; the destination validates the slug. */
export function parseInsightsReturnMarker(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const match = INSIGHTS_RETURN_MARKER_PATTERN.exec(raw);
  return match ? match[1] : null;
}

const TOPOLOGY_RETURN_MARKER_PATTERN = /^topology:(.+)$/;

/** The map node to return to from `/docs/`; full-detail state is not addressable, so the node is selected. */
export function buildTopologyReturnMarker(nodeId: string): string {
  return `topology:${translateOntologyDeeplinkToTopologyParam(nodeId)}`;
}

export function parseTopologyReturnMarker(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const match = TOPOLOGY_RETURN_MARKER_PATTERN.exec(raw);
  return match ? match[1] : null;
}

export function buildTopologyReturnHref(nodeId: string): string {
  return `/topology/?p=${encodeURIComponent(
    translateOntologyDeeplinkToTopologyParam(nodeId),
  )}`;
}

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

/** Map editor link with the canonical `<kind>:<slug>` in `?p=`, normalized like the map's own `?p=`. */
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

/** The four relations the map's editor can write. */
export type MeaningEditRelation = "isA" | "dependsOn" | "contains" | "relates";
const MEANING_EDIT_RELATIONS: readonly MeaningEditRelation[] = [
  "isA",
  "dependsOn",
  "contains",
  "relates",
];

/** A map edge type → editable relation, or null so no dead edit affordance is shown. */
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

const ONTOLOGY_MEANING_EDIT_KEY = "edit";

/**
 * Whether the `from` node's document declares the edge. A `contains` derived from a child's
 * `domain:` is authored by `to` and cannot be edited as `contains`.
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

/** Map edge editor link; `edit=<relation>:<targetId>` splits on the first colon only. */
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

/** Parses `edit=<relation>:<targetId>` on the first colon; null for anything else. */
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
