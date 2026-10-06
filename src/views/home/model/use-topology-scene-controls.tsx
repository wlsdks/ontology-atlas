import type { useTopologyAuthoring } from "./use-topology-authoring";
import type { useTopologyCanvasFocus } from "./use-topology-canvas-focus";
import type { useTopologyExplorationLenses } from "./use-topology-exploration-lenses";
import type { useTopologyGraphProjection } from "./use-topology-graph-projection";
import type { useTopologyPreferences } from "./use-topology-preferences";
import type { useTopologyRouteControls } from "./use-topology-route-controls";
import type { useTopologyVaultReadModel } from "./use-topology-vault-read-model";

import { useProjects } from "@/features/project-data-source";
import { completeMapNavigation } from "@/shared/lib/map-navigation-pending";
import { useFailureSentence } from "@/shared/lib/use-failure-sentence";
import { useToast } from "@/shared/ui";
import type { DialLabels } from "@/widgets/ontology-map";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { countProjectRelationsWithinGraph, resolveTopologyOverlayState, resolveTopologyRenderState } from "../lib/topology-render-state";
import { selectTopologyNodeRouteState } from "./url-state";
import { useTopologyIndexReadModel } from "./use-topology-index-read-model";
import { useTopologyPathLens } from "./use-topology-path-lens";

function reportTopologyGraphStats(
  setStats: React.Dispatch<React.SetStateAction<{ key:string;nodes:number;relations:number }|null>>,
  key:string,
  stats:{nodes:number;relations:number},
) {
  setStats({key,...stats});
}



