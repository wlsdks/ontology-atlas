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
import { useCallback, useEffect, useMemo, useState } from "react";
import { countProjectRelationsWithinGraph, resolveTopologyOverlayState, resolveTopologyRenderState } from "../lib/topology-render-state";
import { selectTopologyNodeRouteState } from "./url-state";
import { useTopologyIndexReadModel } from "./use-topology-index-read-model";
import { useTopologyPathLens } from "./use-topology-path-lens";

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
    allMapNodeIds, allExpandedParentIds, pathExpandedParents, pathChipState, pathChipLabel,
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
  // Starter scaffold for an empty folder: the checklist button runs the same
  // `scaffoldOntology()` as "start fresh in an empty folder". It is an explicit click
  // rather than an automatic run, which is what keeps the local-first promise never to
  // write into someone's folder unasked.
  const [starterScaffolding, setStarterScaffolding] = useState(false);
  const handleScaffoldStarter = useCallback(async () => {
    setStarterScaffolding(true);
    try {
      // A vault created in the screen's language reads in that language.
      const result = await vault.scaffoldOntology(activeLocale);
      toast.show(
        // Concepts and config files are counted separately: summed it says 8, but there
        // are 5 actual ontology concepts, which contradicted the settings panel's
        // "5 documents".
        t("startChecklist.scaffoldToast", {
          concepts: result.markdownCreated,
          configs: result.agentConfigCreated,
        }),
        "success",
      );
    } catch (err) {
      // The sentence a reader gets is written here or in `messages/*.json`, never thrown from a
      // module that cannot know their language (B2, installed-app inspection before v1.2.2).
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
   * Wording for the bar above a cluster; the canvas never composes strings itself.
   *
   * The `{count}` placeholder is passed through **verbatim**: the real number is known
   * to the renderer per frame (a function of the "open at once" setting and how many
   * remain) and not here. next-intl's interpolation cannot be used, so a contract test
   * enforces the placeholder convention instead.
   */
  const clusterBarLabels = useMemo(
    () => ({
      expand: t("cluster.barExpand"),
      expandCount: t("cluster.barExpandCount", { count: "{count}" }),
      collapse: t("cluster.barCollapse"),
    }),
    [t],
  );
  /*
   * The tier names the 3D Strata arrangement writes at each plane's rim. They are
   * the canonical kind names (`kinds.*`), not a second vocabulary invented for the
   * map — the plane a node sits on *is* its kind, so naming it anything else would
   * be two words for one thing.
   */
  const domeTierLabels = useMemo(
    () => ({
      project: tKinds("project"),
      domain: tKinds("domain"),
      capability: tKinds("capability"),
      element: tKinds("element"),
    }),
    [tKinds],
  );
  /*
   * The bottom-right readout's own numbers (`FirstRunReadout`). `drawnConceptCount`
   * is reported by the map for the frame it just painted, and the total comes from
   * the same `ontologyInsight` as `indexDomainCount`, so the two cannot drift. The
   * readout used to open with the project count — 1 in every vault anyone has
   * opened — and then describe the zoom rule rather than the screen.
   */
  const [drawnConceptCount, setDrawnConceptCount] = useState(0);
  const handleMapFrameDrawn = useCallback((count: number) => {
    setDrawnConceptCount(count);
    completeMapNavigation(mapEntryTicket);
  }, [mapEntryTicket]);
  const totalConceptCount = ontologyInsight?.nodes.length ?? 0;
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
   * Splitting the boot long task (measured 2026-08-19). This page's first client
   * commit bundled the page chrome, the map widget's mount, and the map's mount effect
   * (forced layout included) into **one task**, holding 324–335 ms under 4× CPU
   * throttling — the single largest long task on a `/ko/topology/` load, and a stall
   * visible on real hardware. The canvas draws nothing before its own first rAF frame
   * anyway, so deferring the mount by **one rAF** splits that task into "page commit"
   * and "map mount" while what appears on screen is unchanged (either way the first
   * paint is an empty canvas). The reveal still starts on the map's first rAF frame,
   * as its contract says.
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
  // Since the controls panel was removed, the only remaining filter source is
  // `activeCategory` in the URL route state (`?category=`).
  const topologyFiltersActive = activeCategory !== null;
  const topologyOverlayState = resolveTopologyOverlayState({
    dataReady: projectsQuery.loaded,
    totalNodes: currentTopologyGraphStats?.nodes ?? visibleTopologyNodeCount,
    totalRelations: currentTopologyGraphStats?.relations ?? visibleTopologyRelationCount,
    visibleNodes: topologyVisibleCount,
    filtersActive: topologyFiltersActive,
  });
  const emptyTopologyNodeCount = currentTopologyGraphStats?.nodes ?? visibleTopologyNodeCount;
  const handleTopologyGraphStatsChange = useCallback(
    (stats: { nodes: number; relations: number }) => {
      setTopologyGraphStats({ key: visibleTopologyStatsKey, ...stats });
    },
    [setTopologyGraphStats, visibleTopologyStatsKey],
  );
  const clearTopologyFilters = useCallback(() => {
    setRouteState((current) => ({
      ...current,
      activeCategory: null,
    }));
  }, [setRouteState]);
  // Explicit "expand" for card badge/double-click — performs selection and focus entry in one go.
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
    drawerOpen, handleToggleExpandAll, pathChipLabel, pathChipState, pathPacketCopied, copyPathPacket,
    handleClearPath, indexTreeResult, realmActive, realmLedgerModel, indexMaxDomainDescendantCount,
    indexDomainCensus, topologyTotalNodes, topologyTotalRelations, indexDomainCount, topologyOverlayState,
    handleScaffoldStarter, starterScaffolding, emptyTopologyNodeCount, clearTopologyFilters,
    topologyRenderState, mapMountTaskReady, handleExpandRequest, handleMapFrameDrawn,
    handleTopologyGraphStatsChange, mapLensIds, mapLensKind, pathLensEdgeIds, pathExpandedParents,
    allExpandedParentIds, realmCaption, clusterBarLabels, domeTierLabels, drawnConceptCount,
    totalConceptCount
  } as const;
}
