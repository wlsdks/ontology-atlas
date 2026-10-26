"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { HoverAvoidRect } from "./input/topology-pointer-types";
import type { FlatDialState, FlatRingMemoryStore } from "./loop/topology-loop-contract";
import type { DialEvidence, DialLabels } from "../dial/types";
import { Orbit } from "lucide-react";
import { MAP_CANVAS_SURFACE_ROLE } from "@/shared/lib/map-canvas/focus-map-canvas";
import { copyCanvasAtCssSize, isMapLayoutMorphArmed, publishMapLayoutSnapshot } from "@/shared/lib/map-canvas/map-layout-morph-store";
import { readOntologyMapTokensOrNull } from "../tokens/topology-read-tokens";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { useTopologyLoop } from "./loop/use-topology-loop";
import { OntologyMapTierLegend } from "./OntologyMapTierLegend";
import type { TierNameAnchor } from "../model/dome-view/tier-names";
import type { TierRevealConfig } from "../model/visibility/tier-visibility";
import type { TopologyMapLensKind } from "../model/visibility/path-lens";
import type { ClusterBarLabels } from "../render/cluster-chips";
import type { DomeViewKind } from "../model/dome-view/types";
import type { SelectionSource } from "../model/camera/flat-selection-camera";
import { DEFAULT_EXPAND, DEFAULT_MAP_ARRANGEMENT, DEFAULT_MAP_NAVIGATION_SPEED } from "@/shared/lib/preferences/appearance-preferences";
import type { CanvasBackground, ExpandPreference, FootprintPreference, GlyphSet, MapArrangement, MapNavigationSpeed } from "@/shared/lib/preferences/appearance-preferences";
import { controlClass } from '@/shared/ui/control-class';
import { usePanelPresence } from "@/shared/lib/render-timing/use-presence";
import { measureCanvasInsets } from "../interaction/free-area";

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
import { transientSurface } from "@/shared/ui/surfaces/transient-surface";

export interface OntologyMapNode {
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
   * Raw authorship source (`created_by`): `human`, `agent:<name>`, or absent. The review-pending
   * ring draws only for exactly `human`; absent is unknown, not human.
   */
  createdBy?: string;
  /** Living-map drift — the dusty decision derived from vault mtime
   *  (`views/home/lib/map-canvas/topology-dusty.ts`). true renders through the existing stale
   *  channel (dash plus the opaque stale token). Omitted means fresh. */
  stale?: boolean;
  fullDegree: number;
  /** Transitive contained-descendant count — the engraved numeral shown on project/domain chips in circuit range (prototype `n.count`). */
  descendantCount: number;
}

