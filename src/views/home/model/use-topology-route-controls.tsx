import type { useTopologyPreferences } from "./use-topology-preferences";

import { useLocalStorageBoolean } from "@/shared/lib/use-local-storage-boolean";
import { resolveIndexPanelState, resolveLeftSlotOwner, resolveRenderedIndexPanelState, type IndexPanelState } from "@/widgets/topology-index-panel";
import { useCallback, useMemo, useState } from "react";
import { enterRealmRouteState, exitRealmRouteState, limitExpandedParents, toggleExpandedParent } from "./url-state";
const INDEX_PANEL_COLLAPSED_KEY = "demo:index-panel-collapsed:v1";
interface Options {
  expandedParentSlugs: string[];
  expandAllActive: boolean;
  setExpandAllActive: React.Dispatch<React.SetStateAction<boolean>>;
  setRouteState: (updater: Partial<import("@/views/home/model/url-state").HomeRouteState> | ((current: import("@/views/home/model/url-state").HomeRouteState) => import("@/views/home/model/url-state").HomeRouteState), options?: import("@/views/home/model/use-home-route-state").HomeRouteStateUpdateOptions | undefined) => void;
  setFitViewToken: React.Dispatch<React.SetStateAction<number>>;
  indexState: import("@/widgets/topology-index-panel/lib/index-panel-state").IndexPanelState | null;
  analysisMode: import("@/views/home/model/url-state").TopologyAnalysisMode;
  selectedSlug: string | null;
  renderProjects: import("@/entities/project/model/types").Project[];
  topologyPreferences: Pick<ReturnType<typeof useTopologyPreferences>, "expand">;
}
export function useTopologyRouteControls({
  expandedParentSlugs, expandAllActive, setExpandAllActive, setRouteState, setFitViewToken, indexState,
  analysisMode, selectedSlug, renderProjects, topologyPreferences
}: Options) {
  const { expand } = topologyPreferences;

  // Memoised on the joined string for a stable dependency. Deep links obey the user's cap too,
  // since parsing knows only the default; the tail is kept, like `toggleExpandedParent`'s LRU.
  const expandedParentsKey = limitExpandedParents(expandedParentSlugs, expand.maxOpenParents).join(",");
  const expandedParentSet = useMemo(
    () => new Set(expandedParentsKey ? expandedParentsKey.split(",") : []),
    [expandedParentsKey],
  );
  // Only toggles expansion; selection and focus are untouched.
  const handleToggleCluster = useCallback(
    (parentId: string) => {
      if (expandAllActive) {
        setExpandAllActive(false);
        setRouteState((current) => ({ ...current, expandedParents: [] }));
        setFitViewToken((current) => current + 1);
        return;
      }
      setRouteState((current) => ({
        ...current,
        // Past the settings cap the longest-open parent closes instead of the click doing nothing.
        expandedParents: toggleExpandedParent(
          current.expandedParents,
          parentId,
          expand.maxOpenParents,
        ),
      }));
    },
    [expandAllActive, setRouteState, setExpandAllActive, setFitViewToken, expand.maxOpenParents],
  );
  const handleEnterRealm = useCallback(
    (slug: string) => {
      setExpandAllActive(false);
      setRouteState((current) => enterRealmRouteState(current, slug));
    },
    [setExpandAllActive, setRouteState],
  );
  const handleExitRealm = useCallback(() => {
    setRouteState((current) => exitRealmRouteState(current));
  }, [setRouteState]);
  // INDEX is the default left occupant: localStorage holds the preference and `?index=` wins
  // (`resolveIndexPanelState`). `resolveLeftSlotOwner` decides between it and the analysis rail.
  const indexPanelCollapsedStored = useLocalStorageBoolean(
    INDEX_PANEL_COLLAPSED_KEY,
    false,
  );
  const indexPreference: IndexPanelState = resolveIndexPanelState(
    indexState,
    indexPanelCollapsedStored ? "collapsed" : "expanded",
  );
  const leftSlotOwner = resolveLeftSlotOwner({ analysisMode });
  const baseRenderedIndexState = resolveRenderedIndexPanelState(
    leftSlotOwner,
    indexPreference,
  );
  // Session-only demotions that never touch the stored preference: the left stack collapses while
  // a datasheet shows (a manual expand wins until the selection ends), and on a map with zero
  // concepts, where INDEX holds nothing and pushes the start checklist aside.
  const [indexManualExpandWhileEmpty, setIndexManualExpandWhileEmpty] = useState(false);
  const setIndexPreference = useCallback(
    (next: IndexPanelState) => {
      try {
        window.localStorage.setItem(
          INDEX_PANEL_COLLAPSED_KEY,
          next === "collapsed" ? "1" : "0",
        );
      } catch {
        // Private mode: the URL param still carries the preference.
      }
      setRouteState((current) => ({ ...current, indexState: next }));
    },
    [setRouteState],
  );
  const handleIndexCollapse = useCallback(
    () => setIndexPreference("collapsed"),
    [setIndexPreference],
  );
  // Uses the same `setIndexPreference` as the panel's own controls, so it persists and applies
  // now.
  const handleChangeIndexDefaultCollapsed = useCallback(
    (next: boolean) => setIndexPreference(next ? "collapsed" : "expanded"),
    [setIndexPreference],
  );
  // `--map-safe-inset-left` assumes INDEX's width, so collapsing flips the
  // attribute `app/globals.css` keys on, invalidates the cached token read (`read-map-tokens.ts`)
  // and re-fits the camera. The effects live below `renderedIndexState`.
  const selectedProject = useMemo(
    () =>
      selectedSlug
        ? (renderProjects.find((p) => p.slug === selectedSlug) ?? null)
        : null,
    [selectedSlug, renderProjects],
  );
  return {
    selectedProject, indexPanelCollapsedStored, handleChangeIndexDefaultCollapsed, expandedParentSet,
    setIndexPreference, setIndexManualExpandWhileEmpty, baseRenderedIndexState, indexManualExpandWhileEmpty,
    handleExitRealm, handleEnterRealm, handleIndexCollapse, handleToggleCluster
  };
}
