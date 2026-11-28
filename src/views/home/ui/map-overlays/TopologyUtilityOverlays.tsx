import { lazy } from "react";
import { SilentSuspense } from "@/shared/ui/fallbacks/silent-suspense";
import type { useTopologyAuthoring } from "../../model/authoring/use-topology-authoring";
import type { useTopologyNavigationActions } from "../../model/use-topology-navigation-actions";
import type { useTopologyRouteControls } from "../../model/route-state/use-topology-route-controls";


const MountedGlobalSearch = lazy(() => import("@/widgets/global-search").then((m) => ({ default: m.MountedGlobalSearch })));

import { buildDocsVaultHref } from "@/entities/docs-vault";
import { focusMapCanvasWhenReady } from "@/shared/lib/map-canvas/focus-map-canvas";
const ShortcutSheet = lazy(() => import("@/widgets/shortcut-sheet").then((m) => ({ default: m.ShortcutSheet })));
const DocsQuickDrawer = lazy(() => import("@/widgets/docs-quick-drawer").then((m) => ({ default: m.DocsQuickDrawer })));

interface TopologyUtilityOverlaysProps {
  ontologySearchOpen: boolean;
  setOntologySearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  shortcutsOpen: boolean;
  setShortcutsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  docsDrawerOpen: boolean;
  setDocsDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  topologyRouteControls: Pick<ReturnType<typeof useTopologyRouteControls>, "selectedProject">;
  topologyNavigationActions: Pick<ReturnType<typeof useTopologyNavigationActions>, "handleSelect">;
  topologyAuthoring: Pick<ReturnType<typeof useTopologyAuthoring>, "createNodeOpen">;
}

export function TopologyUtilityOverlays({
  ontologySearchOpen, setOntologySearchOpen, shortcutsOpen, setShortcutsOpen, docsDrawerOpen,
  setDocsDrawerOpen, topologyAuthoring, topologyNavigationActions, topologyRouteControls,

}: TopologyUtilityOverlaysProps) {
  const { createNodeOpen } = topologyAuthoring;
  const { handleSelect } = topologyNavigationActions;
  const { selectedProject } = topologyRouteControls;

  return (<>
    <SilentSuspense>
      <MountedGlobalSearch
        onMap
        onSelectionFocus={(keyboard) => { focusMapCanvasWhenReady(undefined, keyboard); }}
        open={!createNodeOpen && ontologySearchOpen}
        onOpenChange={(next) => {
          if (createNodeOpen && next) return;
          setOntologySearchOpen(next);
        }}
        onSelectNode={(node) => handleSelect(node.id, { exitPath: 'when-complete' })}
        onSelectProject={(project) => handleSelect(project.slug, { exitPath: 'when-complete' })}
      />
    </SilentSuspense>
    <SilentSuspense>
      <ShortcutSheet
        open={!createNodeOpen && shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        returnFocusSelector={'[data-testid="topology-shortcuts-help-button"]'}
      />
    </SilentSuspense>
    <SilentSuspense>
      <DocsQuickDrawer
        open={!createNodeOpen && docsDrawerOpen}
        onClose={() => setDocsDrawerOpen(false)}
        getDocHref={(slug) => buildDocsVaultHref({ slug })}
        contextProject={
          selectedProject
            ? {
              slug: selectedProject.slug,
              name: selectedProject.name,
            }
            : null
        }
      />
    </SilentSuspense>
  </>);
}
