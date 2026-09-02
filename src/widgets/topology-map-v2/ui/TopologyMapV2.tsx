"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Orbit } from "lucide-react";
import { MAP_CANVAS_SURFACE_ROLE } from "@/shared/lib/focus-map-canvas";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useTopologyLoop } from "./use-topology-loop";
import type { TierRevealConfig } from "../model/tier-visibility";
import type { TopologyMapLensKind } from "../model/path-lens";
import type { ClusterBarLabels } from "../render/cluster-chips";
import { DEFAULT_EXPAND, DEFAULT_MAP_ARRANGEMENT } from "@/shared/lib/appearance-preferences";
import type { CanvasBackground, ExpandPreference, FootprintPreference, GlyphSet, MapArrangement } from "@/shared/lib/appearance-preferences";
import { controlClass } from '@/shared/ui/control-class';
import { usePanelPresence } from "@/shared/lib/use-presence";

/**
 * How long the notice stays on screen.
 *
 * ⚠️ It was set to 1100ms at first and **the test caught it** — across eight
 * presses it had already vanished, so the notice was never once seen. A person is
 * in the same position: reading one line takes longer than that. 1900ms is enough
 * to read and press the next direction, and it still disappears on its own.
 *
 * It may exceed the cooldown (`DEAD_END_NOTICE_COOLDOWN_MS`, 1200ms) — hitting
 * another dead end restarts the timer and moves the notice **beside the new node**.
 */
const WALK_NOTICE_HOLD_MS = 1900;

/** From the node's centre to the notice's bottom edge — the largest node radius (30) plus 8 of breathing room. */
const WALK_NOTICE_NODE_GAP = 38;
import { useReducedMotion } from "framer-motion";
import { transientSurface } from "@/shared/ui/transient-surface";

/**
 * `TopologyMapV2` — the product's single current canvas-2D topology renderer.
 * The former DOM canvas and Sigma/WebGL implementations are retired and
 * deleted; `HomePage` supplies the current adapter contract (selected slug,
 * path query, visibility and interaction callbacks) directly to this widget.
 *
 * The component itself stays a thin JSX shell — mount/resize/rAF-loop/
 * pointer/camera/draw wiring all live in `use-topology-loop.ts` (+ its
 * `topology-world.ts`/`topology-camera-math.ts`/`topology-frame-draw.ts`
 * helpers), per this file's own 300-line budget (`.claude/rules/*`).
 */

export interface TopologyV2Node {
  id: string;
  label: string;
  kind: "project" | "domain" | "capability" | "element";
  size: number;
  x: number;
  y: number;
  isHub: boolean;
  ownerKey: string | null;
  recentlyUpdated: boolean;
  /**
   * The raw authorship source (`created_by`) — `human`, `agent:<name>`, or absent.
   * The review-pending ring is drawn only when the value is **exactly** `human`.
   * Absent is unknown, not human (ledger 2026-07-31 — no retroactive inference).
   */
  createdBy?: string;
  /** Living-map drift — the dusty decision derived from vault mtime
   *  (`views/home/lib/topology-dusty.ts`). true renders through the existing stale
   *  channel (dash plus the opaque stale token). Omitted means fresh. */
  stale?: boolean;
  fullDegree: number;
  /** Transitive contained-descendant count — the engraved numeral shown on project/domain chips in circuit range (prototype `n.count`). */
  descendantCount: number;
}

export interface TopologyV2Edge {
  /** Original KnowledgeGraphEdge identity. External embeds may be omitted. */
  id?: string;
  source: string;
  target: string;
  relationType: string;
  relationQuality: "strong" | "weak" | null;
  evidenceCount: number;
  kind: "contains" | "depends";
  /** P3b — the vault document slug that declared this relation (frontmatter *is* the graph, so showing provenance costs nothing). */
  declaredBySlug: string | null;
}

interface TopologyV2Focus {
  /**
   * The only focus field the v2 canvas loop actually consumes. The old
   * depthLimit/searchQuery/activeCategory/hubsOnly were dead fields the renderer
   * never read, and they went with the controls panel (the loop computes ego focus
   * only).
   */
  selectedSlug: string | null;
}

interface TopologyV2PreviewEdge {
  sourceId: string;
  targetId: string;
  relationType: string;
  phase: "draft" | "committing";
}

/**
 * Adapter contract (`docs/TOPOLOGY-V2-DESIGN.md` §5.3 — v2 only replaces rendering, not
 * the upstream state/callback contract).
 */
