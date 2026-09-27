/**
 * What the path chip may claim. If either endpoint does not resolve in this vault, say only that:
 * a hop count, "no path" or the copy button all presuppose both nodes exist, and a copied packet
 * would hand an
 * agent two absent slugs as fact.
 */
export type TopologyPathChipState =
  | { kind: "awaiting-target"; sourceTitle: string }
  /** `missing` holds the raw slug the address carried. */
  | { kind: "missing-endpoints"; missing: readonly string[] }
  /** A true "no path". */
  | { kind: "no-path"; sourceTitle: string; targetTitle: string }
  | { kind: "resolved"; sourceTitle: string; targetTitle: string; hops: number };

export interface TopologyPathChipInput {
  sourceSlug: string | null;
  targetSlug: string | null;
  /** Null on failure; never substitute the slug. */
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

/** "No path" qualifies: it is true when both nodes exist. */
export function canCopyTopologyPathPacket(
  state: TopologyPathChipState | null,
): boolean {
  return state?.kind === "resolved" || state?.kind === "no-path";
}
