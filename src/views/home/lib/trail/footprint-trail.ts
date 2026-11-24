import { formatQueryOntologyCall } from "@/shared/lib/ontology-graph/ontology-query-call";

export const FOOTPRINT_TRAIL_MAX = 30;

/**
 * A revisit is a new step, because the trail is a route: collapsing A->B->A erases that the user
 * came back. Consecutive duplicates are ignored, or reclicking a node advances the count while the
 * user sits still.
 */
export function appendFootprintVisit(
  trail: readonly string[],
  nodeId: string,
): string[] {
  if (trail.length > 0 && trail[trail.length - 1] === nodeId) return [...trail];
  const next = [...trail, nodeId];
  return next.length > FOOTPRINT_TRAIL_MAX
    ? next.slice(next.length - FOOTPRINT_TRAIL_MAX)
    : next;
}

/**
 * Only each node's last visit survives, in order: the handoff packet and timeline would repeat
 * themselves otherwise. Only the map uses the raw trail, where repetition reads as shape.
 */
export function collapseFootprintTrail(trail: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < trail.length; i += 1) {
    if (trail.lastIndexOf(trail[i]) === i) out.push(trail[i]);
  }
  return out;
}

export interface TrailEdge {
  from: string;
  to: string;
  type: string;
  label?: string;
}

/** A real move between two steps that share no edge, which is a valid walk. */
export const TRAIL_STEP_UNRELATED = "unrelated";

export type TrailStepLink = { type: string; reason: string | null } | typeof TRAIL_STEP_UNRELATED;

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

/**
 * Entry `i` describes the move that arrived at the last visit of `rowIds[i]`, only when that move
 * came from `rowIds[i - 1]`; any other arrival (a revisit, a deleted step between) has no link,
 * so a de-duplicated list never claims a move the walk did not make. O(E + T) with pair-key and
 * last-index maps; when several edges join a pair, the one carrying a reason wins.
 */
export function buildTrailStepLinks(
  steps: readonly string[],
  rowIds: readonly string[],
  edges: readonly TrailEdge[],
): (TrailStepLink | null)[] {
  const lastIndexOf = new Map<string, number>();
  steps.forEach((id, i) => lastIndexOf.set(id, i));
  const arrivedFromRowAbove = rowIds.map((id, i) => {
    if (i === 0) return false;
    const index = lastIndexOf.get(id);
    return index !== undefined && index > 0 && steps[index - 1] === rowIds[i - 1];
  });
  const wanted = new Set<string>();
  rowIds.forEach((id, i) => {
    if (arrivedFromRowAbove[i]) wanted.add(pairKey(rowIds[i - 1], id));
  });
  const byPair = new Map<string, { type: string; reason: string | null }>();
  if (wanted.size > 0) {
    for (const edge of edges) {
      const key = pairKey(edge.from, edge.to);
      if (!wanted.has(key)) continue;
      const reason = edge.label?.trim() || null;
      const held = byPair.get(key);
      if (held && (held.reason !== null || reason === null)) continue;
      byPair.set(key, { type: edge.type, reason });
    }
  }
  return rowIds.map((id, i) =>
    arrivedFromRowAbove[i] ? byPair.get(pairKey(rowIds[i - 1], id)) ?? TRAIL_STEP_UNRELATED : null,
  );
}

export type TrailStepCaption =
  | { relationLabel: string; reason: string | null }
  | typeof TRAIL_STEP_UNRELATED;

/** Null and an unknown caption read as no caption: the row claims nothing about its arrival. */
export function trailStepCaptionText(
  caption: TrailStepCaption | null | undefined,
  unrelatedLabel: string,
): string {
  if (!caption) return "";
  if (caption === TRAIL_STEP_UNRELATED) return unrelatedLabel;
  return caption.reason ? `${caption.relationLabel} · ${caption.reason}` : caption.relationLabel;
}

export interface FootprintTrailEntry {
  id: string;
  title: string;
  kind: string;
  /** The vault slug (`capabilities/vault-graph-query`); null for a concept with no document. */
  slug: string | null;
}

export interface FootprintTrailPacketLabels {
  title: string;
  order: string;
  reviewHint: string;
  undocumented: string;
  pathHint: string;
  unrelated: string;
}

/**
 * MCP calls stay English regardless of UI locale so the packet pastes straight into a coding agent.
 * One `get_concepts` call reads the whole walk; a concept without a document is named by title.
 */
export function formatFootprintTrailAgentPacket(
  entries: readonly FootprintTrailEntry[],
  labels: FootprintTrailPacketLabels,
  captions: readonly (TrailStepCaption | null)[] = [],
): string {
  const lines: string[] = [`# ${labels.title}`, labels.order];
  entries.forEach((entry, i) => {
    lines.push(`${i + 1}. ${entry.title} (${entry.kind})${entry.slug ? `: ${entry.slug}` : ""}`);
    const caption = trailStepCaptionText(captions[i], labels.unrelated);
    if (caption) lines.push(`   — ${caption}`);
  });
  const slugs = entries.flatMap((entry) => (entry.slug ? [entry.slug] : []));
  lines.push("");
  lines.push(labels.reviewHint);
  if (slugs.length > 0) lines.push(`get_concepts(${JSON.stringify({ slugs })})`);
  for (const entry of entries) {
    if (!entry.slug) lines.push(`${entry.title}: ${labels.undocumented}`);
  }
  const first = entries[0]?.slug;
  const last = entries[entries.length - 1]?.slug;
  if (entries.length >= 2 && first && last) {
    lines.push("");
    lines.push(labels.pathHint);
    lines.push(formatQueryOntologyCall({ operation: "path", from: first, to: last }));
  }
  return lines.join("\n");
}
