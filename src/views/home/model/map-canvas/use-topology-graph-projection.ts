import type { KnowledgeProjectInsight } from "@/entities/knowledge-graph";
import type { Project } from "@/entities/project";
import { useMemo, useState } from "react";
import { buildOntologyMapGraph } from "../../lib/map-canvas/map-adapter";
import { resolveCanvasSelectedSlug } from "../../lib/selection/resolve-canvas-selection";
import { clampSynthSize, type SynthShape, synthesizeEvidenceStates, synthesizeVaultGraph } from "../../lib/synth-vault/synth-vault";
import type { MapEvidence } from "./use-map-evidence-states";
import { resolveRealmNodeId } from "../route-state/url-state";

export function useTopologyGraphProjection({
  projects,
  localGraphRoot,
  insight,
  spotlightOn,
  recentNodeIds,
  changedSlugs,
  dustySlugs,
  selectedProject,
  selectedOntologyNodeId,
  selectedSlug,
  deeplinkSourceReady,
  projectsLoaded,
  realmSlug,
}: {
  projects: readonly Project[];
  localGraphRoot: string | null;
  insight: KnowledgeProjectInsight | null;
  spotlightOn: boolean;
  recentNodeIds: ReadonlySet<string>;
  changedSlugs: ReadonlySet<string>;
  dustySlugs: ReadonlySet<string>;
  selectedProject: Project | null;
  selectedOntologyNodeId: string | null;
  selectedSlug: string | null;
  deeplinkSourceReady: boolean;
  projectsLoaded: boolean;
  realmSlug: string | null;
}) {
  const projectBySlug = useMemo(
    () => new Map(projects.map((project) => [project.slug, project])),
    [projects],
  );
  const reverseDeps = useMemo(() => {
    const result = new Map<string, string[]>();
    for (const project of projects) {
      for (const dependency of project.dependencies) {
        const dependants = result.get(dependency);
        if (dependants) dependants.push(project.slug);
        else result.set(dependency, [project.slug]);
      }
    }
    return result;
  }, [projects]);
  const hubs = useMemo(() => projects.filter((project) => project.isHub), [projects]);
  const localGraphProjects = useMemo(() => {
    if (!localGraphRoot) return projects;
    const visited = new Set<string>([localGraphRoot]);
    let frontier = [localGraphRoot];
    for (let hop = 0; hop < 2; hop += 1) {
      const next: string[] = [];
      for (const slug of frontier) {
        const project = projectBySlug.get(slug);
        if (!project) continue;
        for (const dependency of project.dependencies) {
          if (!visited.has(dependency) && projectBySlug.has(dependency)) {
            visited.add(dependency);
            next.push(dependency);
          }
        }
        for (const dependant of reverseDeps.get(slug) ?? []) {
          if (!visited.has(dependant)) {
            visited.add(dependant);
            next.push(dependant);
          }
        }
      }
      frontier = next;
      if (frontier.length === 0) break;
    }
    return projects.filter((project) => visited.has(project.slug));
  }, [localGraphRoot, projectBySlug, projects, reverseDeps]);
  const [synthSize] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = new URLSearchParams(window.location.search).get("synth");
      return raw === null ? null : clampSynthSize(Number(raw));
    } catch {
      return null;
    }
  });
  const [synthDependencies] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return new URLSearchParams(window.location.search).get("synthDeps") === "1";
    } catch {
      return false;
    }
  });
  const [synthShape] = useState<SynthShape>(() => {
    if (typeof window === "undefined") return "uniform";
    try {
      return new URLSearchParams(window.location.search).get("synthShape") === "layered" ? "layered" : "uniform";
    } catch {
      return "uniform";
    }
  });
  const [synthStaleShare] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = new URLSearchParams(window.location.search).get("synthEvidence");
      const percent = raw === null ? Number.NaN : Number(raw);
      return Number.isFinite(percent) ? Math.min(1, Math.max(0, percent / 100)) : null;
    } catch {
      return null;
    }
  });
  const spotlightIds = spotlightOn ? recentNodeIds : null;
  const freshChannelSlugs = spotlightOn ? recentNodeIds : changedSlugs;
  const projectedSource = useMemo(() => synthSize !== null
    ? synthesizeVaultGraph(synthSize, { dependencies: synthDependencies, shape: synthShape })
    : insight, [insight, synthDependencies, synthShape, synthSize]);
  const graph = useMemo(() => projectedSource
    ? buildOntologyMapGraph(projectedSource.nodes, projectedSource.edges, { changedSlugs: freshChannelSlugs, dustySlugs })
    : { nodes: [], edges: [] }, [dustySlugs, freshChannelSlugs, projectedSource]);
  const synthEvidence = useMemo<MapEvidence | null>(() => {
    if (synthSize === null || synthStaleShare === null) return null;
    return {
      availability: "measured",
      states: synthesizeEvidenceStates(graph.nodes.map((node) => node.id), synthStaleShare),
      movedPaths: new Map(),
    };
  }, [graph.nodes, synthSize, synthStaleShare]);
  const selectedProjectNodeId = useMemo(() => {
    if (!selectedProject) return null;
    const nodeId = `project:${selectedProject.slug}`;
    return insight?.nodes.some((node) => node.id === nodeId) ? nodeId : selectedProject.slug;
  }, [insight, selectedProject]);
  const resolvedSelectionSlug = synthSize !== null
    ? projectedSource?.nodes.find(node => node.id === selectedSlug)?.id ?? null
    : selectedProjectNodeId ?? selectedOntologyNodeId;
  const canvasSelectedSlug = resolveCanvasSelectedSlug({
    selectedSlug,
    resolvedSlug: resolvedSelectionSlug,
    sourceReady: synthSize !== null || deeplinkSourceReady,
    projectsLoaded: synthSize !== null || projectsLoaded,
    ontologyLoaded: projectedSource !== null,
  });
  const canvasSelectedGraphNode = useMemo(
    () => canvasSelectedSlug ? projectedSource?.nodes.find((node) => node.id === canvasSelectedSlug) ?? null : null,
    [canvasSelectedSlug, projectedSource],
  );
  const resolvedRealmSlug = useMemo(
    () => resolveRealmNodeId(realmSlug, (projectedSource?.nodes ?? []).map((node) => node.id)),
    [projectedSource, realmSlug],
  );
  const realmTitle = useMemo(
    () => resolvedRealmSlug ? graph.nodes.find((node) => node.id === resolvedRealmSlug)?.label ?? resolvedRealmSlug : null,
    [graph.nodes, resolvedRealmSlug],
  );

  return {
    reverseDeps,
    projectBySlug,
    hubs,
    localGraphProjects,
    spotlightIds,
    ontologyMapGraph: graph,
    synthEvidence,
    isSynthetic: synthSize !== null,
    resolvedSelectionSlug,
    canvasSelectedSlug,
    canvasSelectedGraphNode,
    resolvedRealmSlug,
    realmTitle,
  };
}