export interface TopologyMapV2Props {
  nodes: readonly TopologyV2Node[];
  edges: readonly TopologyV2Edge[];
  focus: TopologyV2Focus;
  /**
   * **Which vault this graph came from** — a changed value re-fits the overview.
   *
   * The single source of the identity string is `useVaultIdentityScope()`
   * (`features/vault-scope`). What triggers here is **the source, not the node
   * count**: hijacking the camera when the user adds one node mid-work is worse
   * than the original defect, so it only re-fits on a sample↔local or sample↔sample
   * switch. Omitted, it fits once at first as before.
   */
  dataSourceKey?: string | null;
  /** Increment to re-run fit-to-bounds (HomePage's "fit the map" — fit the map). */
  fitViewToken: number;
  /** Bump to replay the ontology growing in containment order (`model/growth-replay.ts`). */
  growthReplayToken?: number;
  /** The token that fits the camera to the emphasised nodes when the lens or period changes. */
  spotlightFitToken?: number;
  /** Increment to force a full relayout. */
  relayoutToken: number;
  /** P3d(E1) — the first-map reveal trigger (incremented when bootstrap completes). */
  revealToken?: number;
  /** P3b — an edge click (at a point that missed every node). */
  onSelectEdge?: (edge: { sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null }) => void;
  /** Edge selection = pair focus — only the two ends stay lit, everything else dims, and the selected edge is pale indigo. */
  selectedEdge?: { sourceId: string; targetId: string } | null;
  /** Pre-write relation overlay. It never enters the force/layout graph. */
  previewEdge?: TopologyV2PreviewEdge | null;
  /** P3c — the edge hover microcard (fires on an identity change; null clears it). */
  onHoverEdge?: (
    edge: { sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null } | null,
    position: { x: number; y: number } | null,
  ) => void;
  /**
   * The connected-node slug the user is hovering in the detail panel's
   * "connected nodes" (connected nodes) list. Under focus, that node and its connecting
   * edge light up on the canvas so panel and map read as one (lead spec §4).
   * Optional — the panel-hover wiring is a follow-up; omitting it keeps the map
   * behavior identical.
   */
  emphasizedNeighborSlug?: string | null;
  onSelect?: (slug: string) => void;
  /** An arrow key was pressed with nowhere to go in that direction. The page decides the copy. */
  onWalkDeadEnd?: ((point: { x: number; y: number } | null) => void) | null;
  onOpen?: (slug: string) => void;
  onPaneClick?: () => void;
  onVisibleCountChange?: (visible: number) => void;
  onGraphStatsChange?: (stats: { nodes: number; relations: number }) => void;
  /**
   * M-5 — semantic-zoom tier (spine → circuit → element) changed. Fires only
   * on transitions; HomePage feeds it to the corner readout so the "zoom in to
   * see elements" hint drops once elements are actually on screen.
   */
  onZoomTierChange?: (tier: "spine" | "circuit" | "element") => void;
  /**
   * W2-B node right-click context menu — called with the hit node's id and
   * viewport-space cursor position. Omitted keeps right-click behavior
   * unchanged (browser default menu everywhere, same as before this slice).
   */
  onContextMenuNode?: (slug: string, position: { x: number; y: number }) => void;
  /** Right-click on empty canvas — "create a concept here" (create a concept here). Omitted, it is a no-op as before. */
  onContextMenuPane?: (position: { x: number; y: number }) => void;
  /**
   * Density gate — the set of parent slugs the user has expanded (URL `?open=`).
   * A parent with more children than the threshold (12) is collapsed by default (a
   * cluster chip), and only the parents in this set reveal their children.
   * Omitted or empty means everything is collapsed.
   */
  expandedParents?: ReadonlySet<string>;
  /** Density gate — a cluster chip click toggles that parent's expansion (HomePage does the URL round trip). */
  onToggleCluster?: (parentId: string) => void;
  /** S2 part 5C — the cluster chip hover tooltip (fires on an identity change; null clears it). */
  onHoverCluster?: (
    info: {
      parentId: string;
  /** Direct gated children collapsed at this tier (the chip's `+N`). */
      count: number;
  /** Panel3-S6 — the parent's total descendant count (the node badge = descendantCount). */
      descendantTotal: number;
      expanded: boolean;
      position: { x: number; y: number };
    } | null,
  ) => void;
  /**
   * Density gate — the accessibility hint for the cluster chip affordance (i18n,
   * injected by HomePage). Chips are canvas glyphs and cannot carry individual aria,
   * so an sr-only description inside the container tells a screen reader what is
   * collapsed and how to expand it.
   */
  clusterHint?: string;
  /** Embed mode (project detail neighbor map) — reduced physics/chrome. */
  minimal?: boolean;
  /**
   * W6 agent visibility — the graph node id matching the agent heartbeat's
   * current focus (already resolved to `kind:slug` form by `HomePage`), or
   * `null`/omitted when there's no fresh heartbeat focus. Draws a static
   * amber ring + label activity mark on that one node; never fabricated.
   */
  agentFocusNodeId?: string | null;
  /**
   * The recently-changed spotlight (`?recent=`, council design 2026-07-23) —
   * non-null turns on a lens that sinks every node and edge outside this set to the
   * rest alpha. Nodes inside the set are lit by HomePage swapping the fresh channel
   * key (changedSlugs) over the same window. null or omitted is off.
   */
  spotlightIds?: ReadonlySet<string> | null;
  /** The meaning currently carried by the same lens mechanism. Omission refers to existing recent changes. */
  mapLensKind?: TopologyMapLensKind;
  /** Only authored edge ids actually included in the shortest path. */
  pathEdgeIds?: ReadonlySet<string> | null;
  /**
   * S4 realm expansion — the map has switched to this node's world (`?realm=slug`);
   * without it, the full map. HomePage derives it from the URL.
   */
  realmRootId?: string | null;
  /** S4 — clicking the orbit "expand" button enters the realm at this slug (HomePage does the URL round trip). */
  onEnterRealm?: (slug: string) => void;
  /** S4 — the orbit button's accessible label (i18n, injected by HomePage). The user-facing wording is "show only this" (show only this; owner decision 2026-07-23) while the internal name stays realm. */
  realmEnterLabel?: string;
  /** S4 — the orbit button's hover microtooltip copy ("look only inside this node" — look only inside this node). */
  realmEnterTooltip?: string;
  /**
   * The inventory engraving at the warding circle's base — "○○ · N elements" (i18n,
   * injected by HomePage). The widget does not count for itself but receives the
   * string, so it shares a single source with the ledger panel's inventory. null or
   * omitted means no engraving.
   */
  realmCaption?: string | null;
  /**
   * The copy for "the bar above the head" (the bar above the head) — "expand all" /
   * "expand N" / "collapse" (expand all / expand N / collapse), i18n, injected by
   * HomePage. The canvas renderer never composes strings (the same convention as
   * the warding caption). Omitted draws an English fallback, so a contract test
   * catches a broken wiring.
   */
  clusterBarLabels?: ClusterBarLabels | null;
  /**
   * H3 P2 — the canvas accessibility label (i18n, injected by HomePage). A canvas
   * is painted pixels and reads to a screen reader as an empty graphic, so
   * `role="img"` plus this label states what it is and what the keyboard
   * alternative is (the INDEX panel) in one sentence. Omitted, neither role nor
   * label is set (zero regression).
   */
  canvasLabel?: string;
  /**
   * The dead-end notice copy — **the copy belongs to the page** (the same reason as
   * `canvasLabel`: this widget has tests that render it with no provider). The
   * widget decides the position and the moment it disappears — only the side that
   * knows the canvas coordinates can.
   */
  walkNoticeLabel?: string;
  /**
   * The footprint trail (fable design) — the node ids visited (ego focused) during
   * the session, oldest to most recent. Each visited node gets a pale indigo
   * hairline ring that decays with recency (a static marking). HomePage's session
   * state passes it down. Omitted or empty means no footprints.
   */
  visitedTrail?: readonly string[];
  /**
   * A ref holding whether the trail lens is on — true while the trail popover is
   * open. The map briefly sets aside reading relations and yields to reading the
   * path: only the `visitedTrail` nodes keep their values and labels, and every
   * other node, cluster chip, label and edge recedes to the existing dim values.
   * It is not a new mode or URL state but is equivalent to the popover being open
   * (a transient surface). It is a ref for the same reason as the brushing below —
   * so a toggle does not re-render the page tree.
   */
  trailLensActiveRef?: RefObject<boolean>;
  /**
   * Trail brushing — a ref holding the node id of the row being hovered in the
   * popover (valid only during the lens). A ref rather than a value because lifting
   * a signal that changes continuously while scanning rows into state re-renders the
   * whole page tree on every hover (measured ~100ms). The frame loop reads it every
   * frame, so the same result costs zero renders.
   */
  trailHoverNodeIdRef?: RefObject<string | null>;
  /** Set when the pointer is over a node's name in a side panel (the conversation
   *  panel or the datasheet) — see `use-topology-loop`. */
  panelHoverNodeIdRef?: RefObject<string | null>;
  /**
   * Slice C (the dev/non-dev mode toggle) — the display-lens tier gate config.
   * Omitted defaults to `DEFAULT_TIER_REVEAL` (dev mode). In non-dev (plain) mode
   * HomePage passes `PLAIN_TIER_REVEAL` (element always hidden).
   */
  tierReveal?: TierRevealConfig;
  /**
   * The bbox the overview camera fits — `"spine"` (default) is project/domain/hub,
   * `"full"` is every node. Only a consumer that draws every tier on entry (the
   * gateway's evidence section — `GATEWAY_TIER_REVEAL`) passes `"full"`: drawing
   * every tier while fitting the spine bbox seats the graph low in the frame,
   * because its mass sits below the spine's centre (measured 2026-08-18 at 1512:
   * 143px of blank above, 17px below). The workbench default is unchanged — on an entry
   * that draws the spine only, fitting the full bbox was a regression that shrank 8
   * nodes to dots (the `use-topology-loop` trySnapInitialCamera doc-block).
   */
  overviewFit?: "spine" | "full";
  /**
   * The guided tour (2026-07-23, `src/features/guided-tour`) — the projection
   * contract for canvas node anchors (steps 2 and 4). It points at a node rather
   * than DOM, so it copies the realm "expand" button's precedent verbatim (the
   * per-frame `worldToScreen` block in `use-topology-loop.ts`). While this node id
   * is non-null the loop writes a transform plus `--tour-anchor-r` into
   * `tourAnchorRef`'s DOM every frame. Resolving the id (choosing project, domain
   * or hub) belongs to HomePage (`resolve-tour-anchor-node.ts`) — this widget only
   * projects.
   */
  tourAnchorNodeId?: string | null;
  /**
   * The guided tour's anchor circle DOM — HomePage/`GuidedTourOverlay` creates it
   * and passes it down here as well (the overlay is what reads the rect to place
   * its cutout). This component renders the actual element and only the ref is
   * shared outward.
   */
  tourAnchorRef?: RefObject<HTMLDivElement | null>;
  /**
   * rank18 (design council batch B1) — while a DOM overlay (GlobalSearch and the
   * like) is open, the canvas is excluded from the keyboard and screen-reader tree.
   * A canvas is painted pixels and offers no keyboard traversal of its own, and
   * INDEX/the datasheet are already accessible alternatives, so the canvas hides
   * only while an overlay is open (no new alternative UI — the existing INDEX and
   * datasheet are reused).
   */
  overlayOpen?: boolean;
  /**
   * The icon set (Phase 5 #21) — the node body's render style. HomePage reads it
   * with `useGlyphSet()` and passes it down. The DOM glyph
   * (`TopologyV2KindGlyph`) reads the same store itself, so canvas and DOM swap in
   * lockstep. Omitted defaults to `"geometric"`.
   */
  glyphSet?: GlyphSet;
  /**
   * The canvas background set — dots (default), relation web, or depth grid.
   * HomePage reads it with `useCanvasBackground()` and passes it down. Omitted
   * defaults to `"dot"`.
   */
  canvasBackground?: CanvasBackground;
  /**
   * 3D view (2026-08-18, opt-in) — ownership becomes the Cone tree and
   * coupling becomes the relation-driven Cloud (`model/dome-view.ts`). The top
   * toolbar's 3D picker turns it on; omitted is false (2D, the default).
   */
  view3d?: boolean;
  /**
   * Which structural question places nodes in 3D — `ownership` uses containment
   * tiers in the Dome (default); `coupling` lets relations determine all three
   * Cloud axes. The rationale and geometry live in `model/dome-view.ts`. Ignored
   * in 2D.
   */
  mapArrangement?: MapArrangement;
  /**
   * 3D reframing input (2026-08-18, second pass) — whether the node detail panel is
   * actually covering the screen. To the dome camera, that panel opening or closing
   * is a window-resize event, so every flip of this value smoothly reframes the
   * selected node against the visible area. Ignored in 2D (omitted is false).
   */
  detailPanelVisible?: boolean;
  /** The footprint appearance setting — read with `useFootprint()` and passed down. Omitted means no footprints. */
  footprint?: FootprintPreference | null;
  /**
   * The expand settings — the expand affordance (pill/bar/badge), the child layout,
   * how many open at once, how many to attempt naming, and how many parents stay
   * expanded together. HomePage reads them with `useExpand()` and passes them down.
   * Omitted defaults to `DEFAULT_EXPAND` (identical to a screen that never touched
   * settings).
   */
  expand?: ExpandPreference;
  /**
   * Who owns the wheel and a vertical swipe — see the `wheelIntent` documentation in
   * `topology-pointer-handlers.ts`. The workbench omits it (= `"zoom"`, unchanged);
   * only a surface embedded as a band inside a scrolling document passes
   * `"page-scroll"`.
   */
  wheelIntent?: "zoom" | "page-scroll";
  /**
   * How long without input before ambient motion sleeps. Omitted uses the workbench
   * default (`AMBIENT_SLEEP_DELAY_MS`, 30 seconds — the value for a surface where a
   * person **keeps the map open for a long time** while judging).
   *
   * A surface like the gateway, where the session itself can be shorter than that,
   * passes something shorter. Measured (motion seat, 2026-07-28): a `/download`
   * visitor **could not structurally reach sleep** — the canvas is 62% of the
   * viewport, so merely moving the mouse toward a CTA fired `pointermove` and reset
   * the 30-second clock. And nothing on that surface earns the burn (measured change
   * per second on an awake canvas: 0.056% — the comets are not perceived). It was
   * paying workbench rates for a poster.
   */
  ambientSleepDelayMs?: number;
}

