import {
  PROMOTION_MIN_FAN_IN,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import type { TopologyOntologyDrawerModel } from "./topology-ontology-drawer";

/**
 * How load-bearing a node is, in plain terms a non-developer can read:
 * - `core`: many places depend on it (fan-in >= {@link PROMOTION_MIN_FAN_IN}) —
 *   the "핵심 축".
 * - `leaf`: barely connected (total degree <= 1) — a말단 조각.
 * - `supporting`: everything in between.
 */
export type NodeSignificanceLevel = "core" | "supporting" | "leaf";

/**
 * Plain-language "so what" of a single node, *derived* from graph data that
 * already exists (degree, transitive reach, owning domain, neighbours). No new
 * authoring required — works on any bootstrapped vault. The UI turns this
 * structured model into i18n sentences; this module stays prose-free so it is
 * locale-agnostic and unit-testable on structure alone.
 *
 * approach C: an authored `significance` frontmatter override (when present)
 * wins for the "why it matters" line via {@link buildNodeSignificance} options.
 */
export interface NodeSignificanceModel {
  /** Raw kind token — UI resolves via `t("kinds.{key}")`; see {@link normalizeKindLabelKey}. */
  kind: string;
  /** Owning domain title for the "무엇인가" line, or null when none. */
  ownerDomainTitle: string | null;
  importance: {
    level: NodeSignificanceLevel;
    /** Direct incoming = how many places depend on it. */
    usedByCount: number;
    /** Authored override prose (trimmed) for the "왜 중요한가" line; null when derived. */
    authored: string | null;
  };
  dependsOn: {
    /** Direct outgoing count (authoritative). */
    count: number;
    /** Up to `nameLimit` outgoing neighbour titles, for the inline list. */
    names: string[];
  };
  impact: {
    /** Transitive dependents = blast radius if this node changes. */
    reachCount: number;
  };
}

export interface BuildNodeSignificanceOptions {
  /** Authored frontmatter `significance` override; trimmed-empty is ignored. */
  authoredSignificance?: string | null;
  /** Max neighbour names listed inline (default 3). */
  nameLimit?: number;
}

const DEFAULT_NAME_LIMIT = 3;

/** Kind keys that exist under the `kinds.*` i18n namespace. */
const KNOWN_KIND_LABEL_KEYS = new Set([
  "project",
  "domain",
  "capability",
  "element",
  "document",
  "vault-readme",
]);

/**
 * Map a raw kind token to a key guaranteed present under `kinds.*`, so the UI
 * never asks next-intl for a missing key. Unknown kinds fall back to `unknown`.
 */
export function normalizeKindLabelKey(kind: string): string {
  return KNOWN_KIND_LABEL_KEYS.has(kind) ? kind : "unknown";
}

function resolveLevel(
  usedByCount: number,
  dependsOnCount: number,
): NodeSignificanceLevel {
  if (usedByCount >= PROMOTION_MIN_FAN_IN) return "core";
  if (usedByCount + dependsOnCount <= 1) return "leaf";
  return "supporting";
}

/**
 * Synthesize a node's plain-language significance from the same drawer model
 * the popover/drawer already build — zero recompute, so counts can't drift.
 */
export function buildNodeSignificance(
  node: KnowledgeGraphNode,
  model: TopologyOntologyDrawerModel,
  options: BuildNodeSignificanceOptions = {},
): NodeSignificanceModel {
  const nameLimit = options.nameLimit ?? DEFAULT_NAME_LIMIT;
  const authoredTrimmed = options.authoredSignificance?.trim();
  const authored = authoredTrimmed ? authoredTrimmed : null;

  const names = model.previewRelations
    .filter((relation) => relation.direction === "outgoing")
    .map((relation) => relation.other?.title)
    .filter((title): title is string => Boolean(title))
    .slice(0, nameLimit);

  return {
    kind: node.kind,
    ownerDomainTitle: model.ownerDomain?.title ?? null,
    importance: {
      level: resolveLevel(model.incomingCount, model.outgoingCount),
      usedByCount: model.incomingCount,
      authored,
    },
    dependsOn: {
      count: model.outgoingCount,
      names,
    },
    impact: {
      reachCount: model.reach.dependents,
    },
  };
}
