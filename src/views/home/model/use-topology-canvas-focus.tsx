import type { useTopologyVaultReadModel } from "./use-topology-vault-read-model";

import { buildChatNodeIndex, resolveNodeAgentTarget } from "@/entities/knowledge-graph";
import { presentationRelationKeysForGraphEdge } from "@/features/acp-session";
import { requestOntologyMapFrame } from "@/widgets/ontology-map";
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
type FullDetailA1Component = Awaited<ReturnType<typeof importFullDetailA1>>["FullDetailA1"];
const importFullDetailA1 = () => import("@/widgets/full-detail-a1");
interface Options {
  topologyVaultReadModel: Pick<ReturnType<typeof useTopologyVaultReadModel>, "ontologyInsight" | "selectedOntologyNode">;
}
export function useTopologyCanvasFocus({ topologyVaultReadModel }: Options) {
  const { ontologyInsight, selectedOntologyNode } = topologyVaultReadModel;


  // The one channel for side-panel name hover (chat names, datasheet rows) to point at a map node.
  // It reuses the node's own pointer-hover mark, so there is no second highlight to learn. A ref,
  // so hover costs no render and never competes with canvas hover.
  const panelHoverNodeIdRef = useRef<string | null>(null);
  // Only names that exist become links, or one dead link teaches people to stop pressing.
  // Agents name `domains/x` while map ids are `domain:x`; `chat-node-index.ts` maps between them.
  const chatNodeIndex = useMemo(
    () => buildChatNodeIndex(ontologyInsight?.nodes),
    [ontologyInsight],
  );
  const chatKnownSlugs = useMemo(() => new Set(chatNodeIndex.keys()), [chatNodeIndex]);
  const chatKnownRelations = useMemo(() => chatRelationKeys(ontologyInsight), [ontologyInsight]);
  const pointMapAt = useCallback((nodeId: string | null) => {
    panelHoverNodeIdRef.current = nodeId;
    requestOntologyMapFrame();
  }, []);
  // Changes only with the index; reading a ref in render breaks under concurrent rendering.
  const handleChatHoverSlug = useCallback(
    (slug: string | null) => pointMapAt(slug ? (chatNodeIndex.get(slug) ?? null) : null),
    [chatNodeIndex, pointMapAt],
  );
  // Relation rows hand over canvas ids, so they skip the index.
  const handleDatasheetHoverConnection = pointMapAt;
  // Evidence rows hand over vault slugs; one the map lacks resolves to null.
  const handleDatasheetHoverEvidence = handleChatHoverSlug;

  // A click opens the compact popover; full detail is opt-in
  // (`docs/design/topology-focus-and-scale.md`).
  // It renders only while this slug matches the selection.
  const [fullDetailSlug, setFullDetailSlug] = useState<string | null>(null);
  // `slug` is the canvas node id from `use-topology-loop.ts`'s hit test; `x`/`y` are viewport
  // coordinates.
  const [contextMenuNode, setContextMenuNode] = useState<
    { slug: string; x: number; y: number } | null
  >(null);
  const closeContextMenu = useCallback(() => setContextMenuNode(null), []);
  // A menu closes when the selection moves on, set during render so it never paints over the new
  // panel.
  const selectedNodeId = selectedOntologyNode?.id ?? null;
  const [menuSelectionId, setMenuSelectionId] = useState(selectedNodeId);
  if (menuSelectionId !== selectedNodeId) {
    setMenuSelectionId(selectedNodeId);
    if (contextMenuNode) setContextMenuNode(null);
  }
  const handleContextMenuNode = useCallback(
    (slug: string, position: { x: number; y: number }) => {
      setContextMenuNode({ slug, x: position.x, y: position.y });
    },
    [],
  );
  const interactionSelectedSlugRef = useRef<string | null>(null);
  // The popover's growth origin; non-canvas selections fall back to `center top`.
  const lastCanvasPointerRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const nodePopoverPositionerRef = useRef<HTMLDivElement | null>(null);
  const handleCanvasPointerDownCapture = useCallback((event: ReactPointerEvent) => {
    lastCanvasPointerRef.current = { x: event.clientX, y: event.clientY, at: performance.now() };
  }, []);
  const [selectedRelationActive, setSelectedRelationActive] = useState(false);
  // The first Esc closes the popover and keeps ego focus; with this true, the next deselects.
  // Each fresh selection resets it.
  const [nodePopoverDismissed, setNodePopoverDismissed] = useState(false);
  const detailKeyboardTargetRef = useRef<string | null>(null);
  const detailCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const fullDetailOpen =
    fullDetailSlug != null && fullDetailSlug === selectedOntologyNode?.id;
  /**
   * Full detail is a lazy chunk: the map stays until it loads, then background and content land in
   * one crossfade instead of a blank window. Prewarmed when a node is selected.
   */
  const [FullDetailCard, setFullDetailCard] = useState<FullDetailA1Component | null>(null);
  useEffect(() => {
    if (FullDetailCard) return;
    if (!selectedOntologyNode && fullDetailSlug == null) return;
    let cancelled = false;
    void importFullDetailA1()
      .then((mod) => {
        // Wrapped so the function is not taken for a state updater.
        if (!cancelled) setFullDetailCard(() => mod.FullDetailA1);
      })
      .catch(() => {
        // A failed chunk leaves the render gate closed.
      });
    return () => {
      cancelled = true;
    };
  }, [FullDetailCard, selectedOntologyNode, fullDetailSlug]);
  return {
    setFullDetailSlug, nodePopoverDismissed, nodePopoverPositionerRef, lastCanvasPointerRef,
    interactionSelectedSlugRef, setSelectedRelationActive, contextMenuNode, fullDetailOpen, fullDetailSlug,
    selectedRelationActive, detailKeyboardTargetRef, detailCloseButtonRef, setNodePopoverDismissed,
    chatNodeIndex, closeContextMenu, handleCanvasPointerDownCapture, handleContextMenuNode,
    panelHoverNodeIdRef, handleDatasheetHoverConnection, handleDatasheetHoverEvidence, FullDetailCard,
    chatKnownSlugs, chatKnownRelations, handleChatHoverSlug
  };
}

function chatRelationKeys(insight: Options["topologyVaultReadModel"]["ontologyInsight"]): ReadonlySet<string> {
  const agentSlugByNodeId = new Map((insight?.nodes ?? []).map((node) => [
    node.id,
    resolveNodeAgentTarget(node).ref ?? node.id,
  ]));
  const kindByNodeId = new Map((insight?.nodes ?? []).map((node) => [node.id, node.kind]));
  return new Set((insight?.edges ?? []).flatMap((edge) => presentationRelationKeysForGraphEdge({
    from: agentSlugByNodeId.get(edge.from) ?? edge.from,
    to: agentSlugByNodeId.get(edge.to) ?? edge.to,
    type: edge.type,
    toKind: kindByNodeId.get(edge.to) ?? null,
  })));
}