export function TopologyMapV2(props: TopologyMapV2Props) {
  const { nodes, edges, focus, minimal, emphasizedNeighborSlug, dataSourceKey = null, overviewFit = "spine", fitViewToken, growthReplayToken = 0, spotlightFitToken = 0, relayoutToken, revealToken, onSelectEdge, onSelect, onPaneClick, onVisibleCountChange, onGraphStatsChange, onZoomTierChange, onContextMenuNode, onContextMenuPane, agentFocusNodeId, spotlightIds = null, mapLensKind = "recent", pathEdgeIds = null, onHoverEdge, selectedEdge = null, previewEdge = null, expandedParents, onToggleCluster, onHoverCluster, clusterHint, realmRootId = null, onEnterRealm, realmEnterLabel, realmEnterTooltip, realmCaption = null, clusterBarLabels = null, canvasLabel, walkNoticeLabel, visitedTrail, trailLensActiveRef, trailHoverNodeIdRef, panelHoverNodeIdRef, tierReveal, tourAnchorNodeId = null, tourAnchorRef, overlayOpen = false, glyphSet = "geometric", canvasBackground = "dot", view3d = false, mapArrangement = DEFAULT_MAP_ARRANGEMENT, detailPanelVisible = false, footprint = null, expand = DEFAULT_EXPAND, wheelIntent = "zoom", ambientSleepDelayMs, onWalkDeadEnd = null } = props;

  const realmEnterButtonRef = useRef<HTMLButtonElement | null>(null);

  // The installed app's verifier cannot find a pixel edge inside the canvas with a
  // DOM selector. When the verification-only event arrives, the real graph edge
  // touching the current focus is selected through the same onSelectEdge contract.
  // The event never fires in normal use, and it uses no extra state and no user vault.
  useEffect(() => {
    if (!onSelectEdge) return;
    const handleVerifySelectEdge = (event: Event) => {
      const preferredNodeId =
        event instanceof CustomEvent &&
        typeof event.detail?.preferredNodeId === "string"
          ? event.detail.preferredNodeId
          : focus.selectedSlug;
      const edge =
        edges.find(
          (candidate) =>
            candidate.source === preferredNodeId || candidate.target === preferredNodeId,
        ) ?? edges[0];
      if (!edge) {
        window.dispatchEvent(
          new CustomEvent("ontology-atlas:verify-edge-selected", {
            detail: { error: "missing-edge" },
          }),
        );
        return;
      }
      onSelectEdge({
        sourceId: edge.source,
        targetId: edge.target,
        relationType: edge.relationType,
        declaredBySlug: edge.declaredBySlug,
      });
      window.dispatchEvent(
        new CustomEvent("ontology-atlas:verify-edge-selected", {
          detail: {
            sourceId: edge.source,
            targetId: edge.target,
            relationType: edge.relationType,
          },
        }),
      );
    };
    window.addEventListener("ontology-atlas:verify-select-edge", handleVerifySelectEdge);
    return () => {
      window.removeEventListener("ontology-atlas:verify-select-edge", handleVerifySelectEdge);
    };
  }, [edges, focus.selectedSlug, onSelectEdge]);

  // `handleWheel` is wired natively (non-passive) inside `useTopologyLoop` —
  // see its own FIX comment — not bound here as a JSX prop.
  /**
   * The dead-end notice — **beside the node, self-dismissing, and it never takes
   * focus** (three owner reports from real use, 2026-08-10).
   *
   * ## Why the app's shared toast was abandoned
   *
   * It started as a toast. The judgement "do not create a new surface" was right
   * even then, but in the real thing three things were wrong at once — and all
   * three came from **one cause**:
   *
   * | What the owner saw | Cause |
   * |---|---|
   * | "I can't tell when it appears like this" (like this I can't tell) | A toast sits at the screen's bottom right. The blocked node is somewhere in the middle, and a sentence 500px away does not connect to "the thing I just pressed" |
   * | "It doesn't disappear, it just stays" (it doesn't disappear, it just stays) | When the close button takes focus, sonner stops its own dismissal timer |
   * | "Without pressing x you can't even move" (without pressing x you can't even move) | Once focus moves to the toast, arrow keys never reach the canvas |
   *
   * So this notice has to be **something that cannot take focus** — no button, and
   * `pointer-events: none`. Nothing is lost by missing it (that there is no node in
   * that direction can be learned again by pressing again), which also fits the
   * toast discipline (*"anything you cannot afford to miss belongs to a permanent
   * surface"*). Assistive technology reads it through `aria-live`.
   *
   * The motion uses **machinery that already exists** — `usePanelPresence` plus
   * `overlay-spring-surface` (`overlay-fade-only` for reduced motion). Zero new
   * keyframes, zero new tokens.
   */
  const [notice, setNotice] = useState<{ x: number; y: number; key: number } | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();
  const noticePresence = usePanelPresence(notice !== null);
  const handleWalkDeadEnd = useCallback(
    (point: { x: number; y: number } | null) => {
      onWalkDeadEnd?.(point);
      if (!walkNoticeLabel || !point) return;
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
      setNotice({ x: point.x, y: point.y, key: performance.now() });
      noticeTimerRef.current = window.setTimeout(() => {
        noticeTimerRef.current = null;
        setNotice(null);
      }, WALK_NOTICE_HOLD_MS);
    },
    [onWalkDeadEnd, walkNoticeLabel],
  );
  useEffect(
    () => () => {
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    },
    [],
  );

  const { canvasRef, containerRef, handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel, handleContextMenu, handleKeyDown } =
    useTopologyLoop({
      nodes,
      edges,
      onWalkDeadEnd: handleWalkDeadEnd,
      wheelIntent,
      ambientSleepDelayMs,
      focusedSlug: focus.selectedSlug,
      emphasizedNeighborSlug,
      dataSourceKey,
      fitViewToken,
      growthReplayToken,
      spotlightFitToken,
      relayoutToken,
      revealToken,
      onSelectEdge,
      onHoverEdge,
      selectedEdge,
      previewEdge,
      onSelect,
      onPaneClick,
      onVisibleCountChange,
      onGraphStatsChange,
      onZoomTierChange,
      onContextMenuNode,
      onContextMenuPane,
      agentFocusNodeId,
      spotlightIds,
      mapLensKind,
      pathEdgeIds,
      expandedParents,
      onToggleCluster,
      onHoverCluster,
      realmRootId,
      onEnterRealm,
      realmEnterButtonRef,
      realmCaption,
      clusterBarLabels,
      visitedTrail,
      trailLensActiveRef,
      trailHoverNodeIdRef,
      panelHoverNodeIdRef,
      tierReveal,
      overviewFit,
      tourAnchorNodeId,
      tourAnchorRef,
      glyphSet,
      canvasBackground,
      view3d,
      mapArrangement,
      detailPanelVisible,
      footprint,
      expand,
    });

  return (
    <div
      ref={containerRef}
      data-testid="topology-map-v2"
      data-map-engine="v2"
      data-minimal={minimal ? "true" : "false"}
      data-source-node-count={nodes.length}
      data-map-lens={spotlightIds ? mapLensKind : undefined}
      data-path-node-count={mapLensKind === "path" ? spotlightIds?.size : undefined}
      data-path-edge-count={mapLensKind === "path" ? pathEdgeIds?.size ?? 0 : undefined}
      data-preview-edge={
        previewEdge
          ? `${previewEdge.sourceId}>${previewEdge.targetId}:${previewEdge.relationType}`
          : undefined
      }
      data-preview-phase={previewEdge?.phase}
      // rank18 — while an overlay is open the canvas is excluded from the aria tree
      // and Tab traversal (inert blocks the pointer too). INDEX and the datasheet
      // are the alternative list.
      aria-hidden={overlayOpen}
      inert={overlayOpen}
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      <canvas
        ref={canvasRef}
        data-testid="topology-map-v2-canvas"
        /* The marker `G M` uses to find this canvas and focus it — the full reason is
           in `shared/lib/focus-map-canvas.ts`. `data-testid` belongs to the tests and
           is never used as a runtime selector. */
        data-surface-role={MAP_CANVAS_SURFACE_ROLE}
        /**
         * **Something you can drag is not a picture** (motion seat P3, 2026-07-28).
         *
         * It used to declare `role="img"` — a still image — to assistive technology
         * while the label said "you can drag it around". The affordance contradiction
         * was written straight into the accessibility tree. There was no `tabIndex`
         * either, so a keyboard user got **zero** signals.
         *
         * Why `group` rather than `role="application"`: `application` takes away the
         * assistive technology's default key handling entirely. The old reasoning was
         * *"this canvas offers no keyboard traversal of its own, so taking the keys
         * away and giving nothing back is the worst option"*.
         *
         * ⚠️ **That premise stopped being true on 2026-08-09** — arrow-key traversal
         * of neighbours was added (`onKeyDown`). `group` stays anyway: the only keys
         * we swallow are **the four arrows**, and leaving the rest to assistive
         * technology loses less than taking all key handling. If an environment is
         * observed where a screen reader's browse mode claims the arrow keys first,
         * `application` gets another look then — nothing is taken away pre-emptively
         * without measuring against real assistive technology.
         *
         * The focus ring is **also an affordance of the still frame** — zero motion budget.
         */
        role={canvasLabel ? "group" : undefined}
        aria-label={canvasLabel}
        tabIndex={canvasLabel ? 0 : undefined}
        // Why `cursor-grab` is the **default state** (council "Interaction" —
        // interaction — 2026-07-28): this canvas's primary action is panning. The
        // pointer handlers override it inline with `pointer` over a node or edge, and
        // `grabbing` while pushing.
        //
        // **It has to be a class, not an inline style.** When a drag ends and resets
        // with `style.cursor = ""`, an inline default erases itself and falls to
        // `auto` (measured). As a class, the cascade restores `grab` where the inline
        // value was lifted — the reset becomes correct by itself.
        className="cursor-grab outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)]"
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          // `none` swallows a vertical swipe too — inside a scrolling document the
          // page then will not move at all on a phone. With `pan-y` the page takes
          // vertical and the map takes a horizontal drag.
          touchAction: wheelIntent === "page-scroll" ? "pan-y" : "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onContextMenu={handleContextMenu}
        /**
         * Walk neighbours with the arrow keys (2026-08-09, option B). The rules are in
         * `../interaction/keyboard-walk` and the wiring is `use-topology-loop`'s
         * `handleKeyDown`. Until this was added, the canvas could take focus but there
         * were **zero things a key could do**.
         */
        onKeyDown={handleKeyDown}
      />
      {/* The S4 orbit "expand" button — anchored to canvas coordinates (the loop
          refreshes the transform every frame). Hidden by default; shown only when the
          focused node has children and sits outside a realm. No radial menu — one
          button. A microtooltip on hover (one plain line). */}
      {onEnterRealm ? (
        <button
          ref={realmEnterButtonRef}
          type="button"
          data-testid="topology-realm-enter-button"
          aria-label={realmEnterLabel}
          /**
           * **While invisible it is not a tab stop** (keyboard measurement, 2026-07-29).
           *
           * This button appears and disappears every frame through `opacity` and
           * `pointerEvents` alone (to preserve layout), and `opacity: 0` **does not
           * turn off focusability.** So the 26th Tab on the map stopped here: the ring
           * draws at alpha 0 and is nowhere on screen, and pressing Enter does nothing
           * (the click decision lives in the canvas's hit test). To a keyboard user it
           * is **a slot where focus vanishes**.
           *
           * Paired with `pointer-events: none`, it drops out of the tab order and hides
           * from screen readers too. Both come back when it is visible.
           */
          tabIndex={-1}
          aria-hidden
          // rank6 — it always lays out with flex and appears and disappears through
          // opacity and pointer-events alone (refreshed by the loop every frame). An
          // opacity transition fades it instead of the hard jolt of toggling display,
          // while camera following is preserved.
          // The duration names the ramp's "movement" step (--motion-base): this
          // transition's protagonist is the control appearing and leaving rather than
          // its hover colour, and leaving it on the default (confirmation, 120ms) puts
          // the jolt back into the fade. The easing keeps the same curve as the map surface.
          className={controlClass({ shape: "icon", className: "group absolute left-0 top-0 z-40 flex h-7 w-7 rounded-full border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] text-[color:var(--topology-v2-indigo-bright)] shadow-[var(--topology-v2-panel-shadow)] transition-[opacity,background-color] duration-[var(--motion-fast)] ease-[var(--topology-motion-ease-out)] hover:bg-[color:var(--topology-v2-panel-row-hover)]" })}
          style={{ opacity: 0, pointerEvents: "none" }}
        >
          <Orbit size={ICON_SIZE.md} aria-hidden />
          {/*
           * **This tooltip is not drawn in 3D** (owner instruction, 2026-08-18).
           *
           * This button moves to the node's **projected** position every frame. In 2D
           * a still camera means a still position, so the text box below it stays put;
           * in the dome the node keeps moving with rotation and perspective, so the
           * same text box slides across the scene — by the time your eyes settle to
           * read it, it has gone elsewhere.
           *
           * It disables **the explanation, not the feature**: the button and its
           * `aria-label` ("Show only this") are unchanged, so mouse and
           * assistive technology reach it exactly as before.
           */}
          {realmEnterTooltip && !view3d ? (
            <span
              role="tooltip"
              className="pointer-events-none absolute left-1/2 top-full mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded-[var(--topology-v2-panel-radius)] border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] px-2 py-1 text-label font-[var(--font-weight-signature)] text-[color:var(--topology-v2-panel-text-primary)] shadow-[var(--topology-v2-panel-shadow)] group-hover:block"
            >
              {realmEnterTooltip}
            </span>
          ) : null}
        </button>
      ) : null}
      {/* The guided tour's canvas node anchor (steps 2 and 4) — the same projection
          technique as the realm button (the loop refreshes the transform and
          `--tour-anchor-r` every frame). It is a **measurement probe** with no paint:
          the scrim and cutout are painted by GuidedTourOverlay, which reads this rect
          from the z-70 overlay layer (Guardian correction 2026-07-23 — painting the
          scrim at z-40 inside the widget left outer chrome such as the top toolbar
          floating above the scrim, so the testid step and the dimming layered wrongly). */}
      {tourAnchorRef ? (
        <div
          ref={tourAnchorRef}
          data-testid="topology-tour-anchor"
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 z-40"
          style={{
            width: "calc(var(--tour-anchor-r, 0px) * 2)",
            height: "calc(var(--tour-anchor-r, 0px) * 2)",
            visibility: tourAnchorNodeId ? "visible" : "hidden",
          }}
        />
      ) : null}
      {noticePresence.mounted && notice ? (
        <div
          key={notice.key}
          data-walk-notice=""
          {...transientSurface("notice")}
          /* Read by assistive technology, and non-existent to pointer and focus. */
          role="status"
          aria-live="polite"
          data-state={noticePresence.exiting ? "closed" : "open"}
          className={[
            reducedMotion ? "overlay-fade-only" : "overlay-spring-surface",
            "pointer-events-none absolute z-40 max-w-[240px] -translate-x-1/2 -translate-y-full rounded-[var(--topology-v2-panel-radius)] border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] px-2.5 py-1.5 text-label text-[color:var(--topology-v2-panel-text-primary)] shadow-[var(--topology-v2-panel-shadow)]",
          ].join(" ")}
          style={{
            left: notice.x,
            // Raised **above** the node — below it is the label's place (`LABEL_OFFSET`).
            top: notice.y - WALK_NOTICE_NODE_GAP,
            ["--overlay-spring-origin" as string]: "center bottom",
          }}
        >
          {walkNoticeLabel}
        </div>
      ) : null}
      {clusterHint ? (
        <span
          data-testid="topology-cluster-hint"
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: "hidden",
            clip: "rect(0 0 0 0)",
            whiteSpace: "nowrap",
            border: 0,
          }}
        >
          {clusterHint}
        </span>
      ) : null}
    </div>
  );
}
