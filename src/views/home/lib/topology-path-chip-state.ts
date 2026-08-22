/**
 * What the path chip is allowed to claim — a pure decision.
 *
 * **The lie this fixed (2026-08-01).** Endpoint titles came from
 * `resolveTopologyNodeTitle`, which returned the slug as a title when it found
 * nothing. So with two nodes absent from this vault the chip drew two plausible
 * names and then asserted "no path". The truth was "neither is here" while the
 * screen said "both are here and unconnected" — worse than silence, because the
 * user then reasons about a relation that does not exist. The copy-packet button
 * stayed available in that state too, handing an agent two non-existent slugs
 * and a "no path" conclusion: the point where a fooled human passes it on to a
 * machine as fact.
 *
 * **The rule:** if either endpoint fails to resolve in this vault, say only
 * that. No hop count, no "no path", no copy button — all three presuppose that
 * both nodes exist.
 */
export type TopologyPathChipState =
  /** Only the source is picked — the normal state, waiting for a target. */
  | { kind: "awaiting-target"; sourceTitle: string }
  /** An endpoint is absent from this vault; `missing` holds the raw slug the address carried. */
  | { kind: "missing-endpoints"; missing: readonly string[] }
  /** Both exist and nothing connects them — a true "no path". */
  | { kind: "no-path"; sourceTitle: string; targetTitle: string }
  | { kind: "resolved"; sourceTitle: string; targetTitle: string; hops: number };

export interface TopologyPathChipInput {
  sourceSlug: string | null;
  targetSlug: string | null;
  /** The resolved title, or null on failure — **never substitute the slug.** */
  sourceTitle: string | null;
  targetTitle: string | null;
  hopCount: number | null;
}

export function resolveTopologyPathChipState({
  sourceSlug,
  targetSlug,
  sourceTitle,
  targetTitle,
  hopCount,
}: TopologyPathChipInput): TopologyPathChipState | null {
  if (!sourceSlug) return null;

  const missing: string[] = [];
  if (!sourceTitle) missing.push(sourceSlug);
  if (targetSlug && !targetTitle) missing.push(targetSlug);
  if (missing.length > 0) return { kind: "missing-endpoints", missing };

  // Past the branches above, `sourceTitle` is guaranteed present.
  const resolvedSourceTitle = sourceTitle as string;
  if (!targetSlug || !targetTitle) {
    return { kind: "awaiting-target", sourceTitle: resolvedSourceTitle };
  }
  if (hopCount === null) {
    return { kind: "no-path", sourceTitle: resolvedSourceTitle, targetTitle };
  }
  return {
    kind: "resolved",
    sourceTitle: resolvedSourceTitle,
    targetTitle,
    hops: hopCount,
  };
}

/**
 * Whether this state may be handed to an agent — only when both endpoints exist.
 * "No path" qualifies: it is a true fact given that both nodes are there.
 */
export function canCopyTopologyPathPacket(
  state: TopologyPathChipState | null,
): boolean {
  return state?.kind === "resolved" || state?.kind === "no-path";
}
