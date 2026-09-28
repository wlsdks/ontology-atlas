/**
 * The containment chain from the selected node up to the apex, lit with the existing ego
 * grammar (`docs/DECISIONS.md` (107)): no new ink, alpha or token. Callers pass the Sets to
 * fill, so the walk allocates nothing; O(depth) up the `parentId` chain, and it stops on
 * the first repeated id because a malformed vault can write `contains` cycles.
 */

export function domeAncestryEdgeKey(sourceId: string, targetId: string): string {
  return `${sourceId}\u0000${targetId}`;
}

/** Returns how many ancestors were found; 0 when the focus is the apex or parentless. */
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
 * Adds everything the focus contains, at any depth, without clearing the ancestry the
 * caller just filled: together they are the one family line a focus lights. Cycle-safe,
 * O(N) at most; returns how many descendants were added.
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
