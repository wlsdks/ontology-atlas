import type { useTopologyAuthoring } from "./use-topology-authoring";
import type { useTopologyCanvasFocus } from "./use-topology-canvas-focus";

import { useCallback, useEffect, useState } from "react";
import { type CreateNodeKind } from "../ui/CreateNodeForm";

interface Options {
  analysisMode: import("@/views/home/model/url-state").TopologyAnalysisMode;
  createNodeIntent: boolean;
  ontologySearchOpen: boolean;
  shortcutsOpen: boolean;
  setOntologySearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setShortcutsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setDocsDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setRouteState: (updater: Partial<import("@/views/home/model/url-state").HomeRouteState> | ((current: import("@/views/home/model/url-state").HomeRouteState) => import("@/views/home/model/url-state").HomeRouteState), options?: import("@/views/home/model/use-home-route-state").HomeRouteStateUpdateOptions | undefined) => void;
  topologyCanvasFocus: Pick<ReturnType<typeof useTopologyCanvasFocus>, "setFullDetailSlug">;
  topologyAuthoring: Pick<ReturnType<typeof useTopologyAuthoring>, "canCreateNode" | "createNodeOpen" | "bootstrapOpen" | "setCreateNodeOpen">;
}
export function useTopologyCreateIntent({
  analysisMode, createNodeIntent, ontologySearchOpen, shortcutsOpen, setOntologySearchOpen,
  setShortcutsOpen, setDocsDrawerOpen, setRouteState, topologyAuthoring, topologyCanvasFocus
}: Options) {
  const { canCreateNode, createNodeOpen, bootstrapOpen, setCreateNodeOpen } = topologyAuthoring;
  const { setFullDetailSlug } = topologyCanvasFocus;

  const topologyShortcutHelpPhoneVisible =
    analysisMode !== "path" && analysisMode !== "health";
  const createNodePending = createNodeIntent && !canCreateNode;
  const topologyCreateNodeBlockingActive = createNodeOpen || createNodePending || bootstrapOpen;
  const topologyBlockingOverlayState = bootstrapOpen
    ? "bootstrap-from-docs"
    : createNodeOpen
      ? "create-node"
      : createNodePending
        ? "create-node-pending-vault"
        : ontologySearchOpen
          ? "global-search"
          : shortcutsOpen
            ? "shortcuts"
            : "none";
  const topologyBlockingOverlayActive = topologyBlockingOverlayState !== "none";
  // Onboarding QA, 2026-07-24: the composer's initial kind is state so the start
  // checklist can carry a "create your first project/domain" intent into it. Ordinary
  // entry points keep the previous default.
  const [createNodeDefaultKind, setCreateNodeDefaultKind] = useState<CreateNodeKind>("capability");
  /**
   * The domain "create one from here" preselects: opening it from a domain node on
   * the map arrives with that domain already chosen. An empty string means no domain,
   * as before.
   */
  const [createNodeSeedDomain, setCreateNodeSeedDomain] = useState("");
  const openCreateNode = useCallback(() => {
    setCreateNodeDefaultKind("capability");
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
  }, [setOntologySearchOpen, setShortcutsOpen, setDocsDrawerOpen, setFullDetailSlug, setCreateNodeOpen, setRouteState]);
  const openCreateNodeWithKind = useCallback(
    (kind: CreateNodeKind) => {
      openCreateNode();
      setCreateNodeDefaultKind(kind);
    },
    [openCreateNode, setCreateNodeDefaultKind],
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
  }, [canCreateNode, createNodeIntent, createNodeOpen, openCreateNode, setRouteState]);
  return {
    topologyBlockingOverlayState, createNodePending, topologyBlockingOverlayActive, createNodeDefaultKind,
    createNodeSeedDomain, topologyCreateNodeBlockingActive, openCreateNodeWithKind, openCreateNode,
    topologyShortcutHelpPhoneVisible, setCreateNodeSeedDomain, setCreateNodeDefaultKind
  };
}
