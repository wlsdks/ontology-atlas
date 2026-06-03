export interface TopologyRenderStateInput {
  dataReady: boolean;
  totalNodes: number;
  totalRelations: number;
}

export interface TopologyRenderState {
  showImmediateEmptyState: boolean;
  renderCanvas: boolean;
}

export interface TopologyProjectRelationInput {
  slug: string;
  dependencies: readonly string[];
}

export function countProjectRelationsWithinGraph(
  projects: readonly TopologyProjectRelationInput[],
): number {
  const visibleSlugs = new Set(projects.map((project) => project.slug));
  return projects.reduce(
    (sum, project) =>
      sum + project.dependencies.filter((dependency) => visibleSlugs.has(dependency)).length,
    0,
  );
}

export function resolveTopologyRenderState({
  dataReady,
  totalNodes,
  totalRelations,
}: TopologyRenderStateInput): TopologyRenderState {
  const hasRenderableData = totalNodes > 0;
  const hasDrawableRelations = totalRelations > 0;
  return {
    showImmediateEmptyState: dataReady && (!hasRenderableData || !hasDrawableRelations),
    renderCanvas: !dataReady || (hasRenderableData && hasDrawableRelations),
  };
}
