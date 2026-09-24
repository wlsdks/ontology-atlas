/**
 * Dome ancestry — the containment chain from the selected node up to the apex.
 *
 * ## What it is for (owner-picked, 2026-08-23 — `docs/DECISIONS.md` (107))
 *
 * In the dome, height *is* the containment tier, so a selected node's most legible "where am I"
 * answer is the meridian running from it up to the apex: element → capability → domain → project.
 * This module computes that chain so the frame draw can light it **with the existing ego
 * grammar** — ancestor nodes join the neighbour set, ancestor edges take the same "ego" state a
 * focused relation edge takes. No new ink, no new alpha, no new token: the family line lights
 * exactly the way the neighbourhood already lights, because in this product both are the same
 * sentence ("these belong together").
 *
 * ## Shape
 *
 * Pure and allocation-free per call: the caller passes the two `Set`s to fill (the frame draw
 * reuses module-level sets, its standing per-frame-allocation discipline). The walk is the
 * `parentId` chain the world already carries — O(depth), and depth is at most the kind ladder
 * (project → domain → capability → element = 3 hops).
 *
 * Cycle-safe: a malformed vault can write `contains` cycles (the `cycles` query counts them), so
 * the walk stops on the first repeated id rather than spinning.
 */

/** The key an edge is looked up by — parent (source) first, the contains direction. */
export function domeAncestryEdgeKey(sourceId: string, targetId: string): string {
  return `${sourceId}\u0000${targetId}`;
}

/**
 * Fills `nodeIds` with the focused node's ancestors and `edgeKeys` with the chain's
 * parent→child edges. Returns how many ancestors were found (0 = nothing to light —
 * the focused node is the apex, or parentless).
 */
export function collectDomeAncestry(
  focusedId: string,
  parentOf: (id: string) => string | null | undefined,
  nodeIds: Set<string>,
  edgeKeys: Set<string>,
): number {
  nodeIds.clear();
  edgeKeys.clear();
  let child = focusedId;
  for (;;) {
    const parent = parentOf(child);
    if (parent === null || parent === undefined || parent === focusedId || nodeIds.has(parent)) {
      return nodeIds.size;
    }
    nodeIds.add(parent);
    edgeKeys.add(domeAncestryEdgeKey(parent, child));
    child = parent;
  }
}

/**
 * **The lit subtree** (2026-09-25, lit strata) — adds everything the focused node contains,
 * at any depth, to `nodeIds`, and each of those `contains` links to `edgeKeys`, without
 * clearing either: the caller has just filled them with the ancestry, and the two together
 * are the one family line a focus lights, apex to leaves.
 *
 * The approved look lights **one subtree** under a focus while the rest of the structure
 * sinks into the fog; the ancestry alone lit the way up and left what a domain holds as dark
 * as everything else. Same grammar as the ancestry: the members join the neighbour set, the
 * links take the ego edge state. Cycle-safe and bounded by the node count; returns how many
 * descendants were added.
 */
export function collectDomeSubtree(
  focusedId: string,
  childrenOf: (id: string) => readonly string[] | undefined,
  nodeIds: Set<string>,
  edgeKeys: Set<string>,
): number {
  let added = 0;
  const stack = [focusedId];
  const seen = new Set<string>([focusedId]);
  while (stack.length > 0) {
    const parent = stack.pop()!;
    for (const child of childrenOf(parent) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      if (!nodeIds.has(child)) {
        nodeIds.add(child);
        added += 1;
      }
      edgeKeys.add(domeAncestryEdgeKey(parent, child));
      stack.push(child);
    }
  }
  return added;
}