export interface OntologyMapEdge {
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

interface OntologyMapFocus {
  /**
   * The only focus field the v2 canvas loop actually consumes. The old
   * depthLimit/searchQuery/activeCategory/hubsOnly were dead fields the renderer
   * never read, and they went with the controls panel (the loop computes ego focus
   * only).
   */
  selectedSlug: string | null;
}

interface OntologyMapPreviewEdge {
  sourceId: string;
  targetId: string;
  relationType: string;
  phase: "draft" | "committing";
}

/**
 * Adapter contract (`docs/design/ontology-map.md` §5.3 — v2 only replaces rendering, not
 * the upstream state/callback contract).
 */
export interface OntologyMapProps {
  nodes: readonly OntologyMapNode[];
  edges: readonly OntologyMapEdge[];
  /** Optional diagnostic annotations; these never change the force graph or ontology. */
  relationCaptions?: ReadonlyMap<string, string> | null;
  reviewQuestionIds?: ReadonlySet<string> | null;
  focus: OntologyMapFocus;
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
  assembleOnOpen?: boolean;
  arrivingDocuments?: number;
  /** Increment to re-run fit-to-bounds (HomePage's "fit the map" — fit the map). */
  fitViewToken: number;
  /**
   * Bump to **toggle** the replay of the ontology growing in containment order
   * (`model/ambient/growth-replay.ts`) — a bump while one runs stops it.
   */
  growthReplayToken?: number;
  /** Fires true when a growth replay starts and false when it ends, however it ends. */
  onGrowthReplayingChange?: (running: boolean) => void;
  /** The token that fits the camera to the emphasised nodes when the lens or period changes. */
  spotlightFitToken?: number;
  /** Saved-set focus identity. The loop restores its pre-focus camera when this clears in the same vault. */
  constellationFocusId?: string | null;
  /** Increment to force a full relayout. */
  relayoutToken: number;
  /** P3d(E1) — the first-map reveal trigger (incremented when bootstrap completes). */
  revealToken?: number;
  /** P3b — an edge click (at a point that missed every node). */
  onSelectEdge?: (edge: { sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null;
    }) => void;
  /** Edge selection = pair focus — only the two ends stay lit, everything else dims, and the selected edge is pale indigo. */
  selectedEdge?: { sourceId: string; targetId: string; relationType?: string;
    } | null;
  /** Pre-write relation overlay. It never enters the force/layout graph. */
  previewEdge?: OntologyMapPreviewEdge | null;
  /** P3c — the edge hover microcard (fires on an identity change; null clears it). */
  onHoverEdge?: (
    edge: { sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null;
    } | null,
    position: { x: number; y: number; avoid: readonly HoverAvoidRect[];
    } | null) => void;
  /**
   * The connected-node slug the user is hovering in the detail panel's
   * "connected nodes" (connected nodes) list. Under focus, that node and its connecting
   * edge light up on the canvas so panel and map read as one (lead spec §4).
   * Optional — the panel-hover wiring is a follow-up; omitting it keeps the map
   * behavior identical.
   */
  emphasizedNeighborSlug?: string | null;
  onSelect?: (slug: string, source: SelectionSource) => void;
  /** An arrow key was pressed with nowhere to go in that direction. The page decides the copy. */
  onWalkDeadEnd?: ((point: { x: number; y: number;
    } | null) => void) | null;
  onOpen?: (slug: string) => void;
  onPaneClick?: () => void;
  onVisibleCountChange?: (visible: number) => void;
  onGraphStatsChange?: (stats: { nodes: number; relations: number;
    }) => void;
  /** How many concepts the frame just painted — the bottom readout's own number. */
  onDrawnCountChange?: (drawn: number) => void;
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
  onContextMenuNode?: (slug: string, position: { x: number; y: number;
    }) => void;
    /** Right-click on empty canvas — "create a concept here" (create a concept here). Omitted, it is a no-op as before. */
    onContextMenuPane?: (position: {
        x: number;
        y: number;
    }) => void;
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
      position: { x: number; y: number;
        };
    } | null) => void;
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
   * Recently-changed spotlight (`?recent=`): non-null sinks every node and edge outside this set to
   * the rest alpha. Null or omitted is off.
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
  /** Expanded INDEX covers the map on phones, so its floating controls yield. */
  indexExpanded?: boolean;
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
  /** Translated kind names, each standing beside its Strata plane's rim (`OntologyMapTierLegend`). */
  domeTierLabels?: Readonly<Partial<Record<DomeViewKind, string>>> | null;
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
   * Bbox the overview camera fits: "spine" (default) is project/domain/hub, "full" is every node.
   * Pass "full" only when every tier draws on entry; fitting the spine bbox then seats the graph low
   * in the frame.
   */
  overviewFit?: "spine" | "full";
  /**
   * While a DOM overlay is open the canvas is excluded from the keyboard and screen-reader tree;
   * INDEX and the datasheet remain the accessible alternatives.
   */
  overlayOpen?: boolean;
  /**
   * The icon set (Phase 5 #21) — the node body's render style. HomePage reads it
   * with `useGlyphSet()` and passes it down. The DOM glyph
   * (`OntologyMapKindGlyph`) reads the same store itself, so canvas and DOM swap in
   * lockstep. Omitted defaults to `"geometric"`.
   */
  glyphSet?: GlyphSet;
  /**
   * The canvas background set — dots (default), relation web, or depth grid.
   * HomePage reads it with `useCanvasBackground()` and passes it down. Omitted
   * defaults to `"dot"`.
   */
  canvasBackground?: CanvasBackground;
  view3d?: boolean;
    /**
     * Which structural question places nodes in 3D — `strata` stacks the containment
     * tiers as lit planes (default); `coupling` lets relations determine all three
     * Neural axes. The rationale and geometry live in `model/dome-view/`. Ignored
     * in 2D.
     */
    mapArrangement?: MapArrangement;
  /**
   * Node id to evidence state; sets how much light each node emits. An absent id, or null, is
   * unknown and emits none.
   */
  domeEvidence?: ReadonlyMap<string, "current" | "stale" | "unknown"> | null;
  onHiddenDependenciesChange?: (count: number) => void;
  dialLabels?: DialLabels | null;
  evidenceStates?: ReadonlyMap<string, DialEvidence> | null;
  impactLens?: boolean;
  onFlatDialChange?: (state: FlatDialState) => void;
  flatRingMemory?: FlatRingMemoryStore | null;
  loadProgress?: { read: number; total: number;
    } | null;
  placingTierRead?: boolean;
  /**
   * The lit 3D map's legend — kinds and evidence, composed by the page in its own words and
   * shown only while 3D is on. The widget places it; it owns no copy.
   */
  domeLightLegend?: ReactNode;
  /**
   * Whether the node detail panel covers the screen. To the dome camera its opening or closing is a
   * resize, so each flip reframes the selected node. Ignored in 2D.
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
   * `topology-pointer-types.ts`. The workbench omits it (= `"zoom"`, unchanged);
   * only a surface embedded as a band inside a scrolling document passes
   * `"page-scroll"`.
   */
  wheelIntent?: "zoom" | "page-scroll";
  navigationSpeed?: MapNavigationSpeed;
  /**
   * Idle time before ambient motion sleeps. Omitted uses `AMBIENT_SLEEP_DELAY_MS` (30s, for a
   * long-open workbench); short-session surfaces such as the gateway pass less, since moving the
   * mouse resets the clock.
   */
  ambientSleepDelayMs?: number;
}

