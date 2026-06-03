export interface TopologyRenderStateInput {
  dataReady: boolean;
  totalNodes: number;
}

export interface TopologyRenderState {
  showImmediateEmptyState: boolean;
  renderCanvas: boolean;
}

export function resolveTopologyRenderState({
  dataReady,
  totalNodes,
}: TopologyRenderStateInput): TopologyRenderState {
  const hasRenderableData = totalNodes > 0;
  return {
    showImmediateEmptyState: dataReady && !hasRenderableData,
    renderCanvas: !dataReady || hasRenderableData,
  };
}
