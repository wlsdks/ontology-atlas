"use client";

/**
 * `TopologyMapV2`'s engine hook — owns the canvas/rAF/pointer wiring so the
 * component itself stays a thin JSX shell (`docs/TOPOLOGY-V2-DESIGN.md` §4
 * P2-P4). Per-frame drawing is delegated to `topology-frame-draw.ts`; layout/
 * adjacency construction to `topology-world.ts`; camera-space conversions to
 * `topology-camera-math.ts`; pointer/wheel handlers to
 * `topology-pointer-handlers.ts` (this file only owns the refs they close over).
 */

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";

import type { CameraAxes, CameraTarget } from "../engine/camera";
import { MAX_FRAME_DELTA_SECONDS } from "../engine/spring";
import { CAMERA_TRANSITION_MIN_MS, cameraTransitionDurationMs, easeCameraKeyframe, easeInOutCubic, type CameraKeyframe, type CameraTween } from "../model/camera-easing";
import { stepTugAxis, tugFactorForHop, tugFalloffForDistance } from "../interaction/drag-tug";
import { isCameraUnsettled, isCanvasActive, isDomeSpinAnimating, isEgoTailAnimating, shouldSkipFrame } from "../model/idle-gate";
import { ambientSleepFactor, isAmbientAsleep } from "../model/ambient-sleep";
import { NAVIGATION_INTENT_EVENT, NAVIGATION_YIELD_MS } from "@/shared/lib/navigation-intent";
import { stepSpotlightPhase } from "../model/spotlight-motion";
import type { TopologyMapLensKind } from "../model/path-lens";
import { resolveViewportReframeMode } from "../model/viewport-reframe";
import { classifyZoomTier, computeZoomRatio, DEFAULT_TIER_REVEAL, nodeTierAlpha, type TierRevealConfig, type ZoomTier } from "../model/tier-visibility";
import { relaxNodeSeparation, type SeparationNode } from "../model/separation";
import { createForceSimulation, type ForceSimulation } from "../model/force-layout";
import { INITIAL_POINTER_MACHINE_STATE, type PointerMachineState } from "../interaction/pointer-state-machine";
import { initHomeSpring, isHomeSpringConverged, stepHomeSpring, type HomeSpringState } from "../model/relayout-home";
import type { NodeDragState } from "./topology-pointer-handlers";
import { DEPTH_DOT_LAYERS, buildDepthDotPattern, buildGridPattern } from "../render/grid";
import { orbitButtonRect, type ClusterBarLabels } from "../render/cluster-chips";
import { createAnimatedBackground, type AnimatedBackground } from "../render/animated-background";
import { buildDustPoints, buildRealmCosmosPoints, computeStarDustCount, type DustPoint } from "../render/starfield";
import { DEFAULT_EXPAND, DEFAULT_MAP_ARRANGEMENT } from "@/shared/lib/appearance-preferences";
import type { CanvasBackground, ExpandPreference, FootprintPreference, GlyphSet, MapArrangement } from "@/shared/lib/appearance-preferences";
import { centerForInsets, computeClusterFitTarget, computeDomeFocusCameraTarget, computeEffectiveCameraScaleMax, computeEffectiveCameraScaleMin, computeFocusCameraTarget, computeOverviewCameraTarget, computeOverviewFitScale, fitWorldTarget, hasAnyNodeOnScreen, worldToScreen } from "./topology-camera-math";
import { drawTopologyFrame, lastDrawnLabelBoxes } from "./topology-frame-draw";
import { MOTION } from "@/shared/motion";
import { isPreviewEndpoint, isPreviewEndpointHidden } from "../render/preview-edge";
import { relaxNewlyVisible } from "../model/layout";
import { computeTopologyClusterState } from "./topology-cluster-state";
import type { ClusterChip } from "../model/density-gate";
import { clusterMoreChipId, EGO_NEIGHBOR_CHIP_ID, parseClusterMoreChipId, rankEgoNeighborsByDOI, scheduleRipple, selectiveEgoNeighbors, stepEmphasis, stepFocusRamp, type EgoNeighborRankEntry } from "../model/focus-state";
import { buildFootprintSteps, buildWalkedEdgeKeys } from "../model/footprint-steps";
import type { FootprintInk } from "@/shared/lib/footprint-glyph";
import {
  INITIAL_REALM_TRANSITION_STATE,
  REALM_EXIT_FLIP_MS,
  REALM_EXIT_OUTSIDE_RETURN_DELAY_MS,
  REALM_EXIT_OUTSIDE_RETURN_MS,
  REALM_INSIDE_FLIP_MS,
  REALM_OUTSIDE_FLING_MS,
  isRealmOutsideCulled,
  REALM_WARDING_DRAW_DELAY_MS,
  realmDustParallaxFactor,
  realmExitFlipDelayFor,
  realmInsideFlipDelayFor,
  realmInsidePosition,
  realmOutsidePosition,
  realmOutsideReturnAlpha,
  realmOutsideReturnPosition,
  realmTransitionReducer,
  realmWardingDrawProgress,
  realmWardingEraseProgress,
  type RealmTransitionState,
} from "../model/realm-transition";
import {
  depthParallaxFactorForDepth,
  isDepthParallaxActive,
  stepDepthParallax,
  ZERO_PARALLAX,
  type DepthParallaxOffset,
} from "../model/realm-depth-parallax";
import {
  beginDomeModelBuild,
  beginDomeMorph,
  clampDomePitch,
  DOME_BUILD_SLICE_MS,
  createDomeRuntime,
  decayOrbitVelocity,
  DOME_ASSEMBLE_TOTAL_MS,
  DOME_ENTRY_SWEEP_MS,
  commitDomeEntrySweep,
  ORBIT_SNAP_ARRIVE_RAD,
  orbitSnapTauMs,
  DOME_POSE_LAG_SCALE,
  chargeTierLag,
  domeEdgeControlWorld,
  DOME_PERIOD_MS,
  DOME_PITCH_DEFAULT,
  DOME_POSE_MS,
  DOME_TIER_LAG_DECAY_PER_MS,
  domeEgoWorldBounds,
  domeFocusYaw,
  domeNearestYawTurn,
  domeWorldBounds,
  ORBIT_SMOOTH_TAU_MS,
  projectDomeCoord,
  stepDomeDragSpring,
  settleDomeRuntimeOffscreen,
  updateDomeFrame,
  type DomeModelBuild,
  type DomeRuntime,
} from "../model/dome-view";
import { buildRealmRuntimeData, fallbackAngleFor, realmCameraTarget, realmVisibleBounds, type RealmRuntimeData } from "./topology-realm-runtime";
import { computeVisibleWardingRadius } from "../model/realm";
import { initWardingFit, stepWardingFit, type WardingFitState } from "../model/realm-warding-fit";
import { createTopologyPointerHandlers, type TopologyPointerHandlers } from "./topology-pointer-handlers";
import { stepTopologyPhysics } from "./topology-physics-step";
import { updatePulses, type Pulse } from "../render/edge-fireflies";
import {
  pickInitialFocus,
  pickNeighborInDirection,
  shouldAnnounceDeadEnd,
  walkDirectionForKey,
} from "../interaction/keyboard-walk";
import { keyboardZoomIntent } from "../interaction/keyboard-zoom";
import { createGrowthReplay, GROWTH_REPLAY_CANCEL_GRACE_MS, stepGrowthReplay, type GrowthReplay } from "../model/growth-replay";
import {
  collectCanvasObstacles,
  computeFreeArea,
  measureCanvasInsets,
  type Rect,
} from "../interaction/free-area";

import { readTopologyV2TokensOrNull } from "./topology-read-tokens";
import type { TopologyMapV2Props } from "./TopologyMapV2";
import { applyForcePositions, buildTopologyWorld, recomputeWorldGeometry, type TopologyWorld, radiusForKind } from "./topology-world";
import { prepareRevealHome } from "./topology-reveal-home";

/** Kept outside the hook so it never enters an effect's dependency list. */
function overviewBoundsFor(fit: "spine" | "full", world: TopologyWorld) {
  return fit === "full" ? world.bounds : world.spineBounds;
}
import type { TopologyV2Tokens } from "../tokens/read-topology-v2-tokens";

/**
 * How fast a neighbour's tug offset eases toward its target (or back to 0 on
 * release) — NOT how far it moves; that is the token-backed
 * `dragTug1Hop`/`dragTug2Hop` factor. Deliberately not a `--topology-v2-*`
 * token, on the same precedent as `engine/camera.ts`'s
 * `DEFAULT_PAN_BOUNDS_MARGIN`.
 *
 * A "connected" drag reads as neighbours following with a slight lag —
 * roughly 100–300 ms of catch-up. 150 ms sits mid-band. The first attempt,
 * 80 ms, sat near the hover-ripple rise tau and read as rigidly pointer-locked
 * rather than physically following.
 */
const DRAG_TUG_EASE_TAU = 0.15;
/**
 * Grace period before the idle gate may skip frames. Covers the ramp decay
 * tail (emphasis tau 0.15 settles visually after ~0.7 s) plus drag-release
 * residue. Time-based, so it is refresh-rate invariant.
 */
const IDLE_GRACE_MS = 1200;
/**
 * Frames of unchanged size before the viewport counts as settled and the
 * viewport-dependent layers (grid, star dust, cosmos dots) are rebuilt.
 * Counted in frames rather than ms because this detects size settling, not a
 * design duration, and the unit that carries a resize *is* the frame.
 */
const VIEWPORT_SETTLE_FRAMES = 2;
type ViewportReframeMotion = "tracking" | "finalize-tracking" | "settled";

/**
 * Backing-resolution cap while dragging. **A drag costs painting, not
 * computing.**
 *
 * Measured 2026-07-31 (synth=3000, 14" Retina): frames landed at **13 fps**
 * during a drag while our own JS took **2.2 ms** per frame — 2.6% of the 83 ms
 * budget. The main thread was 100% busy but scripting was only 0.43 s of
 * 14.9 s; the rest was raster. Re-measuring the same scene with dpr lowered
 * 2 → 1 gave **13 fps → 45 fps**: quartering the pixels ran 3.3× faster, which
 * is direct evidence the cost rides on pixel count.
 *
 * Full resolution returns on the frame the pointer lifts, so **still frames
 * lose no sharpness at all**. Only the moving frames blur, and the eye cannot
 * resolve those anyway.
 */
const INTERACTION_DPR_CAP = 1;
/**
 * Sparsity threshold for narrowing a sim frame's derived updates to the nodes
 * that actually moved: take the narrowed path only when the tug's reach is
 * under `1/this` of the graph.
 *
 * A threshold is needed because narrowing is not free — index lookups have
 * worse cache locality than an array sweep, and detecting which nodes moved
 * requires a coordinate snapshot. Measured 2026-07-31 per block, the crossover
 * is visible directly: at a reach of **281/3000 (9%)** the sim block went
 * 2.1 → 1.5 ms (win); at **975/3000 (33%)** geometry went 0.4 → 0.6 ms (loss).
 * 5 sits between them, biased toward the loss side.
 */
const SCOPED_FRAME_SPARSITY = 5;
/** World-unit epsilon below which a homing node is considered "arrived" (`relayout-home.ts#isHomeSpringConverged`). */
const HOME_CONVERGE_EPSILON = 0.5;

/**
 * FA2 iterations per warm frame — a bounded synchronous tick budget
 * (`model/force-layout.ts` integration note). The count is refresh-rate
 * invariant (1 per 60 Hz-frame-equivalent of real time) so a 120 Hz display
 * does not relax the graph twice as fast, and capped at 3 so one hitchy frame
 * cannot explode the sim.
 *
 * The sim is warm ONLY while a node is pin-dragged, plus its brief release
 * settle — never on load. The static default is the deterministic de-piled
 * concentric grid from `model/layout.ts`; running FA2 on mount turned that
 * clean circuit into a generic force hairball, which is why the design
 * guardian rejected it.
 */
function forceIterationsForDt(dt: number): number {
  return Math.min(3, Math.max(1, Math.round(dt * 60)));
}

export interface UseTopologyLoopArgs {
  nodes: TopologyMapV2Props["nodes"];
  edges: TopologyMapV2Props["edges"];
  focusedSlug: string | null;
  /**
   * The neighbor slug the user is hovering in the detail panel's "Connected Nodes"
   * list, or null. Under focus this one node (+ its connecting edge) lights up
   * on the canvas so panel and map read as one ("emphasis ripple" linkage,
   * lead spec §4). Null until the panel-hover wiring feeds it in.
   */
  emphasizedNeighborSlug?: string | null;
  /** Identity of this graph's source; a change refits the overview. See the same name on `TopologyMapV2Props`. */
  dataSourceKey?: string | null;
  /**
   * What the overview camera fits: `"spine"` (default) is the project/domain/
   * hub bbox, `"full"` is every node's bbox. See the same name on
   * `TopologyMapV2Props`.
   */
  overviewFit?: "spine" | "full";
  fitViewToken: number;
  /** Bump to start a growth replay (`model/growth-replay.ts`). Ignored under reduced motion. */
  growthReplayToken?: number;
  /** Bumped to aim the camera at the spotlit nodes when the lens or its window changes (0 = unused). */
  spotlightFitToken?: number;
  relayoutToken: number;
  /**
   * The first-map reveal. On increment every node starts at the spine centre
   * (the project's position) and springs home, so the moment reads as "my
   * documents gathered" rather than "something was generated".
   *
   * Fires on bootstrap completion only — never on an ordinary load, where the
   * animation would just delay the map. Under reduced-motion the homing snap
   * path arrives immediately.
   */
  revealToken?: number;
  onSelectEdge?: (edge: { sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null }) => void;
  /** Edge hover micro-card. Fires only when the identified edge changes; null clears. */
  onHoverEdge?: (
    edge: { sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null } | null,
    position: { x: number; y: number } | null,
  ) => void;
  onSelect?: (slug: string) => void;
  /**
   * An arrow key found no neighbour in that direction; repeats are debounced
   * by the hook. Carries **where** the walk stopped (canvas-local coords)
   * because this is the only place that knows the position, and the hint has
   * to appear beside that node.
   */
  onWalkDeadEnd?: ((point: { x: number; y: number } | null) => void) | null;
  onPaneClick?: () => void;
  onVisibleCountChange?: (visible: number) => void;
  onGraphStatsChange?: (stats: { nodes: number; relations: number }) => void;
  /**
   * The semantic-zoom altitude tier changed (spine → circuit → element). Fires
   * on transitions only, not per frame, and is driven by the same reveal bands
   * the draw pass uses to gate node visibility — so the corner readout can
   * never say "zoom in to see elements" while elements are already on screen.
   */
  onZoomTierChange?: (tier: ZoomTier) => void;
  /** Node right-click context menu — see `topology-pointer-handlers.ts#createTopologyPointerHandlers`'s `onContextMenuNode` doc. */
  onContextMenuNode?: (slug: string, position: { x: number; y: number }) => void;
  /** Right-click on empty canvas — "create a concept here". */
  onContextMenuPane?: (position: { x: number; y: number }) => void;
  /**
   * W6 agent visibility — the graph node id matching the agent heartbeat's
   * current focus (already resolved to `kind:slug` form upstream, or `null`
   * when there's no fresh focus). Drives the amber agent-focus ring + label
   * activity mark; `null`/omitted draws neither (fabrication 0).
   */
  agentFocusNodeId?: string | null;
  /**
   * Recent-change spotlight. Non-null turns the lens on: nodes and edges
   * outside this set sink to `--topology-v2-spotlight-rest-alpha`. The on/off
   * transition reuses the focusDimTau ramp (<200 ms perceived) and arrives
   * immediately under reduced-motion. The set itself is built by HomePage from
   * the `?recent=` window's mtime arithmetic (`useAdaptiveRecentChanges`).
   */
  spotlightIds?: ReadonlySet<string> | null;
  mapLensKind?: TopologyMapLensKind;
  pathEdgeIds?: ReadonlySet<string> | null;
  /** Edge selection = pair focus (show only endpoints, selected edge pale indigo). */
  selectedEdge?: { sourceId: string; targetId: string } | null;
  previewEdge?: TopologyMapV2Props["previewEdge"];
  /**
   * Density gate — the set of parent slugs the user has expanded (URL
   * `?open=`). Children of a parent past the threshold are collapsed into a
   * cluster chip by default; only parents listed here reveal theirs. Omitted
   * means everything is collapsed.
   */
  expandedParents?: ReadonlySet<string>;
  /** Density gate — a cluster chip click toggles that parent's expansion (round-trips through the URL). */
  onToggleCluster?: (parentId: string) => void;
  /** Cluster-chip hover tooltip. Fires only when the identified chip changes; null clears. */
  onHoverCluster?: (
    info: {
      parentId: string;
      /** Direct children collapsed by the density gate at this tier (the chip's `+N`). */
      count: number;
      /** Every descendant beneath the parent (the node badge's `descendantCount`). */
      descendantTotal: number;
      expanded: boolean;
      position: { x: number; y: number };
    } | null,
  ) => void;
  /**
   * Realm entry — switches the map into this node's own world (`?realm=slug`);
   * null is the whole map. A change starts a subtree relayout plus the
   * transition choreography.
   */
  realmRootId?: string | null;
  /** The orbit's enter button was clicked for this slug; HomePage round-trips it through the URL. */
  onEnterRealm?: (slug: string) => void;
  /** DOM for the orbit's enter button — anchored in canvas coords, following the camera every frame. */
  realmEnterButtonRef?: RefObject<HTMLButtonElement | null>;
  /**
   * The census caption engraved under the warding ring. Formatted by HomePage
   * from the same source as the ledger census, so the widget never touches
   * i18n or census arithmetic itself. (The internal name stays `realm`; the
   * user-facing wording is "View only this" — owner decision 2026-07-23.)
   */
  realmCaption?: string | null;
  /**
   * Footprint trail — node ids visited (ego-focused) during this session,
   * oldest to newest, held in HomePage session state. Each visited node gets a
   * recency-decayed hairline ring. Not persisted to the URL. Omitted or empty
   * draws no footprints.
   */
  visitedTrail?: readonly string[];
  /**
   * Whether the trail lens is on, as a **ref** — true while the trail popover
   * is open. The map briefly stops being read for relations and yields to
   * being read for a path: only the `visitedTrail` nodes keep their values and
   * labels, everything else recedes to the existing dim values. This is not a
   * new mode, toggle, or URL state — it is **equivalent** to the popover being
   * open (transient-surface contract).
   *
   * A ref rather than a value for the same reason as brushing: promoting it to
   * state re-renders the whole page tree on every lens toggle, and the
   * transition frame jumps into the 100 ms range (measured). The loop reads it
   * every frame, and the idle gate wakes itself by comparing against the lens
   * state it last drew, so the same transition costs zero renders.
   */
  trailLensActiveRef?: RefObject<boolean>;
  /**
   * Translations for "expand all" / "expand N" / "collapse". The canvas never
   * builds user-facing strings — same path `realmCaption` already uses.
   */
  clusterBarLabels?: ClusterBarLabels | null;
  /**
   * Trail brushing — a **ref** holding the node id of the popover row under
   * hover/focus. While the lens is on, the map borrows its own hover channel
   * to draw the existing hover preview ring on that node, answering "which one
   * was two steps ago" by pointing instead of numbering.
   *
   * A ref rather than a value because hover changes continuously as the cursor
   * sweeps rows, and each change through React state re-renders the entire
   * HomePage tree (measured 68–109 ms, enough to feel sticky). The frame loop
   * already reads refs every frame, so it reaches the same result with zero
   * renders — the same contract as `tourAnchorRef`.
   */
  trailHoverNodeIdRef?: RefObject<string | null>;
  /**
   * **The node the cursor is pointing at from a side panel** (2026-08-17).
   * Two callers — chat-pane node names and the data sheet's
   * relation/evidence/domain rows — share one channel because there is one
   * cursor.
   *
   * Second exception to "focus owns emphasis exclusively", for the same reason
   * as the trail lens (`trailHoverNodeIdRef`): the cursor is over a panel, not
   * the canvas, so it cannot compete with canvas hover.
   *
   * It deliberately looks **exactly** like a mouse hover — a distinct
   * appearance would be one more thing to learn. A ref, because a render per
   * hover feels sticky on a large graph.
   */
  panelHoverNodeIdRef?: RefObject<string | null>;
  /**
   * Tier gate config for the display lens. Omitted means `DEFAULT_TIER_REVEAL`
   * (developer mode — capability and element both respond to zoom normally).
   * In plain mode HomePage passes `PLAIN_TIER_REVEAL`, which hides elements
   * outright. Draw, hit-testing, and pan clamping all agree because they read
   * this one value.
   */
  tierReveal?: TierRevealConfig;
  /**
   * Guided tour — the node id the canvas anchor projects onto during steps 2
   * and 4, or `null` when the step has no anchor or the node was not found.
   * A block alongside the realm enter button writes a transform plus
   * `--tour-anchor-r` into `tourAnchorRef`'s DOM every frame.
   */
  tourAnchorNodeId?: string | null;
  /** DOM for the guided tour's anchor circle — rendered by `TopologyMapV2`, shared here as a ref only. */
  tourAnchorRef?: RefObject<HTMLDivElement | null>;
  /**
   * Node body render style: `"geometric"` (default, filled) or `"line"`
   * (stroke only). The kind→silhouette mapping is unchanged either way. Reads
   * the same store as the DOM glyphs so both swap together.
   */
  glyphSet?: GlyphSet;
  /**
   * Canvas background set — `"dot"` (default), `"web"` (relation mesh), or
   * `"depth"` (perspective grid). All remain restrained, non-particle fields.
   */
  canvasBackground?: CanvasBackground;
  /**
   * 3D view (2026-08-18, opt-in) — relays the map into the ownership Cone tree or
   * relation-driven Cloud (`model/dome-view.ts`). Draw, hit-testing, DOM anchors,
   * and the inspection hook all read the same frame map. Omitted keeps 2D.
   */
  view3d?: boolean;
  /** Which 3D structure is drawn — ownership Cone tree or coupling Cloud. */
  mapArrangement?: MapArrangement;
  /** 3D reframe input: is the detail panel covering the viewport (`TopologyMapV2` JSDoc). */
  detailPanelVisible?: boolean;
  /** Footprint appearance settings. Omitted or `null` draws no footprints. */
  footprint?: FootprintPreference | null;
  /**
   * Expansion settings — the expand affordance, child placement, how many open
   * at once, how many to attempt naming, and how many parents stay expanded
   * together.
   */
  expand?: ExpandPreference;
  /** Wheel / vertical-swipe ownership — see `wheelIntent` in `topology-pointer-handlers.ts`. */
  wheelIntent?: "zoom" | "page-scroll";
  /** Ambient sleep delay — see `ambientSleepDelayMs` on `TopologyMapV2`. */
  ambientSleepDelayMs?: number;
}

/** Immutable empties so the dome's collapsed/chip consumers allocate nothing per frame. */
const EMPTY_DOME_CLUSTERED: ReadonlySet<string> = new Set();
const EMPTY_DOME_CHIPS: readonly ClusterChip[] = [];

const EMPTY_EXPANDED_SET: ReadonlySet<string> = new Set();
const EMPTY_TRAIL: readonly string[] = [];

export type UseTopologyLoopResult = TopologyPointerHandlers & {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  /** Walk to a neighbour with the arrow keys — the canvas's `onKeyDown`. */
  handleKeyDown: (event: ReactKeyboardEvent<HTMLCanvasElement>) => void;
};

