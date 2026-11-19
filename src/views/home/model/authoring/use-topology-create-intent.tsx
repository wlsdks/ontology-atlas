import type { useTopologyAuthoring } from "./use-topology-authoring";
import type { useTopologyCanvasFocus } from "../use-topology-canvas-focus";

import { useCallback, useEffect, useState } from "react";
import { type CreateNodeKind } from "../../ui/CreateNodeForm";
import { createDefaultsFromSelection } from "./create-defaults";

interface Options {
  analysisMode: import("@/views/home/model/route-state/url-state").TopologyAnalysisMode;
  createNodeIntent: boolean;
  ontologySearchOpen: boolean;
  shortcutsOpen: boolean;
  setOntologySearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setShortcutsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setDocsDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setRouteState: (updater: Partial<import("@/views/home/model/route-state/url-state").HomeRouteState> | ((current: import("@/views/home/model/route-state/url-state").HomeRouteState) => import("@/views/home/model/route-state/url-state").HomeRouteState), options?: import("@/views/home/model/route-state/use-home-route-state").HomeRouteStateUpdateOptions | undefined) => void;
  topologyCanvasFocus: Pick<ReturnType<typeof useTopologyCanvasFocus>, "setFullDetailSlug">;
  topologyAuthoring: Pick<ReturnType<typeof useTopologyAuthoring>, "canCreateNode" | "createNodeOpen" | "bootstrapOpen" | "setCreateNodeOpen" | "createSelection">;
}

/** What the create card opens with; `opening` remounts the card so its fields start empty. */
export interface CreateNodeDefaults {
  kind: CreateNodeKind;
  parent: string;
  opening: number;
}

export function useTopologyCreateIntent({
  analysisMode, createNodeIntent, ontologySearchOpen, shortcutsOpen, setOntologySearchOpen,
  setShortcutsOpen, setDocsDrawerOpen, setRouteState, topologyAuthoring, topologyCanvasFocus
}: Options) {
  const { canCreateNode, createNodeOpen, bootstrapOpen, setCreateNodeOpen, createSelection } = topologyAuthoring;
  const { setFullDetailSlug } = topologyCanvasFocus;

  const topologyShortcutHelpPhoneVisible =
    analysisMode !== "path" && analysisMode !== "health";
  const createNodePending = createNodeIntent && !canCreateNode;
  // The create card sits beside the map like the concept panel, so only these two dim it.
  const topologyCreateNodeBlockingActive = createNodePending || bootstrapOpen;
  const topologyBlockingOverlayState = bootstrapOpen
    ? "bootstrap-from-docs"
    : createNodePending
      ? "create-node-pending-vault"
      : ontologySearchOpen
        ? "global-search"
        : shortcutsOpen
          ? "shortcuts"
          : "none";
  const topologyBlockingOverlayActive = topologyBlockingOverlayState !== "none";
  const [createNodeDefaults, setCreateNodeDefaults] = useState<CreateNodeDefaults>({
    kind: "capability",
    parent: "",
    opening: 0,
  });
  const openCreateNode = useCallback((overrides: Partial<Omit<CreateNodeDefaults, "opening">> = {}) => {
    const defaults = { ...createDefaultsFromSelection(createSelection), ...overrides };
    setCreateNodeDefaults((current) => ({ ...defaults, opening: current.opening + 1 }));
    setOntologySearchOpen(false);
    setShortcutsOpen(false);
    setDocsDrawerOpen(false);
    setFullDetailSlug(null);
    setCreateNodeOpen(true);
    setRouteState((current) => ({
      ...current,
      createNodeIntent: true,
      meaningEditorIntent: false,
      meaningEditParam: null,
    }));
  }, [createSelection, setOntologySearchOpen, setShortcutsOpen, setDocsDrawerOpen, setFullDetailSlug, setCreateNodeOpen, setRouteState]);
  const openCreateNodeWithKind = useCallback(
    (kind: CreateNodeKind) => openCreateNode({ kind, parent: "" }),
    [openCreateNode],
  );
  useEffect(() => {
    if (!createNodeIntent) return;
    let cancelled = false;
    window.queueMicrotask(() => {
      if (cancelled) return;
      if (canCreateNode && !createNodeOpen) {
        openCreateNode();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [canCreateNode, createNodeIntent, createNodeOpen, openCreateNode]);
  return {
    topologyBlockingOverlayState, createNodePending, topologyBlockingOverlayActive, createNodeDefaults,
    topologyCreateNodeBlockingActive, openCreateNodeWithKind, openCreateNode,
    topologyShortcutHelpPhoneVisible,
  };
}
