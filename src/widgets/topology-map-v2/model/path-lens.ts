/**
 * 최근 변경·경로·전체 보기는 같은 "집합으로 카메라를 맞추고 나머지를
 * 가라앉히는" 렌즈 기구를 공유하지만, 의미는 섞지 않는다.
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
