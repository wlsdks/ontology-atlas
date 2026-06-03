export interface TopologyRenderStateInput {
  dataReady: boolean;
  totalNodes: number;
  totalRelations: number;
}

export interface TopologyRenderState {
  showImmediateEmptyState: boolean;
  renderCanvas: boolean;
}

export type TopologyEmptyReason = "no-projects" | "no-relations";

export type TopologyOverlayState =
  | { kind: "none" }
  | { kind: "filter-empty" }
  | { kind: "filter-sparse" }
  | { kind: "structural-empty"; emptyReason: TopologyEmptyReason };

export interface TopologyOverlayStateInput extends TopologyRenderStateInput {
  visibleNodes: number | null;
  filtersActive: boolean;
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

export function resolveTopologyOverlayState({
  dataReady,
  totalNodes,
  totalRelations,
  visibleNodes,
  filtersActive,
}: TopologyOverlayStateInput): TopologyOverlayState {
  if (!dataReady) return { kind: "none" };

  if (totalNodes <= 0) {
    return { kind: "structural-empty", emptyReason: "no-projects" };
  }

  if (totalRelations <= 0) {
    return { kind: "structural-empty", emptyReason: "no-relations" };
  }

  if (visibleNodes === null || visibleNodes > 1) return { kind: "none" };

  if (filtersActive) {
    return { kind: visibleNodes === 0 ? "filter-empty" : "filter-sparse" };
  }

  return { kind: "structural-empty", emptyReason: "no-relations" };
}
