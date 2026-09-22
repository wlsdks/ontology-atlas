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

  // Density gate: turn the parent-slug list from `?open=` into a Set for the map,
  // memoised on the joined string so the dependency is stable.
  //
  // **Deep links obey the user's cap too** (defect measured 2026-08-02). Parsing
  // `?open=` is a pure function that knows nothing about settings and falls back to
  // 3, so someone who had lowered "parents open at once" to 1 got three from a
  // single link (measured: maxOpen=1, three parents expanded, 82 nodes). A cap the
  // click path alone honours is not a cap. Keeping the tail matches
  // `toggleExpandedParent`'s LRU eviction — what is written later is the more
  // recent intent.
  const expandedParentsKey = limitExpandedParents(expandedParentSlugs, expand.maxOpenParents).join(",");
  const expandedParentSet = useMemo(
    () => new Set(expandedParentsKey ? expandedParentsKey.split(",") : []),
    [expandedParentsKey],
  );
  // Cluster chip click toggles that parent's expansion through the URL. Node
  // selection and focus are untouched — the chip only collapses and expands.
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
        // The cap comes from settings. Past it, the least recently expanded parent
        // closes here rather than the click doing nothing — see
        // `toggleExpandedParent`.
        expandedParents: toggleExpandedParent(
          current.expandedParents,
          parentId,
          expand.maxOpenParents,
        ),
      }));
    },
    [expandAllActive, setRouteState, setExpandAllActive, setFitViewToken, expand.maxOpenParents],
  );
  // Enter a realm: the orbit button or a datasheet action switches the map into
  // this node's world, through the URL.
  const handleEnterRealm = useCallback(
    (slug: string) => {
      setExpandAllActive(false);
      setRouteState((current) => enterRealmRouteState(current, slug));
    },
    [setExpandAllActive, setRouteState],
  );
  // Leave the realm (chip ✕ or Esc) and return to the whole map.
  const handleExitRealm = useCallback(() => {
    setRouteState((current) => exitRealmRouteState(current));
  }, [setRouteState]);
  // INDEX panel — the default left occupant. Preference
  // persists in localStorage; `?index=` (parsed into `routeState.indexState`)
  // wins for deep-linking (`resolveIndexPanelState` precedence). The analysis
  // rail ("reader lens") and INDEX are exclusive left-slot occupants —
  // `resolveLeftSlotOwner` decides which owns it, per analysis mode +
  // whether the user opted to reveal the overview analysis chrome.
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
  // Owner, 2026-07-23: *"It's dizzying — all panels are open at once"* (it is dizzying
  // because every panel is open at once). While a node is selected and the
  // datasheet is up, the left stack retreats to a collapsed tab; clicking empty
  // canvas restores the stored preference. If the user expands it manually during
  // a selection, that expansion wins until the selection ends. This is a
  // session-only demotion — the persisted preference is never touched.
  /*
   * On a map with nothing in it yet, INDEX starts collapsed. Owner, 2026-08-16:
   * *"On first start, the left index should be closed."*
   *
   * INDEX is a concept list, so with zero concepts it has nothing to hold — the
   * panel showed one "no matching concepts" line while owning the left third of
   * the screen, pushing the start checklist (the only thing there is to do at that
   * moment) to the right. Same shape as the during-selection demotion above: a
   * session-only demotion that never touches the stored preference, so it comes
   * back as soon as a concept exists, and expanding it by hand wins.
   */
  const [indexManualExpandWhileEmpty, setIndexManualExpandWhileEmpty] = useState(false);
  const setIndexPreference = useCallback(
    (next: IndexPanelState) => {
      try {
        window.localStorage.setItem(
          INDEX_PANEL_COLLAPSED_KEY,
          next === "collapsed" ? "1" : "0",
        );
      } catch {
        /* private mode — URL param still carries the preference */
      }
      setRouteState((current) => ({ ...current, indexState: next }));
    },
    [setRouteState],
  );
  const handleIndexCollapse = useCallback(
    () => setIndexPreference("collapsed"),
    [setIndexPreference],
  );
  // The settings gear's INDEX default row writes through the SAME
  // `setIndexPreference` that the INDEX panel's own fold/expand controls use, so it
  // persists to `INDEX_PANEL_COLLAPSED_KEY` and applies immediately rather than
  // "on next reload".
  const handleChangeIndexDefaultCollapsed = useCallback(
    (next: boolean) => setIndexPreference(next ? "collapsed" : "expanded"),
    [setIndexPreference],
  );
  // The map's safe-inset-left assumes INDEX's width by default
  // (`--map-safe-inset-left: 344` = 18 inset + 300 width + 26 gap).
  // Collapsing INDEX narrows that reserved space — flip the DOM attribute
  // `app/globals.css` keys off of, invalidate the cached token read (canvas
  // reads CSS vars once per `read-map-tokens.ts`'s own contract),
  // then force a re-fit via the existing fit-view token so the camera actually
  // re-centres against the new width instead of only changing CSS. The dataset and
  // fit effects live below the selection-aware `renderedIndexState` derivation.
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
