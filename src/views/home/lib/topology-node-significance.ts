import {
  PROMOTION_MIN_FAN_IN,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import type { TopologyOntologyDrawerModel } from "./topology-ontology-drawer";

/**
 * `core`: fan-in >= {@link PROMOTION_MIN_FAN_IN}; `leaf`: total degree <= 1; `supporting`: in
 * between.
 */
type NodeSignificanceLevel = "core" | "supporting" | "leaf";

/**
 * A node's plain-language "so what", derived from existing graph data and kept prose-free for i18n.
 * An authored `significance` override wins the "why it matters" line.
 */
export interface NodeSignificanceModel {
  /** The UI resolves it via `t("kinds.{key}")`; see {@link normalizeKindLabelKey}. */
  kind: string;
  ownerDomainTitle: string | null;
  /**
   * Lets the datasheet's domain line focus the domain on click; null with {@link ownerDomainTitle}.
   */
  ownerDomainId: string | null;
  importance: {
    level: NodeSignificanceLevel;
    usedByCount: number;
    /** Null when derived. */
    authored: string | null;
  };
  dependsOn: {
    count: number;
    names: string[];
  };
  impact: {
    /** Blast radius if this node changes. */
    reachCount: number;
  };
}

export interface BuildNodeSignificanceOptions {
  /** Trimmed-empty is ignored. */
  authoredSignificance?: string | null;
  /** Default 3. */
  nameLimit?: number;
}

const DEFAULT_NAME_LIMIT = 3;

const KNOWN_KIND_LABEL_KEYS = new Set([
  "project",
  "domain",
  "capability",
  "element",
  "document",
  "vault-readme",
]);

/** Unknown kinds fall back to `unknown`, so the UI never asks next-intl for a missing key. */
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

/** Built from the drawer model, so counts cannot drift. */
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
    .map((relation) => relation.other?.display ?? relation.other?.title)
    .filter((title): title is string => Boolean(title))
    .slice(0, nameLimit);

  return {
    kind: node.kind,
    ownerDomainTitle: model.ownerDomain?.title ?? null,
    ownerDomainId: model.ownerDomain?.id ?? null,
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
