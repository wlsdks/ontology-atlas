import type { KnowledgeProjectInsight } from "@/entities/knowledge-graph";
import type { Project } from "@/entities/project";
import { useMemo, useState } from "react";
import { buildOntologyMapGraph } from "../lib/map-adapter";
import { resolveCanvasSelectedSlug } from "../lib/resolve-canvas-selection";
import { clampSynthSize, synthesizeVaultGraph } from "../lib/synth-vault";
import { resolveRealmNodeId } from "./url-state";

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
  const spotlightIds = spotlightOn ? recentNodeIds : null;
  const freshChannelSlugs = spotlightOn ? recentNodeIds : changedSlugs;
  const graph = useMemo(() => {
    if (synthSize !== null) {
      const synth = synthesizeVaultGraph(synthSize);
      return buildOntologyMapGraph(synth.nodes, synth.edges, { changedSlugs: freshChannelSlugs });
    }
    return insight
      ? buildOntologyMapGraph(insight.nodes, insight.edges, { changedSlugs: freshChannelSlugs, dustySlugs })
      : { nodes: [], edges: [] };
  }, [dustySlugs, freshChannelSlugs, insight, synthSize]);
  const selectedProjectNodeId = useMemo(() => {
    if (!selectedProject) return null;
    const nodeId = `project:${selectedProject.slug}`;
    return insight?.nodes.some((node) => node.id === nodeId) ? nodeId : selectedProject.slug;
  }, [insight, selectedProject]);
  const resolvedSelectionSlug = selectedProjectNodeId ?? selectedOntologyNodeId;
  const canvasSelectedSlug = resolveCanvasSelectedSlug({
    selectedSlug,
    resolvedSlug: resolvedSelectionSlug,
    sourceReady: deeplinkSourceReady,
    projectsLoaded,
    ontologyLoaded: insight !== null,
  });
  const canvasSelectedGraphNode = useMemo(
    () => canvasSelectedSlug ? insight?.nodes.find((node) => node.id === canvasSelectedSlug) ?? null : null,
    [canvasSelectedSlug, insight],
  );
  const resolvedRealmSlug = useMemo(
    () => resolveRealmNodeId(realmSlug, (insight?.nodes ?? []).map((node) => node.id)),
    [insight, realmSlug],
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
    resolvedSelectionSlug,
    canvasSelectedSlug,
    canvasSelectedGraphNode,
    resolvedRealmSlug,
    realmTitle,
  };
}
