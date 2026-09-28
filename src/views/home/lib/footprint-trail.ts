import { ATLAS_CLI } from "@/shared/config/cli-invocation";
/**
 * Session model for the footprint trail, appended whenever a node takes ego focus.
 * Never in the URL or localStorage; reset on reload.
 */

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

/** `null` when the two nodes share no edge: a walk need not follow edges. */
export interface TrailStepLink {
  type: string;
  reason: string | null;
}

/** Unordered: the walk may cross an edge in either direction. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

/**
 * Entry `i` links `trail[i]` to `trail[i - 1]`; index 0 is always null (no predecessor, not
 * "unrelated"). O(E + T) with a pair-key map. When several edges join a pair, the one carrying a
 * reason wins.
 */
export function buildTrailStepLinks(
  trail: readonly string[],
  edges: readonly TrailEdge[],
): (TrailStepLink | null)[] {
  if (trail.length === 0) return [];
  const wanted = new Set<string>();
  for (let i = 1; i < trail.length; i += 1) wanted.add(pairKey(trail[i - 1], trail[i]));
  const byPair = new Map<string, TrailStepLink>();
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
  return trail.map((id, i) => (i === 0 ? null : byPair.get(pairKey(trail[i - 1], id)) ?? null));
}

export interface TrailStepCaption {
  relationLabel: string;
  reason: string | null;
}

export function graphIdToConceptSlug(nodeId: string): string {
  const idx = nodeId.indexOf(":");
  if (idx < 0) return nodeId;
  const tail = nodeId.slice(idx + 1).trim();
  return tail || nodeId;
}

export interface FootprintTrailEntry {
  id: string;
  title: string;
  kind: string;
  /**
   * The vault-known name (`resolveNodeAgentTarget`); deriving it from the id tail invents names for
   * flattened derived slugs.
   */
  agentRef?: string | null;
  /** Without a document the packet suggests creating one instead of `get_concept`. */
  documented?: boolean;
}

function agentRefOf(entry: FootprintTrailEntry): string {
  return entry.agentRef?.trim() || graphIdToConceptSlug(entry.id);
}

export interface FootprintTrailPacketLabels {
  title: string;
  order: string;
  reviewHint: string;
  undocumented: string;
  /** Only with 2+ visits. */
  pathHint: string;
  /** Omitted when there are no dusty nodes. */
  dustyHint?: string;
  unrelated?: string;
}

/**
 * MCP calls stay English regardless of UI locale so the packet pastes straight into a coding agent.
 */
export function formatFootprintTrailAgentPacket(
  entries: readonly FootprintTrailEntry[],
  labels: FootprintTrailPacketLabels,
  dustySlugs: readonly string[] = [],
  captions: readonly (TrailStepCaption | null)[] = [],
): string {
  const lines: string[] = [`# ${labels.title}`, labels.order];
  entries.forEach((entry, i) => {
    lines.push(`${i + 1}. ${entry.title} (${entry.kind}): ${entry.id}`);
    // The reason for each step is what the vault holds that source cannot state; silent without
    // captions.
    if (i === 0 || i >= captions.length) return;
    const caption = captions[i];
    if (caption) {
      lines.push(`   — ${caption.reason ? `${caption.relationLabel} · ${caption.reason}` : caption.relationLabel}`);
    } else if (labels.unrelated) {
      lines.push(`   — ${labels.unrelated}`);
    }
  });
  lines.push("");
  lines.push(labels.reviewHint);
  for (const entry of entries) {
    // `get_concept` on an undocumented concept answers "not found", so name the reference another
    // document wrote down.
    lines.push(
      entry.documented === false
        ? `# ${agentRefOf(entry)} — ${labels.undocumented}`
        : `get_concept("${agentRefOf(entry)}")`,
    );
  }
  if (entries.length >= 2) {
    const first = agentRefOf(entries[0]);
    const last = agentRefOf(entries[entries.length - 1]);
    lines.push("");
    lines.push(labels.pathHint);
    lines.push(`find_path("${first}", "${last}")`);
  }
  if (labels.dustyHint && dustySlugs.length > 0) {
    lines.push("");
    lines.push(labels.dustyHint);
    for (const slug of dustySlugs.slice(0, 3)) {
      lines.push(`get_concept("${graphIdToConceptSlug(slug)}")`);
    }
    lines.push(`${ATLAS_CLI} maintenance`);
  }
  return lines.join("\n");
}
