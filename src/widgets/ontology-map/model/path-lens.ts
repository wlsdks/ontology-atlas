/**
 * Recent changes, path, and full views share the same lens mechanism of "aligning
 * the camera to a set and sinking the rest", but their meanings must not be mixed.
 */
export type TopologyMapLensKind = 'recent' | 'path' | 'all' | 'constellation';

export function isPathLensNode(
  kind: TopologyMapLensKind,
  nodeId: string,
  pathNodeIds: ReadonlySet<string> | null,
): boolean {
  return kind === 'path' && pathNodeIds?.has(nodeId) === true;
}

/**
 * **A path has its source and waits for a target** — the focused node is the source,
 * and no path is resolved yet. The camera frames the map the target is picked from
 * rather than diving into the source's neighbourhood (`computePathPickBounds`).
 */
export function isPathTargetPick(
  kind: TopologyMapLensKind,
  focusedId: string | null,
  pathNodeIds: ReadonlySet<string> | null,
): boolean {
  return kind === 'path' && focusedId !== null && (pathNodeIds === null || pathNodeIds.size === 0);
}

export function isPathLensEdge(
  kind: TopologyMapLensKind,
  edgeId: string | null | undefined,
  pathEdgeIds: ReadonlySet<string> | null,
): boolean {
  return kind === 'path' && Boolean(edgeId) && pathEdgeIds?.has(edgeId as string) === true;
}
