import type { useTopologyVaultReadModel } from "./use-topology-vault-read-model";

import { buildChatNodeIndex, resolveNodeAgentTarget } from "@/entities/knowledge-graph";
import { presentationRelationKeysForGraphEdge } from "@/features/acp-session";
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
type FullDetailA1Component = Awaited<ReturnType<typeof importFullDetailA1>>["FullDetailA1"];
const importFullDetailA1 = () => import("@/widgets/full-detail-a1");
interface Options {
  topologyVaultReadModel: Pick<ReturnType<typeof useTopologyVaultReadModel>, "ontologyInsight" | "selectedOntologyNode">;
}
export function useTopologyCanvasFocus({ topologyVaultReadModel }: Options) {
  const { ontologyInsight, selectedOntologyNode } = topologyVaultReadModel;


  /*
    The single channel by which **hovering a node name in a side panel** makes the
    map point at that node. Two consumers:

    ① The chat panel. Owner, 2026-08-17: *"Just hovering in the chat could mark our node."*
    ② The datasheet's children / parents / evidence / domain rows. Owner, 2026-08-17:
       *"It would be nice if hovering each of these showed it on the map beside — right now nothing responds."* (hovering each of these should show it
       on the map beside — right now nothing responds).

    Adding ② created **no second channel**. "Blink" does not ask for a blink or a
    glow — this repo forbids blink, glow, and pulse (`.claude/rules/forbidden.md`,
    the design section) — it means *"make it visible where that is"*, and the map
    already has a mark taught for exactly that: the one a node shows when the pointer
    is over it. One channel means one highlight, so there is nothing new to learn.

    Same contract as footprint brushing: the cursor is over a side panel rather than
    the canvas, so it never competes with canvas hover, and being a ref it costs no
    render per hover. The two consumers cannot collide — there is one cursor.
  */
  const panelHoverNodeIdRef = useRef<string | null>(null);
  /* Which names in a reply become links — **only names that really exist**. Linking
     any `a/b` would turn file paths and URLs into links too, and someone who meets
     one link that goes nowhere stops pressing the rest.

     ⚠️ **There are two name spaces** (measured against the real app, 2026-08-17).
     This list used to be built from `nodes.map((n) => n.id)`, but those ids look like
     `domain:example-domain` while **the name an agent uses is
     `domains/example-domain`**. The two can never be equal, so no name in a chat ever
     matched and the whole feature was wired but dead. The decision and the
     reproduction live in `chat-node-index.ts`. */
  const chatNodeIndex = useMemo(
    () => buildChatNodeIndex(ontologyInsight?.nodes),
    [ontologyInsight],
  );
  const chatKnownSlugs = useMemo(() => new Set(chatNodeIndex.keys()), [chatNodeIndex]);
  const chatKnownRelations = useMemo(() => {
    const agentSlugByNodeId = new Map((ontologyInsight?.nodes ?? []).map((node) => [
      node.id,
      resolveNodeAgentTarget(node).ref ?? node.id,
    ]));
    const kindByNodeId = new Map((ontologyInsight?.nodes ?? []).map((node) => [node.id, node.kind]));
    return new Set((ontologyInsight?.edges ?? []).flatMap((edge) => presentationRelationKeysForGraphEdge({
      from: agentSlugByNodeId.get(edge.from) ?? edge.from,
      to: agentSlugByNodeId.get(edge.to) ?? edge.to,
      type: edge.type,
      toKind: kindByNodeId.get(edge.to) ?? null,
    })));
  }, [ontologyInsight]);
  /* Identity changes only when the index does, which is only when the vault changes.
     Reading a ref during render would look cheaper but is the pattern that breaks
     under concurrent rendering. */
  const handleChatHoverSlug = useCallback(
    (slug: string | null) => {
      panelHoverNodeIdRef.current = slug ? (chatNodeIndex.get(slug) ?? null) : null;
    },
    [chatNodeIndex],
  );
  /* The datasheet's relation rows already hand over a **canvas node id** (the same
     name space as `onSelectConnection`), so they skip the index. */
  const handleDatasheetHoverConnection = useCallback((id: string | null) => {
    panelHoverNodeIdRef.current = id;
  }, []);
  /* Evidence rows hand over a **vault slug**, so they go through the same index as
     the chat. A document the map does not have resolves to null and nothing
     happens. */
  const handleDatasheetHoverEvidence = useCallback(
    (slug: string | null) => {
      panelHoverNodeIdRef.current = slug ? (chatNodeIndex.get(slug) ?? null) : null;
    },
    [chatNodeIndex],
  );

  // A node click defaults to the compact ego popover; the full-detail overlay is
  // opt-in (overview first, details on demand — `docs/design/topology-focus-and-scale.md`).
  // This holds the slug whose full detail is open, and the overlay renders only when
  // it matches the current selection, so picking another node falls back to its
  // popover with no effect needed.
  const [fullDetailSlug, setFullDetailSlug] = useState<string | null>(null);
  // Node right-click context menu. `slug` here is the CANVAS graph
  // node id (`OntologyMapNode.id`, same id space `onSelect`/`handleSelect`
  // use), reported by `use-topology-loop.ts`'s tier-aware hit test; `x`/`y`
  // are viewport-space cursor coordinates the menu anchors to.
  const [contextMenuNode, setContextMenuNode] = useState<
    { slug: string; x: number; y: number } | null
  >(null);
  const closeContextMenu = useCallback(() => setContextMenuNode(null), []);
  /*
   * A menu belongs to the moment it was opened in. When the selection moves on
   * (INDEX, search, the keyboard walk), the camera moves with it and the node the
   * menu hangs off slides away — the menu used to stay behind, floating over the
   * newly opened panel. Adjusted during render, not in an effect, so the stale
   * menu never paints a frame over the new panel.
   */
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
  // The last screen coordinates pressed on the map. The detail popover uses them as
  // its growth origin so it appears to grow out of the node that was clicked.
  // Selections that are not canvas clicks (INDEX, a connection row, the keyboard)
  // have no coordinates and fall back to `center top`.
  const lastCanvasPointerRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const nodePopoverPositionerRef = useRef<HTMLDivElement | null>(null);
  const handleCanvasPointerDownCapture = useCallback((event: ReactPointerEvent) => {
    lastCanvasPointerRef.current = { x: event.clientX, y: event.clientY, at: performance.now() };
  }, []);
  const [selectedRelationActive, setSelectedRelationActive] = useState(false);
  // In the Esc dismissal order, the first press closes the node popover WITHOUT
  // releasing the ego focus (the dim); the second — with this true — deselects. Reset
  // to false on every fresh node selection so re-clicking a node always reopens its
  // popover. A `null` selection also clears it via `handleClose`.
  const [nodePopoverDismissed, setNodePopoverDismissed] = useState(false);
  const detailKeyboardTargetRef = useRef<string | null>(null);
  const detailCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const fullDetailOpen =
    fullDetailSlug != null && fullDetailSlug === selectedOntologyNode?.id;
  /**
   * Full detail is a lazy chunk. It used to paint the opaque full-bleed surface
   * (`fixed inset-0` plus the canvas background) the instant `fullDetailOpen` went
   * true, while its contents arrived only once the chunk did — so after the press
   * **the whole window held black for 150 ms** (frame diff exactly 0.000 across nine
   * frames) and the destination popped in one frame. An arrival with no visible
   * origin, and it reads as the app having died.
   *
   * So the order is inverted: **the departure screen (the map) stays** until the
   * chunk is ready. The arrival then puts background and content in one commit and
   * resolves as a single crossfade — the same grammar close already used, leaving by
   * the way you came. No skeleton and no fake progress bar: the departure screen
   * covers that time.
   *
   * Prewarming happens the moment a node is selected — that is, the moment the
   * popover with the full-detail action becomes visible — so by the time it is
   * actually pressed there is nothing left to wait for.
   */
  const [FullDetailCard, setFullDetailCard] = useState<FullDetailA1Component | null>(null);
  useEffect(() => {
    if (FullDetailCard) return;
    if (!selectedOntologyNode && fullDetailSlug == null) return;
    let cancelled = false;
    void importFullDetailA1()
      .then((mod) => {
        // Wrapped once so a function value is not mistaken for a state updater.
        if (!cancelled) setFullDetailCard(() => mod.FullDetailA1);
      })
      .catch(() => {
        /* A failed chunk leaves the render gate below closed, as it already is. */
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
