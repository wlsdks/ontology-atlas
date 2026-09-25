import type { useTopologyAuthoring } from "../model/use-topology-authoring";
import type { useTopologyKeyboardTour } from "../model/use-topology-keyboard-tour";
import type { useTopologyNavigationActions } from "../model/use-topology-navigation-actions";
import type { useTopologyRouteControls } from "../model/use-topology-route-controls";


const MountedGlobalSearch = dynamic(() => import("@/widgets/global-search").then(m => m.MountedGlobalSearch), { ssr: false });

import { buildDocsVaultHref } from "@/entities/docs-vault";
import { GuidedTourOverlay } from "@/features/guided-tour";
import { readDrawnMapMarks } from "@/widgets/ontology-map";
import { focusMapCanvasWhenReady } from "@/shared/lib/focus-map-canvas";
import dynamic from "next/dynamic";
const ShortcutSheet = dynamic(
  () => import("@/widgets/shortcut-sheet").then((m) => m.ShortcutSheet),
  { ssr: false },
);
const DocsQuickDrawer = dynamic(
  () => import("@/widgets/docs-quick-drawer").then((m) => m.DocsQuickDrawer),
  { ssr: false },
);

/**
 * What the tour's card must leave in view, per step (interaction audit, 2026-09-25): on "lines
 * are relations" the project and the domains whose lines it explains, and on the datasheet
 * step the node whose datasheet just opened. Module scope, so its identity is stable.
 */
function readTourAvoidRects(stepId: string) {
  if (stepId === "relations") {
    return readDrawnMapMarks((id) => id.startsWith("domain:") || id.startsWith("project:"));
  }
  if (stepId === "datasheet") {
    const selected = document
      .querySelector('[data-testid="map-detail-panel"]')
      ?.getAttribute("data-selected-node-id");
    return selected ? readDrawnMapMarks((id) => id === selected) : [];
  }
  return [];
}

interface TopologyUtilityOverlaysProps {
  ontologySearchOpen: boolean;
  setOntologySearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  shortcutsOpen: boolean;
  setShortcutsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  docsDrawerOpen: boolean;
  setDocsDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  topologyKeyboardTour: Pick<ReturnType<typeof useTopologyKeyboardTour>, "tour" | "tourAnchorRef" | "tourAnchorNodeId" | "activateTourAnchor">;
  topologyRouteControls: Pick<ReturnType<typeof useTopologyRouteControls>, "selectedProject">;
  topologyNavigationActions: Pick<ReturnType<typeof useTopologyNavigationActions>, "handleSelect">;
  topologyAuthoring: Pick<ReturnType<typeof useTopologyAuthoring>, "createNodeOpen">;
}

export function TopologyUtilityOverlays({
  ontologySearchOpen, setOntologySearchOpen, shortcutsOpen, setShortcutsOpen, docsDrawerOpen,
  setDocsDrawerOpen, topologyAuthoring, topologyNavigationActions, topologyRouteControls,
  topologyKeyboardTour
}: TopologyUtilityOverlaysProps) {
  const { createNodeOpen } = topologyAuthoring;
  const { handleSelect } = topologyNavigationActions;
  const { selectedProject } = topologyRouteControls;
  const { tour, tourAnchorRef, tourAnchorNodeId, activateTourAnchor } = topologyKeyboardTour;

  return (<>
    <MountedGlobalSearch
      onMap
      onSelectionFocus={(keyboard) => { focusMapCanvasWhenReady(undefined, keyboard); }}
      open={!createNodeOpen && ontologySearchOpen}
      onOpenChange={(next) => {
        if (createNodeOpen && next) return;
        setOntologySearchOpen(next);
      }}
      onSelectNode={(node) => handleSelect(node.id)}
      onSelectProject={(project) => handleSelect(project.slug)}
    />
    <ShortcutSheet
      open={!createNodeOpen && shortcutsOpen}
      onClose={() => setShortcutsOpen(false)}
      returnFocusSelector={'[data-testid="topology-shortcuts-help-button"]'}
    />
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
    <GuidedTourOverlay
      tour={tour}
      canvasAnchorRef={tourAnchorRef}
      onActivateAnchor={tourAnchorNodeId ? activateTourAnchor : undefined}
      readAvoidRects={readTourAvoidRects}
    />
  </>);
}
