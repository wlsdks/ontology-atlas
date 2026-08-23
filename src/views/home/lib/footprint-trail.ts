import { ATLAS_CLI } from "@/shared/config/cli-invocation";
/**
 * Session model for the footprint trail — the path walked, appended to every
 * time a node takes ego focus on the map. It is not a mode but a passive record
 * layer over the map: never in the URL, never in localStorage, reset on reload.
 *
 * Pure functions only; no React or DOM knowledge.
 */

/** Session trail cap; oldest visits are pushed out so it cannot grow without bound. */
export const FOOTPRINT_TRAIL_MAX = 30;

/**
 * Appends a visit. **A revisit is a new step** — the same node may appear many
 * times. Immutable; returns a new array.
 *
 * **Why dedup was removed (owner instruction, 2026-07-29).** The old
 * implementation deleted the previous position and moved the node to the end, so
 * a node existed at most once in the trail, which made the owner's request —
 * *"repeat visits should show several numbers"* (repeat visits should show several
 * numbers) — structurally impossible: no amount of fixing the number-drawing
 * code helps when the data holds one step.
 *
 * The trail is a route, not a set of recent visits. Collapsing A->B->A into A,B
 * erases the fact that the user came back, which is the only thing this feature
 * carries.
 *
 * **Consecutive duplicates are ignored**: clicking the same node twice, or focus
 * being reconfirmed, is not a step. Counting those makes the numbers climb while
 * the user sits still.
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
 * Collapsed trail for the handoff packet and the timeline: only each node's last
 * visit survives, in original order. Handing an agent the same `get_concept`
 * three times is noise, and so is a human timeline that repeats.
 *
 * Only the map uses the raw trail, because repetition is legible there as shape.
 */
export function collapseFootprintTrail(trail: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < trail.length; i += 1) {
    if (trail.lastIndexOf(trail[i]) === i) out.push(trail[i]);
  }
  return out;
}

/** Bare concept slug from a graph node id (`project:foo` -> `foo`); unprefixed ids pass through. */
export function graphIdToConceptSlug(nodeId: string): string {
  const idx = nodeId.indexOf(":");
  if (idx < 0) return nodeId;
  const tail = nodeId.slice(idx + 1).trim();
  return tail || nodeId;
}

export interface FootprintTrailEntry {
  /** Graph node id (`<kind>:<slug>`). */
  id: string;
  title: string;
  kind: string;
  /**
   * The name the agent knows: the vault-root document slug or the raw reference
   * (`resolveNodeAgentTarget`). Deriving it from the id tail instead emits names
   * the vault does not have for derived nodes whose slug was flattened
   * (`element:srcentitiesfoots`).
   */
  agentRef?: string | null;
  /** Whether the node has its own document; if not, the packet suggests creating one instead of `get_concept`. */
  documented?: boolean;
}

/** Name for the handoff text: the agent-known name if any, else the id tail. */
function agentRefOf(entry: FootprintTrailEntry): string {
  return entry.agentRef?.trim() || graphIdToConceptSlug(entry.id);
}

export interface FootprintTrailPacketLabels {
  /** Packet heading. */
  title: string;
  /** Lead-in for the ordered visit list. */
  order: string;
  /** One line introducing the `get_concept` sequence. */
  reviewHint: string;
  /** One line introducing the `find_path` hint; only with 2+ visits. */
  pathHint: string;
  /** Drift handoff: one line about dusty nodes. The caller formats the count, and
   *  the whole section is omitted when there are none. */
  dustyHint?: string;
}

/**
 * Serializes the visit chain into the handoff-packet grammar. The MCP calls are
 * stable English regardless of UI locale, so the packet pastes straight into a
 * coding agent — the same discipline the path chip's packet follows.
 */
export function formatFootprintTrailAgentPacket(
  entries: readonly FootprintTrailEntry[],
  labels: FootprintTrailPacketLabels,
  dustySlugs: readonly string[] = [],
): string {
  const lines: string[] = [`# ${labels.title}`, labels.order];
  entries.forEach((entry, i) => {
    lines.push(`${i + 1}. ${entry.title} (${entry.kind}): ${entry.id}`);
  });
  lines.push("");
  lines.push(labels.reviewHint);
  for (const entry of entries) {
    // `get_concept` on an undocumented concept answers "not found" the moment it
    // is pasted, so state the only form the vault knows: a reference another
    // document wrote down.
    lines.push(
      entry.documented === false
        ? `# ${agentRefOf(entry)} — 아직 문서 없음(참조로만 존재). add_concept 로 만들 수 있어요`
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
  // Carry the staleness signal the map already shows into the agent packet too:
  // three representatives plus the CLI queue hint. Silent when there are none.
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