export function OntologyMap(props: OntologyMapProps) {
  const { nodes, edges, focus, minimal, emphasizedNeighborSlug, dataSourceKey = null, assembleOnOpen = true, arrivingDocuments = 0, overviewFit = "spine", fitViewToken, growthReplayToken = 0, onGrowthReplayingChange, spotlightFitToken = 0, constellationFocusId = null, relayoutToken, revealToken, onSelectEdge, onSelect, onPaneClick, onVisibleCountChange, onGraphStatsChange, onDrawnCountChange, onZoomTierChange, onContextMenuNode, onContextMenuPane, agentFocusNodeId, spotlightIds = null, mapLensKind = "recent", pathEdgeIds = null, onHoverEdge, selectedEdge = null, previewEdge = null, expandedParents, onToggleCluster, onHoverCluster, clusterHint, realmRootId = null, onEnterRealm, realmEnterLabel, realmEnterTooltip, realmCaption = null, clusterBarLabels = null, domeTierLabels = null, canvasLabel, walkNoticeLabel, visitedTrail, trailLensActiveRef, trailHoverNodeIdRef, panelHoverNodeIdRef, tierReveal, overlayOpen = false, glyphSet = "geometric", canvasBackground = "dot", view3d = false, mapArrangement = DEFAULT_MAP_ARRANGEMENT, detailPanelVisible = false, footprint = null, expand = DEFAULT_EXPAND, wheelIntent = "zoom", navigationSpeed = DEFAULT_MAP_NAVIGATION_SPEED, ambientSleepDelayMs, onWalkDeadEnd = null } = props;

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
            candidate.source === preferredNodeId || candidate.target === preferredNodeId) ?? edges[0];
      if (!edge) {
        window.dispatchEvent(
          new CustomEvent("ontology-atlas:verify-edge-selected", {
            detail: { error: "missing-edge" },
          }));
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
        }));
    };
    window.addEventListener("ontology-atlas:verify-select-edge", handleVerifySelectEdge);
    return () => {
      window.removeEventListener("ontology-atlas:verify-select-edge", handleVerifySelectEdge);
    };
  }, [edges, focus.selectedSlug, onSelectEdge]);

  // `handleWheel` is wired natively (non-passive) inside `useTopologyLoop` —
  // see its own FIX comment — not bound here as a JSX prop.
  /**
   * The dead-end notice sits beside the node, self-dismisses and must never take focus: a focused
   * control stops the dismissal timer and diverts arrow keys from the canvas. So no button and
   * `pointer-events: none`; assistive technology reads it through `aria-live`.
   */
  const [notice, setNotice] = useState<{ x: number; y: number; key: number;
    } | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();
  const noticePresence = usePanelPresence(notice !== null);
  const handleWalkDeadEnd = useCallback(
    (point: { x: number; y: number;
    } | null) => {
      onWalkDeadEnd?.(point);
      if (!walkNoticeLabel || !point) return;
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
      setNotice({ x: point.x, y: point.y, key: performance.now() });
      noticeTimerRef.current = window.setTimeout(() => {
        noticeTimerRef.current = null;
        setNotice(null);
      }, WALK_NOTICE_HOLD_MS);
    },
    [onWalkDeadEnd, walkNoticeLabel]);
  useEffect(
    () => () => {
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    },
    []);

  /*
   * ── Strata's tier names ────────────────────────────────────────────────────
   *
   * Where the frame placed each name beside its plane's rim this frame
   * (`model/dome-view/tier-names.ts`); `OntologyMapTierLegend` draws them and measures them.
   */
  const [tierNames, setTierNames] = useState<readonly TierNameAnchor[] | null>(null);
  const handleTierNames = useCallback((next: readonly TierNameAnchor[] | null) => {
    setTierNames(next);
  }, []);
  const tierNamesActive = view3d && mapArrangement === "strata" && domeTierLabels !== null;

  const { canvasRef, containerRef, raiseDomeTier, setDomeTierNameWidths, readLayoutMarks, handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel, handlePointerLeave, handleContextMenu, handleKeyDown } =
    useTopologyLoop({
      nodes,
      edges,
      relationCaptions: props.relationCaptions,
      reviewQuestionIds: props.reviewQuestionIds,
      onWalkDeadEnd: handleWalkDeadEnd,
      wheelIntent,
      navigationSpeed,
      ambientSleepDelayMs,
      focusedSlug: focus.selectedSlug,
      emphasizedNeighborSlug,
      dataSourceKey,
      assembleOnOpen,
      arrivingDocuments,
      fitViewToken,
      growthReplayToken,
      onGrowthReplayingChange,
      spotlightFitToken,
      constellationFocusId,
      relayoutToken,
      revealToken,
      onSelectEdge,
      onHoverEdge,
      selectedEdge,
      previewEdge,
      onSelect,
      onPaneClick,
      onVisibleCountChange,
      onDrawnCountChange,
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
      onDomeTierAnchorsChange: handleTierNames,
      visitedTrail,
      trailLensActiveRef,
      trailHoverNodeIdRef,
      panelHoverNodeIdRef,
      tierReveal,
      overviewFit,
      glyphSet,
      canvasBackground,
      view3d,
      mapArrangement,
      domeEvidence: props.domeEvidence ?? null,
      onHiddenDependenciesChange: props.onHiddenDependenciesChange,
      dialLabels: props.dialLabels ?? null,
      evidenceStates: props.evidenceStates ?? null,
      impactLens: props.impactLens ?? false,
      onFlatDialChange: props.onFlatDialChange,
      flatRingMemory: props.flatRingMemory ?? null,
      loadProgress: props.loadProgress ?? null,
      placingTierRead: props.placingTierRead ?? false,
      detailPanelVisible,
      footprint,
      expand,
    });

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    return () => {
      if (!isMapLayoutMorphArmed()) return;
      const ground = readOntologyMapTokensOrNull()?.canvasBgNear ?? "transparent";
      publishMapLayoutSnapshot({ marks: readLayoutMarks(), bitmap: copyCanvasAtCssSize(canvas), ground });
    };
  }, [canvasRef, readLayoutMarks]);

  /*
   * Publishes the open panels' measured insets (`measureCanvasInsets`) as
   * `--map-live-inset-left/right` so overlays stop at the panel edge. Re-read when the panel flips,
   * once after its entrance, and on resize.
   */
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const publish = () => {
      const box = canvas.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) return;
      const insets = measureCanvasInsets(canvas, { x: box.x, y: box.y, width: box.width, height: box.height });
      container.style.setProperty("--map-live-inset-left", `${insets.left}px`);
            container.style.setProperty("--map-live-inset-right", `${insets.right}px`);
        };
        publish();
        const settled = window.setTimeout(publish, 360);
        window.addEventListener("resize", publish);
        return () => {
            window.clearTimeout(settled);
            window.removeEventListener("resize", publish);
        };
    }, [canvasRef, containerRef, detailPanelVisible]);
    return (<div ref={containerRef} data-testid="ontology-map" data-map-engine="v2" data-minimal={minimal ? "true" : "false"} data-source-node-count={nodes.length} data-map-lens={spotlightIds ? mapLensKind : undefined} data-path-node-count={mapLensKind === "path" ? spotlightIds?.size : undefined} data-path-edge-count={mapLensKind === "path" ? pathEdgeIds?.size ?? 0 : undefined} data-preview-edge={previewEdge
            ? `${previewEdge.sourceId}>${previewEdge.targetId}:${previewEdge.relationType}`
            : undefined} data-preview-phase={previewEdge?.phase}
    // rank18 — while an overlay is open the canvas is excluded from the aria tree
    // and Tab traversal (inert blocks the pointer too). INDEX and the datasheet
    // are the alternative list.
    aria-hidden={overlayOpen} inert={overlayOpen} style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas ref={canvasRef} data-testid="ontology-map-canvas"
    /* The marker `G M` uses to find this canvas and focus it — the full reason is
       in `shared/lib/map-canvas/focus-map-canvas.ts`. `data-testid` belongs to the tests and
       is never used as a runtime selector. */
    data-surface-role={MAP_CANVAS_SURFACE_ROLE}
    /**
     * `group` rather than `role="application"`: `application` removes assistive technology's default
     * key handling, and only the four arrows are swallowed. Not `img`: the canvas is draggable and
     * keyboard-walkable.
     */
    role={canvasLabel ? "group" : undefined} aria-label={canvasLabel} tabIndex={canvasLabel ? 0 : undefined}
    // `cursor-grab` must be a class, not an inline style: an inline default is erased by `style.cursor
    // = ""` when a drag ends, while the class restores `grab` by cascade.
    className="cursor-grab outline-none data-[keyboard-focus=true]:outline-2 data-[keyboard-focus=true]:outline-solid data-[keyboard-focus=true]:-outline-offset-2 data-[keyboard-focus=true]:outline-[color:var(--color-indigo-focus-ring)]" style={{
            display: "block",
            width: "100%",
            height: "100%",
            // `none` swallows a vertical swipe too — inside a scrolling document the
            // page then will not move at all on a phone. With `pan-y` the page takes
            // vertical and the map takes a horizontal drag.
            touchAction: wheelIntent === "page-scroll" ? "pan-y" : "none",
        }} onPointerDown={(event) => {
            delete event.currentTarget.dataset.keyboardFocus;
            handlePointerDown(event);
        }}
    // Decided once, as focus arrives: a key pressed on a canvas a click focused must not draw the frame.
    onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) event.currentTarget.dataset.keyboardFocus = "true"; }}
    onBlur={(event) => { delete event.currentTarget.dataset.keyboardFocus; }} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerCancel} onPointerLeave={handlePointerLeave} onContextMenu={handleContextMenu}
    onKeyDown={handleKeyDown}/>
      {/* The S4 orbit "expand" button — anchored to canvas coordinates (the loop
                  refreshes the transform every frame). Hidden by default; shown only when the
                  focused node has children and sits outside a realm. No radial menu — one
                  button. A microtooltip on hover (one plain line). */}
      {onEnterRealm && !detailPanelVisible ? (<button ref={realmEnterButtonRef} type="button" data-testid="topology-realm-enter-button" aria-label={realmEnterLabel}
        /**
         * Not a tab stop while invisible: the button hides through `opacity` and `pointerEvents` only, and
         * `opacity: 0` leaves it focusable. With `pointer-events: none` it drops out of tab order and
         * screen readers.
         */
        tabIndex={-1} aria-hidden className={controlClass({ shape: "icon", className: `${props.indexExpanded ? "max-md:hidden " : ""}atlas-touch-floor atlas-touch-floor-wide group absolute left-0 top-0 z-40 flex h-7 w-7 rounded-full border border-[color:var(--map-panel-border)] bg-[color:var(--map-panel-surface)] text-[color:var(--map-indigo-bright)] shadow-[var(--map-panel-shadow)] transition-[opacity,background-color] hover:bg-[color:var(--map-panel-row-hover)]` })} style={{ opacity: 0, pointerEvents: "none" }}>
          <Orbit size={ICON_SIZE.md} aria-hidden/>
          {/* Tooltip is not drawn in 3D: the button follows the node's projected position, which keeps moving
             in the dome, so the text would slide. Only the explanation is disabled; the button and its
             `aria-label` are unchanged. */}
          {realmEnterTooltip && !view3d ? (<span role="tooltip" className="pointer-events-none absolute left-1/2 top-full mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded-[var(--map-panel-radius)] border border-[color:var(--map-panel-border)] bg-[color:var(--map-panel-surface)] px-2 py-1 text-label font-[var(--font-weight-signature)] text-[color:var(--map-panel-text-primary)] shadow-[var(--map-panel-shadow)] group-hover:block">
              {realmEnterTooltip}
            </span>) : null}
        </button>) : null}
      {view3d && props.domeLightLegend ? props.domeLightLegend : null}
      {/* The inspector docks against the same right edge the names favour, and the
                  reader is looking at one concept, so the names step aside while it is open. */}
      {tierNamesActive && !detailPanelVisible ? (<OntologyMapTierLegend names={tierNames ?? []} labels={domeTierLabels!} onRaise={raiseDomeTier} onWidths={setDomeTierNameWidths}/>) : null}
      {noticePresence.mounted && notice ? (<div key={notice.key} data-walk-notice="" {...transientSurface("notice")}
        /* Read by assistive technology, and non-existent to pointer and focus. */
        role="status" aria-live="polite" data-state={noticePresence.exiting ? "closed" : "open"} className={[
                reducedMotion ? "overlay-fade-only" : "overlay-spring-surface",
                "pointer-events-none absolute z-40 max-w-[240px] -translate-x-1/2 -translate-y-full rounded-[var(--map-panel-radius)] border border-[color:var(--map-panel-border)] bg-[color:var(--map-panel-surface)] px-2.5 py-1.5 text-label text-[color:var(--map-panel-text-primary)] shadow-[var(--map-panel-shadow)]"
            ].join(" ")} style={{
                left: notice.x,
                // Raised **above** the node — below it is the label's place (`LABEL_OFFSET`).
                top: notice.y - WALK_NOTICE_NODE_GAP,
                ["--overlay-spring-origin" as string]: "center bottom",
            }}>
          {walkNoticeLabel}
        </div>) : null}
      {clusterHint ? (<span data-testid="topology-cluster-hint" style={{
                position: "absolute",
                width: 1,
                height: 1,
                padding: 0,
                margin: -1,
                overflow: "hidden",
                clip: "rect(0 0 0 0)",
                whiteSpace: "nowrap",
                border: 0,
            }}>
          {clusterHint}
        </span>) : null}
    </div>);
}
