/**
 * Recent changes, path, and full views share the same lens mechanism of "aligning
 * the camera to a set and sinking the rest", but their meanings must not be mixed.
 */
export type TopologyMapLensKind = 'recent' | 'path' | 'all';

export function isPathLensNode(
  kind: TopologyMapLensKind,
  nodeId: string,
  pathNodeIds: ReadonlySet<string> | null,
): boolean {
  return kind === 'path' && pathNodeIds?.has(nodeId) === true;
}

export function isPathLensEdge(
  kind: TopologyMapLensKind,
  edgeId: string | null | undefined,
  pathEdgeIds: ReadonlySet<string> | null,
): boolean {
  return kind === 'path' && Boolean(edgeId) && pathEdgeIds?.has(edgeId as string) === true;
}