export function useTopologyLoop(args: UseTopologyLoopArgs): UseTopologyLoopResult {
  const { nodes, edges, focusedSlug, emphasizedNeighborSlug = null, dataSourceKey = null, overviewFit = "spine", fitViewToken, growthReplayToken = 0, spotlightFitToken = 0, relayoutToken, revealToken = 0, onSelectEdge, onHoverEdge, onSelect, onPaneClick, onVisibleCountChange, onGraphStatsChange, onZoomTierChange, onContextMenuNode, onContextMenuPane, agentFocusNodeId = null, spotlightIds = null, mapLensKind = "recent", pathEdgeIds = null, selectedEdge = null, previewEdge = null, expandedParents = EMPTY_EXPANDED_SET, onToggleCluster, onHoverCluster, realmRootId = null, onEnterRealm, realmEnterButtonRef, realmCaption = null, visitedTrail = EMPTY_TRAIL, trailLensActiveRef, clusterBarLabels = null, trailHoverNodeIdRef, panelHoverNodeIdRef, tierReveal = DEFAULT_TIER_REVEAL, tourAnchorNodeId = null, tourAnchorRef, glyphSet = "geometric", canvasBackground = "dot", view3d = false, mapArrangement = DEFAULT_MAP_ARRANGEMENT, detailPanelVisible = false, footprint = null, expand = DEFAULT_EXPAND, wheelIntent = "zoom", ambientSleepDelayMs, onWalkDeadEnd = null } = args;

  const getRealmCaption = useEffectEvent(() => realmCaption);
  const getClusterBarLabels = useEffectEvent(() => clusterBarLabels);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const viewportRef = useRef({ width: 0, height: 0, dpr: 1 });
  const previewEdgePropRef = useRef(previewEdge);
  const previewEdgeHeldRef = useRef(previewEdge);
  const previewSignatureRef = useRef<string | null>(null);
  const previewAlphaRef = useRef(previewEdge ? 1 : 0);
  const previewCommitRef = useRef(previewEdge?.phase === "committing" ? 1 : 0);
  const previewTransitionRef = useRef<{
    start: number;
    duration: number;
    fromAlpha: number;
    toAlpha: number;
    fromCommit: number;
    toCommit: number;
  } | null>(null);
  useEffect(() => {
    previewEdgePropRef.current = previewEdge;
    if (previewEdge) previewEdgeHeldRef.current = previewEdge;
  }, [previewEdge]);
  /**
   * The latest size **measured** by the ResizeObserver. Committing it (swapping
   * the canvas backing size) does not happen here — an rAF frame picks it up.
   * Why: see the resize effect below.
   */
  const pendingViewportRef = useRef<{ width: number; height: number; dpr: number } | null>(null);
  /** Do the viewport-dependent layers need rebuilding (once, after the size settles). */
  const viewportRebuildPendingRef = useRef(false);
  /** The backing-resolution scale in force right now — changes only when an interaction starts or ends. */
  const appliedDprScaleRef = useRef<number | null>(null);
  /** Consecutive frames with no new size — compared against `VIEWPORT_SETTLE_FRAMES`. */
  const viewportSettleFramesRef = useRef(0);
  const commitViewportSizeRef = useRef<(() => boolean) | null>(null);
  const rebuildViewportLayersRef = useRef<(() => void) | null>(null);
  const worldRef = useRef<TopologyWorld | null>(null);
  const dustPointsRef = useRef<DustPoint[]>([]);
  /** Cosmos dots inside the warding ring while a realm is active — built once per viewport, refreshed on resize. */
  const cosmosPointsRef = useRef<DustPoint[]>([]);
  const gridPatternRef = useRef<CanvasPattern | null>(null);
  /**
   * Particle state plus offscreen buffer for the animated backgrounds (flow,
   * proximity web, gravity). A variant change rebuilds it outright: a particle
   * means something different in each variant, so reusing state makes the first
   * seconds look wrong.
   */
  const animatedBgRef = useRef<AnimatedBackground | null>(null);
  /** Cursor position in canvas-screen coords, or null when off-canvas — which quietens the background. */
  const bgPointerRef = useRef<{ x: number; y: number } | null>(null);
  /** Patterns for the three depth-dot layers — static, built once on mount and on resize. */
  const depthDotPatternsRef = useRef<(CanvasPattern | null)[]>([]);
  const depthDotCanvasRef = useRef<HTMLCanvasElement[]>([]);
  // Appearance-preference props mirrored into refs so the frame loop can read
  // them without re-subscribing; an effect below refreshes each on change.
  const glyphStyleRef = useRef<"fill" | "line">(glyphSet === "line" ? "line" : "fill");
  const canvasBackgroundRef = useRef<CanvasBackground>(canvasBackground);
  /** 3D view target — mirrored because draw reads it per frame and hit-testing reads it per event. */
  const view3dRef = useRef<boolean>(view3d);
  /**
   * Arrangement mirror, read by the draw loop. On change an effect below drops
   * the dome model so the next frame rebuilds it at the new angle; height and
   * camera are untouched.
   */
  const mapArrangementRef = useRef<MapArrangement>(mapArrangement);
  /**
   * Dome runtime (`model/dome-view.ts#DomeRuntime`) — one box holding the
   * model, pose (yaw/pitch), inertia, assembly clock, and this frame's
   * projection map. The loop updates it each frame; the pointer handlers
   * (orbit, flat drag, hit-testing) and the instrumentation read the same box.
   */
  const domeRuntimeRef = useRef<DomeRuntime | null>(null);
  /** Which world the dome model was computed from — a different world forces a relayout. */
  const domeWorldSourceRef = useRef<unknown>(null);
  /**
   * The **in-progress, time-sliced** dome model build for the first 3D frame
   * (measured 2026-08-19).
   *
   * Relaxing the coupled cloud placement is O(n²) × iterations, ~350 ms at
   * 2,000 nodes, and running `buildDomeModel` synchronously started boot with a
   * **single-frame hitch of 346–368 ms**. Now each frame advances only
   * `DOME_BUILD_SLICE_MS` and resumes on the next. Nothing is drawn until the
   * build completes, so the screen shows what the synchronous hitch showed
   * anyway (an empty canvas on boot, the last 2D frame on a mid-session toggle)
   * while input and timers stay alive. Slicing preserves the floating-point
   * operation order, so the result is **bit-identical**.
   *
   * `world`/`arrangement` are recorded alongside: a world swap or arrangement
   * change mid-slice makes this build stale input, and it is restarted.
   */
  const domeModelBuildRef = useRef<{
    world: unknown;
    arrangement: string;
    build: DomeModelBuild;
  } | null>(null);
  /**
   * Idle-gate instrumentation (e2e only) — **the names of the flags that last
   * kept a frame awake**.
   *
   * Why it exists (2026-08-19 integration review): regressions of the "the map
   * never falls back asleep after a drag" family show only their symptom (CPU
   * per second); the cause — which activity flag stayed true — was invisible
   * from outside the canvas, because pixels only ever say "something drew".
   * The idle-gate doc-block's discipline (every motion in flight must have a
   * name) is verifiable only if those names reach a window. Recorded only when
   * the `?e2e=1` inspection window is attached (`idleDebugEnabledRef` below),
   * so the product path pays nothing.
   */
  const lastActiveCausesRef = useRef<{ t: number; causes: string[] } | null>(null);
  const idleDebugEnabledRef = useRef(false);
  /**
   * Pending 3D reframe on selection: written by the focus effect, consumed by
   * the loop's dome step. At effect time the world may still be rebuilding (a
   * selection also expands ancestor clusters), so computing it there fails
   * silently. The loop always holds the live world, so the next dome frame
   * handles it for certain.
   */
  const domeFocusPendingRef = useRef<{ slug: string | null } | null>(null);
  /** One-shot after 3D turns on: cinematically fit the camera to the dome bbox. Turning it off leaves the camera alone. */
  const domeFitPendingRef = useRef(false);
  /**
   * Duration for the next dome fit tween (ms), set together with
   * `domeFitPendingRef`: the assembly length on entry, the morph length on an
   * arrangement refit. Undefined falls back to the 2D transition rule.
   */
  const domeFitDurationRef = useRef<number | undefined>(undefined);
  /**
   * Debt to refit the 2D overview after 3D turns off — written by the `view3d`
   * effect, paid by the loop's dome step **once teardown has finished**.
   * Fitting while the ramp is still running would frame mid-morph coordinates.
   */
  const flatFitPendingRef = useRef(false);
  /** Footprint preference and ink, mirrored because the frame loop reads them every frame. */
  const footprintPrefRef = useRef<FootprintPreference | null>(footprint ?? null);
  /**
   * Expansion preference, mirrored for the same reason. A settings change is
   * picked up by an effect below and takes effect **from the next frame**.
   */
  const expandPrefRef = useRef<ExpandPreference>(expand);
  const footprintInkRef = useRef<FootprintInk>([232, 196, 122]);
  const footprintStepColorRef = useRef<string>("#e8c47a");
  /**
   * The moment one more step joined the trail — only that mark gets a short
   * arrival motion. Comparing length is enough: the trail only ever grows at
   * the end.
   */
  const footprintTrailLenRef = useRef(0);
  const footprintAppearAtRef = useRef(0);
  /**
   * Ambient sleep delay as a ref rather than a value, because closing over the
   * value would make it a dependency of the loop effect and restart the whole
   * rAF loop whenever the prop changes.
   */
  const ambientSleepDelayRef = useRef<number | undefined>(ambientSleepDelayMs);

  // Live force simulation (`model/force-layout.ts`) — seeded off the concentric
  // layout, ticked while warm (`heatRef > 0`) or while a node is pinned.
  const simRef = useRef<ForceSimulation | null>(null);
  const heatRef = useRef(0);
  const nodeDragRef = useRef<NodeDragState | null>(null);
  /** Touch pinch-zoom — the active touch pointers (pointerId → canvas coords). The hook owns this state because the handler factory is recreated every render. */
  const activeTouchesRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  /** Previous frame's distance/midpoint for a pinch in progress (null = not pinching). */
  const pinchRef = useRef<{ dist: number; midX: number; midY: number } | null>(null);
  /** The tug/settle-restriction set for the active drag, or one just released through its settle burst. */
  const dragAffectedSetRef = useRef<{ draggedId: string; oneHop: ReadonlySet<string>; twoHop: ReadonlySet<string> } | null>(null);
  /** The dragged node's world position at grab time, for this drag's total displacement Δ. */
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  /** Each tug-affected neighbour's current eased offset (world units), added on top of its natural position. */
  const dragTugOffsetsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  /**
   * Coordinate snapshot from the **start** of a sim frame (in node-array
   * order). Comparing against it at the end of the frame yields the nodes that
   * really moved, and narrows the derived geometry update to those
   * (`recomputeWorldGeometry(world, tokens, movedIds)`).
   *
   * Measured rather than inferred from "which set is about to move" because
   * three separate things write coordinates in one frame — force application,
   * neighbour tug, and separation relaxation — and their reaches differ.
   * Inference eventually misses one, and the symptom is a visible defect:
   * edges detached from their nodes.
   */
  const geomPrevXRef = useRef<Float64Array | null>(null);
  const geomPrevYRef = useRef<Float64Array | null>(null);
  /**
   * Nodes that **separation relaxation displaced** last frame and that sit
   * outside the force-applied set.
   *
   * This frame's `applyForcePositions` reverting their coordinates to the sim
   * values is the pre-existing behaviour, so the narrowed write-back has to
   * include them to preserve it. (Whether that revert is correct at all is a
   * separate question — nothing here changes the behaviour.)
   */
  const sepDisplacedIdsRef = useRef<Set<string>>(new Set());
  /** Active auto-arrange homing springs, keyed by node id; empty when no relayout is in flight. */
  const homeSpringsRef = useRef<Map<string, HomeSpringState>>(new Map());
  const homingActiveRef = useRef(false);
  /**
   * Per-node homing target override while a realm is active; null falls back to
   * the global `homeX`/`homeY`, and inside a realm the targets are
   * `insideTargets` (realm coordinate space). Cleared when homing converges or
   * is cancelled.
   *
   * Owner bug report 2026-07-23: the root sat outside its own warding ring.
   * Homing to global home left the ring at the realm origin while the nodes
   * flew off to spine coordinates.
   */
  const homeTargetOverrideRef = useRef<ReadonlyMap<string, { x: number; y: number }> | null>(null);
  /** Previous frame's pin-dragged node id, to detect the release transition. */
  const prevPinnedNodeIdRef = useRef<string | null>(null);

  // --- Realm state ---
  /** Transition state machine (idle/entering/active/exiting). */
  const realmTransitionRef = useRef<RealmTransitionState>(INITIAL_REALM_TRANSITION_STATE);
  /** The current realm's transition-start data: subtree, relaid-out coords, warding ring, exit origins. */
  const realmDataRef = useRef<RealmRuntimeData | null>(null);
  /**
   * Has coordinate ownership been handed back to the ordinary paths (drag, sim,
   * homing) after the realm settled into `active`?
   *
   * Owner bug report: while the active phase overwrote `node.x = insideTargets`
   * every frame it fought the drag and nodes would not move. Now the first
   * settled frame snaps once, reseeds the sim, and sets this flag; later active
   * frames leave coordinates alone. Reset to false on entry and exit.
   */
  const realmActiveHandedOffRef = useRef(false);
  /**
   * Easing state for refitting the warding radius. Each frame measures the
   * target radius from the **visible** members (excluding density-gate
   * collapsed ones) and eases toward it over 240 ms — one ease per chip expand
   * or collapse, never a continuous animation. Reset to null on every entry so
   * the first frame seeds by snapping to the initial radius.
   */
  const wardingFitRef = useRef<WardingFitState | null>(null);
  // Previous `realmRootId`, for the enter/exit diff. Initialising to null is
  // the point: mounting from a `?realm=slug` deep link gives prev(null) ≠
  // realmRootId(slug), so the first effect fires realm entry and a shared link
  // or an agent reproduces the realm exactly.
  const prevRealmRootIdRef = useRef<string | null>(null);
  /** The node slug the orbit's enter button currently targets; the button's click reads it. */
  const realmEnterTargetRef = useRef<string | null>(null);
  /** `onEnterRealm` prop mirror, for the button listener's closure. */
  const onEnterRealmRef = useRef<typeof onEnterRealm>(onEnterRealm);
  /** Orbit button DOM mirror, so the mount-only rAF effect need not depend on the prop ref. */
  const realmEnterButtonElRef = useRef<HTMLButtonElement | null>(null);
  /** Guided-tour anchor circle DOM mirror — same reason as the realm button. */
  const tourAnchorElRef = useRef<HTMLDivElement | null>(null);
  // --- Depth parallax (reacts to camera input while a realm is active) ---
  /** Parallax offset for depth 2 (the capability ring), in world units. Converges to 0 when the camera stops. */
  const realmParallaxDepth2Ref = useRef<DepthParallaxOffset>(ZERO_PARALLAX);
  /** Parallax offset for depth 3+ (the element ring), in world units. */
  const realmParallaxDepth3Ref = useRef<DepthParallaxOffset>(ZERO_PARALLAX);
  /** Previous frame's camera centre in world coords, for the parallax delta. null = no earlier sample. */
  const prevCameraCenterRef = useRef<{ x: number; y: number } | null>(null);
  /**
   * This frame's parallax data (per-band offsets plus depthById). rAF refreshes
   * it every frame and pointer hit-testing reads it, so clicks land against the
   * **same** offsets the draw used. Non-null only while a realm is active and
   * the offsets are meaningful.
   */
  const realmParallaxRef = useRef<{
    depthById: ReadonlyMap<string, number>;
    depth2: DepthParallaxOffset;
    depth3: DepthParallaxOffset;
  } | null>(null);
  /**
   * This frame's depth-derived tier kind overrides. rAF fills it every frame
   * through the **same gate** the draw uses (null when no realm is active), and
   * pointer hit-testing reads it so depth-1 element children are clickable
   * exactly when they are drawn.
   */
  const realmTierKindsRef = useRef<ReadonlyMap<string, "project" | "domain" | "capability" | "element"> | null>(null);
  /** Cached `contains` ancestor chain of the realm root — treated as expanded so the outer density gate cannot hide the realm's interior. */
  const realmExpandChainRef = useRef<{ rootId: string; chain: ReadonlySet<string> } | null>(null);
  /** Latest render inputs read by the mount-only rAF and pointer closures. */
  const realmCaptionRef = useRef<string | null>(realmCaption);
  const clusterBarLabelsRef = useRef<ClusterBarLabels | null>(clusterBarLabels);
  useLayoutEffect(() => {
    realmCaptionRef.current = getRealmCaption();
    clusterBarLabelsRef.current = getClusterBarLabels();
  }, [realmCaption, clusterBarLabels]);
  const cameraRef = useRef<CameraAxes>({
    x: { value: 0, velocity: 0 },
    y: { value: 0, velocity: 0 },
    scale: { value: 1, velocity: 0 },
  });
  const cameraTargetRef = useRef<CameraTarget>({ tx: 0, ty: 0, tscale: 1 });
  /**
   * WCAG 2.2 §2.3.3 — "who moved the camera last". Pointer-handler gestures
   * (wheel, pinch, pan, flick) set it true; every **programmatic** move in this
   * file (ego dive, fit, realm, initial snap) resets it to false.
   * `stepTopologyPhysics` uses it to confine the reduced-motion camera snap to
   * app-initiated moves: user-initiated zoom and pan are an explicit exception
   * in the standard, and cutting them teleports the whole viewport in one
   * frame, which is worse than the motion being removed.
   */
  const userDrivenCameraRef = useRef(false);
  /**
   * The live cubic camera transition, or null.
   * Set by `beginCameraTween` on every programmatic move (focus dive, cluster
   * dive, fit/relayout); driven each frame in the rAF loop; cleared the instant
   * an interactive gesture (wheel/drag) takes over. Never set under
   * `prefers-reduced-motion` (the spring path snaps instead).
   */
  const cameraTweenRef = useRef<CameraTween | null>(null);
  const dampingRef = useRef(1.0);
  /**
   * Dive-zoom fix. Owner: "Zooming in and out feels slow." Which spring angular frequency
   * this frame's camera step uses. `null` until the first token read (the rAF
   * loop falls back to `cameraSpringAngFreqTransition` for that first frame).
   * Set to `cameraSpringAngFreqInteractive` on every live wheel tick
   * (`topology-pointer-handlers.ts#handleWheel`); reset to
   * `cameraSpringAngFreqTransition` by every PROGRAMMATIC camera move below
   * (initial snap, fit/relayout, focus dive/deselect) so that move's whole
   * settle plays out at the cinematic rate, not whatever the last wheel tick
   * left behind.
   */
  const cameraAngularFreqRef = useRef<number | null>(null);
  const overviewScaleRef = useRef(1);
  const hasInitializedRef = useRef(false);
  /**
   * The **source** the overview was last fitted to. When the world is rebuilt
   * with a different value, the initial fit runs once more (see the
   * `dataSourceKey` prop's comment).
   */
  const fittedDataSourceKeyRef = useRef<string | null>(null);
  const lastFrameTimeRef = useRef(0);
  // `useEffect(fn, [relayoutToken, fitViewToken])` also fires once on mount
  // (standard React behaviour, not only on token change). That used to be
  // harmless because it recomputed the same tight-bounding fit target
  // `trySnapInitialCamera` had just set. Once the initial camera deliberately
  // started at the *simplified* overview scale (`computeOverviewCameraTarget`),
  // the same mount-time fire immediately overwrote it back to the tight fit and
  // the reduced-density fix never visibly took effect.
  //
  // Captured through a lazy initializer, which runs exactly once even under
  // StrictMode's dev-only double-invoke of effects. A plain "have I run before"
  // boolean ref does NOT survive that double-invoke, because the
  // mount/cleanup/remount cycle flips it back and forth. The effect below skips
  // while both tokens still equal their captured mount-time values — i.e. no
  // real fit-view or relayout click has happened yet.
  const initialFitTokensRef = useRef({ relayout: relayoutToken, fitView: fitViewToken });
  // Starts empty so an initial deep-linked spotlight gets one fit. Afterwards the
  // processed token prevents unrelated renders from taking the camera again.
  const lastProcessedSpotlightFitTokenRef = useRef<number | null>(null);
  /*
   * **Deferred fit** for deep-linked sessions (2026-08-02, caught by the motion
   * seat's audit).
   *
   * Mounting with `?recent=` already in the URL bumps the token **once, right
   * after mount** — at which point the map has not laid out yet, so the guard
   * below (`!hasInitializedRef.current`) returns silently. The token never
   * changes again, so the camera **never moves**: someone arriving from the
   * history screen lands on the default overview with the spotlit node
   * off-screen, which is the exact symptom this was meant to fix.
   *
   * So instead of dropping the fit when it cannot run, record it as debt and
   * pay it once where initialization completes.
   */
  const pendingSpotlightFitRef = useRef(false);
  const runSpotlightFitRef = useRef<(() => boolean) | null>(null);
  /** Latest function to reframe the current semantic state with the settled viewport size. */
  const reframeViewportRef = useRef<((motion: ViewportReframeMotion) => boolean) | null>(null);
  /** Has the camera already followed the new available area during the direction change? */
  const viewportCameraTrackedRef = useRef(false);
  // C1 B3 — same mount-skip pattern, but for the DEDICATED relayout-only
  // effect below (node-position homing), which must not fire on mount either.
  const initialRelayoutTokenRef = useRef(relayoutToken);

  const pointerMachineRef = useRef<PointerMachineState>(INITIAL_POINTER_MACHINE_STATE);
  const dragHistoryRef = useRef<{ x: number; y: number; t: number }[]>([]);
  /** When the navigation yield ends — see the `navigation-intent` subscription effect's doc-block. */
  const navYieldUntilRef = useRef(0);
  /**
   * What an empty-space drag means in 3D: starting inside the dome's grip
   * orbits it, starting outside pans the camera as in 2D. `pointerdown` decides
   * once, using `DOME_GRIP_MARGIN`.
   */
  const domeGripRef = useRef(false);
  const camStartAtDownRef = useRef({ x: 0, y: 0 });
  const canvasRectRef = useRef<{ left: number; top: number } | null>(null);

  const focusedSlugRef = useRef<string | null>(focusedSlug);
  const lastFocusedSlugRef = useRef<string | null>(focusedSlug);
  const panelEmphasisNodeIdRef = useRef<string | null>(emphasizedNeighborSlug);
  const hoveredNodeIdRef = useRef<string | null>(null);
  /** The edge under hover — shared by the draw's ink emphasis and the micro-card. */
  const hoveredEdgeRef = useRef<{ sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null } | null>(null);
  /** Edge-selection (pair focus) prop mirror, for the rAF closure. */
  const selectedEdgeRef = useRef<{ sourceId: string; targetId: string } | null>(selectedEdge);
  /** Footprint trail prop mirror — the rAF closure builds the recency rank from it each frame. */
  const visitedTrailRef = useRef<readonly string[]>(visitedTrail);
  /**
   * Keep-set for the trail lens, updated in place (clear + add) only when
   * `visitedTrail` changes, so a 60 fps loop never allocates a fresh Set per
   * frame. The lens adds zero per-frame allocation.
   */
  const visitedTrailSetRef = useRef<Set<string>>(new Set(visitedTrail));
  /**
   * The lens state that was last **drawn**. The idle gate compares it against
   * the live ref and counts "the lens just changed" as activity — the lens is a
   * ref rather than React state, so no effect can wake the loop and the frame
   * gate has to own waking instead.
   */
  const drawnTrailLensRef = useRef(false);
  /** Trail lens / brushing prop-ref mirrors, so the rAF closure reads the latest without deps (same idiom as `tourAnchorRef`). */
  const trailLensPropRef = useRef<RefObject<boolean> | null>(trailLensActiveRef ?? null);
  const trailBrushPropRef = useRef<RefObject<string | null> | null>(trailHoverNodeIdRef ?? null);
  const panelHoverPropRef = useRef<RefObject<string | null> | null>(panelHoverNodeIdRef ?? null);
  /**
   * The node this frame **actually treated as hovered** — a mirror kept solely
   * for the `__atlasMap.hover()` instrument. The canvas has no DOM, so from
   * outside, "is the map pointing at that node" could only be answered by
   * comparing pixels, and pixels never say what changed or why. This copies the
   * value the frame wrote, so it cannot disagree with the screen.
   */
  const drawnHoveredNodeIdRef = useRef<string | null>(null);
  /** Density gate — expanded-parents Set mirror, shared by the rAF and pointer closures. */
  const expandedParentsRef = useRef<ReadonlySet<string>>(expandedParents);
  /** Previous expanded set, diffed to find newly expanded parents for the camera dive. */
  const prevExpandedParentsRef = useRef<ReadonlySet<string>>(expandedParents);
  /** Density gate — this frame's cluster chips (world-anchored). Hit-testing reads it. */
  const clusterChipsRef = useRef<readonly ClusterChip[]>([]);
  /**
   * The nodes this frame did **not** draw: density-gate collapsed ones plus
   * neighbours hidden by selective ego. Pointer hit-testing reads it to exclude
   * them — what is not drawn must not be clickable or hoverable.
   */
  const clusteredIdsRef = useRef<ReadonlySet<string>>(EMPTY_EXPANDED_SET);
  /** Density gate — the cluster parent under hover (chip border emphasis + cursor). */
  const hoveredClusterIdRef = useRef<string | null>(null);
  /**
   * How many batches of selective-ego neighbours are lit (session-only). 1 is
   * the top 24; each "neighbours +N" chip click adds one. Reset to 1 whenever
   * focus changes (see the focus effect below).
   */
  const egoRevealBatchesRef = useRef(1);
  /**
   * High-fan-out batch reveal — lit batches per expanded cluster parent
   * (parentId → count, default 1 = the top 24 children). Each "+N more" chip
   * click increments that parent only; not persisted to the URL. Collapsed
   * parents are pruned in the frame's batch section. This generalises
   * `egoRevealBatchesRef` per parent, because several parents can be expanded
   * at once.
   */
  const clusterRevealBatchesRef = useRef<Map<string, number>>(new Map());
  /**
   * High-fan-out batch reveal — appearance ramp for children a batch just
   * revealed (childId → 0..1), converging 0→1 with a DOI-ordered centre-out
   * stagger (start times in `batchAppearStartRef`). `drawTopologyFrame`
   * multiplies it into the child's draw alpha and a slight appearScale (0.6→1).
   * It **replaces** the expand group fade (chipReveal) rather than stacking on
   * it, so alphas never double-fade. Snaps to 1 under reduced-motion.
   */
  const batchAppearRef = useRef<Map<string, number>>(new Map());
  /**
   * High-fan-out batch reveal — absolute start time per batched child (childId →
   * ms on the same `performance.now()` clock). Filled in DOI rank order by
   * `scheduleRipple` (base 0 + i·rippleStaggerMs, reusing the
   * rippleStaggerMaxMs budget cap). Before its start the ramp stays at 0, so
   * the stagger compresses inside the total budget instead of reading as a slow
   * enumeration.
   */
  const batchAppearStartRef = useRef<Map<string, number>>(new Map());
  /** High-fan-out batch reveal — children visible via a batch last frame, for the newly-revealed diff. */
  const prevBatchVisibleRef = useRef<Set<string>>(new Set());
  const emphasisRef = useRef<Map<string, number>>(new Map());
  /** Ego tier-reveal ramp, stepped in `stepTopologyPhysics`, consumed by `drawTopologyFrame`. */
  const egoRevealRef = useRef<Map<string, number>>(new Map());
  /**
   * Click-focus signature — per-node 0..1 color ramp, stepped in
   * `stepTopologyPhysics`, consumed by `drawTopologyFrame` to lerp normal↔dim/
   * ego color + ease the center radius. Sibling to `emphasisRef`/`egoRevealRef`.
   */
  const focusRampRef = useRef<Map<string, number>>(new Map());
  /**
   * Cluster chip expand/collapse reveal ramp (parentId → 0..1), converging
   * exponentially at `--topology-v2-cluster-reveal-tau` toward 1 when expanded
   * and 0 when collapsed. Stepped every frame by the loop (reusing
   * focus-state's `stepEmphasis`); `drawTopologyFrame` multiplies it into the
   * expanded disc children's draw alpha and into `drawClusterChip`'s pill/badge
   * fade-in. Snaps under reduced-motion.
   */
  const chipRevealRef = useRef<Map<string, number>>(new Map());
  /**
   * The fifth tier-piercing channel — a 0..1 ramp for **children a chip expand
   * revealed**, in the same grammar as edge selection, footprints, ego and
   * spotlight.
   *
   * Uses `clusterRevealTau` (0.17), the value the chip's own pill/badge fade
   * uses, because the input producing this channel is a chip click. The first
   * attempt borrowed `egoRevealRiseTau` (0.22), the rhythm of a *different*
   * event (an ego click) — see `.claude/rules/design.md` "One input = one event"
   * (one input, one event).
   *
   * ⚠️ In the draw this channel **replaces** the group fade
   * (`topology-frame-draw.ts`'s `revealMul`); applying both makes alpha the
   * product of two exponentials. Measured: the chip reached 90% at 391 ms while
   * its children took 621 ms — a 230 ms gap, past the 120 ms threshold. That
   * file guards `batchAppear` against double fades; this channel was added
   * later and missed the guard.
   */
  const expandRevealRef = useRef<Map<string, number>>(new Map());
  /**
   * New-node appearance ramp (nodeId → 0..1). On a world rebuild the id set is
   * diffed and only **new** nodes are seeded at 0 (existing ones stay at 1, so
   * nothing regresses); the frame loop converges them to 1.
   * `drawTopologyFrame` multiplies it into effRadius (a slight 0.6→1 scale) and
   * globalAlpha so a node swells into view instead of popping. Snaps to 1 under
   * reduced-motion. The first build has no previous set, so everything is
   * seeded at 1 and this cannot collide with the initial-load choreography.
   */
  const appearRef = useRef<Map<string, number>>(new Map());
  /**
   * Growth replay in flight (`model/growth-replay.ts`), or null. While it runs
   * the draw reads `growthReplayAppearRef` instead of `appearRef`, so the
   * physics step's own appear ramp is untouched and resumes the moment the
   * replay ends or is cancelled by input.
   */
  const growthReplayRef = useRef<GrowthReplay | null>(null);
  const growthReplayAppearRef = useRef<Map<string, number>>(new Map());
  const growthReplayTokenSeenRef = useRef(growthReplayToken);
  const prevNodeIdsRef = useRef<Set<string>>(new Set());
  /**
   * Ids of nodes **born during this session**. The appearance ramp
   * (`appearRef`) alone is not enough: at overview zoom a new capability's tier
   * alpha is 0, so the ramp is multiplied by zero — an agent could create a
   * node and all the screen showed was the domain's child count going 2 → 3
   * (measured 2026-08-17, fixed on the owner's instruction). Nodes in this set
   * get the same class of tier exemption as an ego click or a chip expand, so
   * they are actually drawn.
   *
   * **It persists for the session.** Appearing and then vanishing is exactly
   * the flicker the owner said not to do. A reload returns to the ordinary tier
   * rules.
   */
  const bornNodeIdsRef = useRef<Set<string>>(new Set());
  /**
   * Per-label LOD presence ramp (nodeId → 0..1), turning label flicker into a
   * fade. `drawTopologyFrame` knows the layout result, so it steps and consumes
   * this in place; the loop owns only its lifetime.
   */
  const labelPresentRef = useRef<Map<string, number>>(new Map());
  /**
   * Click-focus signature — the focus classification the COLOR ramp reads from,
   * held for the ~160ms fade after a deselect so the dim/ego target the colors
   * ease FROM persists instead of snapping to normal. Mirrors the live
   * focus while a selection is active, then lingers until the retained subject's
   * ramp decays to ~0 (see the per-frame update after `stepTopologyPhysics`).
   */
  const colorFocusRef = useRef<{ focusedNodeId: string | null; selectedEdge: { sourceId: string; targetId: string } | null } | null>(null);
  const rippleStartRef = useRef<Map<string, number>>(new Map());
  const reducedMotionRef = useRef(false);
  /**
   * The just-committed selection's one-shot
   * commit-pulse anchor (which node, and when it was clicked). Set once per
   * NEW selection by the "focused slug change" effect below, never mutated
   * per-frame — `drawTopologyFrame` derives `now - startAtMs` itself every
   * frame and lets `model/selection-pulse.ts#computeSelectionPulse` decide
   * when the pulse has expired (no cleanup timer needed; an expired pulse
   * just draws nothing).
   */
  const selectionPulseRef = useRef<{ nodeId: string; startAtMs: number } | null>(null);
  /**
   * Hover pulses — the list of live one-shot signals. Pointer handlers append
   * on hover; the frame loop drops expired ones (`updatePulses`) and hands the
   * rest to the draw.
   */
  const pulsesRef = useRef<Pulse[]>([]);
  /**
   * Does the world contain any `depends` edge at all — computed once per world
   * build for the idle gate. Without one there are no comets, so the map is
   * allowed to be judged idle.
   */
  const hasDependsEdgesRef = useRef(false);
  /**
   * Selecting a node also sends comets along its incident `contains` edges, so
   * the idle gate must not freeze while a focus is set and the graph has any
   * `contains` edge. Deliberately coarse — it does not ask "does *this* focused
   * node have an incident edge inside the cap". A world-level flag of the same
   * grain as `hasDependsEdgesRef` is enough, and with no focus there is nothing
   * to stay awake for anyway.
   */
  const hasContainsEdgesRef = useRef(false);
  /** Time of last activity, refreshed on every frame where an activity flag is true. */
  const lastActiveMsRef = useRef(0);
  /**
   * Ambient sleep — time of the last **user input**. Being different from
   * `lastActiveMsRef` is the whole point: that one is refreshed every frame
   * ambient motion is running, so it is permanently current and can never
   * answer "has the person let go". This ref is touched by pointer and wheel
   * only.
   *
   * Seeded at 0 rather than `performance.now()` because calling that during
   * render is impure and lint blocks it — and 0 is also the semantically right
   * value: `performance.now()`'s origin *is* the navigation, so "input happened
   * at time 0" says "untouched since the page opened". Falling asleep 30 s
   * later is the intended behaviour.
   */
  const lastInputMsRef = useRef(0);
  /** Previous frame's camera values, for movement detection. */
  const prevCameraSampleRef = useRef<{ x: number; y: number; s: number } | null>(null);
  /** W6 agent visibility — mirrors `agentFocusNodeId` prop into a ref for the rAF closure, same pattern as `focusedSlugRef`. */
  const agentFocusNodeIdRef = useRef<string | null>(agentFocusNodeId);
  /** Guided tour — `tourAnchorNodeId` prop mirror, same pattern. */
  const tourAnchorNodeIdRef = useRef<string | null>(tourAnchorNodeId);
  /** Spotlight — prop mirror plus its on/off exponential ramp (0..1, stepped in the frame body). */
  const spotlightIdsRef = useRef<ReadonlySet<string> | null>(spotlightIds);
  const mapLensKindRef = useRef<TopologyMapLensKind>(mapLensKind);
  const pathEdgeIdsRef = useRef<ReadonlySet<string> | null>(pathEdgeIds);
  const spotlightRampRef = useRef(0);
  const spotlightDashOffsetRef = useRef(0);
  /**
   * Trail lens strength 0..1, on the **same** exponential ramp as the spotlight
   * so no new easing is introduced. Closing the popover keeps handing the lens
   * set down until this reaches 0, so the trail ink dies out on the ramp rather
   * than cutting.
   */
  const trailLensRampRef = useRef(0);
  /** Mirror the tier-change callback into a ref for the rAF closure, and
   * track the last emitted tier so the callback fires only on transitions. */
  const onZoomTierChangeRef = useRef<typeof onZoomTierChange>(onZoomTierChange);
  const lastZoomTierRef = useRef<ZoomTier | null>(null);
  /** Tier gate config mirror, shared by the rAF closure and the pointer handlers. */
  const tierRevealRef = useRef<TierRevealConfig>(tierReveal);

  /**
   * Tokens for computing a camera target — **only the left and right safe
   * insets are replaced with measured values.**
   *
   * `topology-camera-math` already dodges the panels via the safe insets, but
   * those are CSS tokens and therefore static while the real geometry depends
   * on state. Measured 2026-08-10 at 1512×982: the tokens say left 78 / right
   * 120; the truth was **left 324 / right 0 before a selection** and **left 0 /
   * right 384 after one** (selecting collapses INDEX and opens the popover).
   *
   * A first attempt added a *second* correction (a free-area shift) on the
   * selection path only — a second system for one concern, landing 188 px short
   * in one case and over-correcting by 64 px in another. The fix is not another
   * shift but **feeding the existing insets true values**.
   *
   * Left and right only, and only here. `safeInsetTop` (148) is the tool lane
   * plus docked chips and `safeInsetBottom` (96) is a **label reservation** —
   * without it the bottom row of labels once silently disappeared. Those are
   * layout promises, not covering panels, so measuring over them brings that
   * defect back; and `safeInset*` is also read by label culling
   * (`topology-frame-draw`), which has nothing to do with the camera.
   *
   * Takes the **larger** of token and measurement, so width the token reserved
   * for other reasons is never lost.
   */
  const cameraTokens = useCallback(<T extends { safeInsetLeft: number; safeInsetRight: number }>(tokens: T): T => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return tokens;
    const box = canvasEl.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return tokens;
    const measured = measureCanvasInsets(canvasEl, {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    });
    return {
      ...tokens,
      safeInsetLeft: Math.max(tokens.safeInsetLeft, measured.left),
      safeInsetRight: Math.max(tokens.safeInsetRight, measured.right),
    };
  }, []);

  /**
   * Begin a cubic ease-in-out camera transition from the live camera to
   * `target` (van Wijk's principle: duration proportional to distance), driven
   * each frame by the rAF loop via `easeCameraKeyframe`. Under
   * `prefers-reduced-motion` it no-ops and clears any tween, so the
   * physics-step reduced snap owns the jump. Its identity is stable (refs
   * only), so listing it in the programmatic-move effects' deps never re-fires
   * them.
   */
  const beginCameraTween = useCallback((target: CameraTarget, durationOverrideMs?: number) => {
    if (reducedMotionRef.current) {
      cameraTweenRef.current = null;
      return;
    }
    const cam = cameraRef.current;
    const start: CameraKeyframe = { x: cam.x.value, y: cam.y.value, scale: cam.scale.value };
    const tgt: CameraKeyframe = { x: target.tx, y: target.ty, scale: target.tscale };
    cameraTweenRef.current = { start, target: tgt, startMs: performance.now(), durationMs: durationOverrideMs ?? cameraTransitionDurationMs(start, tgt) };
  }, []);

  useEffect(() => {
    onZoomTierChangeRef.current = onZoomTierChange;
  }, [onZoomTierChange]);

  useEffect(() => {
    onEnterRealmRef.current = onEnterRealm;
  });

  useEffect(() => {
    realmEnterButtonElRef.current = realmEnterButtonRef?.current ?? null;
  });

  useEffect(() => {
    tourAnchorElRef.current = tourAnchorRef?.current ?? null;
  });

  useEffect(() => {
    trailLensPropRef.current = trailLensActiveRef ?? null;
    trailBrushPropRef.current = trailHoverNodeIdRef ?? null;
    panelHoverPropRef.current = panelHoverNodeIdRef ?? null;
  });

  useEffect(() => {
    focusedSlugRef.current = focusedSlug;
    /*
     * The hover ref is cleared on every focus transition (bug sweep
     * 2026-09-01). The pointermove handler early-returns while a node is
     * focused, so the id captured at click time froze in this ref: the idle
     * gate read it as "interaction in progress" every frame and the ambient
     * sleep never engaged — a full-frame 60fps repaint for as long as the
     * mouse rested over the canvas (~130ms/s at 2k nodes). And deselecting via
     * Escape or the panel close without moving the mouse let the frame
     * resolver revive the stale id as a live hover ring on the
     * previously-clicked node. A fresh pointermove after deselect re-derives
     * the real hover.
     */
    hoveredNodeIdRef.current = null;
    // Select and deselect are static state transitions, so force one more draw
    // even while idle skipping (symmetric with the selectedEdge effect).
    // Without this wake on deselect, the retained colorFocus fade freezes in
    // the idle gate and the ring stays at full opacity. Keying off the
    // focusedSlug → null transition guarantees the fade regardless of where the
    // event came from (empty-canvas click, Escape, the panel's close button).
    lastActiveMsRef.current = performance.now();
  }, [focusedSlug]);

  useEffect(() => {
    agentFocusNodeIdRef.current = agentFocusNodeId;
  }, [agentFocusNodeId]);
  useEffect(() => {
    tourAnchorNodeIdRef.current = tourAnchorNodeId;
  }, [tourAnchorNodeId]);
  useEffect(() => {
    spotlightIdsRef.current = spotlightIds;
  }, [spotlightIds]);
  useEffect(() => {
    mapLensKindRef.current = mapLensKind;
    pathEdgeIdsRef.current = pathEdgeIds;
  }, [mapLensKind, pathEdgeIds]);
  // Phase 5 #21 — Apply new render style from the next frame when icon set changes.
  useEffect(() => {
    glyphStyleRef.current = glyphSet === "line" ? "line" : "fill";
  }, [glyphSet]);
  /*
   * An arrangement change rebuilds **coordinates only** — neither the pose
   * (yaw/pitch) nor the camera is touched. Switching between ownership and
   * coupling changes *where the angles come from*, not *what you are looking
   * at*, so resetting the viewpoint would throw away the angle the user just
   * set.
   *
   * The model is invalidated by clearing `domeWorldSourceRef`: the loop's dome
   * step already has a "world changed, re-solve layout but keep the pose" path,
   * so this reuses it and adds no new branch.
   */
  useEffect(() => {
    if (mapArrangementRef.current === mapArrangement) return;
    mapArrangementRef.current = mapArrangement;
    domeWorldSourceRef.current = null;
    lastActiveMsRef.current = performance.now();
  }, [mapArrangement]);

  useEffect(() => {
    if (view3dRef.current === view3d) return;
    view3dRef.current = view3d;
    /*
     * Turning it on makes the next frame's dome step fit the camera to the dome
     * bbox with a cinematic tween.
     *
     * **Turning it off now fits too.** Owner bug report 2026-08-19: *"Switching from 3D back to 2D comes out oddly small"* (switching from 3D back to 2D
     * comes out oddly small).
     *
     * The old reasoning — nodes morph back into place, so nothing jumps —
     * holds only when the 3D camera matches the 2D framing, and it almost never
     * does: the dome fit scale is far lower than the 2D overview (0.315 vs
     * 0.978), and selection reframes, user pans and cloud placement each move
     * it again. Returning to 2D then moves only the nodes, **leaving the camera
     * where 3D put it**. At that zoom semantic zoom also collapses the shapes
     * to circles and hides the engraved counts, so it reads as a different
     * screen rather than a smaller one.
     *
     * It failed to reproduce in the browser a few times because returning was a
     * **side effect of another effect rather than a guaranteed behaviour**, so
     * some paths happened to land right. This makes the accident a contract.
     */
    domeFitPendingRef.current = view3d;
    if (view3d) domeFitDurationRef.current = DOME_ASSEMBLE_TOTAL_MS;
    if (!view3d) flatFitPendingRef.current = true;
    // Re-entering 3D restarts an untouched screen, so rearm the attention spin
    // (the rule that lowers it on interaction is in the spinArmed JSDoc) and
    // the entry sweep — re-entry is a fresh appearance. The sweep is tied to
    // the assembly clock (`domeEntrySweep`), so it only means anything at this
    // moment, when that clock restarts from 0.
    if (view3d && domeRuntimeRef.current !== null) {
      domeRuntimeRef.current.spinArmed = true;
      domeRuntimeRef.current.entryArmed = true;
      domeRuntimeRef.current.entryClock = 0;
    }
    lastInputMsRef.current = performance.now();
    lastActiveMsRef.current = lastInputMsRef.current;
  }, [view3d]);
  // In 3D, the detail panel opening or closing is a resize event as far as the
  // camera is concerned. Owner, 2026-08-18: *"The camera should account for where
  // the panel is and settle at a good size by itself."* (the camera should account for where
  // the panel is and settle at a good size by itself). If the flip arrives
  // while a selection is live, the selected node is reframed against the new
  // visible-area insets on the same cinematic tween — never a teleport.
  //
  // The value is mount-based, so a close arrives after the exit animation ends,
  // once the panel has left the DOM and the measured insets are true. 2D does
  // not use this event: the 2D focus target already accounts for the panel
  // insets at selection time, and closing the panel *is* deselection, so there
  // is no separate reframing point.
  const lastDetailPanelVisibleRef = useRef(detailPanelVisible);
  useEffect(() => {
    if (lastDetailPanelVisibleRef.current === detailPanelVisible) return;
    lastDetailPanelVisibleRef.current = detailPanelVisible;
    if (!view3dRef.current || realmTransitionRef.current.phase !== "idle") return;
    if (domeRuntimeRef.current === null) return;
    const slug = focusedSlugRef.current;
    if (slug === null) return;
    domeFocusPendingRef.current = { slug };
    lastActiveMsRef.current = performance.now();
  }, [detailPanelVisible]);
  // An expansion-preference change takes effect from the next frame. Swapping
  // the value needs no world rebuild; the layout effect below re-solves placement.
  useEffect(() => {
    expandPrefRef.current = expand;
  }, [expand]);
  /**
   * On a canvas-background change, **dispose** the particle engine for the dot
   * background and build a fresh one for any other variant. Keeping the engine
   * alive under "dot" would step an invisible buffer every frame.
   */
  useEffect(() => {
    canvasBackgroundRef.current = canvasBackground;
    animatedBgRef.current?.dispose();
    if (canvasBackground !== "web") {
      animatedBgRef.current = null;
      return;
    }
    const rootStyle = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string): string => {
      const raw = rootStyle.getPropertyValue(name).trim();
      return raw === "" ? fallback : raw;
    };
    const inkMax = Number(read("--canvas-bg-ink-max", "0.08"));
    animatedBgRef.current = createAnimatedBackground("web", {
      inkMax: Number.isFinite(inkMax) ? inkMax : 0.08,
      particleRgb: read("--canvas-bg-particle-rgb", "150, 165, 220"),
    });
    return () => {
      animatedBgRef.current?.dispose();
      animatedBgRef.current = null;
    };
  }, [canvasBackground]);

  /**
   * Resolve the footprint ink: read whichever of the two colour tokens the
   * preference names and expand it to RGB. The canvas cannot read CSS
   * variables, so this happens once per preference change rather than per frame.
   */
  useEffect(() => {
    footprintPrefRef.current = footprint;
    if (!footprint) return;
    const rootStyle = getComputedStyle(document.documentElement);
    const hex = rootStyle
      .getPropertyValue(footprint.tone === "indigo" ? "--color-footprint-trail-indigo" : "--color-footprint-trail")
      .trim();
    const parsed = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (parsed) {
      const n = parseInt(parsed[1], 16);
      footprintInkRef.current = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      footprintStepColorRef.current = hex.startsWith("#") ? hex : `#${parsed[1]}`;
    } else {
      // Token missing or in rgba() form — fall back to the default ink, which
      // beats footprints disappearing.
      footprintInkRef.current = footprint.tone === "indigo" ? [200, 210, 255] : [232, 196, 122];
      footprintStepColorRef.current = footprint.tone === "indigo" ? "#c8d2ff" : "#e8c47a";
    }
  }, [footprint]);

  /**
   * Cursor tracking for the animated backgrounds only. Takes the coordinates
   * from a native `passive` listener rather than extending the large pointer
   * handler factory — that one owns hit-testing, dragging and pinching, and
   * touching its contract for one background coordinate is not worth the cost.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      bgPointerRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      // A hand moving over the map means the navigation was cancelled, or the
      // user decided to stay here.
      navYieldUntilRef.current = 0;
    };
    const onLeave = () => {
      bgPointerRef.current = null;
      /*
       * **Leaving the canvas also clears node hover** (measured 2026-08-19).
       *
       * Node hover (`hoveredNodeIdRef`) used to be released only by a
       * pointermove onto empty space *inside* the canvas, so leaving the window
       * with the cursor over a node — flicking out, releasing a drag at the
       * edge, Cmd-Tabbing away — left an emphasis on it forever. And because
       * `emphasisTarget` reads that ref, the idle gate **never closed again**:
       * 2D at 2,000 nodes burned 130 ms/s even 48 s after the last input, where
       * the same screen idles at 3 ms/s.
       *
       * Pushing the activity timestamp *after* clearing matters: without it the
       * gate closes right there and nobody draws the frame where the emphasis
       * is gone, freezing the ring lit (same reason as `focusFadeSettling`).
       */
      if (hoveredNodeIdRef.current !== null) {
        hoveredNodeIdRef.current = null;
        lastActiveMsRef.current = performance.now();
      }
    };
    canvas.addEventListener("pointermove", onMove, { passive: true });
    canvas.addEventListener("pointerleave", onLeave, { passive: true });
    return () => {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  /**
   * **A screen being left is not worth drawing** (measured 2026-08-19).
   *
   * Time-to-new-screen after a rail tap depended on where you started. To the
   * docs screen under 4× throttling: 194 ms from 2D at 2,000 nodes, but
   * **529 ms from 3D at 2,000 with the dome auto-spinning, and 745 ms at
   * 3,000**. The new screen was not slow — the map kept fully repainting up to
   * the moment it left, competing for frame budget with the new screen's first
   * render.
   *
   * The signal is one shared-layer event (`shared/lib/navigation-intent.ts`);
   * the map knowing the nav rail, or the rail knowing the map's loop, would be
   * an FSD violation.
   *
   * **Recorded as a deadline, released on its own.** A cancelled navigation
   * cannot stop the map forever: it resumes when the cap passes, and one
   * pointer event over the canvas releases it sooner. Same discipline as
   * `idle-gate` being designed without wake wiring.
   */
  useEffect(() => {
    const onIntent = () => {
      navYieldUntilRef.current = performance.now() + NAVIGATION_YIELD_MS;
    };
    window.addEventListener(NAVIGATION_INTENT_EVENT, onIntent);
    return () => window.removeEventListener(NAVIGATION_INTENT_EVENT, onIntent);
  }, []);

  // Ambient sleep delay differs per surface (the gateway's is shorter).
  useEffect(() => {
    ambientSleepDelayRef.current = ambientSleepDelayMs;
  }, [ambientSleepDelayMs]);

  useEffect(() => {
    tierRevealRef.current = tierReveal;
  }, [tierReveal]);

  useEffect(() => {
    selectedEdgeRef.current = selectedEdge;
    // A selection change is a static state transition: draw once more even
    // while idle skipping.
    lastActiveMsRef.current = performance.now();
  }, [selectedEdge]);

  useEffect(() => {
    const prev = prevExpandedParentsRef.current;
    prevExpandedParentsRef.current = expandedParents;
    expandedParentsRef.current = expandedParents;
    // An expansion toggle is a static state transition: wake even while idle
    // skipping so the collapsed children appearing or disappearing is drawn at
    // once.
    lastActiveMsRef.current = performance.now();

    // Dive the camera to the newly expanded parent, if there is one. A collapse
    // alone leaves the camera where it is (owner's instruction). The children
    // reveal naturally through tier alpha as the camera descends into the disc,
    // reusing the existing ramp rather than adding a motion contract.
    let newlyExpanded: string | null = null;
    for (const id of expandedParents) {
      if (!prev.has(id)) {
        newlyExpanded = id;
        break;
      }
    }
    if (newlyExpanded === null) return;
    const tokens = readTopologyV2TokensOrNull();
    const world = worldRef.current;
    const { width, height } = viewportRef.current;
    if (!tokens || !world || width <= 0 || height <= 0 || !hasInitializedRef.current) return;
    const overviewEntryScale = overviewScaleRef.current * tokens.overviewEntryRatio;
    // The dive fits the bbox of **this batch** (the top DOI-ranked children),
    // not the whole disc: few and large beats pulling far back to contain, say,
    // all 108 children when only the top 24 are actually drawn. The rest are
    // collapsed, so they need no framing. Only gated children are ranked, by
    // the same rule as the density gate's domain exemption. Below the threshold
    // there is no restriction at all.
    const gatedChildren = (world.childrenByParent.get(newlyExpanded) ?? []).filter(
      (c) => world.nodeById.get(c)?.kind !== "domain",
    );
    // Batch size comes from the expansion preference. If framing disagrees with
    // how many are actually drawn, what we aimed to contain and what the user
    // sees diverge.
    const batchSize = expandPrefRef.current.batchSize;
    let batchRestrict: Set<string> | null = null;
    if (gatedChildren.length > batchSize) {
      const ranked = rankEgoNeighborsByDOI(
        gatedChildren.map((id) => ({
          id,
          kind: world.nodeById.get(id)?.kind ?? "element",
          degree: world.neighborMap.get(id)?.size ?? 0,
          // childrenByParent is derived from containment, so every entry is a
          // `contains` edge — a uniform weight, which keeps the relative order
          // deterministic.
          relationType: "contains",
        })),
      );
      batchRestrict = new Set<string>([newlyExpanded, ...ranked.slice(0, batchSize)]);
    }
    const target = computeClusterFitTarget(world, tokens, width, height, newlyExpanded, overviewEntryScale, batchRestrict);
    if (!target) return;
    dampingRef.current = tokens.cameraDampingDefault;
    cameraTargetRef.current = target;
    userDrivenCameraRef.current = false;
    // Programmatic camera move: a cubic ease-in-out tween, delegated to the
    // spring under reduced-motion. angfreq is the value the spring takes over
    // with once the tween ends or is interrupted.
    cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
    beginCameraTween(target);
  }, [expandedParents, beginCameraTween]);

  useEffect(() => {
    panelEmphasisNodeIdRef.current = emphasizedNeighborSlug;
  }, [emphasizedNeighborSlug]);

  useEffect(() => {
    visitedTrailRef.current = visitedTrail;
    // The keep-set is updated in place; the frame loop only reads it.
    const keep = visitedTrailSetRef.current;
    keep.clear();
    for (const id of visitedTrail) keep.add(id);
    // Adding or clearing a footprint is a static state transition: draw once
    // more even while idle skipping, same wake contract as edge selection.
    lastActiveMsRef.current = performance.now();
  }, [visitedTrail]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = query.matches;
    const onChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches;
    };
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);

  /**
   * Which bbox the overview fit uses. The workbench (`"spine"`, the default)
   * draws only the spine tier on entry, so the spine bbox is the honest frame;
   * the gateway's evidence section (`"full"`) draws every tier from entry via
   * `GATEWAY_TIER_REVEAL`, so the all-node bbox is. Measured 2026-08-18 at 1512
   * on the gateway: drawing every tier while fitting the spine bbox left 143 px
   * empty above the frame and 17 px below, because the graph's mass sits below
   * the spine centre — the owner's "It sits too low."
   *
   * Labels are not in the bbox; bottom clearance stays with
   * `OVERVIEW_LABEL_BOTTOM_ALLOWANCE` in `topology-camera-math`. The
   * `overviewScaleRef` anchor must use the same bbox or the entry zoomRatio
   * stops being 1 — same contract as the warning in `trySnapInitialCamera`.
   *
   * Frozen at mount (both consumers pass a literal). A ref plus a module-level
   * function, because lint blocks ref writes during render and
   * component-local functions in effect deps, while a ref read and a pure
   * function outside the hook trip neither.
   */
  const overviewFitRef = useRef(overviewFit);

  /**
   * Safety net: if a resize or a monitor change leaves **no node on screen at
   * all**, return to the overview fit.
   *
   * The discipline is not to refit on every resize. A zoom and position the
   * user set are intent, and erasing them is its own kind of defect. This
   * intervenes only in the unambiguous "the map looks empty" state
   * (`hasAnyNodeOnScreen === false`), and moves the spring target rather than
   * the value so nothing jumps; reduced-motion is already honoured by the
   * camera tween contract.
   */
  const rescueCameraIfEverythingOffscreen = (tokens: TopologyV2Tokens) => {
    const world = worldRef.current;
    const { width, height } = viewportRef.current;
    if (!world || width <= 0 || height <= 0) return;
    if (hasAnyNodeOnScreen(cameraRef.current, width, height, world.nodes)) return;
    const target = computeOverviewCameraTarget(overviewBoundsFor(overviewFitRef.current, world), width, height, tokens, world.nodes.length);
    cameraTargetRef.current = { tx: target.tx, ty: target.ty, tscale: target.tscale };
    userDrivenCameraRef.current = false;
  };

  const trySnapInitialCamera = (tokens: TopologyV2Tokens) => {
    if (hasInitializedRef.current) return;
    const world = worldRef.current;
    const { width, height } = viewportRef.current;
    if (!world || width <= 0 || height <= 0) return;
    const target = computeOverviewCameraTarget(
      overviewBoundsFor(overviewFitRef.current, world),
      width,
      height,
      tokens,
      world.nodes.length,
    );
    cameraRef.current = {
      x: { value: target.tx, velocity: 0 },
      y: { value: target.ty, velocity: 0 },
      scale: { value: target.tscale, velocity: 0 },
    };
    cameraTargetRef.current = target;
    userDrivenCameraRef.current = false;
    overviewScaleRef.current = computeOverviewFitScale(
      overviewBoundsFor(overviewFitRef.current, world),
      width,
      height,
      tokens,
      world.nodes.length,
    );
    cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
    hasInitializedRef.current = true;
    if (pendingSpotlightFitRef.current && runSpotlightFitRef.current?.()) {
      pendingSpotlightFitRef.current = false;
    }
  };

  // --- world (layout + adjacency) — rebuilt whenever the graph itself changes ---
  useEffect(() => {
    const tokens = readTopologyV2TokensOrNull();
    if (!tokens) return;
    // Contract point for installed-app proof: desktop WebView verification
    // reads the click-cancel hysteresis from here. Exposes the token verbatim.
    containerRef.current?.setAttribute(
      "data-stage-pan-click-cancel-px",
      String(tokens.hysteresisPx),
    );
    // The expansion structure decides the **seed coordinates**, so it is an
    // input to the world build and appears in the dep array below: changing the
    // preference rebuilds the world and children move to the new placement.
    const world = buildTopologyWorld(nodes, edges, tokens, expand.structure);
    worldRef.current = world;
    // Seed the new-node appearance ramp. On the first build (no previous set)
    // everything is 1, so nothing animates and this cannot collide with the
    // initial-load choreography. Later builds seed only previously unseen ids
    // at 0 and leave existing nodes at 1; vanished ids are pruned. Convergence
    // itself belongs to the frame loop (`stepTopologyPhysics`).
    {
      const prevIds = prevNodeIdsRef.current;
      const appear = appearRef.current;
      const isFirstBuild = prevIds.size === 0;
      const nextIds = new Set<string>();
      for (const n of world.nodes) {
        nextIds.add(n.id);
        if (isFirstBuild || prevIds.has(n.id)) {
          if (!appear.has(n.id)) appear.set(n.id, 1);
        } else {
          appear.set(n.id, 0); // New node — swells into view from 0.
          bornNodeIdsRef.current.add(n.id); // Tier-gate exemption; see `bornNodeIdsRef`.
        }
      }
      for (const id of [...appear.keys()]) if (!nextIds.has(id)) appear.delete(id);
      for (const id of [...bornNodeIdsRef.current]) if (!nextIds.has(id)) bornNodeIdsRef.current.delete(id);
      prevNodeIdsRef.current = nextIds;
    }
    // Cache whether comets can ever run, so the idle gate can decide.
    hasDependsEdgesRef.current = world.edges.some((e) => e.kind === "depends");
    hasContainsEdgesRef.current = world.edges.some((e) => e.kind === "contains");
    // A new world invalidates pulses aimed at the old world's edges.
    pulsesRef.current = [];
    // Seed the force sim off the concentric layout (spatial memory) and warm it
    // so it settles into an organic layout that un-piles the fan-arcs.
    simRef.current = createForceSimulation(
      world.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })),
      world.edges.map((e) => ({ source: e.sourceId, target: e.targetId })),
    );
    nodeDragRef.current = null;
    // No load-time settle: the sim stays cold until a node is pin-dragged. The
    // static default is the deterministic de-piled grid from `topology-world`.
    heatRef.current = 0;
    // A graph rebuild invalidates any in-flight drag/tug/homing state — those
    // ids/refs point at the OLD world's nodes.
    dragAffectedSetRef.current = null;
    dragStartPosRef.current = null;
    dragTugOffsetsRef.current.clear();
    homeSpringsRef.current.clear();
    homingActiveRef.current = false;
    homeTargetOverrideRef.current = null;
    prevPinnedNodeIdRef.current = null;
    onVisibleCountChange?.(nodes.length);
    onGraphStatsChange?.({ nodes: nodes.length, relations: edges.length });
    /*
     * **A different data source refits the overview** (decision ledger
     * 2026-08-08 (3) ②).
     *
     * `trySnapInitialCamera` ran once, guarded by `hasInitializedRef`, so
     * opening a vault mid-session (sample → local) **drew the new graph with
     * the previous graph's camera**, leaving the new world's outermost nodes
     * outside the chrome safe area.
     *
     * The single trigger is source identity; triggering on node count would
     * hijack the camera every time the user adds one. Lowering the
     * initialization flag reuses the **same overview fit path**, so safe-area
     * fit, the `overviewScaleRef` anchor and reduced-motion handling all come
     * along for free.
     *
     * ⚠️ **`null` means "not known yet", not "changed".** The vault identity
     * string **lies while loading**: every live refresh sends `load()` back to
     * status `'loading'` (`use-local-vault.ts`), so the identity computed then
     * is `sample:<sample>` rather than `local:<folder>`. Counting that as a
     * change **hijacks the camera on every file saved into the vault** —
     * measured 2026-08-08: adding one node jumped it dx −3.93, dy −10.66,
     * scale −0.0327. So the caller passes `null` until it settles (HomePage's
     * `deeplinkSourceReady`) and this compares only against the last value it
     * knew.
     */
    if (dataSourceKey !== null && dataSourceKey !== fittedDataSourceKeyRef.current) {
      fittedDataSourceKeyRef.current = dataSourceKey;
      hasInitializedRef.current = false;
    }
    trySnapInitialCamera(tokens);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, expand.structure]);

  // --- resize (mechanical) + grid pattern/dust (viewport-dependent, built once/on resize) ---
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    /**
     * Record the size only. **Do not change the canvas backing size here.**
     *
     * `canvas.width = n` clears the bitmap, and a ResizeObserver callback runs
     * **after** rAF and **before** paint within a browser frame. Resizing here
     * makes that frame's order `draw → clear → paint`, so **an empty canvas
     * reaches the screen**. A docking panel's width transition fires the
     * observer every frame, so for the whole transition (measured
     * 183–200 ms) the map showed 0 nodes, 0 edges, 0 grid. Committing inside
     * rAF makes the order `clear → draw → paint`, and the same resize never
     * blanks a frame.
     */
    const measure = () => {
      const rect = container.getBoundingClientRect();
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      pendingViewportRef.current = { width: rect.width, height: rect.height, dpr };
      // Keep the cached pointer rect fresh whenever layout changes (see
      // `canvasRectRef` in `topology-pointer-handlers.ts`).
      canvasRectRef.current = { left: rect.left, top: rect.top };
    };

    /** The cheap half, called from inside a frame: backing size and viewport facts only. */
    const commitViewportSize = () => {
      const pending = pendingViewportRef.current;
      if (!pending) return false;
      pendingViewportRef.current = null;
      const backingWidth = Math.max(1, Math.round(pending.width * pending.dpr));
      const backingHeight = Math.max(1, Math.round(pending.height * pending.dpr));
      const sizeChanged = canvas.width !== backingWidth || canvas.height !== backingHeight;
      // **An unchanged CSS size does not rebuild the viewport layers.**
      // Everything `rebuildViewportLayers` produces (star dust, grid, depth
      // dots) is in CSS pixels and stays valid across a dpr change. Without
      // this distinction, grabbing and releasing a drag rebuilds the star dust
      // twice, and the fix for lag becomes new lag.
      const cssSizeChanged =
        viewportRef.current.width !== pending.width || viewportRef.current.height !== pending.height;
      if (canvas.width !== backingWidth) canvas.width = backingWidth;
      if (canvas.height !== backingHeight) canvas.height = backingHeight;
      viewportRef.current = pending;
      if (cssSizeChanged) {
        viewportRebuildPendingRef.current = true;
        // Move dock width and camera on the same clock. Creating the first target
        // after settling appears as two actions: 「Panel Move → Brief Pause → Map Move」.
        // This path does not recreate stardust/grids, only cheaply updates the camera target.
        if (
          hasInitializedRef.current &&
          reframeViewportRef.current?.("tracking")
        ) {
          viewportCameraTrackedRef.current = true;
        }
      }
      return sizeChanged;
    };

    /**
     * The expensive half: rebuild the viewport-dependent layers and rescue the
     * camera. Runs **once, after the size settles** (`VIEWPORT_SETTLE_FRAMES`).
     * During a transition the previous point cloud keeps being drawn —
     * momentarily misplaced star dust beats a blank screen, and refitting the
     * camera every frame makes it jump twice at the end of the transition.
     */
    const rebuildViewportLayers = () => {
      const { width, height } = viewportRef.current;
      if (width <= 0 || height <= 0) return;

      const tokens = readTopologyV2TokensOrNull();
      if (!tokens) return;

      if (!gridCanvasRef.current) gridCanvasRef.current = document.createElement("canvas");
      if (!gridPatternRef.current) {
        gridPatternRef.current = buildGridPattern(gridCanvasRef.current, {
          minorColor: tokens.gridMinor,
          majorColor: tokens.gridMajor,
          baseColor: tokens.canvasBgNear,
        });
      }
      // The three depth-dot layers are static tiles, built once per viewport rebuild.
      if (depthDotCanvasRef.current.length === 0) {
        depthDotCanvasRef.current = DEPTH_DOT_LAYERS.map(() => document.createElement("canvas"));
      }
      {
        const rootStyle = getComputedStyle(document.documentElement);
        const rgb = rootStyle.getPropertyValue("--canvas-bg-particle-rgb").trim() || "150, 165, 220";
        depthDotPatternsRef.current = DEPTH_DOT_LAYERS.map((layer, i) =>
          buildDepthDotPattern(depthDotCanvasRef.current[i], layer, `rgba(${rgb}, ${0.055 * layer.alphaScale})`),
        );
      }
      dustPointsRef.current = buildDustPoints(width, height, computeStarDustCount(width, height, tokens.dustAreaPerPoint), tokens.dustParallaxMin, tokens.dustParallaxMax);
      // Cosmos dots are twice the density of the dust (two layers), counted off
      // the same areaPerPoint token and doubled.
      cosmosPointsRef.current = buildRealmCosmosPoints(
        width,
        height,
        computeStarDustCount(width, height, tokens.dustAreaPerPoint) * 2,
      );
      // Initial mount has `trySnapInitialCamera` set the camera immediately. Only
      // resize with an existing camera realigns the current semantic state to the new width.
      const hadCameraBeforeResize = hasInitializedRef.current;
      trySnapInitialCamera(tokens);
      const reframeMotion: ViewportReframeMotion = viewportCameraTrackedRef.current
        ? "finalize-tracking"
        : "settled";
      const reframed =
        hadCameraBeforeResize && reframeViewportRef.current?.(reframeMotion);
      viewportCameraTrackedRef.current = false;
      // Even if the camera was intentionally preserved like a user pan/zoom, if all
      // nodes have clearly vanished after resize (an obvious failure state), the existing
      // safety net acts as the final rescue.
      if (!reframed) rescueCameraIfEverythingOffscreen(tokens);
    };

    commitViewportSizeRef.current = commitViewportSize;
    rebuildViewportLayersRef.current = rebuildViewportLayers;

    // Commit immediately on mount: `trySnapInitialCamera` needs the viewport
    // facts before the first frame in order to decide the first camera.
    measure();
    commitViewportSize();
    rebuildViewportLayers();
    viewportRebuildPendingRef.current = false;

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => {
        window.removeEventListener("resize", measure);
        commitViewportSizeRef.current = null;
        rebuildViewportLayersRef.current = null;
      };
    }
    const observer = new ResizeObserver(measure);
    observer.observe(container);

    // `ResizeObserver` only sees **size** changes. Moving the window to another
    // monitor leaves the CSS size intact and changes `devicePixelRatio` alone,
    // which leaves the canvas backing size at the old DPR and misaligns
    // everything drawn. So DPR is watched separately.
    // `matchMedia(resolution)` fires once when the current DPR is left behind,
    // so it is re-armed with a fresh query each time.
    let dprQuery: MediaQueryList | null = null;
    const onDprChange = () => {
      measure();
      watchDpr();
    };
    const watchDpr = () => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
      dprQuery?.removeEventListener?.("change", onDprChange);
      const dpr = window.devicePixelRatio || 1;
      dprQuery = window.matchMedia(`(resolution: ${dpr}dppx)`);
      dprQuery.addEventListener?.("change", onDprChange);
    };
    watchDpr();

    return () => {
      observer.disconnect();
      dprQuery?.removeEventListener?.("change", onDprChange);
      commitViewportSizeRef.current = null;
      rebuildViewportLayersRef.current = null;
    };
  }, []);

  // --- relayoutToken / fitViewToken — both mean "spring back to the full overview fit" ---
  /**
   * Spring back to the full overview fit — shared by the fit/relayout tokens
   * and the `0` key (`interaction/keyboard-zoom.ts`), so the keyboard fit is
   * byte for byte the fit the toolbar performs.
   */
  const runOverviewFit = useCallback(() => {
    const tokens = readTopologyV2TokensOrNull();
    const world = worldRef.current;
    const { width, height } = viewportRef.current;
    if (!tokens || !world || width <= 0 || height <= 0 || !hasInitializedRef.current) return;
    // Warding invariant (owner bug report 2026-07-23): inside a realm, fit and
    // relayout return to the **realm's content bbox**, not the global spine.
    // Tweening to the global overview takes the camera out of the realm and
    // leaves "an empty ring plus some nodes somewhere" — same contract as the
    // deselect return.
    const realmData = realmDataRef.current;
    const realmPhase = realmTransitionRef.current.phase;
    if (realmData !== null && (realmPhase === "entering" || realmPhase === "active")) {
      const bounds = realmVisibleBounds(
        world,
        realmData,
        new Set([...expandedParentsRef.current, realmData.rootId]),
        tokens,
      );
      const target = realmCameraTarget(bounds, tokens, width, height);
      cameraTargetRef.current = target;
      userDrivenCameraRef.current = false;
      dampingRef.current = tokens.cameraDampingDefault;
      cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
      beginCameraTween(target);
      return;
    }
    // 3D "reset" — the way back after spinning the dome until you are lost.
    // Eases the pose to the default (yaw 0.55, pitch 0.34) and fits the camera
    // to that pose's dome bbox. The yaw target is the equivalent angle nearest
    // the current one, so it never takes the long way round.
    const dome = domeRuntimeRef.current;
    if (dome !== null && dome.active) {
      const targetYaw = domeNearestYawTurn(0.55, dome.yaw);
      dome.yawVel = 0;
      // Drop the landing target too — new input and an explicit reset always win.
      dome.yawSnap = null;
      dome.pitchVel = 0;
      dome.orbiting = false;
      dome.poseTween = { startYaw: dome.yaw, startPitch: dome.pitch, targetYaw, targetPitch: DOME_PITCH_DEFAULT, startMs: performance.now(), durationMs: DOME_POSE_MS };
      // Auto-align is the explicit reset that sends the pose home, and it is
      // the one place the attention spin is rearmed after user interaction
      // lowered `spinArmed`.
      dome.spinArmed = true;
      const domeBounds = domeWorldBounds(dome.model, targetYaw, DOME_PITCH_DEFAULT);
      if (domeBounds !== null) {
        const padX = (domeBounds.maxX - domeBounds.minX) * 0.15;
        const padY = (domeBounds.maxY - domeBounds.minY) * 0.15;
        const target = computeOverviewCameraTarget(
          { minX: domeBounds.minX - padX, minY: domeBounds.minY - padY, maxX: domeBounds.maxX + padX, maxY: domeBounds.maxY + padY },
          width,
          height,
          tokens,
          world.nodes.length,
        );
        cameraTargetRef.current = target;
        dome.fitScale = target.tscale;
        userDrivenCameraRef.current = false;
        dampingRef.current = tokens.cameraDampingDefault;
        cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
        beginCameraTween(target);
        lastActiveMsRef.current = performance.now();
        return;
      }
    }
    // Panel-aware: spring back to the overview centered in the VISIBLE area, not
    // behind the left ReaderLens panel (design guardian's camera rejection). Fits the
    // SPINE bbox (not the full 295-node bounds) so "fit view" reframes the same
    // legible 8-node spine as the initial entry — and keeps `overviewScaleRef`
    // on the same spine bounds so the zoom-ratio/altitude anchor stays at ratio 1.
    const overviewTarget = computeOverviewCameraTarget(overviewBoundsFor(overviewFitRef.current, world), width, height, tokens, world.nodes.length);
    cameraTargetRef.current = overviewTarget;
    userDrivenCameraRef.current = false;
    overviewScaleRef.current = computeOverviewFitScale(overviewBoundsFor(overviewFitRef.current, world), width, height, tokens, world.nodes.length);
    dampingRef.current = tokens.cameraDampingDefault;
    // Dive-zoom fix — "fit view"/relayout is a PROGRAMMATIC camera move, so it
    // eases via the cubic transition tween (reduced-motion → spring/snap), not
    // whatever a preceding wheel gesture left in interactive mode.
    cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
    beginCameraTween(overviewTarget);
  }, [beginCameraTween]);
  useEffect(() => {
    if (growthReplayToken === growthReplayTokenSeenRef.current) return;
    growthReplayTokenSeenRef.current = growthReplayToken;
    const world = worldRef.current;
    if (!world || reducedMotionRef.current) return;
    const tokens = readTopologyV2TokensOrNull();
    if (!tokens) return;
    // Fit first so the whole ontology is on screen while it grows; the fit tween
    // and the first nodes start on the same frame.
    runOverviewFit();
    const now = performance.now();
    /*
     * Schedule only what the screen will actually show. In 2D the density gate
     * hides elements at overview altitude, and a replay paced over 125 nodes of
     * which 36 are visible spent most of its twelve seconds on nothing
     * (measured 2026-09-02: one visible birth per second). The tier alpha is
     * read at the **fit target** scale, since that is where the camera is
     * heading; the cone tree draws every tier, so 3D keeps them all.
     */
    const zoomRatio = computeZoomRatio(cameraTargetRef.current.tscale, overviewScaleRef.current * tokens.overviewEntryRatio);
    const dome = domeRuntimeRef.current;
    const domeOn = dome !== null && dome.active;
    const clustered = clusteredIdsRef.current;
    const shown = world.nodes.filter(
      (n) => !clustered.has(n.id) && (domeOn || nodeTierAlpha(n.kind, n.isHub, zoomRatio, tierRevealRef.current) > 0.05),
    );
    growthReplayRef.current = createGrowthReplay(
      shown.map((n) => ({ id: n.id, kind: n.kind, parentId: n.parentId })),
      now,
    );
    growthReplayAppearRef.current = new Map();
    lastActiveMsRef.current = now;
  }, [growthReplayToken, runOverviewFit]);
  useEffect(() => {
    // Skip while both tokens still equal their captured mount-time values —
    // this effect's own mount-time fire (see `initialFitTokensRef` above).
    // `trySnapInitialCamera` already set the correct initial camera; this
    // effect should only react to an actual "fit view"/relayout click after.
    const initial = initialFitTokensRef.current;
    if (relayoutToken === initial.relayout && fitViewToken === initial.fitView) return;
    runOverviewFit();
  }, [relayoutToken, fitViewToken, runOverviewFit]);

  /*
   * The spotlight fit: the **moment** the recent-changes lens turns on or its
   * window changes, aim the camera so every spotlit node is on screen.
   *
   * Owner report 2026-08-02: narrowing the window from 30 days to 1 dropped the
   * spotlight from 15 nodes to 3 while **the view stayed put**, so nothing
   * appeared to happen. Everywhere else — search selection, "View Only This" — the
   * camera follows.
   *
   * It fits once when the token changes and never again after a pan or zoom, so
   * it cannot take away a view the user set; with zero spotlit nodes it does
   * not move at all.
   *
   * Returns `true` on success. The two failure reasons are deliberately
   * distinct: "not ready yet" lets the caller record debt, "nothing to fit"
   * ends there — debt recorded then could never be paid, and a session with no
   * spotlit nodes would retry on every initialization.
   */
  const runSpotlightFit = useCallback((motion: "tween" | "follow" | "snap" = "tween"): boolean => {
    const ids = spotlightIdsRef.current;
    if (ids === null || ids.size === 0) return true; // No debt to record.
    const tokens = readTopologyV2TokensOrNull();
    const world = worldRef.current;
    const { width, height } = viewportRef.current;
    if (!tokens || !world || width <= 0 || height <= 0 || !hasInitializedRef.current) return false;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let hit = 0;
    for (const node of world.nodes) {
      if (!ids.has(node.id)) continue;
      hit += 1;
      if (node.x < minX) minX = node.x;
      if (node.y < minY) minY = node.y;
      if (node.x > maxX) maxX = node.x;
      if (node.y > maxY) maxY = node.y;
    }
    // None of the spotlit ids may exist in the current world (inside a
    // collapsed cluster, say). With no bbox to fit, leave the camera alone —
    // and record no debt, because retrying gives the same result.
    if (hit === 0) return true;

    // Pad so nothing sits flush against the edge: fitting the raw bbox clips
    // labels, rings and footprints.
    const padX = Math.max(48, (maxX - minX) * 0.18);
    const padY = Math.max(48, (maxY - minY) * 0.18);
    const target = fitWorldTarget(
      { minX: minX - padX, minY: minY - padY, maxX: maxX + padX, maxY: maxY + padY },
      width,
      height,
      tokens.cameraScaleMax,
      tokens.cameraScaleMin,
    );
    cameraTargetRef.current = target;
    userDrivenCameraRef.current = false;
    dampingRef.current = tokens.cameraDampingDefault;
    // Live viewport tracking is a target that moves every frame like a wheel. Using
    // a slow narrative transition spring makes the camera linger after the dock stops,
    // appearing as two actions.
    cameraAngularFreqRef.current =
      motion === "follow"
        ? tokens.cameraSpringAngFreqInteractive
        : tokens.cameraSpringAngFreqTransition;
    if (motion === "snap") {
      cameraTweenRef.current = null;
      cameraRef.current = {
        x: { value: target.tx, velocity: 0 },
        y: { value: target.ty, velocity: 0 },
        scale: { value: target.tscale, velocity: 0 },
      };
    } else if (motion === "follow") cameraTweenRef.current = null;
    else beginCameraTween(target);
    return true;
  }, [beginCameraTween]);
  const getRunSpotlightFit = useEffectEvent(() => runSpotlightFit);
  useLayoutEffect(() => {
    runSpotlightFitRef.current = getRunSpotlightFit();
  }, [runSpotlightFit]);

  useEffect(() => {
    if (spotlightFitToken === lastProcessedSpotlightFitTokenRef.current) return;
    lastProcessedSpotlightFitTokenRef.current = spotlightFitToken;
    if (!runSpotlightFit()) pendingSpotlightFitRef.current = true;
  }, [spotlightFitToken, runSpotlightFit]);

  /**
   * Follow docking panel/window/split width transitions to recalculate the currently
   * viewed semantic meaning into the new available area. `tracking` moves only the
   * spring target in the same frame as the width, and `finalize-tracking` lands on
   // the final target with velocity 0 to eliminate underdamped bounce. `settled` uses
   // the standard camera tween for immediately finished resizes.
   *
   // The previous resize path only recreated canvas resolution and stardust, rescuing
   // the camera only when 「everything is off-screen」. Thus, while INDEX collapsed
   // and the right agent entered, if any nodes remained even slightly, the previous
   // width's camera passed validation, pushing the entire graph left. The reason node
   // selection worked normally was that the selection effect re-initialized the new
   // width and inspector separately.
   *
   // Here we do not unconditionally revert to overview. We recalculate the camera meaning
   // owned by each selection/area/path-full lens/3D, preserving screens panned/zoomed
   // directly.
   */
  const reframeViewport = useCallback((motion: ViewportReframeMotion): boolean => {
    const rawTokens = readTopologyV2TokensOrNull();
    const world = worldRef.current;
    const { width, height } = viewportRef.current;
    if (!rawTokens || !world || width <= 0 || height <= 0 || !hasInitializedRef.current) {
      return false;
    }

    // Put the actual DOM width of INDEX/selection inspector into the same safe inset syntax.
    const tokens = cameraTokens(rawTokens);
    const overviewBounds = overviewBoundsFor(overviewFitRef.current, world);
    overviewScaleRef.current = computeOverviewFitScale(
      overviewBounds,
      width,
      height,
      tokens,
      world.nodes.length,
    );

    const realmPhase = realmTransitionRef.current.phase;
    const realmActive = realmPhase === "entering" || realmPhase === "active";
    const focused = focusedSlugRef.current;
    const dome = domeRuntimeRef.current;
    const mode = resolveViewportReframeMode({
      userDriven: userDrivenCameraRef.current,
      domeActive: dome !== null && dome.active,
      focused: focused !== null,
      pairFocused: selectedEdgeRef.current !== null,
      realmActive,
      spotlightActive: (spotlightIdsRef.current?.size ?? 0) > 0,
    });

    if (mode === "preserve") return false;

    // 3D must be handled with live projection coordinates held by rAF. Do not reset
    // orientation; only feed the new viewport into the existing select/deselect reframe path.
    if (mode === "dome-focus" || mode === "dome-overview") {
      // The DOM owns its final bbox in its own projection step. Do not restart that
      // step every frame for width; only hand off the debt once upon settling.
      if (motion === "tracking") return false;
      domeFocusPendingRef.current = { slug: mode === "dome-focus" ? focused : null };
      lastActiveMsRef.current = performance.now();
      return true;
    }

    let target: CameraTarget | null = null;
    if (mode === "focus" && focused !== null) {
      const realmData = realmDataRef.current;
      target = computeFocusCameraTarget(
        world,
        tokens,
        width,
        height,
        focused,
        overviewScaleRef.current * tokens.overviewEntryRatio,
        realmActive ? realmData?.memberIds ?? null : null,
      );
    } else if (mode === "realm") {
      const realmData = realmDataRef.current;
      if (realmData !== null) {
        const bounds = realmVisibleBounds(
          world,
          realmData,
          new Set([...expandedParentsRef.current, realmData.rootId]),
          tokens,
        );
        target = realmCameraTarget(bounds, tokens, width, height);
      }
    } else if (mode === "spotlight") {
      // Recent changes/path/full expand already own a single node-set fit in one place.
      return runSpotlightFit(
        motion === "tracking"
          ? "follow"
          : motion === "finalize-tracking"
            ? "snap"
            : "tween",
      );
    } else if (mode === "overview") {
      target = computeOverviewCameraTarget(
        overviewBounds,
        width,
        height,
        tokens,
        world.nodes.length,
      );
    }

    if (target === null) return false;
    cameraTargetRef.current = target;
    userDrivenCameraRef.current = false;
    dampingRef.current = tokens.cameraDampingDefault;
    cameraAngularFreqRef.current =
      motion === "tracking"
        ? tokens.cameraSpringAngFreqInteractive
        : tokens.cameraSpringAngFreqTransition;
    lastActiveMsRef.current = performance.now();
    if (motion === "finalize-tracking") {
      cameraTweenRef.current = null;
      cameraRef.current = {
        x: { value: target.tx, velocity: 0 },
        y: { value: target.ty, velocity: 0 },
        scale: { value: target.tscale, velocity: 0 },
      };
    } else if (motion === "tracking") cameraTweenRef.current = null;
    else beginCameraTween(target);
    return true;
  }, [beginCameraTween, cameraTokens, runSpotlightFit]);
  useEffect(() => {
    reframeViewportRef.current = reframeViewport;
    return () => {
      reframeViewportRef.current = null;
    };
  }, [reframeViewport]);

  // --- relayoutToken ONLY (not fitViewToken) — also restores every node's
  // position to its canonical (`homeX`/`homeY`) layout coordinate over a
  // short critically-damped spring transition. Fit-view intentionally does NOT
  // do this — it only recentres the camera. They are different user actions:
  // auto-arrange is the button that implies "put the nodes back", per
  // `HomePage.tsx`'s `onRelayout`. ---
  useEffect(() => {
    if (relayoutToken === initialRelayoutTokenRef.current) return;
    const world = worldRef.current;
    if (!world) return;

    // Relayout is a clean slate: drop any in-flight drag/tug/settle state so
    // the homing transition below isn't fighting stale sim pins or tug offsets,
    // and reseed the sim's OWN internal graph at the home coordinates too — it
    // doesn't automatically track `world.nodes` mutations, so without this a
    // drag right after a relayout would start from the sim's stale pre-relayout
    // positions and jump.
    nodeDragRef.current = null;
    heatRef.current = 0;
    dragAffectedSetRef.current = null;
    dragStartPosRef.current = null;
    dragTugOffsetsRef.current.clear();

    // Warding invariant (owner bug report 2026-07-23, repro path ②): inside a
    // realm, auto-arrange means "tidy *this* world", so the homing targets are
    // the **realm layout coordinates** (`insideTargets`), not the global
    // `homeX`/`homeY`. Sending them home globally left the warding ring at the
    // realm origin while every member flew off to spine coordinates — the root
    // ended up outside its own ring. Nodes outside are hard-culled, so they get
    // no spring. A relayout while exiting takes the global path: the reverse
    // playback's destination is global home, so realm-target homing must not
    // pull nodes back into a world that is closing.
    const realmData = realmDataRef.current;
    const realmPhase = realmTransitionRef.current.phase;
    if (realmData !== null && (realmPhase === "entering" || realmPhase === "active")) {
      simRef.current = createForceSimulation(
        world.nodes.map((n) => {
          const t = realmData.insideTargets.get(n.id);
          return { id: n.id, x: t?.x ?? n.x, y: t?.y ?? n.y };
        }),
        world.edges.map((e) => ({ source: e.sourceId, target: e.targetId })),
      );
      const springs = new Map<string, HomeSpringState>();
      for (const node of world.nodes) {
        if (realmData.insideTargets.has(node.id)) springs.set(node.id, initHomeSpring(node.x, node.y));
      }
      homeSpringsRef.current = springs;
      homeTargetOverrideRef.current = realmData.insideTargets;
      homingActiveRef.current = true;
      return;
    }

    simRef.current = createForceSimulation(
      world.nodes.map((n) => ({ id: n.id, x: n.homeX, y: n.homeY })),
      world.edges.map((e) => ({ source: e.sourceId, target: e.targetId })),
    );

    const springs = new Map<string, HomeSpringState>();
    for (const node of world.nodes) {
      springs.set(node.id, initHomeSpring(node.x, node.y));
    }
    homeSpringsRef.current = springs;
    homeTargetOverrideRef.current = null;
    homingActiveRef.current = true;
  }, [relayoutToken]);

  // --- First-map reveal: right after bootstrap, every node gathers out of the
  // spine centre and settles home. It rides the existing homing springs
  // (including their reduced-motion snap), so there is no new motion contract.
  //
  // Initialising to 0 is the point: an empty vault never mounts the canvas, so
  // bootstrap completion (the token bump) happens BEFORE mount. Initialising
  // from the current prop would let the first mount swallow that bump and the
  // reveal would never fire.
  const lastRevealTokenRef = useRef(0);
  useEffect(() => {
    if (revealToken === lastRevealTokenRef.current) return;
    lastRevealTokenRef.current = revealToken;
    const world = worldRef.current;
    if (!world || world.nodes.length === 0) return;
    // Origin = the project node's home, falling back to the spine bbox centre.
    const projectNode = world.nodes.find((n) => n.kind === "project");
    const cx = projectNode?.homeX ?? (world.spineBounds.minX + world.spineBounds.maxX) / 2;
    const cy = projectNode?.homeY ?? (world.spineBounds.minY + world.spineBounds.maxY) / 2;
    const tokens = readTopologyV2TokensOrNull();
    if (!tokens) return;
    const reveal = prepareRevealHome(world, tokens, { x: cx, y: cy });
    worldRef.current = reveal.world;
    homeSpringsRef.current = reveal.springs;
    homingActiveRef.current = true;
  }, [revealToken]);

  // --- focused slug change — spring-dive to the ego bbox, or back to overview when cleared ---
  useEffect(() => {
    if (lastFocusedSlugRef.current === focusedSlug) return;
    lastFocusedSlugRef.current = focusedSlug;
    // A new focus starts from the top-ranked neighbours again, discarding
    // batches opened by chip clicks.
    egoRevealBatchesRef.current = 1;

    // A NEW selection (never a deselect) starts
    // the one-shot commit pulse. Captured unconditionally (before the
    // tokens/world early-return below) so the pulse timestamp is never
    // skipped even if the camera-target computation bails out for some
    // reason.
    selectionPulseRef.current = focusedSlug !== null ? { nodeId: focusedSlug, startAtMs: performance.now() } : null;

    // In 3D the camera target is NOT computed here. The 2D formula
    // (`computeFocusCameraTarget`) works from a node's **2D coordinates**,
    // which differ from where the dome drew it; and at this point the selection
    // may still be expanding ancestor clusters while the world rebuilds, so it
    // fails silently (measured 2026-08-18: selecting in 3D never moved the
    // camera scale once). Record a ticket instead, and let the loop's dome step
    // set up the yaw reframe and camera tween together against the live world.
    if (view3dRef.current && realmTransitionRef.current.phase === "idle" && domeRuntimeRef.current !== null) {
      domeFocusPendingRef.current = { slug: focusedSlug };
      return;
    }

    const tokens = readTopologyV2TokensOrNull();
    const world = worldRef.current;
    const { width, height } = viewportRef.current;
    if (!tokens || !world || width <= 0 || height <= 0) return;

    const overviewEntryScale = overviewScaleRef.current * tokens.overviewEntryRatio;
    // Inside a realm the ego bbox is restricted to realm members, so a
    // flung-out neighbour beyond the warding ring cannot inflate the bbox and
    // throw the camera off screen. The focus dive stays inside the ring.
    const realmActive = realmTransitionRef.current.phase !== "idle";
    const realmData = realmDataRef.current;
    // Deselecting by clicking the floor inside a realm used to send the camera
    // flying: `computeFocusCameraTarget`'s null branch works from the **global**
    // spineBounds, which does not match the realm layout's coordinate space
    // (origin 0,0). While a realm is active, the deselect return target is the
    // realm's content bbox over its visible members — the current realm fit,
    // not `entryCamera`, which belongs to leaving the realm.
    /*
     * ⚠️ **The target computation itself waits one frame.**
     *
     * The popover to avoid is opened by *this very selection*, so it is not in
     * the DOM while this effect runs. Measuring insets then reports 0 on the
     * right and the correction vanishes — which the gate caught exactly ("free
     * 127px, screen 64px"). So measuring and computing happen in the same
     * frame.
     *
     * One frame (≈16 ms) ahead of a 200–420 ms move is invisible, and the
     * one-input-one-event gate holds that gap to a frame count.
     */
    const raf = requestAnimationFrame(() => {
    let target: CameraTarget | null;
    if (focusedSlug === null && realmActive && realmData) {
      const bounds = realmVisibleBounds(
        world,
        realmData,
        new Set([...expandedParentsRef.current, realmData.rootId]),
        tokens,
      );
      target = realmCameraTarget(bounds, tokens, width, height);
    } else {
      const realmMembers = realmActive ? realmData?.memberIds ?? null : null;
      /*
       * Selection entry avoids the actual width of the just-opened inspector. Conversely, selection exit
       // must not avoid the final overview even if the inspector **still remains in the DOM during
       // its exit animation**. Previously both directions recalculated via `cameraTokens()`,
       // leaving the graph left by half the inspector's width (measured approx. 192px) after closing.
       *
       // The exit destination is the safe area after the panel disappears, so use the canonical CSS token;
       // the selection destination uses measured tokens including current actual obstacles. This is a
       // difference in entry/exit states for one condition, not a separate correction value.
       */
      const focusTokens = focusedSlug === null ? tokens : cameraTokens(tokens);
      target = computeFocusCameraTarget(world, focusTokens, width, height, focusedSlug, overviewEntryScale, realmMembers);
    }
    if (!target) return;
    /*
     * **Aim at a spot the panel does not cover.** Owner, 2026-08-10:
     * "It must not be covered — centre it in the space left over after the panel."
     *
     * Selecting a node opens a popover on the right while this target is
     * computed against the **viewport centre**, so the selected node could end
     * up behind the panel explaining it. Measured at 1512×982: canvas x64
     * w1448, popover x1128 w352 — the free area's centre is **192 px left** of
     * the screen centre. The overview path already dodged the panels; the
     * selection path did not, and this is that one place.
     *
     * The panel width is measured from the DOM, not pinned: a pinned value
     * drifts silently the day the panel changes. It runs per selection, not per
     * frame.
     */
      const finalTarget = target;
      dampingRef.current = tokens.cameraDampingDefault;
      cameraTargetRef.current = finalTarget;
      userDrivenCameraRef.current = false;
      // Dive-zoom fix — focus dive AND deselect-return are both PROGRAMMATIC
      // camera moves (this effect fires for both directions of `focusedSlug`
      // changing), so both ease via the cubic transition tween (reduced-motion →
      // spring/snap).
      cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
      lastActiveMsRef.current = performance.now();
      beginCameraTween(finalTarget);
    });
    return () => cancelAnimationFrame(raf);
  }, [focusedSlug, beginCameraTween, cameraTokens]);

  // --- Realm entry/exit: a `realmRootId` change relays out the subtree and
  // starts the transition choreography. Entering re-lays the subtree around
  // that node as a temporary root, FLIPs the members, flings the outsiders away
  // under gravity, and dollies the camera into the warding ring. Exiting
  // returns every node on its home spring (reusing the relayout homing) and
  // fits the camera to the overview. The only new motion contract is
  // realm-transition's FLIP and fling; the exit rides the proven homing path.
  useEffect(() => {
    if (realmRootId === prevRealmRootIdRef.current) return;
    prevRealmRootIdRef.current = realmRootId;
    lastActiveMsRef.current = performance.now();

    const world = worldRef.current;
    const tokens = readTopologyV2TokensOrNull();
    const { width, height } = viewportRef.current;
    if (!world || !tokens) return;
    const now = performance.now();
    const reduced = reducedMotionRef.current;

    // A transition is exclusive with physics and homing, so in-flight state is
    // cleared — same contract as relayout.
    nodeDragRef.current = null;
    heatRef.current = 0;
    dragAffectedSetRef.current = null;
    dragStartPosRef.current = null;
    dragTugOffsetsRef.current.clear();
    // A new transition (either direction) resets the coordinate-ownership handoff.
    realmActiveHandedOffRef.current = false;

    if (realmRootId !== null) {
      // --- Entering ---
      // The warding ring and framing use the members visible under the
      // expansion state at entry. The realm root is always treated as expanded,
      // because its direct children are the realm's spine.
      const data = buildRealmRuntimeData(
        world,
        realmRootId,
        tokens,
        new Set([...expandedParentsRef.current, realmRootId]),
      );
      if (!data) return;
      realmDataRef.current = data;
      // New realm, so the warding ease resets and the first frame seeds by
      // snapping to the initial radius.
      wardingFitRef.current = null;
      realmTransitionRef.current = realmTransitionReducer(realmTransitionRef.current, {
        type: "enter",
        rootId: realmRootId,
        now,
        reducedMotion: reduced,
      });
      // Homing is off during entry: the realm owns coordinates.
      homingActiveRef.current = false;
      homeSpringsRef.current.clear();
      homeTargetOverrideRef.current = null;
      // Camera: dolly in to the warding-ring fit, reusing the cubic tween.
      if (width > 0 && height > 0 && hasInitializedRef.current) {
        // Save "where the user was looking" as the keyframe to return to on
        // exit, taken from the camera just before entry. Only when the camera
        // has initialized — a deep-link mount keeps this null.
        data.entryCamera = {
          tx: cameraRef.current.x.value,
          ty: cameraRef.current.y.value,
          tscale: cameraRef.current.scale.value,
        };
        const target = realmCameraTarget(data.bounds, tokens, width, height);
        dampingRef.current = tokens.cameraDampingDefault;
        cameraTargetRef.current = target;
        userDrivenCameraRef.current = false;
        cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
        // The dolly-in spans the whole choreography (fling → FLIP → warding).
        // A distance-proportional short tween finishes the camera first, which
        // reads as a cut — confirmed on recorded review.
        beginCameraTween(target, 860);
      }
    } else {
      // --- Exiting: a deterministic reverse playback of the entry — inside
      // nodes reverse-FLIP (deepest layer first) and outside nodes return
      // against reverse gravity. The realm data owns those coordinates, not the
      // home springs, so the frame loop's exiting step drives them. The camera
      // rides a 750 ms overview tween to stay in sync with the choreography. ---
      realmTransitionRef.current = realmTransitionReducer(realmTransitionRef.current, {
        type: "exit",
        now,
        reducedMotion: reduced,
      });
      // Physics is exclusive with a transition, so the sim is reseeded at home
      // coordinates and a drag right after the exit does not jump. Heat is 0
      // during the transition, so it does not tick.
      simRef.current = createForceSimulation(
        world.nodes.map((n) => ({ id: n.id, x: n.homeX, y: n.homeY })),
        world.edges.map((e) => ({ source: e.sourceId, target: e.targetId })),
      );
      if (reduced) {
        // Under reduced-motion, deliver the result without the journey: skip
        // the deterministic reverse playback and take the proven home-spring
        // snap path, where the frame loop's reduced homing block jumps straight
        // to homeX/homeY. Nodes are never mutated from inside an effect.
        const springs = new Map<string, HomeSpringState>();
        for (const node of world.nodes) springs.set(node.id, initHomeSpring(node.x, node.y));
        homeSpringsRef.current = springs;
        homeTargetOverrideRef.current = null; // Exiting targets global home.
        homingActiveRef.current = true;
      } else {
        // The realm data owns the inside reverse-FLIP and the outside return,
        // so the home springs are off.
        homingActiveRef.current = false;
        homeSpringsRef.current.clear();
        homeTargetOverrideRef.current = null;
        // Members may have been dragged since the realm settled, so refresh the
        // reverse-FLIP origins (`insideTargets`) to the live coordinates and
        // the first exit frame does not jump.
        const data = realmDataRef.current;
        if (data) {
          const liveTargets = new Map<string, { x: number; y: number }>();
          for (const [id, fallback] of data.insideTargets) {
            const n = world.nodeById.get(id);
            liveTargets.set(id, n ? { x: n.x, y: n.y } : fallback);
          }
          realmDataRef.current = { ...data, insideTargets: liveTargets };
        }
      }
      if (width > 0 && height > 0 && hasInitializedRef.current) {
        // Return to "where the user was looking" if entry saved a keyframe,
        // falling back to the overview fit.
        const savedEntry = realmDataRef.current?.entryCamera ?? null;
        const target = savedEntry ?? computeOverviewCameraTarget(overviewBoundsFor(overviewFitRef.current, world), width, height, tokens, world.nodes.length);
        cameraTargetRef.current = target;
        userDrivenCameraRef.current = false;
        overviewScaleRef.current = computeOverviewFitScale(overviewBoundsFor(overviewFitRef.current, world), width, height, tokens, world.nodes.length);
        dampingRef.current = tokens.cameraDampingDefault;
        cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
        // 750 ms, matched to the choreography (inside reverse-FLIP 660,
        // outside return 650) — the same pattern as entry's 860.
        beginCameraTween(target, 750);
      }
    }
  }, [realmRootId, beginCameraTween]);

  // --- single rAF loop: physics -> altitude -> emphasis -> particles -> draw ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    /*
     * 3D meridian control point — the draw calls this **per edge**, so it is
     * created once in the effect body. Creating it inside the frame would be a
     * per-frame allocation; lifting it to a `useCallback` in the component body
     * would add another name to this effect's dependency list (hooks lint would
     * demand it) and tie the draw loop to that identity. Here matches its real
     * lifetime — the function reads only refs.
     */
    const domeEdgeControlForFrame = (sourceId: string, targetId: string, kind: "contains" | "depends") => {
      const dome = domeRuntimeRef.current;
      return dome === null ? null : domeEdgeControlWorld(dome, sourceId, targetId, kind);
    };
    /**
     * **`alpha: false` — this map never needs to show what is behind it.**
     *
     * Per the WHATWG canvas spec this pins every pixel's alpha to 1.0, which
     * lets **the compositor skip blending against the page content behind the
     * canvas**. Blink sets `cc_layer_->SetContentsOpaque()` from it in
     * `html_canvas_element.cc`, and `cc/layers/layer.h` defines that as a hint
     * that blending may be omitted.
     *
     * ★ The win lands in **the composite stage, not JS frame time**, so it does
     * not appear in a `performance.mark` profile — without knowing that you
     * wrongly conclude "measured it, no difference".
     *
     * The preconditions hold here: one dark theme, background fully painted
     * every frame. Unpainted regions become black rather than transparent,
     * which is moot when everything is painted.
     *
     * ⚠️ **Main canvas only.** The offscreens in `render/grid.ts` and
     * `render/animated-background.ts` composite **on top of** this one and need
     * alpha; setting it there makes the background tiles occlude each other.
     */
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let handle = 0;
    let cancelled = false;

    const frame = (now: number) => {
      if (cancelled) return;

      // Lower the backing resolution while dragging (`INTERACTION_DPR_CAP`).
      // The transition happens exactly **twice** — at the start and end of an
      // interaction — so the canvas is not reallocated per frame.
      {
        const deviceDpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
        const interacting =
          pointerMachineRef.current.phase === "dragging" || nodeDragRef.current !== null;
        const wantScale = interacting ? Math.min(deviceDpr, INTERACTION_DPR_CAP) : deviceDpr;
        const pending = pendingViewportRef.current;
        if (pending) {
          // A pending resize has its dpr **overwritten**. `measure()` records
          // the device dpr, so a window change mid-drag would restore full
          // resolution for the rest of that drag — rare, but silent.
          pending.dpr = wantScale;
          appliedDprScaleRef.current = wantScale;
        } else if (appliedDprScaleRef.current !== wantScale) {
          appliedDprScaleRef.current = wantScale;
          const { width, height } = viewportRef.current;
          if (width > 0 && height > 0) {
            pendingViewportRef.current = { width, height, dpr: wantScale };
          }
        }
      }

      // The resize commit happens **immediately before drawing**. Doing it in
      // the ResizeObserver callback clears the canvas and then paints, so a
      // blank map reaches the screen (see the resize effect's `measure`
      // comment). Here it clears and redraws in the same frame.
      if (commitViewportSizeRef.current?.()) {
        viewportSettleFramesRef.current = 0;
        // If the idle gate skipped this frame, the cleared canvas would ship.
        lastActiveMsRef.current = now;
      } else if (viewportRebuildPendingRef.current) {
        viewportSettleFramesRef.current += 1;
        if (viewportSettleFramesRef.current >= VIEWPORT_SETTLE_FRAMES) {
          rebuildViewportLayersRef.current?.();
          viewportRebuildPendingRef.current = false;
          lastActiveMsRef.current = now;
        }
      }

      const tokens = readTopologyV2TokensOrNull();
      const world = worldRef.current;
      const { width, height, dpr } = viewportRef.current;
      if (!tokens || !world || width <= 0 || height <= 0) {
        handle = requestAnimationFrame(frame);
        return;
      }

      const dt =
        lastFrameTimeRef.current === 0
          ? 0
          : Math.min((now - lastFrameTimeRef.current) / 1000, MAX_FRAME_DELTA_SECONDS);
      lastFrameTimeRef.current = now;

      const previewProp = previewEdgePropRef.current;
      const previewSignature = previewProp
        ? `${previewProp.sourceId}>${previewProp.targetId}:${previewProp.relationType}:${previewProp.phase}`
        : "none";
      if (previewSignatureRef.current !== previewSignature) {
        const firstAppearance = previewSignatureRef.current === null || previewSignatureRef.current === "none";
        previewSignatureRef.current = previewSignature;
        if (previewProp) previewEdgeHeldRef.current = previewProp;
        const durationSeconds = previewProp === null
          ? MOTION.fast.duration
          : previewProp.phase === "committing"
            ? MOTION.settle.duration
            : MOTION.base.duration;
        previewTransitionRef.current = {
          start: now,
          duration: durationSeconds * 1000,
          fromAlpha: previewProp && !firstAppearance
            ? Math.min(previewAlphaRef.current, 0.45)
            : previewAlphaRef.current,
          toAlpha: previewProp ? 1 : 0,
          fromCommit: previewCommitRef.current,
          toCommit: previewProp?.phase === "committing" ? 1 : 0,
        };
      }
      const previewTransition = previewTransitionRef.current;
      if (previewTransition) {
        const progress = reducedMotionRef.current
          ? 1
          : Math.min(1, Math.max(0, (now - previewTransition.start) / previewTransition.duration));
        const eased = easeInOutCubic(progress);
        previewAlphaRef.current = previewTransition.fromAlpha +
          (previewTransition.toAlpha - previewTransition.fromAlpha) * eased;
        previewCommitRef.current = previewTransition.fromCommit +
          (previewTransition.toCommit - previewTransition.fromCommit) * eased;
        if (progress >= 1) {
          previewTransitionRef.current = null;
          if (previewTransition.toAlpha === 0) previewEdgeHeldRef.current = null;
        }
      }

      // The navigation yield sits **ahead of** the idle gate: whatever the
      // activity flags say (auto-spin, comets, assembly ramp), a screen that is
      // being left does not get drawn.
      if (now < navYieldUntilRef.current) {
        handle = requestAnimationFrame(frame);
        return;
      }

      // --- Idle gate: re-evaluate the activity flags from the refs. Once they
      // are all off and the grace period has passed, physics and painting are
      // skipped. rAF keeps running, so any state change resumes naturally on
      // the next frame — no wake wiring and no freeze failure mode.
      {
        const cam = cameraRef.current;
        const target = cameraTargetRef.current;
        const prev = prevCameraSampleRef.current;
        // Watching only the camera's value movement would ignore a wheel tick
        // during an idle skip forever, because a wheel changes the target
        // alone. An unsettled spring (target ≠ value) is activity too — the
        // idle-gate contract.
        const cameraUnsettled = isCameraUnsettled(
          { x: cam.x.value, y: cam.y.value, scale: cam.scale.value },
          target,
        );
        const cameraMoving =
          prev === null ||
          cameraUnsettled ||
          Math.abs(cam.x.value - prev.x) > 0.01 ||
          Math.abs(cam.y.value - prev.y) > 0.01 ||
          Math.abs(cam.scale.value - prev.s) > 0.0001;
        prevCameraSampleRef.current = { x: cam.x.value, y: cam.y.value, s: cam.scale.value };

        /**
         * Ambient sleep factor (design council 「Workbench」 P0 prescription,
         * 2026-07-28).
         *
         * The always-on comets and the fresh breathe are **not switched off**:
         * the comets are the only channel carrying a `depends` edge's
         * direction, so switching them off would delete a typed fact. (The
         * council's test — "does turning that motion off lose information?" —
         * answers yes here.) Instead, once the person has let go for long
         * enough, their speed ramps to 0 and they fall asleep.
         *
         * The factor multiplies comet speed, so the flow decelerates to a stop
         * rather than cutting; the moment it reaches 0 the two activity flags
         * above drop and `isCanvasActive` closes on its own. Any input pushes
         * `lastInputMs` via `noteInput()` and the factor returns to 1 on the
         * next frame — the idle-gate design that needs no wake wiring.
         */
        const ambientFactor = ambientSleepFactor(now, lastInputMsRef.current, ambientSleepDelayRef.current);
        const ambientAsleep = isAmbientAsleep(ambientFactor);

        // Does the dome still have to move — assembly/teardown ramp, auto-spin,
        // orbit inertia, twist spring-back, flat-drag spring, or the reset
        // ease. The auto-spin stops while the pointer is over the canvas
        // (bgPointer present) so an aimed-at node cannot slide out from under
        // the cursor.
        const domeRt = domeRuntimeRef.current;
        const domeTargetOn = view3dRef.current && realmTransitionRef.current.phase === "idle";
        const domeMotion =
          (domeTargetOn && (domeRt === null || domeRt.rampClock < DOME_ASSEMBLE_TOTAL_MS)) ||
          (domeRt !== null &&
            ((!domeTargetOn && domeRt.rampClock > 0) ||
              domeRt.yawVel !== 0 ||
              domeRt.pitchVel !== 0 ||
              domeRt.drag !== null ||
              domeRt.poseTween !== null ||
              /*
               * ★ **Every motion in flight must be named here.** These two
               * were missing and the screen actually froze mid-animation
               * (measured 2026-08-18):
               *
               * - `yawSnap`: the landing target keeps closing the remaining gap
               *   exponentially after velocity reaches 0. A gate that watched
               *   velocity alone read that stretch as "stopped" and cut the
               *   frames, leaving the dome 0.073 rad short of its target.
               * - `entryArmed`: the entry sweep's clock (1500 ms) is longer
               *   than the assembly clock (1120 ms). A gate that watched only
               *   the ramp missed the last 380 ms.
               *
               * Generally: forgetting to register a new motion with the idle
               * gate produces "it sometimes stops halfway", which is the most
               * expensive class of symptom to trace back to its cause.
               */
              domeRt.yawSnap !== null ||
              domeRt.morph !== null ||
              domeRt.entryArmed ||
              domeFocusPendingRef.current !== null ||
              Math.abs(domeRt.lag.domain) + Math.abs(domeRt.lag.capability) + Math.abs(domeRt.lag.element) > 1e-4 ||
              domeRt.pitch !== clampDomePitch(domeRt.pitch) ||
              // Keep rAF awake only while the auto-spin could actually run. A
              // dome whose `spinArmed` was lowered by interaction is a still
              // frame and belongs to the idle gate.
              //
              // ★ **Why `!ambientAsleep` belongs here** (measured 2026-08-19):
              // the auto-spin is ambient motion of the same family as the
              // always-on comets and the fresh breathe, yet it alone sat
              // outside the `ambient-sleep.ts` contract. So 3D **never fell
              // asleep, even 45 s after the last input** — at 2,000 nodes it
              // burned 520 ms per second (half a core) forever, where 2D in the
              // same state burned 3 ms/s, a factor of 170. Given that this
              // app's typical scenario is "leave it open beside the agent
              // terminal", this was the most expensive state available.
              (!domeRt.orbiting &&
                isDomeSpinAnimating({
                  domeOn: domeTargetOn,
                  reducedMotion: reducedMotionRef.current,
                  ambientAsleep,
                  spinArmed: domeRt.spinArmed,
                  pointerOverCanvas: bgPointerRef.current !== null,
                  assembled: domeRt.rampClock >= DOME_ASSEMBLE_TOTAL_MS,
                }))));

        // Growth replay — advance every node's appear value for this frame; the
        // first input after the starting click ends it (nothing is left behind,
        // `appearRef` still holds every node at 1).
        if (growthReplayRef.current !== null) {
          const replay = growthReplayRef.current;
          const cancelled = lastInputMsRef.current > replay.startMs + GROWTH_REPLAY_CANCEL_GRACE_MS;
          if (cancelled || stepGrowthReplay(replay, now, growthReplayAppearRef.current)) {
            growthReplayRef.current = null;
          }
          lastActiveMsRef.current = now;
        }
        const idleFlags = {
          pointerActive: pointerMachineRef.current.phase !== "idle",
          // The sim counts as warm only while a drag grab/release is charging
          // heat, or a node is pinned. There is no always-on physics toggle.
          simWarm: heatRef.current > 0 || nodeDragRef.current !== null,
          homing: homingActiveRef.current,
          selectionPulseActive: selectionPulseRef.current !== null &&
            now - selectionPulseRef.current.startAtMs < tokens.selectPulseDurationMs,
          // ★ The three branches are composed by a pure function in
          // `idle-gate.ts`, not by an inline OR here. While it was inline,
          // ambient sleep applied to the **`depends` branch only**, so leaving
          // a node selected and letting go meant the app never slept.
          //
          // The branches: with `depends` edges present and reduced-motion off,
          // comets flow regardless of focus (owner's instruction that they be
          // always-on), so the canvas is never idle; the focused `contains`
          // comets and the hover pulses raise the same flag. When the document
          // is hidden the browser stops rAF itself, which protects the battery.
          growthReplaying: growthReplayRef.current !== null,
          egoTailAnimating: isEgoTailAnimating({
            reducedMotion: reducedMotionRef.current,
            ambientAsleep,
            hasDependsEdges: hasDependsEdgesRef.current,
            edgePulseSpeed: tokens.edgePulseSpeed,
            focused: focusedSlugRef.current !== null,
            hasContainsEdges: hasContainsEdgesRef.current,
            livePulseCount: pulsesRef.current.length,
          }),
          // Lens brushing is an interaction in progress too: folding to idle
          // would freeze the hover ring or never draw it. Treated like canvas
          // hover.
          emphasisTarget:
            hoveredNodeIdRef.current !== null ||
            panelEmphasisNodeIdRef.current !== null ||
            hoveredClusterIdRef.current !== null ||
            ((trailLensPropRef.current?.current ?? false) && (trailBrushPropRef.current?.current ?? null) !== null) ||
            // Side-panel hover is an interaction in progress as well. Leaving
            // it out lets the loop fold to idle, and hovering then does
            // **nothing** — the value is right but nothing is drawn.
            (panelHoverPropRef.current?.current ?? null) !== null,
          // Lens on/off transition: if it differs from what was last drawn,
          // wake for a frame and draw the new state — same contract as the
          // spotlight ramp settling.
          trailLensSettling:
            (trailLensPropRef.current?.current ?? false) !== drawnTrailLensRef.current ||
            Math.abs(
              trailLensRampRef.current - ((trailLensPropRef.current?.current ?? false) ? 1 : 0),
            ) > 0.01,
          // The fresh breathe is almost always true in this product's **normal
          // state**, where an agent edits the vault daily (council
          // measurement), which made this flag one of the two causes of the
          // idle gate staying open forever. Hence the ambient-sleep guard.
          breathing: !reducedMotionRef.current && !ambientAsleep && world.nodes.some((n) => n.fresh),
          cameraMoving,
          // Deselect fade: with no live focus but a retained colorFocus still
          // present (the colour target for the selection ring and background
          // dim), the loop must stay awake until the focus ramp decays to 0.
          // That decay and the colorFocus clear happen only in the frame body
          // below, so this is counted as activity explicitly rather than
          // relying on incidental activity like comets or the camera —
          // otherwise the deselected ring lingers.
          focusFadeSettling:
            colorFocusRef.current !== null && focusedSlugRef.current === null && selectedEdgeRef.current === null,
          // A spotlight on/off transition whose ramp has not arrived is
          // activity, on the same contract as focusFadeSettling: the ramp steps
          // only inside the frame body.
          spotlightSettling:
            Math.abs(spotlightRampRef.current - (spotlightIdsRef.current !== null ? 1 : 0)) > 0.01,
        };
        const active =
          isCanvasActive(idleFlags) ||
          previewTransitionRef.current !== null ||
          realmTransitionRef.current.phase === "entering" ||
          realmTransitionRef.current.phase === "exiting" ||
          domeMotion;
        if (active) {
          lastActiveMsRef.current = now;
          // e2e instrumentation: the names of the flags that just kept this
          // frame awake (see the `lastActiveCausesRef` doc-block). Recorded
          // only while the window is attached, so the product path pays zero.
          if (idleDebugEnabledRef.current) {
            const causes: string[] = [];
            for (const [k, v] of Object.entries(idleFlags)) if (v === true) causes.push(k);
            if (realmTransitionRef.current.phase !== "idle") causes.push("realmTransition");
            if (domeMotion) causes.push("domeMotion");
            if (previewTransitionRef.current !== null) causes.push("previewEdge");
            lastActiveCausesRef.current = { t: now, causes };
          }
        } else if (shouldSkipFrame(now, lastActiveMsRef.current, IDLE_GRACE_MS)) {
          handle = requestAnimationFrame(frame);
          return;
        }
      }

      // --- Dome step: refresh pose, inertia, assembly clock and frame map each
      // frame. Every value and physical property lives in `model/dome-view.ts`
      // (owner's dispensation: 3D mode sits outside the app's motion
      // conventions — `docs/DECISIONS.md`). ---
      {
        const domeTargetOn = view3dRef.current && realmTransitionRef.current.phase === "idle";
        let dome = domeRuntimeRef.current;
        if (domeTargetOn || (dome !== null && dome.rampClock > 0)) {
          if (dome === null || domeWorldSourceRef.current !== world) {
            if (dome === null) {
              /*
               * First dome — the model build is consumed in **frame-budget
               * slices** (see the `domeModelBuildRef` doc-block: the coupled
               * cloud relaxation used to hitch this one frame by 346–368 ms).
               * The ownership arrangement has a null `step`, so it still
               * completes immediately in this frame.
               */
              let pending = domeModelBuildRef.current;
              if (
                pending === null ||
                pending.world !== world ||
                pending.arrangement !== mapArrangementRef.current
              ) {
                pending = {
                  world,
                  arrangement: mapArrangementRef.current,
                  build: beginDomeModelBuild(
                    world.nodes.map((n) => ({ id: n.id, kind: n.kind, x: n.x, y: n.y, parentId: n.parentId })),
                    /*
                     * The coupling arrangement takes **every relation** as
                     * input to its angles — which is precisely how it differs
                     * from the ownership arrangement, which sees only the
                     * containment parent.
                     */
                    { arrangement: mapArrangementRef.current, edges: world.edges },
                  ),
                };
                domeModelBuildRef.current = pending;
              }
              if (pending.build.step !== null && !pending.build.step(DOME_BUILD_SLICE_MS)) {
                // Still relaxing — draw nothing this frame, exactly as the
                // synchronous hitch used to show a still frame. Count it as
                // activity so the idle gate does not fold, and resume next
                // frame.
                lastActiveMsRef.current = now;
                handle = requestAnimationFrame(frame);
                return;
              }
              domeModelBuildRef.current = null;
              dome = createDomeRuntime(pending.build.model);
              domeRuntimeRef.current = dome;
              // When the map loads with 3D already on (a saved preference on
              // revisit) the toggle effect never runs, so the first fit is
              // scheduled here.
              if (domeTargetOn) {
                domeFitPendingRef.current = true;
                domeFitDurationRef.current = DOME_ASSEMBLE_TOTAL_MS;
              }
            } else {
              /*
               * The world or the arrangement changed while the dome is on
               * screen — re-solve layout, keep the pose (yaw/pitch).
               *
               * Measured 2026-09-02: this path rebuilt synchronously, so a
               * dome→cloud switch held one frame for 22 ms at 125 nodes and
               * **260 ms at 1,000** — the first-entry path above had been sliced
               * (ledger (85)) but a switch had not. It now consumes the same
               * sliced build; the previous model keeps drawing meanwhile, and
               * on completion the coordinates **morph** to the new model
               * (`beginDomeMorph`) instead of cutting.
               */
              let pending = domeModelBuildRef.current;
              if (
                pending === null ||
                pending.world !== world ||
                pending.arrangement !== mapArrangementRef.current
              ) {
                pending = {
                  world,
                  arrangement: mapArrangementRef.current,
                  build: beginDomeModelBuild(
                    world.nodes.map((n) => ({ id: n.id, kind: n.kind, x: n.x, y: n.y, parentId: n.parentId })),
                    { arrangement: mapArrangementRef.current, edges: world.edges },
                  ),
                };
                domeModelBuildRef.current = pending;
              }
              if (pending.build.step !== null && !pending.build.step(DOME_BUILD_SLICE_MS)) {
                /*
                 * Still relaxing — **hold the previous picture** this frame and
                 * resume next frame, the same contract as first entry. Redrawing
                 * the old model on every slice frame stacked ~10 ms of draw on the
                 * 28 ms slice (measured 2026-09-02 at 3,000 nodes: p95 52 ms for 31
                 * frames), and nothing on screen was moving anyway — the click on
                 * the picker put the pointer over the canvas, which parks the spin.
                 * Counted as activity so the idle gate does not fold mid-build.
                 */
                lastActiveMsRef.current = now;
                handle = requestAnimationFrame(frame);
                return;
              } else {
                domeModelBuildRef.current = null;
                beginDomeMorph(dome, pending.build.model, now, reducedMotionRef.current ? 0 : DOME_POSE_MS);
                dome.drawnBounds = null;
                dome.drag = null;
                domeWorldSourceRef.current = world;
                /*
                 * Refit only when the new shape does not fit the viewport at the
                 * current zoom (the cloud is wider than the tree, so a switch made
                 * after a selection reframe spilled nodes past the top edge —
                 * measured 2026-09-02). A shape that still fits keeps the zoom the
                 * user set; the pose is never touched either way.
                 */
                const b = domeWorldBounds(dome.model, dome.yaw, dome.pitch);
                if (b !== null) {
                  const scale = cameraRef.current.scale.value;
                  const spanX = (b.maxX - b.minX) * 1.3 * scale;
                  const spanY = (b.maxY - b.minY) * 1.3 * scale;
                  if (spanX > width || spanY > height) {
                    domeFitPendingRef.current = true;
                    domeFitDurationRef.current = DOME_POSE_MS;
                  }
                }
              }
            }
            if (domeModelBuildRef.current === null) domeWorldSourceRef.current = world;
          }
          dome.active = domeTargetOn;
          // Once, right after turning on: fit the camera so the whole dome sits
          // on screen with 15% padding (the hero's "object centred, half of it
          // air" judgement).
          if (domeFitPendingRef.current && domeTargetOn) {
            domeFitPendingRef.current = false;
            const b = domeWorldBounds(dome.model, dome.yaw, dome.pitch);
            if (b !== null) {
              const padX = (b.maxX - b.minX) * 0.15;
              const padY = (b.maxY - b.minY) * 0.15;
              const target = computeOverviewCameraTarget(
                { minX: b.minX - padX, minY: b.minY - padY, maxX: b.maxX + padX, maxY: b.maxY + padY },
                width,
                height,
                tokens,
                world.nodes.length,
              );
              cameraTargetRef.current = target;
              // If the fit scale is below the 2D floor, lower the floor to it.
              // Otherwise target ≠ value persists and the wheel anchor computes
              // against a zoom that does not exist (see the `fitScale` JSDoc).
              dome.fitScale = target.tscale;
              userDrivenCameraRef.current = false;
              dampingRef.current = tokens.cameraDampingDefault;
              cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
              /*
               * The fit rides the choreography's clock, not the 2D tween cap
               * (measured 2026-09-02 on a real recording: the zoom-out finished
               * in 300 ms while the rings were still at 33% of their rise, so
               * one input read as two events — a whip, then a slow assembly).
               * Entry takes the assembly length; an arrangement refit takes
               * the morph length. `domeFitDurationRef` is set by whoever raised
               * the pending flag.
               */
              beginCameraTween(target, domeFitDurationRef.current);
              domeFitDurationRef.current = undefined;
            }
          }
          const dtMs = dt * 1000;
          // Assembly/teardown clock: turning on runs forward with a tier
          // stagger, turning off runs backward at 1.6×. Reduced-motion snaps —
          // the assembly choreography is app-generated motion.
          if (reducedMotionRef.current) {
            dome.rampClock = domeTargetOn ? DOME_ASSEMBLE_TOTAL_MS : 0;
            /*
             * Under reduced-motion there is **no entry sweep at all** — it is
             * app-generated motion, so WCAG 2.3.3's direct-manipulation
             * exception does not apply.
             *
             * `commitDomeEntrySweep` is deliberately NOT used here: it means
             * "fold the sweep already being drawn into the pose", which would
             * permanently add an angle that was never drawn. With nothing
             * drawn there is nothing to fold in.
             */
            dome.entryArmed = false;
          } else {
            dome.rampClock = Math.max(
              0,
              Math.min(DOME_ASSEMBLE_TOTAL_MS, dome.rampClock + (domeTargetOn ? dtMs : -dtMs * 1.6)),
            );
            /*
             * The entry sweep runs on its own clock, outliving assembly (see
             * the `DOME_ENTRY_SWEEP_MS` doc-block: during assembly the tier
             * ramps are low, so turning the pose barely moves any node). When
             * it is spent it disarms itself and the branch disappears from
             * later frames.
             */
            if (dome.entryArmed) {
              dome.entryClock += domeTargetOn ? dtMs : dtMs * 4;
              if (dome.entryClock >= DOME_ENTRY_SWEEP_MS) dome.entryArmed = false;
            }
          }

          /*
           * The 2D return fit, paid **once, on the frame teardown finishes**
           * (see the `flatFitPendingRef` doc-block). Fitting while the ramp
           * runs frames mid-morph coordinates and is wrong again on arrival.
           *
           * The target uses the **same computation** as 2D fit-view
           * (`overviewBoundsFor` + `computeOverviewCameraTarget`): if the view
           * after turning 3D off differed from the view after pressing
           * fit-view, that difference would itself be the next defect.
           */
          /*
           * The return fit starts **with** the teardown and lasts exactly as
           * long (measured 2026-09-02: it used to wait for the ramp to reach 0,
           * so the concepts folded back at 3D zoom for 700 ms and only then
           * the camera zoomed in — two events for one input). The target is the
           * 2D overview, whose bounds do not depend on the ramp, so it is known
           * on the first teardown frame; the tween and the ramp end together.
           */
          if (flatFitPendingRef.current && !domeTargetOn) {
            flatFitPendingRef.current = false;
            const teardownMs = reducedMotionRef.current ? 0 : dome.rampClock / 1.6;
            const flatTarget = computeOverviewCameraTarget(
              overviewBoundsFor(overviewFitRef.current, world),
              width,
              height,
              tokens,
              world.nodes.length,
            );
            cameraTargetRef.current = flatTarget;
            overviewScaleRef.current = computeOverviewFitScale(
              overviewBoundsFor(overviewFitRef.current, world),
              width,
              height,
              tokens,
              world.nodes.length,
            );
            // This is a programmatic move, so it uses the transition easing
            // rather than the interactive spring a preceding wheel gesture left
            // behind — same contract as 2D fit-view.
            userDrivenCameraRef.current = false;
            dampingRef.current = tokens.cameraDampingDefault;
            cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
            beginCameraTween(flatTarget, teardownMs > 0 ? teardownMs : undefined);
            lastActiveMsRef.current = now;
          }
          // 3D selection reframe: consume the ticket the focus effect left
          // (why here rather than in the effect: the `domeFocusPendingRef`
          // JSDoc). This is the dome equivalent of the 2D focus dive. The node
          // may be on the far side of the structure, so zoom and pan alone
          // would enlarge it while still occluded; instead the yaw (bringing it
          // to the front) and the camera pan/zoom (to the ego projection bbox)
          // ride the **same clock** — cubic ease-in-out, identical duration —
          // and arrive together. No new easing vocabulary.
          if (
            domeFocusPendingRef.current !== null &&
            domeTargetOn &&
            // Gestures win: while the user is orbiting or dragging, the ticket
            // is dropped rather than starting a programmatic move — input
            // always wins, symmetric with the tween-interrupt contract.
            !dome.orbiting &&
            pointerMachineRef.current.phase !== "dragging"
          ) {
            const pending = domeFocusPendingRef.current;
            domeFocusPendingRef.current = null;
            const { width, height } = viewportRef.current;
            if (width > 0 && height > 0) {
              if (pending.slug === null) {
                // Deselect: leave the pose alone (respect the user's
                // viewpoint) and return only the camera to the whole-dome frame
                // at the current pose — the equivalent of the 2D overview
                // return.
                const b = domeWorldBounds(dome.model, dome.yaw, dome.pitch);
                if (b !== null) {
                  const padX = (b.maxX - b.minX) * 0.15;
                  const padY = (b.maxY - b.minY) * 0.15;
                  const target = computeOverviewCameraTarget(
                    { minX: b.minX - padX, minY: b.minY - padY, maxX: b.maxX + padX, maxY: b.maxY + padY },
                    width,
                    height,
                    tokens,
                    world.nodes.length,
                  );
                  cameraTargetRef.current = target;
                  dome.fitScale = target.tscale;
                  userDrivenCameraRef.current = false;
                  dampingRef.current = tokens.cameraDampingDefault;
                  cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
                  beginCameraTween(target);
                }
              } else {
                // A selection is interaction, so the attention spin is
                // lowered here. That holds even for a node with no coordinate
                // (a kind outside the dome model) — interaction is interaction.
                dome.spinArmed = false;
                commitDomeEntrySweep(dome);
                const coord = dome.model.coords.get(pending.slug);
                if (coord !== undefined) {
                  dome.orbiting = false;
                  dome.yawVel = 0;
                  // Drop the landing target too — new input and an explicit
                  // reset always win.
                  dome.yawSnap = null;
                  dome.pitchVel = 0;
                  const targetYaw = domeFocusYaw(coord, dome.yaw);
                  const targetPitch = clampDomePitch(dome.pitch);
                  const egoIds = [pending.slug, ...(world.neighborMap.get(pending.slug) ?? [])];
                  const b = domeEgoWorldBounds(dome.model, egoIds, targetYaw, targetPitch);
                  if (b !== null) {
                    const overviewEntryScale = overviewScaleRef.current * tokens.overviewEntryRatio;
                    const anchorAtTarget = projectDomeCoord(dome.model, coord, targetYaw, targetPitch);
                    const target = computeDomeFocusCameraTarget(
                      b,
                      cameraTokens(tokens),
                      width,
                      height,
                      overviewEntryScale,
                      dome.fitScale,
                      { x: anchorAtTarget.wx, y: anchorAtTarget.wy },
                    );
                    const start: CameraKeyframe = {
                      x: cameraRef.current.x.value,
                      y: cameraRef.current.y.value,
                      scale: cameraRef.current.scale.value,
                    };
                    // Duration is the larger of the camera term (distance
                    // proportional, the existing formula) and the pose term
                    // (half a turn = `DOME_POSE_MS`), so both axes arrive
                    // together on one clock.
                    const yawSpan = Math.abs(targetYaw - dome.yaw) + Math.abs(targetPitch - dome.pitch);
                    const yawMs =
                      CAMERA_TRANSITION_MIN_MS +
                      Math.min(1, yawSpan / Math.PI) * (DOME_POSE_MS - CAMERA_TRANSITION_MIN_MS);
                    const durationMs = Math.max(
                      cameraTransitionDurationMs(start, { x: target.tx, y: target.ty, scale: target.tscale }),
                      yawMs,
                    );
                    dome.poseTween = { startYaw: dome.yaw, startPitch: dome.pitch, targetYaw, targetPitch, startMs: now, durationMs };
                    cameraTargetRef.current = target;
                    userDrivenCameraRef.current = false;
                    dampingRef.current = tokens.cameraDampingDefault;
                    cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
                    beginCameraTween(target, durationMs);
                  }
                }
              }
            }
          }
          // Programmatic pose moves (reset, selection reframe). If an orbit
          // drag starts, the gesture wins and continues from the current pose.
          const pose = dome.poseTween;
          if (pose !== null) {
            if (dome.orbiting) {
              dome.poseTween = null;
            } else {
              const t = (now - pose.startMs) / pose.durationMs;
              if (t >= 1 || reducedMotionRef.current) {
                dome.yaw = pose.targetYaw;
                dome.pitch = pose.targetPitch;
                dome.poseTween = null;
              } else {
                const e = easeInOutCubic(t);
                const prevPoseYaw = dome.yaw;
                dome.yaw = pose.startYaw + (pose.targetYaw - pose.startYaw) * e;
                dome.pitch = pose.startPitch + (pose.targetPitch - pose.startPitch) * e;
                /*
                 * Programmatic moves feed the tier torsion too (see the
                 * `DOME_POSE_LAG_SCALE` doc-block). Without it a click reframe
                 * turns all four rings as one rigid block, which reads as an
                 * object that does not react to its own motion. When the move
                 * ends, charging stops and the existing decay unwinds, so the
                 * settling wobble on arrival comes for free.
                 */
                chargeTierLag(dome.lag, dome.yaw - prevPoseYaw, DOME_POSE_LAG_SCALE);
              }
              dome.yawVel = 0;
              // Drop the landing target too — new input and an explicit reset
              // always win.
              dome.yawSnap = null;
              dome.pitchVel = 0;
              dome.yawTarget = dome.yaw;
              dome.pitchTarget = dome.pitch;
            }
          }
          // While orbiting, follow the pointer-pushed target with τ = 45 ms,
          // which removes the stepping when the event period is longer than the
          // frame period (see the `ORBIT_SMOOTH_TAU_MS` JSDoc). The tier
          // torsion must be charged from the **actual frame movement** to stay
          // in time with that smoothing. Reduced-motion snaps, keeping 1:1
          // direct manipulation.
          if (dome.orbiting) {
            const prevYaw = dome.yaw;
            if (reducedMotionRef.current) {
              dome.yaw = dome.yawTarget;
              dome.pitch = dome.pitchTarget;
            } else {
              const k = 1 - Math.exp(-dtMs / ORBIT_SMOOTH_TAU_MS);
              dome.yaw += (dome.yawTarget - dome.yaw) * k;
              dome.pitch += (dome.pitchTarget - dome.pitch) * k;
              chargeTierLag(dome.lag, dome.yaw - prevYaw);
            }
          }
          if (!dome.orbiting && dome.poseTween === null) {
            /*
             * Carry the release to a meaningful landing, but only when it aimed
             * at a domain meridian (`dome.yawSnap`). τ is derived from the
             * release velocity, so speed does not jump on the frame the pointer
             * lifts (see the `orbitSnapTauMs` doc-block). On arrival it clears
             * its own target and this branch disappears from later frames.
             */
            if (dome.yawSnap !== null) {
              const delta = dome.yawSnap - dome.yaw;
              if (Math.abs(delta) < ORBIT_SNAP_ARRIVE_RAD) {
                dome.yaw = dome.yawSnap;
                dome.yawSnap = null;
                dome.yawVel = 0;
              } else {
                const tau = orbitSnapTauMs(delta, dome.yawVel);
                dome.yaw += delta * (1 - Math.exp(-dtMs / tau));
                // The velocity gauge must keep saying how fast it is turning
                // right now, so decay continues even outside the inertia
                // branch — the disarm check reads it.
                dome.yawVel = decayOrbitVelocity(dome.yawVel, dtMs);
              }
              dome.pitch += dome.pitchVel * dtMs;
              dome.pitchVel = decayOrbitVelocity(dome.pitchVel, dtMs);
              dome.yawTarget = dome.yaw;
              dome.pitchTarget = dome.pitch;
              const clamped = clampDomePitch(dome.pitch);
              if (clamped !== dome.pitch) {
                dome.pitch += (clamped - dome.pitch) * (1 - Math.exp(-dtMs / 120));
                if (Math.abs(clamped - dome.pitch) < 0.0005) dome.pitch = clamped;
                dome.pitchVel = 0;
              }
            } else {
              // Release inertia: the velocity at release carries on and stops
              // under geometric decay.
              dome.yaw += dome.yawVel * dtMs;
              dome.pitch += dome.pitchVel * dtMs;
              dome.yawVel = decayOrbitVelocity(dome.yawVel, dtMs);
              dome.pitchVel = decayOrbitVelocity(dome.pitchVel, dtMs);
              // Pitch rubber-band: past the limit, spring back exponentially.
              const clampedPitch = clampDomePitch(dome.pitch);
              if (clampedPitch !== dome.pitch) {
                dome.pitch += (clampedPitch - dome.pitch) * (1 - Math.exp(-dtMs / 120));
                if (Math.abs(clampedPitch - dome.pitch) < 0.0005) dome.pitch = clampedPitch;
                dome.pitchVel = 0;
              }
            }
            // Auto-spin (48 s per turn) is an attention loop, so it runs
            // **only while armed**: any interaction — orbit, zoom, pinch, node
            // drag, selection — lowers `spinArmed` and it never turns by itself
            // again. Owner: "Stop it turning after I click." It is rearmed by auto-align or by re-entering 3D.
            // It also stops while the pointer is over the canvas, and stays 0
            // under reduced-motion.
            //
            // Its speed is multiplied by the ambient sleep factor — put to
            // sleep, not switched off (`model/ambient-sleep.ts`). 30 s after
            // the hand lets go, rotation ramps to 0 over 2 s; the moment it
            // reaches 0 the activity flag above drops and the idle gate closes.
            // Any input pushes `lastInputMs` and the factor returns to 1 on the
            // next frame, so no wake wiring is needed. A ramp rather than a
            // step for the same reason as the comets: cutting it in one frame
            // reads as the dome having seized.
            const spinFactor = ambientSleepFactor(now, lastInputMsRef.current, ambientSleepDelayRef.current);
            if (
              dome.yawVel === 0 &&
              isDomeSpinAnimating({
                domeOn: domeTargetOn,
                reducedMotion: reducedMotionRef.current,
                ambientAsleep: isAmbientAsleep(spinFactor),
                spinArmed: dome.spinArmed,
                pointerOverCanvas: bgPointerRef.current !== null,
                assembled: dome.rampClock >= DOME_ASSEMBLE_TOTAL_MS,
              })
            ) {
              dome.yaw += (dtMs / DOME_PERIOD_MS) * Math.PI * 2 * spinFactor;
            }
            // Invariant outside a drag: the target always follows the current
            // pose, so the next drag does not inherit a stale target gap.
            dome.yawTarget = dome.yaw;
            dome.pitchTarget = dome.pitch;
          }
          // Tier torsion decay (spring-back) — the hero's elastic torsion.
          const lagDecay = Math.pow(DOME_TIER_LAG_DECAY_PER_MS, dtMs);
          dome.lag.domain = Math.abs(dome.lag.domain) < 1e-5 ? 0 : dome.lag.domain * lagDecay;
          dome.lag.capability = Math.abs(dome.lag.capability) < 1e-5 ? 0 : dome.lag.capability * lagDecay;
          dome.lag.element = Math.abs(dome.lag.element) < 1e-5 ? 0 : dome.lag.element * lagDecay;
          // In-plane node drag: a critically damped spring, reusing the crisp
          // layer's angular frequency.
          if (dome.drag !== null) {
            const coord = dome.model.coords.get(dome.drag.nodeId);
            if (coord === undefined) {
              dome.drag = null;
            } else {
              if (reducedMotionRef.current) {
                dome.drag.spring.px = dome.drag.targetPx;
                dome.drag.spring.pz = dome.drag.targetPz;
                dome.drag.spring.vx = 0;
                dome.drag.spring.vz = 0;
              } else {
                stepDomeDragSpring(
                  dome.drag.spring,
                  dome.drag.targetPx,
                  dome.drag.targetPz,
                  dtMs,
                  tokens.cameraSpringAngFreqInteractive,
                );
              }
              coord.px = dome.drag.spring.px;
              coord.pz = dome.drag.spring.pz;
              const settled =
                Math.abs(dome.drag.spring.px - dome.drag.targetPx) < 0.05 &&
                Math.abs(dome.drag.spring.pz - dome.drag.targetPz) < 0.05 &&
                Math.abs(dome.drag.spring.vx) < 0.05 &&
                Math.abs(dome.drag.spring.vz) < 0.05;
              if (dome.drag.released === true && (settled || reducedMotionRef.current)) dome.drag = null;
            }
          }
          if (dome.rampClock > 0) {
            // The dot radius denominator — the same formula draw and
            // hit-testing multiply by.
            updateDomeFrame(
              dome,
              world.nodes,
              (n) => {
                const w = world.nodeById.get(n.id);
                return w ? radiusForKind(w.kind, tokens) * w.magnitudeScale : 1;
              },
              now,
            );
          } else if (dome.frame.size > 0) {
            dome.frame.clear();
            dome.drawnBounds = null;
            dome.fitScale = null;
            dome.frameEpoch++;
          }
        } else if (dome !== null) {
          dome.active = false;
          // Fully off screen: rest every in-flight motion so the idle gate can
          // fold (see `settleDomeRuntimeOffscreen` — before this, a single 3D
          // visit kept the 2D map awake at 120 frames/s for the whole session).
          settleDomeRuntimeOffscreen(dome);
          domeModelBuildRef.current = null;
          domeFocusPendingRef.current = null;
          if (dome.frame.size > 0) {
            dome.frame.clear();
            dome.drawnBounds = null;
            dome.fitScale = null;
            dome.frameEpoch++;
          }
        }
      }

      // --- force simulation: tick ONLY while a node is pin-dragged (or its
      // brief release settle). Never on load — the static default is the
      // deterministic grid, and the camera is NOT auto-reframed here (that
      // reframing only existed to chase the removed load settle). ---
      const sim = simRef.current;
      const pinned = nodeDragRef.current !== null;
      // A user grab interrupts any in-flight auto-arrange homing —
      // the drag wins, rather than the two fighting over the node's position.
      if (pinned && homingActiveRef.current) {
        homingActiveRef.current = false;
        homeSpringsRef.current.clear();
        homeTargetOverrideRef.current = null;
      }

      // --- Warding invariant (owner bug report 2026-07-23, repro path ①): a
      // realm member released **outside** the warding ring homes back to its
      // realm target, like a rubber band. The ring is a boundary: dragging the
      // root (whose target is the origin) out and dropping it there breaks the
      // world's grammar into "a root outside its own ring". Releases inside
      // keep free placement, and auto-arrange tidies whenever asked. Reuses the
      // existing home springs plus the target override — no new motion. ---
      {
        const pinnedId = nodeDragRef.current?.nodeId ?? null;
        const releasedId = prevPinnedNodeIdRef.current !== null && pinnedId === null ? prevPinnedNodeIdRef.current : null;
        prevPinnedNodeIdRef.current = pinnedId;
        const realmData = realmDataRef.current;
        if (releasedId !== null && realmData !== null && realmTransitionRef.current.phase === "active") {
          const target = realmData.insideTargets.get(releasedId);
          const released = world.nodeById.get(releasedId);
          const radius = wardingFitRef.current?.value ?? realmData.wardingRadius;
          const outside =
            released !== undefined &&
            Math.hypot(released.x - realmData.wardingCenter.x, released.y - realmData.wardingCenter.y) > radius;
          if (target && released && outside) {
            // Re-homed set = the released node plus the realm members inside
            // this drag's tug reach (1- and 2-hop). Springing only the released
            // node freezes the tugged neighbours at their displacement, because
            // the heat = 0 below cuts the path where a normal release's settle
            // eases the tug back to 0. A warding violation tidies the whole
            // disturbed group — the same grammar as a scoped relayout.
            const affected = dragAffectedSetRef.current;
            const springIds = new Set<string>([releasedId]);
            if (affected !== null && affected.draggedId === releasedId) {
              for (const id of affected.oneHop) springIds.add(id);
              for (const id of affected.twoHop) springIds.add(id);
            }
            // The home springs own the coordinates instead of the settle
            // burst, so heat and tug are folded away and the two never fight
            // over the same node — the same exclusivity contract as relayout.
            heatRef.current = 0;
            dragAffectedSetRef.current = null;
            dragTugOffsetsRef.current.clear();
            const springs = new Map(homeSpringsRef.current);
            const override = new Map(homeTargetOverrideRef.current ?? []);
            for (const id of springIds) {
              const t = realmData.insideTargets.get(id);
              const n = world.nodeById.get(id);
              if (!t || !n) continue;
              springs.set(id, initHomeSpring(n.x, n.y));
              override.set(id, t);
            }
            homeSpringsRef.current = springs;
            homeTargetOverrideRef.current = override;
            homingActiveRef.current = true;
            // Reseed the sim's own coordinates at the return targets, so the
            // next drag's `applyForcePositions` does not write back the stale
            // drop positions. With heat = 0 the sim does not tick until the
            // springs converge, which makes seeding at the targets safe.
            simRef.current = createForceSimulation(
              world.nodes.map((n) => {
                const t = override.get(n.id);
                return { id: n.id, x: t?.x ?? n.x, y: t?.y ?? n.y };
              }),
              world.edges.map((e) => ({ source: e.sourceId, target: e.targetId })),
            );
          }
        }
      }
      /*
       * ★ **A fully assembled dome does not run 2D physics** (measured
       * 2026-08-19).
       *
       * `updateDomeFrame`'s offset is `dx = (p.wx − node.x) · r` and the drawn
       * coordinate is `node.x + dx`, so with the tier ramps full (r = 1) it
       * **cancels exactly to `p.wx`**: no mark on an assembled dome depends on
       * the 2D coordinates. `dome.model.coords` is rebuilt only when the
       * `world` object's *identity* changes, so freezing those coordinates for
       * a frame moves the dome by zero pixels.
       *
       * But a 3D node drag sets `nodeDragRef` (the handle for the dome's
       * in-plane drag), making `pinned` true and running **the entire 2D
       * physics pass where nothing could be seen** — FA2 plus separation over
       * all 2,000 nodes, in its worst shape, since the dome path never sets
       * `dragAffectedSetRef` and there was not even an active set. **73%** of
       * the profile's drag samples were here (resolvePair 50.9% + iterate
       * 22.6%), and 3D node-drag p95 was 52.1 ms (≈19 fps) against 2.7 ms in 2D.
       *
       * Leaving 3D finds the 2D layout exactly as it was on entry, which is the
       * better contract anyway.
       */
      const domeAssembled =
        view3dRef.current &&
        realmTransitionRef.current.phase === "idle" &&
        domeRuntimeRef.current !== null &&
        domeRuntimeRef.current.rampClock >= DOME_ASSEMBLE_TOTAL_MS;
      if (domeAssembled) {
        // Heat still drains while the pass is skipped, so leaving 3D does not
        // inherit a stale settle burst — the same time budget rule as below.
        if (!pinned && heatRef.current > 0) heatRef.current = Math.max(0, heatRef.current - dt * 1000);
      } else if (sim && (heatRef.current > 0 || pinned)) {
        // Radius-limited release settle: restrict BOTH the live-drag
        // tick and the post-release settle burst to the dragged node's own
        // cluster (itself + 1-hop + 2-hop), so far nodes never drift via FA2
        // either (matching the explicit tug's own falloff below).
        const affected = dragAffectedSetRef.current;
        // **What can move, intersected with what is drawn.**
        // Dragging a hub makes 1-hop + 2-hop most of the graph, so the hop
        // limit alone filters nothing (measured: applying the active set alone
        // went 137.6 → 137.6 ms, zero gain). A node collapsed off screen moves
        // where nobody can see it, so it is not worth computing.
        const clustered = clusteredIdsRef.current;
        const restrictToIds = affected
          ? new Set<string>(
              [affected.draggedId, ...affected.oneHop, ...affected.twoHop].filter(
                (id) => !clustered.has(id),
              ),
            )
          : null;
        // **The narrowed path wins only when the set is sparse** (measured per
        // block, 2026-07-31).
        //
        // Three things write coordinates in this frame, and one of them — the
        // neighbour tug — pushes the entire 1-/2-hop set, collapsed nodes
        // included, every frame. So "nodes that moved" is not the ~30 the audit
        // assumed but **the size of the tug's reach**: dragging the project
        // root gives 975/3000 (33%), where the index detour was a net loss
        // (geometry 0.4 → 0.6 ms), while dragging a domain gives 281/3000 (9%),
        // where the sim block fell 2.1 → 1.5 ms.
        //
        // Hence one fork: narrow when sparse, otherwise take the original full
        // path **without even taking the snapshot**. The point is to not pay
        // the cost where there is no gain.
        const nodeCount = world.nodes.length;
        const scoped =
          affected !== null &&
          (affected.oneHop.size + affected.twoHop.size + 1) * SCOPED_FRAME_SPARSITY < nodeCount;
        let prevX: Float64Array | null = null;
        let prevY: Float64Array | null = null;
        if (scoped) {
          // Snapshot the frame's starting coordinates, so the end of the frame
          // can measure what really moved and narrow the derived geometry
          // update to it.
          if (geomPrevXRef.current?.length !== nodeCount) {
            geomPrevXRef.current = new Float64Array(nodeCount);
            geomPrevYRef.current = new Float64Array(nodeCount);
          }
          prevX = geomPrevXRef.current!;
          prevY = geomPrevYRef.current!;
          for (let i = 0; i < nodeCount; i += 1) {
            prevX[i] = world.nodes[i].x;
            prevY[i] = world.nodes[i].y;
          }
        }

        sim.tick(forceIterationsForDt(dt), restrictToIds);
        // **The write-back is restricted too.** A restricted tick never
        // touches coordinates outside the subgraph, so writing those values
        // back is a pointless 3,000-element round trip. But it **must include
        // the tug neighbours and the previous frame's separation-displaced
        // nodes**: reverting their frame displacement to 0 is the existing
        // contract, and omitting them accumulates the tug offset every frame
        // until neighbours fly away.
        const applyOnly =
          scoped && affected
            ? new Set<string>([
                affected.draggedId,
                ...affected.oneHop,
                ...affected.twoHop,
                ...sepDisplacedIdsRef.current,
              ])
            : null;
        applyForcePositions(world, sim.positions(applyOnly));

        // Explicit neighbor tug: the dragged node's own per-frame
        // world-space displacement (Δ since grab) propagates to 1-hop/2-hop
        // neighbors, falling off by hop distance, eased in/out so the motion
        // reads as springy lag-then-catch-up rather than a rigid rod. Also
        // runs (easing back toward 0) during the post-release settle so the
        // offset doesn't pop away the instant the pointer lifts.
        if (affected) {
          const draggedNode = world.nodeById.get(affected.draggedId);
          const dragStart = dragStartPosRef.current;
          const factors = { oneHop: tokens.dragTug1Hop, twoHop: tokens.dragTug2Hop };
          const tugIds = new Set<string>([...affected.oneHop, ...affected.twoHop]);
          for (const id of tugIds) {
            const hop = affected.oneHop.has(id) ? 1 : 2;
            const tugged = world.nodeById.get(id);
            // Hop count says WHO may be tugged; world distance from the grab
            // point says HOW MUCH. Without the distance term a hub-and-spoke
            // vault (everything within 2 hops) drags the whole map along.
            // Measured from `dragStart`, not the dragged node's live position,
            // so the elastic neighborhood is fixed at grab time and neighbors
            // never fade in/out mid-drag.
            const falloff =
              tugged && dragStart
                ? tugFalloffForDistance(Math.hypot(tugged.x - dragStart.x, tugged.y - dragStart.y), tokens.dragTugRadius)
                : 0;
            const factor = tugFactorForHop(hop, factors) * falloff;
            let targetX = 0;
            let targetY = 0;
            if (pinned && draggedNode && dragStart) {
              targetX = (draggedNode.x - dragStart.x) * factor;
              targetY = (draggedNode.y - dragStart.y) * factor;
            }
            const prevOffset = dragTugOffsetsRef.current.get(id) ?? { x: 0, y: 0 };
            // Under reduced motion the neighbor offset tracks the pointer
            // 1:1 (user-driven position, no animated lag/catch-up easing).
            const nextOffset = reducedMotionRef.current
              ? { x: targetX, y: targetY }
              : {
                  x: stepTugAxis(prevOffset.x, targetX, dt, DRAG_TUG_EASE_TAU),
                  y: stepTugAxis(prevOffset.y, targetY, dt, DRAG_TUG_EASE_TAU),
                };
            dragTugOffsetsRef.current.set(id, nextOffset);
            if (tugged) {
              tugged.x += nextOffset.x;
              tugged.y += nextOffset.y;
            }
          }
        }

        // Relax the overlap a drag or settle created, in the same frame. This
        // block is not reached while homing, so the first-map reveal's
        // deliberate gathering is protected.
        {
          // ★ **A node that is not drawn cannot overlap.**
          //
          // A subtree collapsed by the density gate is replaced by one chip and
          // is not on screen (measured at synth=3000: **2,820 of 3,000 (94%)
          // collapsed, 118 on screen**). Resolving overlaps among the invisible
          // is pure waste whose result appears nowhere, and because pair count
          // is N² that waste took 78% of the frame (109.3 ms).
          //
          // This is exactly what the owner asked three times: "Only 20 are on screen — why
          // compute all 3,000?" What you hold as data and what you feed into
          // per-frame computation are different things, and here they were
          // indistinguishably the same.
          const drawnIdx: number[] = [];
          const sepNodes: SeparationNode[] = [];
          for (let i = 0; i < world.nodes.length; i += 1) {
            const n = world.nodes[i];
            if (clusteredIdsRef.current.has(n.id)) continue;
            drawnIdx.push(i);
            sepNodes.push({
              id: n.id,
              x: n.x,
              y: n.y,
              r: radiusForKind(n.kind, tokens) * n.magnitudeScale,
            });
          }
          // **Only test what actually moved this frame.** A still-still pair
          // did not overlap last frame, so it cannot overlap now.
          //
          // The force sim **already received** this set
          // (`dragAffectedSetRef`); only separation did not. At 3,000 nodes,
          // 99.99% of the 9 million distance computations per frame were
          // "both still" (measured 2026-07-31: 109.3 ms, 78% of the frame).
          // With no set — after a settle ends, say — it falls back to every
          // node, identical to the previous behaviour.
          const sepActive = affected
            ? new Set<string>([affected.draggedId, ...affected.oneHop, ...affected.twoHop])
            : null;
          relaxNodeSeparation(sepNodes, {
            ratio: tokens.nodeMinSeparationRatio,
            iterations: 2,
            pinnedId: nodeDragRef.current?.nodeId ?? null,
            activeIds: sepActive,
          });
          // Record the displaced nodes here so the next frame's narrowed
          // write-back does not omit their revert (see `applyOnly` above).
          const sepDisplaced = sepDisplacedIdsRef.current;
          sepDisplaced.clear();
          for (let i = 0; i < sepNodes.length; i += 1) {
            const target = world.nodes[drawnIdx[i]];
            if (scoped && (target.x !== sepNodes[i].x || target.y !== sepNodes[i].y)) {
              sepDisplaced.add(target.id);
            }
            target.x = sepNodes[i].x;
            target.y = sepNodes[i].y;
          }
        }
        // Only the nodes whose coordinates really changed this frame. Judging
        // by result rather than by author means none of the three writers
        // (force, tug, separation) can be missed.
        let movedIds: Set<string> | null = null;
        if (prevX && prevY) {
          movedIds = new Set<string>();
          for (let i = 0; i < nodeCount; i += 1) {
            const node = world.nodes[i];
            if (node.x !== prevX[i] || node.y !== prevY[i]) movedIds.add(node.id);
          }
        }
        recomputeWorldGeometry(world, tokens, movedIds);
        // Heat is a TIME budget (ms), not a frame count, so the release
        // settle lasts `--topology-v2-node-release-settle-ms` on every display.
        if (!pinned && heatRef.current > 0) heatRef.current = Math.max(0, heatRef.current - dt * 1000);
        if (!pinned && heatRef.current <= 0) {
          // Settle burst finished — release the affected-set restriction and
          // drop any residual (by-now-decayed-near-0) tug offsets.
          dragAffectedSetRef.current = null;
          dragTugOffsetsRef.current.clear();
          sepDisplacedIdsRef.current.clear();
          // During a drag the bbox only ever grew, because it feeds the pan
          // clamp and erring generous is the safe direction. This one frame,
          // where the settle ends, restores the exact value so a graph that
          // gathered inward does not keep a looser clamp than before the drag.
          recomputeWorldGeometry(world, tokens);
        }
      }

      // Auto-arrange homing: springs every node back to its own
      // `homeX`/`homeY` over a short critically-damped transition, independent
      // of the FA2/tug block above (relayout resets heat/pin, so the two never
      // run in the same frame in practice).
      if (homingActiveRef.current) {
        // Reduced-motion users get the relayout RESULT, not the journey.
        // Warding invariant: inside a realm the override (the realm's
        // `insideTargets`) wins as the homing target; null keeps the global
        // homeX/homeY contract.
        const homeOverride = homeTargetOverrideRef.current;
        if (reducedMotionRef.current) {
          for (const node of world.nodes) {
            if (!homeSpringsRef.current.has(node.id)) continue;
            const t = homeOverride?.get(node.id);
            node.x = t?.x ?? node.homeX;
            node.y = t?.y ?? node.homeY;
          }
          recomputeWorldGeometry(world, tokens);
          homingActiveRef.current = false;
          homeSpringsRef.current.clear();
          homeTargetOverrideRef.current = null;
        } else {
          let allConverged = true;
          for (const node of world.nodes) {
            const spring = homeSpringsRef.current.get(node.id);
            if (!spring) continue;
            const t = homeOverride?.get(node.id);
            const targetX = t?.x ?? node.homeX;
            const targetY = t?.y ?? node.homeY;
            // Homing has its own ω (7.5): a relayout is a layout
            // CORRECTION and should end decisively, unlike the camera's
            // cinematic transition spring (4.7) this used to borrow.
            const nextSpring = stepHomeSpring(spring, targetX, targetY, dt, tokens.nodeHomeSpringAngFreq, tokens.cameraDampingDefault);
            homeSpringsRef.current.set(node.id, nextSpring);
            node.x = nextSpring.x.value;
            node.y = nextSpring.y.value;
            if (!isHomeSpringConverged(nextSpring, targetX, targetY, HOME_CONVERGE_EPSILON)) allConverged = false;
          }
          recomputeWorldGeometry(world, tokens);
          if (allConverged) {
            homingActiveRef.current = false;
            homeSpringsRef.current.clear();
            homeTargetOverrideRef.current = null;
          }
        }
      }

      // --- Realm coordinate step: FLIP the inside nodes, fling the outside
      // ones away under gravity. The tick settles entering → active and
      // exiting → idle. While exiting, the homing above returns coordinates to
      // home, so this block leaves them alone. ---
      {
        const rt = realmTransitionReducer(realmTransitionRef.current, { type: "tick", now });
        realmTransitionRef.current = rt;
        const data = realmDataRef.current;
        if (data && rt.phase === "entering") {
          const elapsed = now - rt.startMs;
          const flipDur = reducedMotionRef.current ? 0 : REALM_INSIDE_FLIP_MS;
          const flingDur = reducedMotionRef.current ? 0 : REALM_OUTSIDE_FLING_MS;
          const outsideCulled = isRealmOutsideCulled(rt, now);
          for (const node of world.nodes) {
            const target = data.insideTargets.get(node.id);
            if (target) {
              const from = data.insideFrom.get(node.id) ?? target;
              // Assemble depth by depth: each member's FLIP start is stepped
              // by its depth, so the rings settle in layers from the root
              // outward. Each ring still takes 660 ms.
              const delay = realmInsideFlipDelayFor(data.depthById.get(node.id) ?? 1);
              const p = realmInsidePosition(from, target, elapsed - delay, flipDur);
              node.x = p.x;
              node.y = p.y;
            } else if (!outsideCulled) {
              const from = data.outsideFrom.get(node.id);
              if (from) {
                const p = realmOutsidePosition(from, data.flingCenter, elapsed, {
                  duration: flingDur,
                  fallbackAngle: fallbackAngleFor(node.id),
                });
                node.x = p.x;
                node.y = p.y;
              }
            }
          }
          recomputeWorldGeometry(world, tokens);
        } else if (data && rt.phase === "active") {
          // Settling: snap to the targets once, reseed the sim at the realm
          // coordinates, and hand coordinate ownership to the ordinary paths
          // (drag, sim, homing). Later active frames do not overwrite
          // coordinates, so dragging works. Overwriting to the targets every
          // frame fought the drag and nodes would not move (owner bug report).
          if (!realmActiveHandedOffRef.current) {
            for (const node of world.nodes) {
              const target = data.insideTargets.get(node.id);
              if (target) {
                node.x = target.x;
                node.y = target.y;
              }
            }
            // Reseed the sim at the current realm coordinates; otherwise the
            // first drag tick's `applyForcePositions` writes back the global
            // coordinates from build time and the members jump.
            simRef.current = createForceSimulation(
              world.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })),
              world.edges.map((e) => ({ source: e.sourceId, target: e.targetId })),
            );
            realmActiveHandedOffRef.current = true;
            recomputeWorldGeometry(world, tokens);
          }
        } else if (data && rt.phase === "exiting" && !reducedMotionRef.current) {
          // Exit reverse-playback: inside nodes reverse-FLIP (deepest layer
          // first, target → home) and outside nodes return against gravity
          // (fling position → home) — the deterministic inverse of the entry
          // step. Reduced-motion never reaches here: the exit effect above
          // already snapped home and went idle with duration 0.
          const elapsed = now - rt.startMs;
          for (const node of world.nodes) {
            const target = data.insideTargets.get(node.id);
            if (target) {
              const home = data.insideFrom.get(node.id) ?? target;
              const delay = realmExitFlipDelayFor(data.depthById.get(node.id) ?? 1);
              const p = realmInsidePosition(target, home, elapsed - delay, REALM_EXIT_FLIP_MS);
              node.x = p.x;
              node.y = p.y;
            } else {
              const from = data.outsideFrom.get(node.id);
              if (from) {
                const p = realmOutsideReturnPosition(from, data.flingCenter, elapsed - REALM_EXIT_OUTSIDE_RETURN_DELAY_MS, {
                  duration: REALM_EXIT_OUTSIDE_RETURN_MS,
                  fallbackAngle: fallbackAngleFor(node.id),
                });
                node.x = p.x;
                node.y = p.y;
              }
            }
          }
          recomputeWorldGeometry(world, tokens);
          // Exit framing defect (node audit 2026-07-24): in the collapsed
          // realm layout at entry, `overviewScaleRef` froze at the collapsed
          // spine fit (≈0.24), which pushed stepCamera's scale ceiling
          // (overviewEntryScale × maxZoomRatio) down to ≈0.73 after exit. The
          // camera then could not climb back to the canonical overview (≈1.14)
          // and stuck in a shrunken frame. Reverse playback restores
          // spineBounds a little more each frame as nodes return home, so the
          // ceiling anchor is recomputed live and cannot suppress the target at
          // the tween → spring handover — equivalent to the fresh and deselect
          // paths.
          overviewScaleRef.current = computeOverviewFitScale(overviewBoundsFor(overviewFitRef.current, world), width, height, tokens, world.nodes.length);
        } else if (rt.phase === "idle" && realmDataRef.current !== null) {
          // Exit complete: reverse playback returned everything home, so drop
          // the realm data and settle the overview anchor against the home
          // spineBounds — the close of the recomputation above.
          realmDataRef.current = null;
          overviewScaleRef.current = computeOverviewFitScale(overviewBoundsFor(overviewFitRef.current, world), width, height, tokens, world.nodes.length);
        }
      }

      /*
       * ★ **A focus cannot stand on a name this graph does not have**
       * (2026-08-17).
       *
       * Owner report: "open in map" on a project document made the map look as
       * if it had vanished. **Everything had been dimmed** — measured, the
       * brightest node sat at 1.40:1 against the background (3:1 is the minimum
       * for a shape), and the 125-node sample vault produced zero bright pixels.
       *
       * The cause was a naming mismatch (project slug `project` vs node id
       * `project:project`), fixed in `HomePage`. But the hazard is not that one
       * path — it is **the rule translating "selected a node that does not
       * exist" into "dim everything"**, which the next path would hit again.
       *
       * So a focus id absent from this frame's node list counts as **nothing
       * selected**: a screen with no selection always beats a selection that
       * shows nothing. Costs one `world.nodeById` lookup.
       * Gate: `tests/e2e/map-focus-dangling.spec.ts`.
       */
      const requestedFocusId = focusedSlugRef.current;
      const focusedNodeId =
        requestedFocusId !== null && world.nodeById.has(requestedFocusId)
          ? requestedFocusId
          : null;
      // While focused, hover is nulled — focus owns emphasis exclusively. The
      // trail lens is the **only exception**: during the lens the cursor is
      // over the popover rather than the canvas, so it cannot compete with
      // canvas hover, and a row hover borrows the map's hover channel to brush
      // row ↔ node. Turning the lens off restores the original rule at once.
      const trailLensActive = trailLensPropRef.current?.current ?? false;
      const trailBrushNodeId = trailLensActive ? (trailBrushPropRef.current?.current ?? null) : null;
      // Side-panel hover (chat, data sheet) occupies the same slot as trail
      // brushing. Both exist only while the cursor is off the canvas, so they
      // cannot collide.
      const panelHoverNodeId = panelHoverPropRef.current?.current ?? null;
      const hoveredNodeId =
        trailBrushNodeId ?? panelHoverNodeId ?? (focusedNodeId ? null : hoveredNodeIdRef.current);
      // What the `__atlasMap.hover()` instrument reads: **exactly what this
      // frame used**. Exposing each channel's source ref separately would let a
      // check pass green on a state where the value is right and the screen is
      // not.
      drawnHoveredNodeIdRef.current = hoveredNodeId;
      // Panel-row emphasis only bites while a node is focused (that's the only
      // time the "Connected Nodes" list exists) — otherwise hover owns the ripple.
      //
      // ★ **The hover channel alone draws nothing** (measured 2026-08-17).
      // While focused, `isNodeEmphasisActive` looks at this value only and
      // filters out the rest. So even when side-panel hover fills
      // `hoveredNodeId` correctly, the emphasis ramp stays at 0 — and the hover
      // ring's alpha rides that ramp (`node-shapes.ts`:
      // `ringAlpha = hoverEmphasis ?? 1`), so the ring is drawn **transparent**.
      // Measured: with a node selected, hovering a relation row changed **zero
      // pixels** on the canvas (reduced motion on, whole-canvas comparison).
      //
      // So the same ref feeds this input as well. It is not a new channel: this
      // input was created to receive *"the one node hovered in the detail
      // panel's connection list"* (`focus-state.ts`, `isNodeEmphasisActive`)
      // and simply had nothing feeding it. The `emphasizedNeighborSlug` prop
      // stays, so a render-based consumer can win later if one appears.
      const panelEmphasisNodeId = focusedNodeId
        ? (panelEmphasisNodeIdRef.current ?? panelHoverNodeId)
        : null;

      // Cubic camera transition tween. While one is in flight it drives this
      // frame's camera directly and skips the physics step's spring
      // (`freezeCamera`). Reduced-motion drops the tween and delegates to the
      // spring/snap path. On completion it snaps to the final value and
      // clears, so later frames find the spring already at rest on target.
      let freezeCamera = false;
      {
        const tween = cameraTweenRef.current;
        if (tween) {
          if (reducedMotionRef.current) {
            cameraTweenRef.current = null;
          } else {
            const elapsed = now - tween.startMs;
            if (elapsed >= tween.durationMs) {
              cameraRef.current = {
                x: { value: tween.target.x, velocity: 0 },
                y: { value: tween.target.y, velocity: 0 },
                scale: { value: tween.target.scale, velocity: 0 },
              };
              cameraTweenRef.current = null;
            } else {
              /*
               * Passing the viewport width selects the **van Wijk optimal
               * path** (see the `VAN_WIJK_RHO` doc-block in
               * `model/camera-easing.ts`). Without it this degrades to
               * per-axis linear interpolation, which is what the
               * "looks like a lerp" sweep across the screen was whenever a
               * move and a zoom overlapped.
               */
              const eased = easeCameraKeyframe(tween.start, tween.target, elapsed, tween.durationMs, width);
              cameraRef.current = {
                x: { value: eased.x, velocity: 0 },
                y: { value: eased.y, velocity: 0 },
                scale: { value: eased.scale, velocity: 0 },
              };
              freezeCamera = true;
            }
          }
        }
      }

      const { camera, farT, zoomRatio } = stepTopologyPhysics({
        world,
        camera: cameraRef.current,
        target: cameraTargetRef.current,
        damping: dampingRef.current,
        overviewScale: overviewScaleRef.current,
        tokens,
        cameraAngularFrequency: cameraAngularFreqRef.current ?? tokens.cameraSpringAngFreqTransition,
        dt,
        now,
        // Ambient sleep factor multiplied into comet speed (1 awake, 0
        // asleep). Recomputed here because the idle-gate decision is in another
        // scope; it is pure arithmetic, so it costs nothing and returns the
        // same value for the same `now`/`lastInputMs`.
        ambientFactor: ambientSleepFactor(now, lastInputMsRef.current, ambientSleepDelayRef.current),
        focusedNodeId,
        pairFocusActive: selectedEdgeRef.current !== null,
        hoveredNodeId,
        panelEmphasisNodeId,
        isDragging: pointerMachineRef.current.phase === "dragging",
        // In 3D, hand the pan leash its anchors from the *drawn* dome: its
        // bbox and the focused node's drawn position. The 2D `world.bounds`
        // anchor used to drag the camera toward the 2D centre on the first
        // wheel-zoom tick (see the override JSDoc in
        // `topology-physics-step.ts`).
        worldBoundsOverride:
          domeRuntimeRef.current !== null && domeRuntimeRef.current.rampClock > 0
            ? domeRuntimeRef.current.drawnBounds
            : null,
        focusAnchorOverride: (() => {
          const dome = domeRuntimeRef.current;
          if (dome === null || dome.rampClock <= 0 || focusedNodeId === null) return null;
          const off = dome.frame.get(focusedNodeId);
          const node = world.nodeById.get(focusedNodeId);
          if (!off || !node) return null;
          return { x: node.x + off.dx, y: node.y + off.dy };
        })(),
        scaleMinOverride:
          domeRuntimeRef.current !== null && domeRuntimeRef.current.rampClock > 0
            ? domeRuntimeRef.current.fitScale
            : null,
        reducedMotion: reducedMotionRef.current,
        userDrivenCamera: userDrivenCameraRef.current,
        freezeCamera,
        // This is the **previous frame's** collapsed set; this frame's is not
        // decided until the cluster stage below. Ramps are values over time, so
        // a one-frame lag is the correct behaviour — an expanded node ramps in
        // from 0 starting next frame, a collapsed one ramps for one more frame
        // — and reversing the order would gain nothing.
        clusteredIds: clusteredIdsRef.current,
        emphasisById: emphasisRef.current,
        rippleStartById: rippleStartRef.current,
        egoRevealById: egoRevealRef.current,
        focusRampById: focusRampRef.current,
        appearById: growthReplayRef.current !== null ? growthReplayAppearRef.current : appearRef.current,
        tierReveal: tierRevealRef.current,
      });
      cameraRef.current = camera;

      // Click-focus signature — refresh the retained color focus. While a
      // selection is live, mirror it; after a deselect, hold the last focus so
      // the color fade has a dim/ego target to ease from, clearing only once the
      // retained subject's ramp has decayed (~160ms) — then the selection ring
      // and background dim have fully faded out (④·⑨). Reduced motion snaps the
      // ramp to 0 the same frame, so this clears immediately too.
      {
        const livePairFocus = selectedEdgeRef.current;
        if (focusedNodeId !== null || livePairFocus !== null) {
          colorFocusRef.current = { focusedNodeId, selectedEdge: livePairFocus };
        } else if (colorFocusRef.current !== null) {
          const retained = colorFocusRef.current;
          const probeId =
            retained.focusedNodeId ?? retained.selectedEdge?.sourceId ?? retained.selectedEdge?.targetId ?? null;
          const retainedRamp = probeId !== null ? (focusRampRef.current.get(probeId) ?? 0) : 0;
          if (retainedRamp < 0.02) colorFocusRef.current = null;
        }
      }

      // Drop hover pulses past their 420 ms lifetime. Firing (appending) is
      // done by the pointer handlers' hover path.
      pulsesRef.current = updatePulses(pulsesRef.current, now);

      // --- Depth parallax step: while a realm is active, charge the per-band
      // offsets from the frame delta of camera input (the world centre moved by
      // pan/zoom). When the camera stops they decay exponentially to 0;
      // reduced-motion holds them at 0. The decay tail is effectively 0 within
      // the idle grace of 1200 ms (tau 0.18 s), so this honours the idle-gate
      // contract without wake wiring. The entering phase's dolly-in is a
      // programmatic move and is excluded — parallax responds to input only —
      // with the centre kept in sync so entering `active` does not produce a
      // large delta spike. ---
      {
        const realmActive =
          realmDataRef.current !== null &&
          realmTransitionRef.current.phase === "active" &&
          !reducedMotionRef.current;
        const prevC = prevCameraCenterRef.current;
        if (realmActive && prevC) {
          const delta = { x: camera.x.value - prevC.x, y: camera.y.value - prevC.y };
          const depthById = realmDataRef.current!.depthById;
          realmParallaxDepth2Ref.current = stepDepthParallax(
            realmParallaxDepth2Ref.current,
            delta,
            depthParallaxFactorForDepth(2),
            dt,
          );
          realmParallaxDepth3Ref.current = stepDepthParallax(
            realmParallaxDepth3Ref.current,
            delta,
            depthParallaxFactorForDepth(3),
            dt,
          );
          const d2 = realmParallaxDepth2Ref.current;
          const d3 = realmParallaxDepth3Ref.current;
          realmParallaxRef.current =
            isDepthParallaxActive(d2) || isDepthParallaxActive(d3)
              ? { depthById, depth2: d2, depth3: d3 }
              : null;
        } else {
          realmParallaxDepth2Ref.current = ZERO_PARALLAX;
          realmParallaxDepth3Ref.current = ZERO_PARALLAX;
          realmParallaxRef.current = null;
        }
        prevCameraCenterRef.current = { x: camera.x.value, y: camera.y.value };
      }

      // Emit the semantic-zoom tier only when it changes (spine → circuit →
      // element), so the corner readout's orientation hint tracks what is
      // actually drawn. Same reveal bands as the draw pass, so the label and
      // the visible nodes cannot contradict each other.
      //
      // Emission is suppressed during a realm transition: `onZoomTierChange` is
      // a HomePage setState, so every call re-renders the whole page. During
      // the programmatic camera dolly of a realm enter/exit the scale crosses
      // tier boundaries repeatedly and froze the choreography frames (measured
      // on perf-realm: entry +331 ms, a 125 ms hitch). Once it settles into
      // active or idle, the comparison below emits the final tier exactly
      // once.
      const realmTransitioning =
        realmTransitionRef.current.phase === "entering" || realmTransitionRef.current.phase === "exiting";
      const nextZoomTier = classifyZoomTier(zoomRatio, tierRevealRef.current);
      if (!realmTransitioning && nextZoomTier !== lastZoomTierRef.current) {
        lastZoomTierRef.current = nextZoomTier;
        onZoomTierChangeRef.current?.(nextZoomTier);
      }

      // Density gate: compute this frame's collapsed/chip state from the live
      // positions, so a chip's anchor follows its parent as the parent is
      // dragged or the graph moves. The decision logic is the pure model in
      // `density-gate.ts`; this only injects coordinates.
      //
      // Inside a realm the realm root is always treated as expanded — its
      // direct children are that world's spine, and collapsing them by the gate
      // leaves the realm an empty ring (same logic as the global domain
      // exemption; reproduced at /?synth=2000). It reads the ref rather than
      // the prop: the frame closure captured a stale realmRootId, so entering
      // via the button did not apply the expansion (confirmed on recorded
      // frames).
      const liveRealmRootId = realmDataRef.current?.rootId ?? null;
      // Owner bug report 2026-07-23 (a capability realm rendered as an empty
      // ring): treating only the root as expanded is not enough. If the root is
      // itself a child the outer density gate collapsed — a capability under a
      // domain with 28 of them, say — the root and every member land in
      // clusteredIds and the realm looks empty. So the root's whole `contains`
      // ancestor chain is treated as expanded and the outer gate cannot hide
      // the realm's interior. The ancestors' other children are hard-culled as
      // realm outsiders anyway.
      let effectiveExpanded: ReadonlySet<string> = expandedParentsRef.current;
      if (liveRealmRootId) {
        // The ancestor chain is computed once per rootId and cached.
        if (realmExpandChainRef.current?.rootId !== liveRealmRootId) {
          const chain = new Set<string>([liveRealmRootId]);
          let cursor: string | null = liveRealmRootId;
          while (cursor) {
            let parent: string | null = null;
            for (const [pid, kids] of world.childrenByParent) {
              if (kids.includes(cursor)) {
                parent = pid;
                break;
              }
            }
            if (!parent || chain.has(parent)) break;
            chain.add(parent);
            cursor = parent;
          }
          realmExpandChainRef.current = { rootId: liveRealmRootId, chain };
        }
        const withRealm = new Set(expandedParentsRef.current);
        for (const id of realmExpandChainRef.current.chain) withRealm.add(id);
        effectiveExpanded = withRealm;
      }
      const clusterState = computeTopologyClusterState(world, effectiveExpanded);

      // Selective ego: when a focused node has more neighbours than the batch
      // limit, keep the top (revealedBatches × limit) by DOI and collapse the
      // rest into clusteredIds, so their nodes, edges and labels hide through
      // the existing skip path. The "neighbours +N" chip is a ClusterChip with
      // `ego: true`, riding the same render and hit paths. Session-only state.
      let frameClusteredIds: ReadonlySet<string> = clusterState.clusteredIds;
      let frameChips: readonly ClusterChip[] = clusterState.chips;
      // While a realm is active, un-collapse members held by an **outside**
      // parent's density gate — the case where a shared element's primary owner
      // is a capability outside the realm. Gates from parents inside the realm
      // (the internal +N chips) are kept. This must match
      // `realmVisibleBounds`'s visible-member rule, or the warding ring and
      // framing diverge from what is drawn.
      if (liveRealmRootId && realmDataRef.current) {
        const memberIds = realmDataRef.current.memberIds;
        let needsFilter = false;
        for (const id of frameClusteredIds) {
          if (memberIds.has(id)) {
            const pid = world.nodeById.get(id)?.parentId ?? null;
            if (!pid || !memberIds.has(pid)) {
              needsFilter = true;
              break;
            }
          }
        }
        if (needsFilter) {
          const filtered = new Set<string>();
          for (const id of frameClusteredIds) {
            if (memberIds.has(id)) {
              const pid = world.nodeById.get(id)?.parentId ?? null;
              if (!pid || !memberIds.has(pid)) continue;
            }
            filtered.add(id);
          }
          frameClusteredIds = filtered;
        }
      }
      {
        const focusId = focusedSlugRef.current;
        const neighbors = focusId ? world.neighborMap.get(focusId) : undefined;
        if (focusId && neighbors && neighbors.size > expandPrefRef.current.batchSize) {
          // DOI relation hierarchy: collect each neighbour's original
          // `WorldEdge.relationType` — before it is flattened to the binary
          // contains|depends. When a pair has several edges the stronger wins
          // (contains > depends > relates), because DOI should rank by the
          // strongest structural tie. An O(E) scan, but this block runs only
          // while a hub with more neighbours than the batch limit is focused.
          const relTier = (t: string): number =>
            t === "contains" || t === "belongs_to" ? 3 : t === "depends_on" ? 2 : 1;
          const relByNeighbor = new Map<string, string>();
          for (const edge of world.edges) {
            const other =
              edge.sourceId === focusId ? edge.targetId : edge.targetId === focusId ? edge.sourceId : null;
            if (other === null) continue;
            const prevRel = relByNeighbor.get(other);
            if (prevRel === undefined || relTier(edge.relationType) > relTier(prevRel)) {
              relByNeighbor.set(other, edge.relationType);
            }
          }
          const entries: EgoNeighborRankEntry[] = [];
          for (const id of neighbors) {
            const n = world.nodeById.get(id);
            entries.push({
              id,
              kind: n?.kind ?? "element",
              degree: world.neighborMap.get(id)?.size ?? 0,
              relationType: relByNeighbor.get(id),
            });
          }
          const ranked = rankEgoNeighborsByDOI(entries);
          const sel = selectiveEgoNeighbors(
            ranked,
            egoRevealBatchesRef.current,
            expandPrefRef.current.batchSize,
          );
          if (sel.hiddenCount > 0) {
            // Merge onto `frameClusteredIds`, which already carries the realm
            // un-collapse filter. Re-using the original `clusterState` would
            // undo that correction.
            frameClusteredIds = new Set<string>([...frameClusteredIds, ...sel.hiddenNeighbors]);
            const focusNode = world.nodeById.get(focusId);
            if (focusNode) {
              // Anchored just below the focused node in world space, by its
              // radius plus clearance.
              const r = radiusForKind(focusNode.kind, tokens) * focusNode.magnitudeScale;
              frameChips = [
                ...clusterState.chips,
                {
                  parentId: EGO_NEIGHBOR_CHIP_ID,
                  count: sel.hiddenCount,
                  expanded: false,
                  anchor: { x: focusNode.x, y: focusNode.y + r + 26 },
                  ego: true,
                },
              ];
            }
          }
        }
      }
      // --- High-fan-out batch reveal: expose an expanded cluster parent's
      //     children in DOI-ordered batches. The density gate exposes ALL of an
      //     expanded parent's gated children, so hundreds pour out at once and
      //     the labels and nodes mash together. This runtime post-pass instead
      //     ① ranks the gated children (with the same domain exemption the
      //     density gate uses) via `rankEgoNeighborsByDOI`, ② shows the top
      //     (batches × batch size), ③ folds the rest and their subtrees back
      //     into `frameClusteredIds`, and ④ places a "+N more" chip (a
      //     synthetic id) at the parent's expand-badge anchor. Clicking it
      //     increments that parent's batch count (`clusterRevealBatchesRef`,
      //     not persisted to the URL) — the same UX as the "neighbours +N"
      //     reveal, so it costs nothing to learn. The ego block may already
      //     have replaced `frameChips` with a new array, so this appends. ---
      const batchAppearVisible = new Set<string>();
      {
        const expandedNow = new Set<string>();
        const moreChips: ClusterChip[] = [];
        const hiddenFromBatch = new Set<string>();
        const prevVisible = prevBatchVisibleRef.current;
        // Batching applies only to parents the user expanded explicitly (URL
        // `?open=`). Expansions injected by realm entry (`realmExpandChain` —
        // that world's spine) are excluded, since re-collapsing them into
        // batches would empty the realm.
        const userExpanded = expandedParentsRef.current;
        const realmChain = realmExpandChainRef.current?.chain;
        for (const chip of clusterState.chips) {
          if (!chip.expanded || chip.ego) continue;
          const parentId = chip.parentId;
          if (!userExpanded.has(parentId) || realmChain?.has(parentId)) continue;
          expandedNow.add(parentId);
          // Same domain exemption as the density gate: spine children are not
          // batched.
          const gated = (world.childrenByParent.get(parentId) ?? []).filter(
            (c) => world.nodeById.get(c)?.kind !== "domain",
          );
          if (gated.length === 0) continue;
          const ranked = rankEgoNeighborsByDOI(
            gated.map((id) => ({
              id,
              kind: world.nodeById.get(id)?.kind ?? "element",
              degree: world.neighborMap.get(id)?.size ?? 0,
              // Derived from childrenByParent, so every entry is `contains`:
              // a uniform weight that leaves the order unchanged.
              relationType: "contains",
            })),
          );
          // shown = batches × batch size, the same arithmetic as
          // `selectiveEgoNeighbors`, sliced directly to preserve order. The
          // remainder collapses behind a "+N more" chip.
          const shown =
            Math.max(1, clusterRevealBatchesRef.current.get(parentId) ?? 1) *
            expandPrefRef.current.batchSize;
          const visibleOrdered = ranked.slice(0, shown);
          const hidden = ranked.slice(shown);
          for (const id of visibleOrdered) batchAppearVisible.add(id);
          if (hidden.length > 0) {
            // Collapse the remaining children and their subtrees, so no
            // grandchild floats without its parent — the same rule the density
            // gate applies to clusteredIds.
            const stack = [...hidden];
            while (stack.length > 0) {
              const id = stack.pop() as string;
              if (hiddenFromBatch.has(id)) continue;
              hiddenFromBatch.add(id);
              const kids = world.childrenByParent.get(id);
              if (kids) stack.push(...kids);
            }
            // The "+N more" chip stands at the expand-badge anchor, outward
            // from the child disc. `ego: true` exempts it from the expanded-
            // disc, group-reveal and chipReveal logic; the pointer resolves the
            // synthetic id back to the real parent for its tooltip and batch
            // reveal.
            moreChips.push({
              parentId: clusterMoreChipId(parentId),
              count: hidden.length,
              expanded: false,
              anchor: chip.anchor,
              ego: true,
            });
          }
          // Only newly revealed children (not visible last frame) get a
          // DOI-ordered centre-out stagger schedule and a ramp seeded at 0.
          // `scheduleRipple` reuses the rippleStaggerMaxMs budget cap, so even
          // a full batch compresses into roughly 180 ms total.
          const newly = visibleOrdered.filter((id) => !prevVisible.has(id));
          if (newly.length > 0) {
            const sched = scheduleRipple(parentId, now, newly, 0, tokens.rippleStaggerMs, tokens.rippleStaggerMaxMs);
            for (const s of sched) {
              if (s.nodeId === parentId) continue;
              batchAppearStartRef.current.set(s.nodeId, s.startAtMs);
              batchAppearRef.current.set(s.nodeId, 0);
            }
          }
        }
        // Prune batch counts for collapsed parents, so the next expand starts
        // from the top batch again.
        for (const pid of [...clusterRevealBatchesRef.current.keys()]) {
          if (!expandedNow.has(pid)) clusterRevealBatchesRef.current.delete(pid);
        }
        if (hiddenFromBatch.size > 0) {
          frameClusteredIds = new Set<string>([...frameClusteredIds, ...hiddenFromBatch]);
        }
        if (moreChips.length > 0) {
          frameChips = [...frameChips, ...moreChips];
        }
        prevBatchVisibleRef.current = batchAppearVisible;
      }
      // --- Realm: hard-cull the outside nodes once the fling completes, and
      // compute the warding ring parameters. ---
      const realmState = realmTransitionRef.current;
      const realmData = realmDataRef.current;
      let realmWarding: { centerX: number; centerY: number; radius: number; drawProgress: number; caption: string | null } | null = null;
      let realmTierKinds: ReadonlyMap<string, "project" | "domain" | "capability" | "element"> | null = null;
      let realmDustParallax = 0;
      // Depth presentation: sharpness (entering and active) comes from
      // depthById, parallax (active only) from the band offsets. The step above
      // filled the parallax ref only when active and non-trivial.
      let realmDepthById: ReadonlyMap<string, number> | null = null;
      let realmDepthParallax: { depth2: DepthParallaxOffset; depth3: DepthParallaxOffset } | null = null;
      // Materialize alpha for outside nodes returning during an exit. Filled
      // only while exiting and not under reduced-motion, where the exit effect
      // has already snapped home and never reaches this frame.
      let realmOutsideReturnAlphaById: Map<string, number> | null = null;
      if (
        realmData &&
        (realmState.phase === "entering" || realmState.phase === "active" || realmState.phase === "exiting")
      ) {
        const exiting = realmState.phase === "exiting";
        realmTierKinds = realmData.tierKindById;
        realmDepthById = realmData.depthById;
        // Parallax bands are active-only: during an exit the world is folding
        // up, so they do not apply.
        realmDepthParallax = !exiting && realmParallaxRef.current
          ? { depth2: realmParallaxRef.current.depth2, depth3: realmParallaxRef.current.depth3 }
          : null;
        if (realmState.phase === "entering" && !reducedMotionRef.current) {
          realmDustParallax = realmDustParallaxFactor(now - realmState.startMs);
        }
        // Fill the materialize alpha for each returning outside node. The
        // coordinate step above uses the same
        // `elapsed - REALM_EXIT_OUTSIDE_RETURN_DELAY_MS`, so reusing it here
        // keeps position and alpha in agreement within every frame.
        if (exiting && !reducedMotionRef.current) {
          const elapsed = now - realmState.startMs - REALM_EXIT_OUTSIDE_RETURN_DELAY_MS;
          const alphaMap = new Map<string, number>();
          for (const id of realmData.outsideFrom.keys()) {
            alphaMap.set(id, realmOutsideReturnAlpha(elapsed, REALM_EXIT_OUTSIDE_RETURN_MS));
          }
          realmOutsideReturnAlphaById = alphaMap;
        }
        // Outside nodes are returning during an exit, so they are not culled
        // (`isRealmOutsideCulled` is false while exiting). The hard cull
        // applies only in entering/active, once the fling completes.
        if (isRealmOutsideCulled(realmState, now)) {
          frameClusteredIds = new Set<string>([...frameClusteredIds, ...realmData.outsideIds]);
        }
        // Density chips belonging to parents outside the realm do not exist
        // inside it either: culling the nodes but keeping the chips leaves
        // chips floating in empty space (seen on screen). "+N more" chips carry
        // a synthetic id, so it is resolved back to the real parent for the
        // membership test — batch chips from inside parents stay, those from
        // outside parents are culled with them.
        frameChips = frameChips.filter((ch) =>
          realmData.memberIds.has(parseClusterMoreChipId(ch.parentId) ?? ch.parentId),
        );
        // The warding radius is refitted to the reach of this frame's
        // **visible** members, excluding anything collapsed by the density gate
        // or by ego. The static `realmData.wardingRadius` counted collapsed
        // phyllotaxis children too and drew a circle far larger than the
        // visible world. Measuring against `insideTargets` (the settled
        // coordinates) keeps the target steady through the entry FLIP, and it
        // eases over 240 ms only when the visible set changes.
        const wc = realmData.wardingCenter;
        const reaches: number[] = [];
        for (const id of realmData.memberIds) {
          if (frameClusteredIds.has(id)) continue;
          const t = realmData.insideTargets.get(id);
          if (!t) continue;
          const mn = world.nodeById.get(id);
          const nr = mn ? radiusForKind(mn.kind, tokens) * mn.magnitudeScale : 0;
          reaches.push(Math.hypot(t.x - wc.x, t.y - wc.y) + nr);
        }
        const targetWardingRadius = computeVisibleWardingRadius(reaches);
        const nextFit = stepWardingFit(
          wardingFitRef.current ?? initWardingFit(targetWardingRadius),
          targetWardingRadius,
          now,
          reducedMotionRef.current,
        );
        wardingFitRef.current = nextFit;
        realmWarding = {
          centerX: realmData.wardingCenter.x,
          centerY: realmData.wardingCenter.y,
          radius: nextFit.value,
          // An exit erases the warding ring in reverse (1 → 0); an entry draws
          // it after a delay (0 → 1).
          drawProgress: exiting
            ? realmWardingEraseProgress(now - realmState.startMs)
            : realmWardingDrawProgress(now - realmState.startMs - REALM_WARDING_DRAW_DELAY_MS),
          // Census engraving, so the ring says what it is the boundary of.
          caption: getRealmCaption(),
        };
      }

      // --- Orbit enter-button position: anchored due **east** of the focused
      // node's ring, following the camera every frame. It disappears inside a
      // realm or on a node with no children.
      //
      // It sat at 45° upper-right until 2026-08-02. The expand control (the
      // shoulder badge) uses that **same bearing**, so 80% of the badge slid
      // under this button and `elementFromPoint` returned the button: the badge
      // could not be pressed, and the single character still poking out read as
      // a false number (`+17` rendered as "7"). The default bar above the head
      // also lost 80 px² of its lower-right corner. The single source for
      // bearing allocation and its rationale is the 「Distinct Bearings」 (distinct
      // bearings) section of `render/cluster-chips.ts`, and
      // `expand-settings.contract.test.ts` locks zero overlap across all
      // radii. ---
      {
        const btn = realmEnterButtonElRef.current;
        if (btn) {
          const fid = focusedSlugRef.current;
          const node = fid ? world.nodeById.get(fid) : undefined;
          const hasChildren = fid ? (world.childrenByParent.get(fid)?.length ?? 0) > 0 : false;
          const engaged = realmState.phase !== "idle";
          const eligible = Boolean(fid && node && hasChildren && !engaged && onEnterRealmRef.current);
          // The enter button fades via opacity + pointer-events (a 150 ms CSS
          // transition in the TopologyMapV2 JSX) rather than hard-toggling
          // display, which would pop it in and out. Its transform keeps
          // updating every frame while the focused node exists, so it follows
          // the camera even mid-fade-out instead of freezing in place.
          if (node) {
            // In 3D the button follows the node's drawn ring position and
            // perspective scale too.
            const dFrame = domeRuntimeRef.current?.frame.get(node.id);
            const rr = radiusForKind(node.kind, tokens) * node.magnitudeScale * (dFrame?.s ?? 1) * camera.scale.value;
            const s = worldToScreen(camera, width, height, node.x + (dFrame?.dx ?? 0), node.y + (dFrame?.dy ?? 0));
            // Single source for the position — the expand control's rect
            // computation reads the same function.
            const orbit = orbitButtonRect(s.x, s.y, rr);
            const bx = orbit.x + orbit.w / 2;
            const by = orbit.y + orbit.h / 2;
            btn.style.transform = `translate(-50%, -50%) translate(${bx}px, ${by}px)`;
          }
          // ★ **The tab stop is toggled along with visibility** (measured on
          // keyboard, 2026-07-29).
          //
          // `opacity: 0` does not remove focusability, so while invisible this
          // button stayed in the tab order and the 26th Tab on the map stopped
          // here — with the focus ring at alpha 0 it was nowhere on screen, and
          // Enter did nothing either (the click decision lives in the canvas
          // hit test). To a keyboard user it was **a slot where focus
          // disappeared**.
          //
          // This is the same place `pointerEvents` is switched off, and it has
          // to be: the JSX's initial values alone cannot track visibility that
          // changes every frame.
          if (eligible) {
            realmEnterTargetRef.current = fid;
            btn.style.opacity = "1";
            btn.style.pointerEvents = "auto";
            btn.tabIndex = 0;
            btn.removeAttribute("aria-hidden");
          } else {
            realmEnterTargetRef.current = null;
            btn.style.opacity = "0";
            btn.style.pointerEvents = "none";
            btn.tabIndex = -1;
            btn.setAttribute("aria-hidden", "true");
          }
        }
      }

      // --- Guided-tour canvas anchor projection, structurally identical to
      // the realm-button block above. Writes the screen position and radius of
      // the node `tourAnchorNodeId` names into the anchor div every frame;
      // TopologyMapV2 draws that circle as a scrim cutout. There is no CSS
      // transition — this per-frame transform *is* the motion. ---
      {
        const anchorEl = tourAnchorElRef.current;
        if (anchorEl) {
          const anchorId = tourAnchorNodeIdRef.current;
          const node = anchorId ? world.nodeById.get(anchorId) : undefined;
          if (node) {
            const dFrame = domeRuntimeRef.current?.frame.get(node.id);
            const rr = radiusForKind(node.kind, tokens) * node.magnitudeScale * (dFrame?.s ?? 1) * camera.scale.value;
            const s = worldToScreen(camera, width, height, node.x + (dFrame?.dx ?? 0), node.y + (dFrame?.dy ?? 0));
            anchorEl.style.transform = `translate(-50%, -50%) translate(${s.x}px, ${s.y}px)`;
            anchorEl.style.setProperty("--tour-anchor-r", `${rr + 10}px`);
          }
        }
      }

      // Step the cluster chip reveal ramp: parents expanded this frame (and
      // not ego chips) converge to 1, other tracked parents to 0, at
      // `clusterRevealTau`. Keys that reach ~0 and are no longer expanded are
      // pruned. Reduced-motion snaps.
      {
        const revealMap = chipRevealRef.current;
        const expandedNow = new Set<string>();
        for (const ch of frameChips) {
          if (ch.expanded && !ch.ego) expandedNow.add(ch.parentId);
        }
        // Tracked = parents expanded now, plus parents whose ramp is still
        // fading out.
        const tracked = new Set<string>([...expandedNow, ...revealMap.keys()]);
        for (const pid of tracked) {
          const target = expandedNow.has(pid);
          const prev = revealMap.get(pid) ?? 0;
          const nextVal = reducedMotionRef.current
            ? (target ? 1 : 0)
            : stepEmphasis(prev, target, true, dt, tokens.clusterRevealTau, tokens.clusterRevealTau);
          if (!target && nextVal <= 0.02) revealMap.delete(pid);
          else revealMap.set(pid, nextVal);
        }
      }

      // Step the appearance ramp for batched children, using
      // `clusterRevealTau` (0.17) — the value the chip's own pill/badge fade
      // uses, since the input producing this ramp is a chip click.
      //
      // ★ **This line, not the fifth channel, is where that fix lands.** An
      // earlier attempt changed only `expandRevealRef`'s tau, and frame
      // measurement (design-motion, 2026-07-31) still found children rising at
      // τ 226–236 ms: children of a chip click are registered on **this batch
      // path without exception** (all of `visibleOrdered`, even when
      // `hidden.length === 0`), and `revealMul`'s ternary consults
      // `batchAppear` first, so the other channel's branch is never taken.
      //
      // Keys not visible in this frame's batch (collapsed, or with a collapsed
      // parent) are pruned. Reduced-motion snaps to 1 with no stagger.
      {
        const appearMap = batchAppearRef.current;
        const startMap = batchAppearStartRef.current;
        for (const id of [...appearMap.keys()]) {
          if (!batchAppearVisible.has(id)) {
            appearMap.delete(id);
            startMap.delete(id);
            continue;
          }
          if (reducedMotionRef.current) {
            appearMap.set(id, 1);
            startMap.delete(id);
            continue;
          }
          if (now < (startMap.get(id) ?? 0)) continue; // Before its stagger start — hold 0.
          const next = stepEmphasis(appearMap.get(id) ?? 0, true, true, dt, tokens.clusterRevealTau, tokens.clusterRevealTau);
          appearMap.set(id, next);
          if (next >= 0.999) startMap.delete(id);
        }
      }

      // Local re-relaxation for nodes that just **became visible** through an
      // expand (2026-07-31).
      //
      // `relaxScope` is fixed at world-build time, against a state where
      // nothing is expanded, so expanding a chip drops its children in at their
      // **seed positions**. Phyllotaxis spacing keeps one parent's children
      // apart (measured: zero overlap), but they **collide with other parents'
      // fans**: 5 overlaps at 3 expands, 18 at 6, 70 at 12.
      //
      // Re-relaxing everything both accumulates cost (341 ms at 24 expands) and
      // **moves nodes the user was already looking at** (up to 15 units). So
      // only the newly visible ones plus their bbox neighbours are solved,
      // which keeps items per click at 107–134 — **constant regardless of how
      // many clicks have happened**.
      //
      // It runs inside the frame because the collapsed set is computed per
      // frame, making this the only place that knows what just became visible.
      // It runs once per expand.
      {
        const prevClustered = clusteredIdsRef.current;
        const newlyVisible = new Set<string>();
        for (const id of prevClustered) if (!frameClusteredIds.has(id)) newlyVisible.add(id);
        if (newlyVisible.size > 0) {
          const alreadyPlaced = new Set<string>();
          for (const node of world.nodes) {
            if (!newlyVisible.has(node.id) && !frameClusteredIds.has(node.id)) {
              alreadyPlaced.add(node.id);
            }
          }
          // Solve the home (canonical) coordinates — that is where the springs
          // return to. The live x/y are shifted by the same delta below, which
          // preserves any drag or physics state.
          const homePoints = new Map(
            world.nodes.map((n) => [n.id, { id: n.id, x: n.homeX, y: n.homeY }]),
          );
          relaxNewlyVisible(
            homePoints,
            world.nodes.map((n) => ({ id: n.id, kind: n.kind, parentId: n.parentId })),
            newlyVisible,
            alreadyPlaced,
            {
              radii: {
                project: tokens.radiusProject,
                domain: tokens.radiusDomain,
                capability: tokens.radiusCapability,
                element: tokens.radiusElement,
              },
            },
          );
          for (const node of world.nodes) {
            if (!newlyVisible.has(node.id)) continue;
            const next = homePoints.get(node.id);
            if (!next) continue;
            const dx = next.x - node.homeX;
            const dy = next.y - node.homeY;
            if (dx === 0 && dy === 0) continue;
            node.homeX = next.x;
            node.homeY = next.y;
            node.x += dx;
            node.y += dy;
          }
          recomputeWorldGeometry(world, tokens);
        }
      }

      // Fifth-channel ramp step: children revealed by an expand (i.e. outside
      // the collapsed set) converge to 1, re-collapsed ones to 0. Nodes the
      // tier already revealed do not need this channel and are excluded, so no
      // ramp is applied twice.
      {
        const revealMap = expandRevealRef.current;
        const target = new Set<string>();
        for (const [parentId, childIds] of world.childrenByParent) {
          if (!effectiveExpanded.has(parentId)) continue;
          for (const id of childIds) if (!frameClusteredIds.has(id)) target.add(id);
        }
        const tracked = new Set<string>([...target, ...revealMap.keys()]);
        for (const id of tracked) {
          const prev = revealMap.get(id) ?? 0;
          const next = reducedMotionRef.current
            ? (target.has(id) ? 1 : 0)
            : stepEmphasis(prev, target.has(id), true, dt, tokens.clusterRevealTau, tokens.clusterRevealTau);
          if (!target.has(id) && next <= 0.02) revealMap.delete(id);
          else revealMap.set(id, next);
        }
      }

      // In 3D **every node is part of the shape**, so the density gate's
      // collapsed set and chips are emptied for this frame's consumers (draw,
      // hit-testing, instrumentation). The underlying computation
      // (`frameClusteredIds`) is left intact, so the collapsed state returns as
      // it was on the frame 2D resumes, and the relax/reveal bookkeeping cannot
      // misfire on a dome toggle.
      const domeAllVisible = domeRuntimeRef.current !== null && domeRuntimeRef.current.rampClock > 0;
      clusterChipsRef.current = domeAllVisible ? EMPTY_DOME_CHIPS : frameChips;
      // Publish this frame's NOT-DRAWN set for hit-testing (density-gate
      // collapsed plus selective-ego hidden neighbours), so draw and hit see
      // the same set.
      clusteredIdsRef.current = domeAllVisible ? EMPTY_DOME_CLUSTERED : frameClusteredIds;
      // Publish the depth override the draw used for this frame's tier alphas
      // to hit-testing as well (null when no realm is active), keeping draw and
      // hit in lockstep.
      realmTierKindsRef.current = realmTierKinds;

      // Footprint trail: this frame's visit ordinal per node, starting at 1.
      // The focused node is excluded because the selection ring already holds
      // that position — this avoids marking it twice and preserves the
      // hierarchy (selection over footprint). The array is short (≤30), so
      // recomputing it per frame costs nothing.
      const footprintStepsById = buildFootprintSteps(visitedTrailRef.current);
      if (focusedNodeId !== null) footprintStepsById.delete(focusedNodeId);

      // A longer trail stamps the arrival motion's start time; a shorter one
      // (cleared) drops the ramp.
      const trailLen = visitedTrailRef.current.length;
      if (trailLen > footprintTrailLenRef.current) footprintAppearAtRef.current = now;
      footprintTrailLenRef.current = trailLen;
      const footprintNewestId = trailLen > 0 ? visitedTrailRef.current[trailLen - 1] : null;
      // Same step as the movement ramp (`--motion-base`, 180 ms): a surface
      // taking its place.
      const footprintAppear = reducedMotionRef.current
        ? 1
        : Math.min(1, Math.max(0, (now - footprintAppearAtRef.current) / 180));

      // Spotlight on/off exponential ramp, reusing focusDimTau so no new
      // easing is introduced. Reduced-motion arrives immediately: static
      // contrast alone carries the information.
      spotlightRampRef.current = reducedMotionRef.current
        ? (spotlightIdsRef.current !== null ? 1 : 0)
        : stepFocusRamp(spotlightRampRef.current, spotlightIdsRef.current !== null, dt, tokens.focusDimTau);
      spotlightDashOffsetRef.current = stepSpotlightPhase({
        dashOffset: spotlightDashOffsetRef.current,
        settling: Math.abs(spotlightRampRef.current - (spotlightIdsRef.current !== null ? 1 : 0)) > 0.01,
        reducedMotion: reducedMotionRef.current,
        dtSeconds: dt,
        speedPxPerMs: tokens.spotlightRingSpeed,
      });

      // Trail lens on/off ramp, reusing the same easing and token.
      // Reduced-motion arrives immediately — same contract as the spotlight.
      trailLensRampRef.current = reducedMotionRef.current
        ? (trailLensActive ? 1 : 0)
        : stepFocusRamp(trailLensRampRef.current, trailLensActive, dt, tokens.focusDimTau);

      // One animated-background step, refreshing its own buffer **before** the
      // draw. It receives `ambientFactor` directly, so it decelerates to a stop
      // once the hand lets go, and at 0 the call returns early — zero raster
      // cost while idle.
      {
        const bg = animatedBgRef.current;
        if (bg) {
          const origin = worldToScreen(camera, width, height, 0, 0);
          bg.step({
            width,
            height,
            dpr,
            originX: origin.x,
            originY: origin.y,
            ambientFactor: ambientSleepFactor(now, lastInputMsRef.current, ambientSleepDelayRef.current),
            pointerX: bgPointerRef.current?.x ?? null,
            pointerY: bgPointerRef.current?.y ?? null,
            dtMs: dt * 1000,
            reducedMotion: reducedMotionRef.current,
          });
        }
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      drawTopologyFrame({
        ctx,
        world,
        camera,
        farT,
        zoomRatio,
        now,
        viewportWidth: width,
        viewportHeight: height,
        gridPattern: gridPatternRef.current,
        dustPoints: dustPointsRef.current,
        tokens,
        focusedNodeId,
        hoveredNodeId,
        emphasizedNeighborId: panelEmphasisNodeId,
        hoveredEdge: hoveredEdgeRef.current,
        selectedEdge: selectedEdgeRef.current,
        previewEdge: previewEdgeHeldRef.current && previewAlphaRef.current > 0.001
          ? {
              ...previewEdgeHeldRef.current,
              alpha: previewAlphaRef.current,
              commitProgress: previewCommitRef.current,
            }
          : null,
        emphasisById: emphasisRef.current,
        egoRevealById: egoRevealRef.current,
        focusRampById: focusRampRef.current,
        appearById: growthReplayRef.current !== null ? growthReplayAppearRef.current : appearRef.current,
        bornNodeIds: bornNodeIdsRef.current,
        chipRevealById: chipRevealRef.current,
        expandRevealById: expandRevealRef.current,
        batchAppearById: batchAppearRef.current,
        labelPresentById: labelPresentRef.current,
        colorFocusedNodeId: colorFocusRef.current?.focusedNodeId ?? null,
        colorSelectedEdge: colorFocusRef.current?.selectedEdge ?? null,
        reducedMotion: reducedMotionRef.current,
        pulses: pulsesRef.current,
        selectionPulse: selectionPulseRef.current,
        agentFocusNodeId: agentFocusNodeIdRef.current,
        clusteredIds: domeAllVisible ? EMPTY_DOME_CLUSTERED : frameClusteredIds,
        clusterChips: domeAllVisible ? EMPTY_DOME_CHIPS : frameChips,
        hoveredClusterId: hoveredClusterIdRef.current,
        wardingRing: realmWarding,
        realmTierKinds,
        realmDepthById,
        realmDepthParallax,
        realmDustParallax,
        realmOutsideReturnAlphaById,
        // Cosmos dots are passed only while a realm is active; they are
        // clipped by the warding ring.
        realmCosmosPoints: realmWarding ? cosmosPointsRef.current : null,
        footprintStepsById,
        footprintPref: footprintPrefRef.current,
        walkedEdgeKeys: buildWalkedEdgeKeys(visitedTrailRef.current),
        footprintInk: footprintInkRef.current,
        footprintStepColor: footprintStepColorRef.current,
        footprintNewestId,
        footprintAppear,
        // The lens keep-set is passed only while the popover is open; closed
        // sends null. After the lens turns off the set keeps being passed until
        // the ramp reaches 0, so the trail ink and background dim *fade down*
        // rather than *disappear*.
        trailLensIds:
          trailLensActive || trailLensRampRef.current > 0.01 ? visitedTrailSetRef.current : null,
        trailLensRamp: trailLensRampRef.current,
        spotlightIds: spotlightIdsRef.current,
        mapLensKind: mapLensKindRef.current,
        pathEdgeIds: pathEdgeIdsRef.current,
        spotlightRamp: spotlightRampRef.current,
        spotlightDashOffset: spotlightDashOffsetRef.current,
        tierReveal: tierRevealRef.current,
        glyphStyle: glyphStyleRef.current,
        backgroundVariant: canvasBackgroundRef.current,
        domeFrame:
          domeRuntimeRef.current !== null && domeRuntimeRef.current.rampClock > 0
            ? domeRuntimeRef.current.frame
            : null,
        domeRamp: domeRuntimeRef.current !== null ? domeRuntimeRef.current.rampClock / DOME_ASSEMBLE_TOTAL_MS : 0,
        domeRings:
          domeRuntimeRef.current !== null && domeRuntimeRef.current.rampClock > 0
            ? domeRuntimeRef.current.rings
            : null,
        domeControlFor:
          domeRuntimeRef.current !== null && domeRuntimeRef.current.rampClock > 0
            ? domeEdgeControlForFrame
            : null,
        paintAnimatedBackground: animatedBgRef.current
          ? (target, w, h) => animatedBgRef.current?.paint(target, w, h)
          : null,
        depthDotPatterns: canvasBackgroundRef.current === "depth" ? depthDotPatternsRef.current : undefined,
        expand: expandPrefRef.current,
        clusterBarLabels: getClusterBarLabels(),
      });
      // Record which lens state this frame drew; the idle gate compares
      // against it next frame to decide whether the lens changed.
      drawnTrailLensRef.current = trailLensActive;

      // Guided-tour spotlight ring, drawn by the engine onto the frame rather
      // than as an overlay DOM circle. Owner bug report 2026-07-24: the DOM
      // circle was slightly offset and a slightly different shape from the
      // node, so it looked misaligned. Using the same `worldToScreen` in the
      // same frame makes agreement with the drawn node structural. The scrim
      // cutout stays with the GuidedTourOverlay.
      {
        const anchorId = tourAnchorNodeIdRef.current;
        const node = anchorId ? world.nodeById.get(anchorId) : undefined;
        if (node) {
          const dFrame = domeRuntimeRef.current?.frame.get(node.id);
          const rr = radiusForKind(node.kind, tokens) * node.magnitudeScale * (dFrame?.s ?? 1) * camera.scale.value;
          const s = worldToScreen(camera, width, height, node.x + (dFrame?.dx ?? 0), node.y + (dFrame?.dy ?? 0));
          ctx.save();
          ctx.beginPath();
          ctx.arc(s.x, s.y, rr + 10, 0, Math.PI * 2);
          ctx.strokeStyle = tokens.selectionRingIndigo;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();
        }
      }

      handle = requestAnimationFrame(frame);
    };

    /**
     * ★ **If the GPU reclaims the canvas the map goes blank** — and nobody is
     * told.
     *
     * An accelerated canvas's backing store can be reclaimed by the browser (a
     * GPU process crash, a driver reset, memory pressure on a backgrounded
     * tab). `contextlost` fires and **drawing silently becomes a no-op** — no
     * exception, no console error. The rAF loop keeps running while the screen
     * stays empty, so the user sees "the map disappeared" and we see nothing at
     * all.
     *
     * The spec's contract is simple: `preventDefault()` on `contextlost` makes
     * the browser attempt recovery and fire `contextrestored`. The next frame
     * redraws everything, so all we have to do is **prevent, and wake** — this
     * loop is a full redraw every frame, so no restore procedure is needed.
     * (`developer.chrome.com/blog/canvas2d`: "receive a callback and redraw".)
     */
    const onContextLost = (event: Event) => {
      event.preventDefault(); // Without this the browser does not attempt recovery.
    };
    const onContextRestored = () => {
      // The idle gate may be skipping frames, so mark the moment after
      // recovery as activity to guarantee the next frame is drawn.
      lastActiveMsRef.current = performance.now();
      viewportRebuildPendingRef.current = true;
    };
    canvas.addEventListener("contextlost", onContextLost);
    canvas.addEventListener("contextrestored", onContextRestored);

    handle = requestAnimationFrame(frame);
    return () => {
      cancelled = true;
      cancelAnimationFrame(handle);
      canvas.removeEventListener("contextlost", onContextLost);
      canvas.removeEventListener("contextrestored", onContextRestored);
    };
    // `beginCameraTween` and `cameraTokens` are `useCallback`s with empty
    // deps, so their references never change. They appear here only because the
    // frame body calls them (3D fit-on, selection reframe); this effect never
    // re-runs, so the loop is never remounted.
  }, [beginCameraTween, cameraTokens]);

  // refs below are only dereferenced inside the returned event-handler
  // closures (pointerdown/move/up/wheel), never synchronously during this
  // render — `createTopologyPointerHandlers` is a plain closure factory, not
  // a render-time read; the lint rule can't see into the imported function body.
  /* eslint-disable react-hooks/refs */
  const handlersRef = useRef<TopologyPointerHandlers | null>(null);
  const handlers = createTopologyPointerHandlers({
    wheelIntent,
    worldRef,
    cameraRef,
    cameraTargetRef,
    cameraTweenRef,
    dampingRef,
    cameraAngularFreqRef,
    viewportRef,
    pointerMachineRef,
    dragHistoryRef,
    domeGripRef,
    camStartAtDownRef,
    canvasRectRef,
    canvasRef,
    focusedSlugRef,
    hoveredNodeIdRef,
    rippleStartRef,
    reducedMotionRef,
    userDrivenCameraRef,
    simRef,
    heatRef,
    nodeDragRef,
    dragAffectedSetRef,
    dragStartPosRef,
    overviewScaleRef,
    activeTouchesRef,
    pinchRef,
    hoveredEdgeRef,
    selectedEdgeRef,
    clusterChipsRef,
    expandPrefRef,
    clusterBarLabelsRef,
    clusteredIdsRef,
    hoveredClusterIdRef,
    realmParallaxRef,
    realmTierKindsRef,
    domeRuntimeRef,
    tierRevealRef,
    onSelect,
    onSelectEdge,
    onHoverEdge,
    onPaneClick,
    onContextMenuNode,
    onContextMenuPane,
    onToggleCluster,
    onHoverCluster,
    // A "neighbours +N" chip click lights the next neighbour batch
    // (session-only). The click gesture just kept the canvas active (inside the
    // idle grace window), so the next frame redraws with the new batch — no
    // separate wake needed.
    onExpandEgoNeighbors: () => {
      egoRevealBatchesRef.current += 1;
    },
    // A "+N more" chip click increments that parent's batch count
    // (session-only, not persisted to the URL). Same as above: the click kept
    // the canvas active, so the next frame redraws the new batch with its
    // DOI-ordered stagger.
    onExpandClusterBatch: (parentId: string) => {
      const map = clusterRevealBatchesRef.current;
      map.set(parentId, (map.get(parentId) ?? 1) + 1);
    },
  });
  /* eslint-enable react-hooks/refs */
  // Lets the inspection hook (`edgeAt`) see the latest handlers from inside an
  // effect with empty deps. Written in an effect rather than during render:
  // this repo's lint blocks ref writes during render, rightly — render must be
  // pure.
  useEffect(() => {
    handlersRef.current = handlers;
  });

  // A JSX `onWheel` prop
  // binds to React's delegated listener, which is registered `passive` by
  // default — calling `preventDefault()` inside it throws "Unable to
  // preventDefault inside passive event listener invocation" on every wheel
  // tick and doesn't actually stop the page from scrolling under the canvas.
  // Attaching the SAME handler natively with `{ passive: false }` fixes both.
  // `handleWheelRef` always points at the latest closure (refreshed every
  // render) so the effect below can stay mount-only (`[]`) without going
  // stale — `handlers` itself isn't memoized, so it isn't a safe effect dep.
  const handleWheelRef = useRef(handlers.handleWheel);
  // `noteInput` is declared further down; the mount-only listener reaches it
  // through this ref (kept in sync by the effect beside noteInput's declaration).
  const wheelNoteInputRef = useRef<() => void>(() => {});
  useEffect(() => {
    handleWheelRef.current = handlers.handleWheel;
  });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // The native listener must go through `noteInput` like every other input
    // path. It used to bind the raw handler, so wheel input never updated
    // lastInputMs — after the 30s ambient sleep, wheel-zooming without moving
    // the pointer left the ambient factor at 0 and the depends-edge comets
    // stayed frozen through the whole interaction (bug sweep 2026-09-01).
    const listener = (e: WheelEvent) => {
      wheelNoteInputRef.current();
      handleWheelRef.current(e);
    };
    canvas.addEventListener("wheel", listener, { passive: false });
    return () => canvas.removeEventListener("wheel", listener);
  }, []);

  // Clicking the orbit enter button enters the realm of the slug currently
  // targeted. rAF updates the button's position every frame; the target slug is
  // shared through `realmEnterTargetRef`.
  useEffect(() => {
    const btn = realmEnterButtonRef?.current;
    if (!btn) return;
    const listener = (e: MouseEvent) => {
      e.stopPropagation();
      const slug = realmEnterTargetRef.current;
      if (slug) onEnterRealmRef.current?.(slug);
    };
    btn.addEventListener("click", listener);
    return () => btn.removeEventListener("click", listener);
  }, [realmEnterButtonRef]);

  /**
   * The ambient-sleep wake signal: records when pointer or wheel input arrived.
   *
   * It wraps the returned handlers thinly because the input sites are scattered
   * through `createTopologyPointerHandlers`, and planting the call at each one
   * means a new handler silently omits it. **There is one boundary** — the
   * surface this hook hands outward.
   */
  const noteInput = useCallback(() => {
    lastInputMsRef.current = performance.now();
    // If it was asleep, drawing must resume from this frame. `idle-gate`
    // re-evaluates the refs every frame, so pushing the activity timestamp is
    // enough to guarantee it.
    lastActiveMsRef.current = lastInputMsRef.current;
  }, []);
  useEffect(() => {
    wheelNoteInputRef.current = noteInput;
  }, [noteInput]);

  /**
   * Announcing a dead end — **silence was the defect.**
   *
   * Owner, using it for real: "The arrow keys work, but I cannot move between nodes freely?"
   * With no connected node in that direction it was built to do **nothing**.
   * Not wrapping around stands — jumping to the far side loses the user's
   * place — but it now says why it did not move, because a press with no
   * response cannot be told from "broken".
   *
   * **No new surface**: the app already has a toast mounted across the layout,
   * it dismisses itself (owner: "Show it briefly, then let it disappear") and assistive technology reads it. A hint
   * box on the map would need position, tokens and motion decided, which is not
   * a spec to set alone.
   *
   * ⚠️ **The wording and the toast do not belong to this widget.** Calling
   * `useTranslations` here broke five map component tests, which render without
   * a provider. This widget already **takes its wording as props**, like
   * `canvasLabel`, so only the event goes out (`onWalkDeadEnd`).
   */
  const onWalkDeadEndRef = useRef(onWalkDeadEnd);
  useEffect(() => {
    onWalkDeadEndRef.current = onWalkDeadEnd;
  });
  /** When it last announced, so holding an arrow key does not repeat itself. */
  const deadEndAtRef = useRef<number | null>(null);

  const announceDeadEnd = useCallback(() => {
    const now = performance.now();
    if (!shouldAnnounceDeadEnd(deadEndAtRef.current, now)) return;
    deadEndAtRef.current = now;
    /*
     * Send **the blocked node's screen position** along. Owner, 2026-08-10:
     * "It should appear clearly right beside the node you were moving from, and
     * then disappear."
     *
     * The screen-coordinate formula is the one the `nodes()` window and the
     * draw already share; deriving it here would be a third copy. When no
     * coordinate can be produced it sends `null` and the receiver decides not
     * to show anything.
     */
    const world = worldRef.current;
    const camera = cameraRef.current;
    const id = focusedSlugRef.current;
    const node = world && id ? world.nodeById.get(id) : null;
    const { width, height } = viewportRef.current;
    const point =
      node && camera && width > 0 && height > 0
        ? {
            x: (node.x - camera.x.value) * camera.scale.value + width / 2,
            y: (node.y - camera.y.value) * camera.scale.value + height / 2,
          }
        : null;
    onWalkDeadEndRef.current?.(point);
  }, []);

  /**
   * Arrow keys **walk the graph** (owner decision, 2026-08-09) — they move to a
   * neighbour rather than pushing the camera. Which neighbour is decided by
   * pure functions in `../interaction/keyboard-walk` (a ±60° wedge, projection
   * plus an orthogonal penalty); this only wires the result into canvas state.
   *
   * **Why no separate focus ring.** Separating focus from selection visually
   * needs a second indigo mark, and in this app indigo already means
   * "selected"; one colour with two meanings breaks the diagram, and that is
   * not a spec to set alone (`.claude/rules/design.md`, 「To change a spec, convene the 'System'」 — changing a spec convenes the design-systems seat). So
   * the keys **move the selection**, identical in meaning to a click, with zero
   * new visual language.
   *
   * **Collapsed nodes are not walked** — a subtree the density gate collapsed
   * has been replaced by a chip, so moving there means "I pressed a key and
   * nothing is visible".
   */
  const handleKeyDown = useCallback((e: ReactKeyboardEvent<HTMLCanvasElement>) => {
    /*
     * Keyboard zoom and fit (`interaction/keyboard-zoom.ts`): `+`/`-` step the
     * camera about the viewport centre on the same tween the fit uses, `0` is
     * the toolbar fit itself. Modifier combinations fall through to the browser.
     */
    const zoomIntent = keyboardZoomIntent(e);
    if (zoomIntent !== null) {
      e.preventDefault();
      if (zoomIntent.kind === "fit") {
        runOverviewFit();
        return;
      }
      const tokens = readTopologyV2TokensOrNull();
      if (!tokens) return;
      const target = cameraTargetRef.current;
      const overviewEntryScale = overviewScaleRef.current * tokens.overviewEntryRatio;
      const scaleMax = computeEffectiveCameraScaleMax(overviewEntryScale, tokens.cameraMaxZoomRatio, tokens.cameraScaleMax);
      let scaleMin = computeEffectiveCameraScaleMin(overviewEntryScale, tokens.cameraMinZoomRatio, tokens.cameraScaleMin);
      const dome = domeRuntimeRef.current;
      if (dome !== null && dome.active) {
        // The 3D fit sits below the 2D floor; the wheel path lowers the floor the same way.
        if (dome.fitScale !== null) scaleMin = Math.min(scaleMin, dome.fitScale);
        dome.spinArmed = false;
        commitDomeEntrySweep(dome);
        dome.poseTween = null;
      }
      const tscale = Math.min(scaleMax, Math.max(scaleMin, target.tscale * zoomIntent.factor));
      if (Math.abs(tscale - target.tscale) < 1e-6) return;
      const next = { tx: target.tx, ty: target.ty, tscale };
      cameraTargetRef.current = next;
      userDrivenCameraRef.current = true;
      dampingRef.current = tokens.cameraDampingDefault;
      cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
      beginCameraTween(next);
      return;
    }
    const direction = walkDirectionForKey(e.key);
    if (!direction) return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;

    const world = worldRef.current;
    const camera = cameraRef.current;
    if (!world || !camera) return;

    const clustered = clusteredIdsRef.current;
    const visible = (id: string) => !clustered.has(id);

    const currentId = focusedSlugRef.current;
    let nextId: string | null = null;

    if (currentId === null || !world.nodeById.has(currentId)) {
      // With no focus, start from **what is being looked at**: the camera's
      // x/y are the world coordinates of the screen centre (the same formula
      // the `nodes()` window uses).
      nextId = pickInitialFocus(
        world.nodes.filter((n) => visible(n.id)).map((n) => ({ id: n.id, x: n.x, y: n.y })),
        { x: camera.x.value, y: camera.y.value },
      );
    } else {
      const from = world.nodeById.get(currentId);
      if (!from) return;
      /*
       * Reachable = **connected neighbours plus siblings**.
       *
       * ⚠️ Neighbours (edges) alone were the candidates at first, and the owner
       * hit the wall in the real thing: "At depth 1 they should be able to move among themselves — I could not move around freely at the centre?" (at
       * depth 1 they should be able to move among themselves — I could not move
       * around freely at the centre). The nine domains ringing the project at
       * the map's centre **have no edges to each other**; each attaches only to
       * the project. So stepping sideways from one to the next was impossible,
       * and on a screen where they visibly form a ring that reads as broken.
       *
       * **This does not permit arbitrary spatial jumps.** A sibling is the
       * typed relation "same parent", which is the very reason they form that
       * ring on screen. Parentless roots count as siblings of each other, for
       * vaults with more than one project.
       */
      const candidateIds = new Set<string>(world.neighborMap.get(currentId) ?? []);
      for (const node of world.nodes) {
        if (node.id === currentId) continue;
        if (node.parentId === from.parentId) candidateIds.add(node.id);
      }
      const candidates: { id: string; x: number; y: number }[] = [];
      for (const id of candidateIds) {
        if (!visible(id)) continue;
        const node = world.nodeById.get(id);
        if (node) candidates.push({ id: node.id, x: node.x, y: node.y });
      }
      if (candidates.length === 0) {
        // A node with nowhere to go. Say why, rather than doing nothing.
        e.preventDefault();
        announceDeadEnd();
        return;
      }
      nextId = pickNeighborInDirection({ id: from.id, x: from.x, y: from.y }, candidates, direction);
    }

    // The arrow keys are ours: the page must not scroll even when there is no
    // neighbour in that direction.
    e.preventDefault();
    if (nextId === null) {
      announceDeadEnd();
      return;
    }

    const target = world.nodeById.get(nextId);
    if (!target) return;
    onSelect?.(nextId);

    /*
     * The camera only **follows**, and only when the focus is about to leave
     * the free area. Recentring on every step keeps the map sliding while you
     * walk and the user loses their place — breaking Shneiderman's
     * overview-first on our own.
     *
     * **Both the test and the target use the free area**, for the reason and
     * the measurements recorded on the focus-dive path above (owner,
     * 2026-08-10). It runs once per step, not per frame.
     */
    const { width, height } = viewportRef.current;
    const canvasEl = canvasRef.current;
    if (width > 0 && height > 0 && canvasEl) {
      const scale = camera.scale.value;
      const canvasBox = canvasEl.getBoundingClientRect();
      const canvasRect: Rect = {
        x: canvasBox.x,
        y: canvasBox.y,
        width: canvasBox.width,
        height: canvasBox.height,
      };
      const obstacles = collectCanvasObstacles(canvasEl, canvasRect);
      const free = computeFreeArea(canvasRect, obstacles);

      // Is the focus comfortably inside the free area (compared in document
      // coordinates).
      const sx = canvasBox.x + (target.x - camera.x.value) * scale + width / 2;
      const sy = canvasBox.y + (target.y - camera.y.value) * scale + height / 2;
      const margin = Math.min(free.width, free.height) * 0.18;
      const outside =
        sx < free.x + margin ||
        sx > free.x + free.width - margin ||
        sy < free.y + margin ||
        sy > free.y + free.height - margin;
      if (outside) {
        /*
         * The target comes from the camera-math formula (`centerForInsets`).
         * Writing it out here would make two copies, and with several copies
         * the default outcome is that one is missed — the focus dive was
         * exactly that missed copy.
         *
         * The free area stays only in the **"has it gone outside" test**:
         * insets give a push distance but not a containing rectangle, so that
         * test asks a question the insets cannot express.
         */
        const centered = centerForInsets(target.x, target.y, { ...measureCanvasInsets(canvasEl, canvasRect), top: 0, bottom: 0 }, scale);
        const cameraTarget = { tx: centered.tx, ty: centered.ty, tscale: scale };
        /*
         * ★ **Starting the tween alone is not enough** (the gate caught this).
         * When the tween ends the spring takes over from `cameraTargetRef`, so
         * leaving that stale **pulls the camera back to the old target** —
         * measured: the node ended up 188 px off the free area's centre, sitting
         * at the screen centre instead. This is why every other programmatic
         * path (focus dive, chip expand, fit-view) sets both.
         */
        cameraTargetRef.current = cameraTarget;
        userDrivenCameraRef.current = false;
        beginCameraTween(cameraTarget);
      }
    }
  }, [onSelect, beginCameraTween, announceDeadEnd, runOverviewFit]);

  const wrappedHandlers = useMemo(
    () => ({
      handleKeyDown: (e: ReactKeyboardEvent<HTMLCanvasElement>) => {
        noteInput();
        handleKeyDown(e);
      },
      handlePointerDown: (e: ReactPointerEvent<HTMLCanvasElement>) => {
        noteInput();
        handlers.handlePointerDown(e);
      },
      handlePointerMove: (e: ReactPointerEvent<HTMLCanvasElement>) => {
        noteInput();
        handlers.handlePointerMove(e);
      },
      handlePointerUp: (e?: ReactPointerEvent<HTMLCanvasElement>) => {
        noteInput();
        handlers.handlePointerUp(e);
      },
      handleWheel: (e: WheelEvent) => {
        noteInput();
        handlers.handleWheel(e);
      },
    }),
    [handlers, noteInput, handleKeyDown],
  );

  /**
   * ★ Inspection hook — an automation window attached only under `?e2e=1`.
   * **Not a product API.**
   *
   * The 2026-07-31 accident: six consecutive attempts to reproduce node-drag
   * lag **only ever dragged the background**. The only way to aim at a node
   * from outside was sweeping the canvas for a `pointer` cursor, but that is a
   * **hover hit**, not **grabbable** — a grab must also pass
   * `sim.hasNode(pressedNodeId)`, and failing that it silently becomes a pan.
   * Node drag and pan then set **the same `grabbing`** cursor
   * (`topology-pointer-handlers.ts`), so even checking afterwards was
   * impossible. Every run answered "it isn't slow here", until the owner looked
   * at the screen: *"You are shaking the background, not a node."*
   *
   * > **A state you cannot distinguish from outside cannot be tested from
   * > outside.**
   *
   * So two things are exposed: a node's **screen position and whether it is
   * grabbable** (aiming), and whether the current drag is **a node or the
   * background** (confirming). Both are getters reading refs on call, so the
   * per-frame cost is zero.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!new URLSearchParams(window.location.search).has("e2e")) return;
    // Enable idle-gate cause recording, only in sessions where the window is
    // attached (`lastActiveCausesRef`).
    idleDebugEnabledRef.current = true;
    const hook = {
      /**
       * The names of the activity flags that last kept a frame awake, when that
       * was, and a few of the raw values feeding the idle gate. In a "it never
       * sleeps" regression this is the only window that names **the cause —
       * which flag** — rather than the symptom (CPU per second).
       */
      idleDebug: () => ({
        lastActive: lastActiveCausesRef.current,
        heat: heatRef.current,
        lastInputMs: lastInputMsRef.current,
        lastActiveMs: lastActiveMsRef.current,
        hovered: hoveredNodeIdRef.current,
        pointerPhase: pointerMachineRef.current.phase,
      }),
      /** Nodes as drawn; coordinates are **CSS pixels**, the mouse coordinate space. */
      nodes: () => {
        const world = worldRef.current;
        const camera = cameraRef.current;
        const { width, height } = viewportRef.current;
        if (!world || !camera || width <= 0) return [];
        const tokens = readTopologyV2TokensOrNull();
        const sim = simRef.current;
        const clustered = clusteredIdsRef.current;
        const preview = previewEdgeHeldRef.current;
        // In 3D the instrument reports the **drawn** coordinates. Reading
        // anything but the frame map the draw last produced would measure the
        // instrument's own imagination rather than the screen (the same
        // principle as the edge instrument below). Mid-rotation it is still
        // *this frame's* coordinates.
        const domeFrame =
          domeRuntimeRef.current !== null && domeRuntimeRef.current.rampClock > 0
            ? domeRuntimeRef.current.frame
            : null;
        return world.nodes.map((n) => {
          const dOff = domeFrame?.get(n.id) ?? { dx: 0, dy: 0, s: 1 };
          return {
          id: n.id,
          kind: n.kind,
          label: n.label,
          // The inverse of screenToWorld, using the same camera, so they
          // cannot disagree.
          x: (n.x + dOff.dx - camera.x.value) * camera.scale.value + width / 2,
          y: (n.y + dOff.dy - camera.y.value) * camera.scale.value + height / 2,
          /** ★ Not checking this produced six wrong answers: a node absent from the sim pans instead of dragging. */
          draggable: sim?.hasNode(n.id) ?? false,
          /** W6 agent ring — reports the same decision the draw uses
           *  (`agentFocusNodeIdRef`). e2e cannot read canvas pixels, so this
           *  typed signal is the only window onto "is the ring actually on this
           *  node". */
          agentFocus: agentFocusNodeIdRef.current === n.id,
          /** A collapsed subtree is replaced by a chip and is not on screen. */
          hidden: isPreviewEndpointHidden(clustered?.has(n.id) ?? false, preview, n.id),
          previewEndpoint: isPreviewEndpoint(preview, n.id),
          /**
           * ★ For the graph-readability instrument: overlap cannot be counted
           * without radii. Uses the **same formula** as the draw
           * (`radiusForKind × magnitudeScale` in `topology-frame-draw.ts`, times
           * the camera zoom for the screen radius). Diverging formulas measure
           * the instrument's imagination, not the screen.
           */
          radius: tokens
            ? radiusForKind(n.kind, tokens) *
              n.magnitudeScale *
              camera.scale.value *
              dOff.s
            : 0,
        };
        });
      },
      /**
       * **Edges** as drawn, in the same CSS pixel space as the nodes.
       *
       * Why expose this (2026-08-03): this app's primary surface is a node-link
       * graph and **edge crossings had never once been counted**. Node specs
       * (shape, radius, parity) had gates; whether the map reads as a graph had
       * no numbers at all.
       *
       * Purchase (1997, Graph Drawing) sets the priority: **reducing edge
       * crossings matters overwhelmingly most** for human comprehension, while
       * maximising angular resolution and grid snapping were not statistically
       * significant. So only crossings and overlap are exposed.
       *
       * Edges attached to a `hidden` node are excluded — counting crossings of
       * lines nobody can see produces numbers that do not describe the screen.
       */
      edges: () => {
        const world = worldRef.current;
        const camera = cameraRef.current;
        const { width, height } = viewportRef.current;
        if (!world || !camera || width <= 0) return [];
        const clustered = clusteredIdsRef.current;
        const toScreenX = (x: number) => (x - camera.x.value) * camera.scale.value + width / 2;
        const toScreenY = (y: number) => (y - camera.y.value) * camera.scale.value + height / 2;
        // The same per-endpoint frame offsets the draw uses
        // (`projectEdgePoints`).
        const domeFrame =
          domeRuntimeRef.current !== null && domeRuntimeRef.current.rampClock > 0
            ? domeRuntimeRef.current.frame
            : null;
        const EDGE_ZERO = { dx: 0, dy: 0, s: 1 };
        const edgeOff = (nodeId: string) => domeFrame?.get(nodeId) ?? EDGE_ZERO;
        return world.edges
          .filter((e) => !clustered?.has(e.sourceId) && !clustered?.has(e.targetId))
          .map((e) => {
            const offA = edgeOff(e.sourceId);
            const offB = edgeOff(e.targetId);
            return {
            sourceId: e.sourceId,
            targetId: e.targetId,
            kind: e.kind,
            ax: toScreenX(e.ax + offA.dx),
            ay: toScreenY(e.ay + offA.dy),
            bx: toScreenX(e.bx + offB.dx),
            by: toScreenY(e.by + offB.dy),
            /**
             * ★ So the instrument measures **the curve that is drawn**, not its
             * chord. The draw path is `quadraticCurveTo(control, b)`
             * (`topology-frame-draw.ts`); joining endpoints instead counts
             * crossings that are not on screen and misses crossings that are —
             * measuring an approximation rather than the map.
             */
            controlX: toScreenX(e.controlX + (offA.dx + offB.dx) / 2),
            controlY: toScreenY(e.controlY + (offA.dy + offB.dy) / 2),
          };
          });
      },
      /**
       * **The edge the app would select** at `(x, y)`, or null on no hit.
       *
       * Why it has to exist (2026-08-03): nodes can be driven from outside via
       * `nodes()` coordinates, but **edges could not be**. Measured: clicking
       * 101 points along a curve's midline across 3 offsets left
       * `selection().edge` null every time (7 px threshold, excluding node
       * bodies). So **no change touching edges could be verified
       * automatically**, and an attempt to give the edge panel enter/exit
       * motion was reverted at that wall.
       *
       * It calls **the same function as the pointer handlers** rather than
       * recomputing coordinates: an instrument with its own formula measures
       * its imagination, not the screen.
       */
      edgeAt: (x: number, y: number, thresholdPx?: number) => {
        const e = handlersRef.current?.probeEdgeAt(x, y, thresholdPx);
        return e ? { sourceId: e.sourceId, targetId: e.targetId, kind: e.kind } : null;
      },
      /** What is being dragged, since a node and the background look identical on screen. */
      interaction: () => {
        const drag = nodeDragRef.current;
        if (drag) return { kind: "node" as const, nodeId: drag.nodeId };
        if (pointerMachineRef.current.phase === "dragging") return { kind: "pan" as const, nodeId: null };
        return { kind: "idle" as const, nodeId: null };
      },
      /** Canvas backing size, to confirm the interaction resolution cap actually applied. */
      backing: () => {
        const c = canvasRef.current;
        return c ? { width: c.width, height: c.height, dpr: window.devicePixelRatio } : null;
      },
      /** Where the map is looking — for verifying deep links, dives and fit-view. */
      camera: () => {
        const camera = cameraRef.current;
        const { width, height } = viewportRef.current;
        if (!camera) return null;
        return { x: camera.x.value, y: camera.y.value, scale: camera.scale.value, width, height };
      },
      /**
       * **Where the map is heading**, as opposed to where it currently is.
       *
       * The destination is set in one step when something changes the available
       * area; the position then interpolates toward it over several frames. A
       * test that samples the position has to pick a wall-clock moment and
       * therefore measures the machine as much as the product —
       * `design-gates.md` says as much: gate by call count, not milliseconds.
       * Reading the target instead makes "did the resize aim the camera at the
       * new area" answerable without timing anything.
       */
      cameraTarget: () => {
        const target = cameraTargetRef.current;
        return { x: target.tx, y: target.ty, scale: target.tscale };
      },
      /**
       * Live horizontal obstruction measured by the same product function the
       * camera consumes. This distinguishes a desktop side inspector from a
       * mobile full-width sheet without copying the classification into E2E.
       */
      obstacleInsets: () => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const box = canvas.getBoundingClientRect();
        if (box.width <= 0 || box.height <= 0) return null;
        return measureCanvasInsets(canvas, {
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
        });
      },
      /**
       * Dome pose — where the dome is looking and whether it still spins by
       * itself. Canvas pixels cannot distinguish yaw, pitch or the armed state
       * from outside, so this is the window for verifying the auto-spin stop,
       * the pitch range and the selection reframe. Null in 2D (dome off), which
       * is distinguishable from the instrument being absent.
       */
      dome: () => {
        const d = domeRuntimeRef.current;
        if (d === null) return null;
        return {
          yaw: d.yaw,
          pitch: d.pitch,
          /*
           * The pose the pointer **commanded**. Its gap from `yaw` is how far
           * behind the hand the dome trails, and there is no way to see that
           * from outside the canvas — pixels show "the dome turns", never "the
           * dome turns late". Lowering the smoothing τ from 45 to 14 ms on
           * 2026-08-19 was decided by measuring this value.
           */
          yawTarget: d.yawTarget,
          pitchTarget: d.pitchTarget,
          yawVel: d.yawVel,
          pitchVel: d.pitchVel,
          orbiting: d.orbiting,
          spinArmed: d.spinArmed,
          /*
           * Tier torsion (follow-through) — **from outside the canvas this is
           * the only thing that says whether the dome reacts to its own
           * motion.** Pixels cannot tell a ring that lagged from a ring simply
           * drawn that way. Requiring this to be non-zero during a
           * programmatic pose move is what makes "a click reframe does not turn
           * as a rigid block" verifiable from outside.
           */
          lag: { ...d.lag },
          /*
           * The meaningful landing a release aimed at. From outside the canvas
           * there is no way to tell inertia that happened to stop from a stop
           * that was aimed; this value is that distinction.
           */
          yawSnap: d.yawSnap,
          poseTween: d.poseTween !== null,
          active: d.active,
          ramp: d.rampClock / DOME_ASSEMBLE_TOTAL_MS,
        };
      },
      /**
       * The node the map is **pointing at via hover** — the same value whether
       * the cursor is over the canvas or over a row in a side panel (chat, data
       * sheet).
       *
       * Why it exists (2026-08-17): there was **no way from outside** to check
       * the contract that hovering a panel row makes the map point at that
       * node. The canvas has no DOM, leaving only pixel comparison, and pixels
       * say "something changed" but never "that node" — pointing at the wrong
       * node would still pass green.
       */
      hover: () => drawnHoveredNodeIdRef.current,
      /** What is selected: one node, or one edge's endpoint pair. */
      selection: () => ({
        nodeId: focusedSlugRef.current,
        edge: selectedEdgeRef.current,
      }),
      /**
       * Density-gate chips — where "+24 really reveals 24" is verified. A chip
       * once claimed 24 while exactly 1 was drawn, because the tier gate did
       * not honour the chip expansion. Reporting the claim (`count`) beside the
       * reality (`shownChildren`) is what makes that mismatch catchable from
       * outside.
       */
      /**
       * The label boxes the last frame drew, in CSS pixels — the only way to see
       * label collision from outside. The canvas has no DOM, so a spec can
       * otherwise only diff pixels, which reports "something changed" and never
       * "these two names sit on top of each other". Node centres are not a
       * substitute: a frame measured **zero** disc overlaps while names visibly
       * crossed (2026-08-22). Names collide long before discs do.
       */
      labels: () => lastDrawnLabelBoxes(),
      chips: () => {
        const world = worldRef.current;
        const clustered = clusteredIdsRef.current;
        return clusterChipsRef.current.map((chip) => {
          const children = world?.childrenByParent.get(chip.parentId) ?? [];
          return {
            parentId: chip.parentId,
            claimedCount: chip.count,
            expanded: chip.expanded,
            /** Direct children that are not collapsed, i.e. can be drawn. */
            shownChildren: children.filter((id) => !clustered.has(id)).length,
          };
        });
      },
    };
    (window as unknown as { __atlasMap?: typeof hook }).__atlasMap = hook;
    return () => {
      delete (window as unknown as { __atlasMap?: typeof hook }).__atlasMap;
    };
  }, []);

  return { canvasRef, containerRef, ...handlers, ...wrappedHandlers };
}