interface Options {
  pathSourceSlug: string | null;
  pathTargetSlug: string | null;
  analysisMode: import("@/views/home/model/url-state").TopologyAnalysisMode;
  expandAllActive: boolean;
  setRouteState: (updater: Partial<import("@/views/home/model/url-state").HomeRouteState> | ((current: import("@/views/home/model/url-state").HomeRouteState) => import("@/views/home/model/url-state").HomeRouteState), options?: import("@/views/home/model/use-home-route-state").HomeRouteStateUpdateOptions | undefined) => void;
  setExpandAllActive: React.Dispatch<React.SetStateAction<boolean>>;
  setFitViewToken: React.Dispatch<React.SetStateAction<number>>;
  toast: ReturnType<typeof useToast>;
  failureSentence: ReturnType<typeof useFailureSentence>;
  mapEntryTicket: number | null;
  localGraphRoot: string | null;
  topologyGraphStats: { key: string; nodes: number; relations: number; } | null;
  projectsQuery: ReturnType<typeof useProjects>;
  activeCategory: string | null;
  topologyVisibleCount: number | null;
  setTopologyGraphStats: React.Dispatch<React.SetStateAction<{ key: string; nodes: number; relations: number; } | null>>;
  topologyCanvasFocus: Pick<ReturnType<typeof useTopologyCanvasFocus>, "setFullDetailSlug" | "setSelectedRelationActive" | "interactionSelectedSlugRef">;
  topologyAuthoring: Pick<ReturnType<typeof useTopologyAuthoring>, "setMeaningEditorState" | "setSelectedEdge">;
  topologyPreferences: Pick<ReturnType<typeof useTopologyPreferences>, "activeLocale" | "t" | "relationVocabulary" | "tKinds">;
  topologyRouteControls: Pick<ReturnType<typeof useTopologyRouteControls>, "expandedParentSet">;
  topologyGraphProjection: Pick<
    ReturnType<typeof useTopologyGraphProjection>,
    | "projectBySlug"
    | "ontologyMapGraph"
    | "spotlightIds"
    | "resolvedRealmSlug"
    | "localGraphProjects"
  >;
  topologyVaultReadModel: Pick<ReturnType<typeof useTopologyVaultReadModel>, "selectedOntologyNode" | "ontologyInsight" | "vault">;
  topologyExplorationLenses: Pick<ReturnType<typeof useTopologyExplorationLenses>, "drawerProject" | "routedConstellation">;
}
export function useTopologySceneControls({
  pathSourceSlug, pathTargetSlug, analysisMode, expandAllActive, setRouteState, setExpandAllActive,
  setFitViewToken, toast, failureSentence, mapEntryTicket, localGraphRoot, topologyGraphStats,
  projectsQuery, activeCategory, topologyVisibleCount, setTopologyGraphStats, topologyExplorationLenses,
  topologyVaultReadModel, topologyGraphProjection, topologyRouteControls, topologyPreferences,
  topologyAuthoring, topologyCanvasFocus
}: Options) {
  const { drawerProject, routedConstellation } = topologyExplorationLenses;
  const { selectedOntologyNode, ontologyInsight, vault } = topologyVaultReadModel;
  const { projectBySlug, ontologyMapGraph, spotlightIds, resolvedRealmSlug, localGraphProjects } = topologyGraphProjection;
  const { expandedParentSet } = topologyRouteControls;
  const { activeLocale, t, relationVocabulary, tKinds } = topologyPreferences;
  const { setMeaningEditorState, setSelectedEdge } = topologyAuthoring;
  const { setFullDetailSlug, setSelectedRelationActive, interactionSelectedSlugRef } = topologyCanvasFocus;


  const drawerOpen = drawerProject !== null || selectedOntologyNode !== null;
  const {
    pathLensNodeIds, pathLensEdgeIds,
    allMapNodeIds, allExpandedParentIds, pathExpandedParents, pathChipState, pathChipLabel, pathChipOutcome,
    pathPacketCopied, copyPathPacket,
  } = useTopologyPathLens({
    sourceSlug: pathSourceSlug, targetSlug: pathTargetSlug, projectBySlug,
    ontologyNodes: ontologyInsight?.nodes, ontologyEdges: ontologyInsight?.edges,
    mapNodes: ontologyMapGraph.nodes, mapEdges: ontologyMapGraph.edges,
    expandedParentSet, locale: activeLocale, t,
  });
  const mapLensIds =
    analysisMode === "path"
      ? pathLensNodeIds
      : routedConstellation
        ? routedConstellation.memberSlugs
        : expandAllActive
          ? allMapNodeIds
          : spotlightIds;
  const mapLensKind =
    analysisMode === "path"
      ? "path" as const
      : routedConstellation
        ? "constellation" as const
        : expandAllActive
          ? "all" as const
          : "recent" as const;
  const handleClearPath = useCallback(() => {
    setRouteState((current) => ({
      ...current,
      analysisMode: "overview",
      pathSourceSlug: null,
      pathTargetSlug: null,
    }));
  }, [setRouteState]);
  const handleToggleExpandAll = useCallback(() => {
    if (expandAllActive) {
      setExpandAllActive(false);
      setRouteState((current) => ({ ...current, expandedParents: [] }));
      setFitViewToken((current) => current + 1);
      return;
    }
    setMeaningEditorState(null);
    setSelectedEdge(null);
    setFullDetailSlug(null);
    setSelectedRelationActive(false);
    setExpandAllActive(true);
    setRouteState((current) => ({
      ...current,
      analysisMode: "overview",
      selectedSlug: null,
      focusedHubSlug: null,
      pathSourceSlug: null,
      pathTargetSlug: null,
      realmSlug: null,
      expandedParents: [],
      meaningEditorIntent: false,
      meaningEditParam: null,
    }));
  }, [expandAllActive, setExpandAllActive, setFitViewToken, setFullDetailSlug, setMeaningEditorState, setRouteState, setSelectedEdge, setSelectedRelationActive]);
  // An explicit click, never automatic, keeps the promise not to write into a folder unasked.
  const [starterScaffolding, setStarterScaffolding] = useState(false);
  const handleScaffoldStarter = useCallback(async () => {
    setStarterScaffolding(true);
    try {
      const result = await vault.scaffoldOntology(activeLocale);
      toast.show(
        // Concepts and config files are counted apart, or the toast disagrees with the settings
        // panel.
        t("startChecklist.scaffoldToast", {
          concepts: result.markdownCreated,
          configs: result.agentConfigCreated,
        }),
        "success",
      );
    } catch (err) {
      // Reader-facing sentences come from here or `messages/*.json`, never from a module that
      // cannot know the locale.
      toast.show(failureSentence(err, t("createNode.toastError")).sentence, "error");
    } finally {
      setStarterScaffolding(false);
    }
  }, [vault, toast, t, activeLocale, failureSentence]);

  const {
    topologyTotalNodes, topologyTotalRelations, indexTreeResult, indexDomainCount,
    indexDomainCensus, indexMaxDomainDescendantCount, realmLedgerModel, realmActive, realmCaption,
  } = useTopologyIndexReadModel({
    insight: ontologyInsight, resolvedRealmSlug, relationVocabulary, t,
  });
  /**
   * The canvas composes no strings. `{count}` passes through verbatim because only the renderer
   * knows the number per frame; a contract test enforces the placeholder since next-intl cannot
   * interpolate it.
   */
  const clusterBarLabels = useMemo(
    () => ({
      expand: t("cluster.barExpand"),
      expandCount: t("cluster.barExpandCount", { count: "{count}" }),
      collapse: t("cluster.barCollapse"),
    }),
    [t],
  );
  // Canonical kind names (`kinds.*`): a plane's tier is its kind, so no second vocabulary.
  const domeTierLabels = useMemo(
    () => ({
      project: tKinds("project"),
      domain: tKinds("domain"),
      capability: tKinds("capability"),
      element: tKinds("element"),
    }),
    [tKinds],
  );
  const tDial = useTranslations("mapDial");
  const dialLabels = useMemo<DialLabels>(
    () => ({
      units: (capabilities, elements) => tDial("units", { capabilities, elements }),
      stale: (count) => tDial("stale", { count }),
      orphans: (count) => tDial("orphans", { count }),
      more: (count) => tDial("more", { count }),
      ring: (min, max) =>
        max === null ? tDial("ringAtLeast", { min }) : min === 0 ? tDial("ringAtMostOne") : tDial("ringBetween", { min, max }),
      reading: (read, total) => tDial("reading", { read, total }),
      settling: () => tDial("settling"),
      linksShown: (shown, total) => tDial("linksShown", { shown, total }),
    }),
    [tDial],
  );
  const handleMapFrameDrawn = useCallback((_count: number) => {
    completeMapNavigation(mapEntryTicket);
  }, [mapEntryTicket]);
  const visibleTopologyNodeCount =
    localGraphRoot === null ? topologyTotalNodes : localGraphProjects.length;
  const visibleTopologyRelationCount =
    localGraphRoot === null
      ? topologyTotalRelations
      : countProjectRelationsWithinGraph(localGraphProjects);
  const visibleTopologyStatsKey = useMemo(
    () =>
      [
        localGraphRoot ?? "__root__",
        localGraphProjects
          .map((project) => `${project.slug}:${project.dependencies.join(",")}`)
          .join("|"),
        ontologyInsight ? `${ontologyInsight.nodes.length}:${ontologyInsight.edges.length}` : "0:0",
      ].join("::"),
    [localGraphRoot, localGraphProjects, ontologyInsight],
  );
  const currentTopologyGraphStats =
    topologyGraphStats?.key === visibleTopologyStatsKey ? topologyGraphStats : null;
  /**
   * Deferring the map mount by one rAF splits the boot long task (page commit vs map mount)
   * without changing the first paint, which is an empty canvas either way.
   */
  const [mapMountTaskReady, setMapMountTaskReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMapMountTaskReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const topologyRenderState = resolveTopologyRenderState({
    dataReady: projectsQuery.loaded,
    totalNodes: currentTopologyGraphStats?.nodes ?? visibleTopologyNodeCount,
    totalRelations: currentTopologyGraphStats?.relations ?? visibleTopologyRelationCount,
  });
  // `?category=` is the only filter source left.
  const topologyFiltersActive = activeCategory !== null;
  const topologyOverlayState = resolveTopologyOverlayState({
    dataReady: projectsQuery.loaded,
    totalNodes: currentTopologyGraphStats?.nodes ?? visibleTopologyNodeCount,
    totalRelations: currentTopologyGraphStats?.relations ?? visibleTopologyRelationCount,
    visibleNodes: topologyVisibleCount,
    filtersActive: topologyFiltersActive,
  });
  const emptyTopologyNodeCount = currentTopologyGraphStats?.nodes ?? visibleTopologyNodeCount;
  // The canvas can retain this callback across equally shaped folders. Binding
  // only the setter and scalar key avoids retaining this render's vault context.
  const handleTopologyGraphStatsChange = useMemo(
    () => reportTopologyGraphStats.bind(null,setTopologyGraphStats,visibleTopologyStatsKey),
    [setTopologyGraphStats, visibleTopologyStatsKey],
  );
  const clearTopologyFilters = useCallback(() => {
    setRouteState((current) => ({
      ...current,
      activeCategory: null,
    }));
  }, [setRouteState]);
  // Card badge or double-click: selection and focus in one go.
  const handleExpandRequest = useCallback(
    (slug: string) => {
      interactionSelectedSlugRef.current = slug;
      setFullDetailSlug(null);
      setSelectedRelationActive(false);
      setRouteState((current) => ({
        ...selectTopologyNodeRouteState(current, slug, {
          isHub: Boolean(projectBySlug.get(slug)?.isHub),
        }),
        analysisMode: "focus",
      }));
    },
    [interactionSelectedSlugRef, setFullDetailSlug, setSelectedRelationActive, setRouteState, projectBySlug],
  );
  return {
    drawerOpen, handleToggleExpandAll, pathChipLabel, pathChipOutcome, pathChipState, pathPacketCopied, copyPathPacket,
    handleClearPath, indexTreeResult, realmActive, realmLedgerModel, indexMaxDomainDescendantCount,
    indexDomainCensus, topologyTotalNodes, topologyTotalRelations, indexDomainCount, topologyOverlayState,
    handleScaffoldStarter, starterScaffolding, emptyTopologyNodeCount, clearTopologyFilters,
    topologyRenderState, mapMountTaskReady, handleExpandRequest, handleMapFrameDrawn,
    handleTopologyGraphStatsChange, mapLensIds, mapLensKind, pathLensEdgeIds, pathExpandedParents,
    allExpandedParentIds, realmCaption, clusterBarLabels, domeTierLabels, dialLabels
  } as const;
}
