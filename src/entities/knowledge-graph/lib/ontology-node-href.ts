import type { KnowledgeGraphNode } from "../model";
import { translateOntologyDeeplinkToTopologyParam } from "./translate-ontology-deeplink";

/**
 * Builds the ontology view's node deeplink — `/ontology/?node=<encoded-id>`.
 *
 * Seven-plus surfaces call this (node detail "copy node link", insights cards,
 * global search results, the project drawer, the docs viewer's kind chip).
 * Defining it once keeps the `?node=` key and the encoding consistent with
 * `translateOntologyDeeplinkToTopologyParam`, which the redirect page uses.
 *
 * `options.via` is the origin marker (`?via=insights:<tab>`). When the insights
 * page stamps its own tab onto a map deeplink, the map reads it back and renders
 * a "return to insights" chip. The marker grammar's single source is the
 * build/parseInsightsReturnMarker pair below.
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
  // The **kind of intent** carried over when a queue row says "ask the agent".
  // The sentence itself is deliberately not in the URL: the destination's opening-line
  // generator writes it in the screen's language. Carrying only the kind means both
  // entry points pass through the same function, and no human sentence ends up in an address.
  if (options?.ask) {
    params.push(`${ONTOLOGY_DEEPLINK_ASK_KEY}=${encodeURIComponent(options.ask)}`);
  }
  return params.length > 0 ? `${base}&${params.join("&")}` : base;
}

/**
 * The `ask` value meaning "explain the whole product". Owned here beside the
 * builder that writes it, so the link and the route that reads it cannot drift
 * apart into two spellings of the same intent.
 */
export const BUSINESS_FLOW_ASK_VALUE = "business-flow";

/** Query key for the deeplink origin marker — shared across insights → redirect → topology. */
export const ONTOLOGY_DEEPLINK_VIA_KEY = "via";
/** The exact insights "to do" review row id — consumed only alongside a valid `via` marker. */
export const ONTOLOGY_DEEPLINK_REVIEW_KEY = "review";
/** The **kind** of opening line to hand the agent — consumed on arrival and stripped from the address. */
export const ONTOLOGY_DEEPLINK_ASK_KEY = "ask";

const INSIGHTS_RETURN_MARKER_PATTERN = /^insights:([a-z][a-z0-9-]*)$/;

/** Serializes the `via=insights:<tab>` marker. Producer side (the insights page) only. */
export function buildInsightsReturnMarker(tab: string): string {
  return `insights:${tab}`;
}

/**
 * Raw `via` value → insights tab slug. Anything that is not the `insights:<slug>`
 * grammar returns null, and the map then renders no chip. Validity of the slug
 * itself is checked at the destination (`parseInsightsTab`), which falls back to
 * the default tab.
 */
export function parseInsightsReturnMarker(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const match = INSIGHTS_RETURN_MARKER_PATTERN.exec(raw);
  return match ? match[1] : null;
}

/** Where the return chip goes — the insights tab and review row the user came from. */
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
 * Sender for the map's contextual-editor deeplink: puts the canonical
 * `<kind>:<slug>` id in `?p=` and opens `workbench=edit`.
 *
 * Normalizing through `translateOntologyDeeplinkToTopologyParam` converges both
 * grammars onto one: already-canonical (`capability:foo`) passes through, a
 * folder form (`capabilities/foo`) is promoted to `capability:foo`, and bare or
 * evidence-path ids pass through — so the map's `n.id === requestedNode` match
 * holds either way. Same normalizer as the map's `?p=` and the ontology redirect.
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
 * The four relations the map's contextual editor can write. URL, preview, and
 * frontmatter writing share this one vocabulary at the entity layer so separate
 * surfaces never define it in parallel.
 */
export type MeaningEditRelation = "isA" | "dependsOn" | "contains" | "relates";
const MEANING_EDIT_RELATIONS: readonly MeaningEditRelation[] = [
  "isA",
  "dependsOn",
  "contains",
  "relates",
];

/**
 * Maps a map edge's relationType (the derive-ontology edge `type`) onto an
 * editable relation. Anything outside the four (`describes`, `belongs_to`,
 * domain membership) returns null, so no "edit on the map" affordance is shown —
 * a dead affordance is worse than none. Frontmatter key aliases such as
 * `dependencies` / `relates` are absorbed here too.
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

/** Query key for a deeplink's edit target — `edit=<relation>:<targetId>`. */
const ONTOLOGY_MEANING_EDIT_KEY = "edit";

/**
 * Is edge A→B really authored in the `from` node's frontmatter — i.e. does
 * `declaredBySlug` (the declaring doc, `edge.evidenceIds[0]`) equal the `from`
 * node's source slug (`node.evidenceIds[0]`)? For all four bearing relations the
 * `from` of the canonical direction is the author. The one exception is a
 * `contains` edge derived backwards from a child's `domain:` key, where the author
 * is the `to` node; that cannot be edited as a `contains` bearing, so the action
 * must not appear. This function filters that case out. Both slugs are compared
 * with any `ontology/` prefix stripped, so the dogfood vault and a local vault match.
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
 * Sender for a map edge deeplink. The focal (`?p=`) is the node that authored the
 * relation; `edit=<relation>:<targetId>` hands the relation and target to the
 * editor on the same map. Both ids are normalized to canonical `<kind>:<slug>`
 * exactly as in the node variant.
 *
 * The `edit` value splits on the **first** colon only, so the target's own
 * `kind:slug` colon survives (`parseOntologyMeaningEditParam` splits the same way).
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
 * Parses `edit=<relation>:<targetId>`, splitting on the **first** colon so the
 * target's own `kind:slug` colon is preserved. Returns null when the value is
 * absent, malformed, or names a relation outside the four editable types.
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
