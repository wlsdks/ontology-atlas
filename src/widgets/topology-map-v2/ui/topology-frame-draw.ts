/**
 * Per-frame Canvas 2D draw pipeline — the composition point for `engine/`,
 * `model/`, and `render/*` (`docs/TOPOLOGY-V2-DESIGN.md` §4 P2-P4, prototype
 * `render()` §13). Camera-space conversions live in `topology-camera-math.ts`
 * (this file only consumes `worldToScreen`, it doesn't own the convention).
 */

import type { CameraAxes } from "../engine/camera";
import { collectDomeAncestry, domeAncestryEdgeKey } from "../model/dome-ancestry";
import { rankEgoNeighborsByDOI, resolveEdgeEgoStateWithPair, resolveNodeEgoStateWithPair, resolveTrailLensNodeEgoState, trailNodeInkStrength, type EdgeEgoState, type EdgePairFocus, type NodeEgoState } from "../model/focus-state";
import { resolveFreshnessVisual } from "../model/freshness";
import { backgroundParallaxOrigin, resolveBackgroundOrigin } from "../model/background-parallax";
import { computeSelectionPulse, type SelectionPulseVisual } from "../model/selection-pulse";
import {
  isPathLensEdge,
  isPathLensNode,
  type TopologyMapLensKind,
} from "../model/path-lens";
import {
  drawEdgeFootprints,
  drawFootprintSteps,
  drawNodeFootprint,
  footprintScaleFor,
  type FootprintInk,
} from "@/shared/lib/footprint-glyph";
import { DEFAULT_EXPAND } from "@/shared/lib/appearance-preferences";
import type { ExpandPreference, FootprintPreference } from "@/shared/lib/appearance-preferences";
import { isDirectionalRelation } from "@/entities/knowledge-graph";
import { depthParallaxOffsetFor, ZERO_PARALLAX } from "../model/realm-depth-parallax";
import {
  DOME_HALO_ALPHA_CAP,
  DOME_HALO_ALPHA_GAIN,
  DOME_RING_ALPHA,
  DOME_RING_WIDTH_PX,
  domeDetailFactor,
  domeFogAlpha,
  domeHaloPx,
  domeLineWidthFactor,
  type DomeNodeFrame,
} from "../model/dome-view";
import { draw as domeRingsDraw } from "../render/dome-rings";
import { realmDepthClarityAlpha, realmDepthClarityScale } from "../model/realm-transition";
import { classifyZoomTier, DEFAULT_TIER_REVEAL, edgeTierAlpha, effectiveNodeAlpha, HITTABLE_MIN_TIER_ALPHA, nodeTierAlpha, type TierRevealConfig } from "../model/tier-visibility";
import {
  LABEL_TOP_K,
  isEgoNeighborLabelExempt,
  selectDiscLabelEligible,
  selectTopKLabels,
  type LabelRankEntry,
} from "../model/label-lod";
import { DEPTH_DOT_LAYERS, draw as gridDraw, lerpColorHex, type CanvasBackgroundVariant } from "../render/grid";
import {
  ACTIVITY_MARK_GAP,
  ACTIVITY_MARK_RADIUS,
  computeLabelAlpha,
  draw as labelsDraw,
  drawInstrumentCaption,
  resolveLabelBaselineY,
  resolveFlippedLabelBaselineY,
  labelZoomScale,
  measureLabelWidth,
  measureLabelVerticalMetrics,
  scaledLabelFontSize,
} from "../render/labels";
import {
  CLUSTER_CHIP_LABEL_PRIORITY,
  ellipsizeToWidth,
  greedyPlaceLabels,
  overlapsForeignReserved,
  NODE_DISC_LABEL_PRIORITY,
  clampAnchorIntoSafeRect,
  isSafeRectProtectedLabel,
  isWithinSafeRect,
  resolveLabelPriority,
  type LabelCandidate,
  type ReservedBox,
  type SafeRect,
} from "../render/label-layout";
import { draw as nodeShapesDraw } from "../render/node-shapes";
import { clusterChipOccupancyRect, drawClusterChip, clusterChipScale, type ClusterBarLabels } from "../render/cluster-chips";
import type { ClusterChip } from "../model/density-gate";
import { drawDiffractionSpike, drawRealmCosmos, drawStarDust, type DustPoint } from "../render/starfield";
import { isEdgeCulled, isNodeCulled, isPassthroughEdge } from "../render/viewport-cull";
import { draw as tracesDraw } from "../render/traces";
import {
  drawPreviewEdge,
  isPreviewEndpoint,
  isPreviewEndpointHidden,
} from "../render/preview-edge";
import { drawPulses, edgePairMeta, selectAmbientDependsComets, selectEgoContainsComets, type Pulse } from "../render/edge-fireflies";
import type { TopologyV2Tokens } from "../tokens/read-topology-v2-tokens";
import { worldToScreen } from "./topology-camera-math";

/**
 * Cull slack. Edges: the control hull already bounds the curve, so this only
 * has to cover stroke width and the comet arcs riding on it. Nodes: the disc
 * is the SMALLEST thing a node paints — diffraction spike arms reach `r*2.6`
 * — so the radius is inflated before the test rather than trusting `r`.
 */
const EDGE_CULL_MARGIN_PX = 24;
const NODE_CULL_SLACK = 3;
import { isSpineNode, radiusForKind, type TopologyWorld, type WorldEdge, type WorldNode } from "./topology-world";

/**
 * Dashed aura ring that tells an expanded parent apart from a collapsed one. The
 * selection (ego) ring is solid, so the two channels never collide. Radius =
 * node disc + this offset (px), 1px, indigo. No glow/neon — dashed hairline only.
 */
const EXPANDED_AURA_RING_OFFSET = 6;
const EXPANDED_AURA_DASH: readonly number[] = [3, 3];
/**
 * Horizontal padding (px) added to each side of a label box. Two labels that
 * merely **touch** read as one word, but AABB overlap testing does not count
 * touching as overlapping — this closes that blind spot at the reservation step.
 * The value matches the mockup's reserved box: `measured width + 6` (3 per side).
 */
const LABEL_SIDE_GAP = 3;
/** Realm root anchor ring alpha — a solid hairline one step crisper than the warding circle (0.5); the centre is the protagonist. */
const REALM_ROOT_ANCHOR_ALPHA = 0.7;
/** Warding count caption — offset below the circle (px, screen-fixed) and ink alpha. */
const WARDING_CAPTION_OFFSET_PX = 24;
const WARDING_CAPTION_ALPHA = 0.62;
const EXPANDED_AURA_ALPHA = 0.55;
/**
 * Membership-ring alpha for an expanded cohort (the direct children). Lower than
 * the parent aura (0.55) so the parent stays the attention winner — 30 children
 * ringing as loudly as their parent read as "the map is sparkling", not "this
 * bundle was expanded".
 */
const EXPANDED_COHORT_ALPHA = 0.42;
/**
 * While a disc is expanded, background nodes unrelated to it dim slightly to cut
 * the visual noise (1.0 when nothing is expanded). Alpha only, never colour.
 *
 * High-fan batch reveal (2026-07) lowered it a further step, 0.5 → 0.42: a batch
 * reveals only a few children (top 24) at a time, so the background has to
 * recede further for the revealed batch to read clearly.
 */
const BACKGROUND_DIM_WHEN_EXPANDED = 0.42;

const EMPTY_NEIGHBOR_SET: ReadonlySet<string> = new Set();
/** Reused empty cap set for frames with no focus (or no incident `contains` edges). */
const EMPTY_EGO_CONTAINS_COMETS: ReadonlySet<string> = new Set();
// perf sweep 2026-07 — reused frame-scratch Map, see its `.clear()` call
// site in `drawTopologyFrame` below for why this is safe.
const effectiveAlphaByIdReused = new Map<string, number>();

/*
 * ── Scratch buffers, aiming at zero allocation per frame ─────────────────
 *
 * Dome mode re-sorts by depth and re-projects the latitude rings every frame.
 * Allocating fresh arrays and objects for that costs, in this vault alone, 2
 * arrays + 291 objects per frame (258-edge sort array · 125-node sort array ·
 * 3 rings × 96 points). At 120Hz that is 35,000 objects per second, and the bill
 * arrives not as frame time but as the stutter when GC interrupts.
 *
 * Same idiom the repo already uses for `effectiveAlphaByIdReused`: the draw only
 * ever runs synchronously from a single rAF loop, so module-scope reuse is safe.
 */
const domeEdgeOrderReused: WorldEdge[] = [];
/** Depth-sort scratch — reused per frame, zero allocation (see the `edgeDrawOrder` block). */
const domeEdgeDepthReused: number[] = [];
const domeEdgeIndexReused: number[] = [];
const domeNodeOrderReused: WorldNode[] = [];
// Dome ancestry (2026-08-23) — the containment chain lit under selection. Reused per frame,
// the file's standing allocation discipline. Two pairs because the COLOR ramp classifies by
// the retained focus, which trails the live focus by ~160ms during a deselect fade.
const domeAncestryNodesReused = new Set<string>();
const domeAncestryEdgesReused = new Set<string>();
const domeAncestryColorNodesReused = new Set<string>();
const domeAncestryColorEdgesReused = new Set<string>();
const domeAncestryUnionReused = new Set<string>();
const domeAncestryColorUnionReused = new Set<string>();
const domeRingScreenReused: { a: number; points: { x: number; y: number; u: number }[] }[] = [];
/**
 * perf 2026-08-19 — one `DomeNodeFrame` lookup per node per frame.
 *
 * The alpha loop, the node sort comparator (O(n log n)!), the node draw, and the
 * label pass each used to re-fetch the same node's frame through
 * `domeFrame.get(id)` — a string-hash lookup, and `domeFrameFor` measured 2.6%
 * self time in the synth=2000 rotation profile. Edges re-fetched 2–3 times per
 * endpoint for depth, draw, and projection. Filled once here, keyed by the node's
 * original index, and everything reads this array. Same objects, so identical
 * pixels; the node sort uses the same index-sort idiom as the edge sort, so the
 * ordering is identical too (stable sort + identical comparison key).
 */
const domeNodeFrameReused: DomeNodeFrame[] = [];
const domeNodeDepthReused: number[] = [];
const domeNodeIndexReused: number[] = [];
const domeEdgeFrameAReused: DomeNodeFrame[] = [];
const domeEdgeFrameBReused: DomeNodeFrame[] = [];
/** The radius the node pass actually drew — reused each frame via `.clear()`. */
const drawnScreenRadiusByIdReused = new Map<string, number>();
/** Input to the ambient `depends` comet cap — replaces the array `filter` built every frame. */
const ambientDependsInputReused: WorldEdge[] = [];
/**
 * Edge endpoint projection scratch — replaces the 4 temporaries (3 points + 1
 * wrapper) `projectEdgePoints` allocated per edge. Safe for the same reason as
 * `effectiveAlphaByIdReused`: the draw runs synchronously from one rAF loop, and
 * the return value is consumed before the next edge.
 */
const edgePointsScratch = {
  a: { x: 0, y: 0 },
  b: { x: 0, y: 0 },
  control: { x: 0, y: 0 },
};
/** Screen-coordinate scratch for the node and label passes — replaces one point object per iteration. */
const nodeScreenScratch = { x: 0, y: 0 };
const labelScreenScratch = { x: 0, y: 0 };
/*
 * perf 2026-08-19 — reused edge-halo argument object. `tracesDraw` reads it
 * synchronously and never retains it (it is a pure draw), so mutating fields on
 * one shared object yields identical values — and therefore identical pixels.
 * Token arguments are frame-invariant too, hence one per frame
 * (`traceTokensFrame`/`nodeShapeTokensFrame`).
 */
const edgeHaloScratch = { color: "", px: 0, alpha: 0 };

/** `lerpColorHex(fill, sheenTint, blend)` cache — constant per fill; invalidated wholesale when tokens change. */
const sheenTopCache = new Map<string, string>();
let sheenTopCacheTint = "";
let sheenTopCacheBlend = -1;
/** The two kind passes, in ink order — hoisted so no array literal is built per frame. */
const EDGE_KIND_PASSES = ["contains", "depends"] as const;
/**
 * perf 2026-08-19 — precomputed edge alpha, keyed by original edge index. The
 * ambient comet filter and the draw loop each used to repeat 2 `clusteredIds.has`
 * plus 2 `effectiveAlphaById.get` calls per edge; now one pass computes it and
 * both consumers read the same value. -1 marks an edge folded away by the density
 * condition (not drawn).
 */
const edgeAlphaReused: number[] = [];
/**
 * perf 2026-08-19 — `NodeVisual` cache for focus-free frames.
 *
 * On a rotating or idle frame (no focus, pair, lens, or hover ripple)
 * `resolveNodeVisual` is a function of (kind, fresh, stale) alone, yet it still
 * built a fresh freshness object plus a fresh `NodeVisual` per node per frame
 * (2,000 nodes × 60fps). Identical inputs now reuse the identical object — same
 * values, same pixels. Invalidated wholesale when tokens or the motion preference
 * change; frames that are not cacheable (focus, etc.) take the original path.
 * No consumer mutates a cached object: the trail-ink mutation only happens on
 * lens-active frames, and those never hit the cache.
 */
const nodeVisualCache: (NodeVisual | undefined)[] = new Array(16);
let nodeVisualCacheTokens: TopologyV2Tokens | null = null;
let nodeVisualCacheReducedMotion: boolean | null = null;
const KIND_CACHE_INDEX: Record<WorldNode["kind"], number> = { project: 0, domain: 1, capability: 2, element: 3 };
/** The zero dome frame — shared (and never mutated) by dome-off nodes and the 2D path. */
const ZERO_DOME_FRAME: DomeNodeFrame = { dx: 0, dy: 0, s: 1, a: 0, u: 0 };

/**
 * **The node alphas this frame actually drew** — the single source for hit testing.
 *
 * The draw had four tier-piercing exemption channels (edge selection · footprint
 * lens · ego focus · recent-change spotlight) but hit testing had only one (ego),
 * so a node raised by the footprint lens was **visible yet unclickable** (found in
 * a full sweep, 2026-07-31). Passing one more argument per channel would drift
 * again the next time a channel is added, so hit testing reads the map the draw
 * already builds.
 *
 * Safe for the same reason given on `effectiveAlphaByIdReused`: `drawTopologyFrame`
 * runs **synchronously only**, from a single rAF loop, and a pointer event cannot
 * interleave with it. Hit testing therefore always reads a **completed previous
 * frame** — which is more accurate, not less: the user clicks **what they saw**.
 */
export function lastDrawnNodeAlphas(): ReadonlyMap<string, number> {
  return effectiveAlphaByIdReused;
}

/**
 * The label boxes this frame actually **drew**, in CSS pixels.
 *
 * Why this has to exist: label collision is the one map-readability property that
 * cannot be observed from outside. The canvas has no DOM, so an e2e spec can only
 * compare pixels — which says "something changed", never "these two names are on
 * top of each other". `__atlasMap.nodes()` exposes node centres and radii, and
 * those measured **zero** overlaps on a frame whose labels were visibly crossing
 * (2026-08-22): names collide long before the discs do.
 *
 * Recorded at the draw call rather than from the placement result, for the same
 * reason `lastDrawnNodeAlphas` is: the placer decides, but a later stage (the LOD
 * presence ramp) can still put a candidate on screen. What matters for readability
 * is what was painted.
 */
let drawnLabelBoxes: { nodeId: string; text: string; minX: number; minY: number; maxX: number; maxY: number }[] = [];

export function lastDrawnLabelBoxes(): readonly {
  nodeId: string;
  text: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}[] {
  return drawnLabelBoxes;
}
// Cluster-chip hover colour easing anchor: which chip has been hovered since
// when (only one can be hovered at a time). The rest→hover colour transition
// (~150ms) is driven from this start time. Under reduced-motion the colour snaps,
// so the anchor goes unused.
const CLUSTER_CHIP_HOVER_MS = 150;
let clusterChipHoverAnim: { id: string; startAt: number } | null = null;
// Label ids placed on the previous frame (hysteresis: within one priority band,
// prefer what was placed last frame) plus the previous timestamp used to derive
// dt for the presence ramp (`now` is monotonic). Module state — the same
// frame-to-frame pattern as `clusterChipHoverAnim`.
let prevPlacedLabelIds: ReadonlySet<string> = new Set();
let lastLabelRampNow = 0;
// Project bumped 2 → 1.5 to match the owner spec exactly: "1.5px amber outer
// stroke" (a 1.5px amber outer stroke). The outer stroke hardcodes amber for
// project (see `resolveNodeVisual` below), so its width is specified
// independently of the other kinds' tier-neutral outlines.
const LINE_WIDTH_BY_KIND: Record<WorldNode["kind"], number> = {
  project: 1.5,
  domain: 1.6,
  capability: 1.3,
  element: 1,
};

function tierFill(kind: WorldNode["kind"], tokens: TopologyV2Tokens): string {
  if (kind === "project") return tokens.nodeFillProject;
  if (kind === "domain") return tokens.nodeFillDomain;
  if (kind === "capability") return tokens.nodeFillCapability;
  return tokens.nodeFillElement;
}

function tierStroke(kind: WorldNode["kind"], tokens: TopologyV2Tokens): string {
  if (kind === "project") return tokens.nodeStrokeProject;
  if (kind === "domain") return tokens.nodeStrokeDomain;
  if (kind === "capability") return tokens.nodeStrokeCapability;
  return tokens.nodeStrokeElement;
}

// perf sweep 2026-07 — `id` never changes for a node's lifetime (graph
// rebuild replaces the whole `TopologyWorld`, never mutates an id in place),
// so the hash below is a pure function of a value that's constant across
// every single frame it's called from. Memoizing it removes one string-hash
// loop per breathing node per frame from the paint hot path — a small win on
// its own, but free (no invalidation to get wrong: a new id simply misses
// once and gets cached).
const phaseCache = new Map<string, number>();

/** Deterministic per-node breathe-phase offset — a stable hash stands in for the prototype's seeded-RNG phase (layout has no PRNG in this contract, `model/layout.ts` JSDoc). */
function phaseForId(id: string): number {
  const cached = phaseCache.get(id);
  if (cached !== undefined) return cached;
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const phase = ((Math.abs(hash) % 1000) / 1000) * Math.PI * 2;
  phaseCache.set(id, phase);
  return phase;
}

interface NodeVisual {
  fill: string;
  stroke: string;
  dash: readonly number[];
  lineWidth: number;
  breatheEnabled: boolean;
}

/**
 * The one place the click-focus color signature lives. Instead of hard-
 * switching to the dim/ego palette the instant a focus commits, it computes
 * BOTH the node's normal (no-focus) look and its focused-state target, then
 * lerps between them by `focusRamp` (0..1, `stepFocusRamp`). So a click's
 * dim (background→gray) / ego (neighbor→indigo, center→bright) color swap eases
 * IN on the camera-dive time axis (owner headline: "avoid reading as a hard cut" —
 * it must never read as a hard cut), and a deselect eases it back OUT — the caller keeps `colorEgoState` pinned to
 * the retained focus while the ramp decays, so the dim target persists to fade
 * FROM instead of snapping to normal. Only color+dash+breathe here; center
 * radius easing is in the draw loop. No new hue — every lerp target is an
 * existing token.
 */
function resolveNodeVisual(
  node: WorldNode,
  colorEgoState: NodeEgoState,
  emphasis: number,
  colorFocusedNodeId: string | null,
  isEmphasizedNeighbor: boolean,
  tokens: TopologyV2Tokens,
  reducedMotion: boolean,
  focusRamp: number,
): NodeVisual {
  const freshness = resolveFreshnessVisual({ fresh: node.fresh, stale: node.stale, hub: node.isHub }, reducedMotion);
  const lineWidth = LINE_WIDTH_BY_KIND[node.kind];
  const dash = freshness.dash;

  // --- Normal (no-focus) target: the look a node holds when nothing is
  // focused. Canvas-emphasis slice §A1 — project keeps its hardcoded amber
  // outer stroke (design.md reserves amber for Layer-0 containers); its
  // selection/neighbor emphasis lives in the ring overlays, never a body
  // indigo lerp, so the amber identity is never muddied.
  let normalFill: string;
  let normalStroke: string;
  let normalBreathe = freshness.breatheEnabled;
  if (freshness.useStaleFillStroke) {
    normalFill = tokens.nodeFillStale;
    normalStroke = tokens.nodeStrokeStale;
    normalBreathe = false;
  } else if (node.kind === "project") {
    normalFill = tierFill(node.kind, tokens);
    normalStroke = tokens.amberHub;
  } else {
    normalFill = tierFill(node.kind, tokens);
    let stroke = tierStroke(node.kind, tokens);
    if (freshness.strokeIndigoLerp > 0) stroke = lerpColorHex(stroke, tokens.indigo, freshness.strokeIndigoLerp);
    // No-focus hover ripple — only when there is no focus classification at all
    // (live or retained); focus owns emphasis otherwise.
    if (!colorFocusedNodeId && emphasis > 0.02) stroke = lerpColorHex(stroke, tokens.indigo, Math.min(1, emphasis));
    normalStroke = stroke;
  }

  const ramp = Math.min(1, Math.max(0, focusRamp));
  // Fast path: no focus intensity → byte-identical to the pre-ramp no-focus look.
  if (ramp <= 0.001) {
    return { fill: normalFill, stroke: normalStroke, dash, lineWidth, breatheEnabled: normalBreathe };
  }

  // --- Focused-state target: dim / neighbor / center, keyed on the (retained)
  // color ego state so the target survives a deselect while the ramp decays.
  let focusedFill: string;
  let focusedStroke: string;
  let focusedBreathe = normalBreathe;
  if (colorEgoState === "dim") {
    focusedFill = tokens.nodeFillDim;
    focusedStroke = tokens.nodeStrokeDim;
    focusedBreathe = false;
  } else if (freshness.useStaleFillStroke) {
    focusedFill = tokens.nodeFillStale;
    focusedStroke = tokens.nodeStrokeStale;
    focusedBreathe = false;
  } else if (node.kind === "project") {
    focusedFill = tierFill(node.kind, tokens);
    focusedStroke = tokens.amberHub;
  } else {
    focusedFill = tierFill(node.kind, tokens);
    let stroke = tierStroke(node.kind, tokens);
    if (freshness.strokeIndigoLerp > 0) stroke = lerpColorHex(stroke, tokens.indigo, freshness.strokeIndigoLerp);
    if (colorEgoState === "neighbor") stroke = lerpColorHex(stroke, tokens.indigo, 0.5);
    // Panel-linked ripple: the hovered detail-row's neighbor pushes past the
    // flat 0.5 neighbor tint toward the brightest indigo, tracking its emphasis.
    if (isEmphasizedNeighbor && emphasis > 0.02) stroke = lerpColorHex(stroke, tokens.indigoBright, Math.min(1, emphasis));
    if (colorEgoState === "center") stroke = tokens.indigoBright;
    focusedStroke = stroke;
  }

  return {
    fill: lerpColorHex(normalFill, focusedFill, ramp),
    stroke: lerpColorHex(normalStroke, focusedStroke, ramp),
    dash,
    lineWidth,
    // dash/breathe can't tween — they cross over once the ramp is mostly to the
    // focused side (a dimmed node stops breathing, etc.).
    breatheEnabled: ramp > 0.5 ? focusedBreathe : normalBreathe,
  };
}

export interface FrameDrawParams {
  ctx: CanvasRenderingContext2D;
  world: TopologyWorld;
  camera: CameraAxes;
  /** Visual-expression axis (constellation ↔ circuit) — node/edge/label morph, diffraction, vignette. */
  farT: number;
  /** Semantic-zoom axis (`cameraScale / overviewEntryScale`) — drives tier visibility only. */
  zoomRatio: number;
  now: number;
  viewportWidth: number;
  viewportHeight: number;
  gridPattern: CanvasPattern | null;
  dustPoints: readonly DustPoint[];
  tokens: TopologyV2Tokens;
  focusedNodeId: string | null;
  hoveredNodeId: string | null;
  /**
   * Under focus, the one neighbor whose detail-panel row the user is hovering.
   * Its node + the ego edge that connects it to the focused node get an extra
   * "emphasis ripple" brightening so panel and map read as one (lead spec §4).
   * Null in the common case (no panel hover).
   */
  emphasizedNeighborId: string | null;
  /** The hovered edge (same state the microcard shows) — brightens that edge's ink. */
  hoveredEdge: { sourceId: string; targetId: string; relationType: string } | null;
  /** Edge selection = pair focus — only the two endpoints stay lit, the rest dims, and the selected edge goes pale indigo. */
  selectedEdge: EdgePairFocus | null;
  previewEdge: {
    sourceId: string;
    targetId: string;
    relationType: string;
    phase: "draft" | "committing";
    alpha: number;
    commitProgress: number;
  } | null;
  emphasisById: ReadonlyMap<string, number>;
  /** C1 A2 — ego tier-reveal ramp (`topology-physics-step.ts` steps it), consumed by `effectiveNodeAlpha`. */
  egoRevealById: ReadonlyMap<string, number>;
  /**
   * Click-focus signature — per-node 0..1 ramp stepped by `stepTopologyPhysics`.
   * `resolveNodeVisual` lerps normal→dim/ego color by it and the draw loop eases
   * the center node's radius 1→1.12, so the dim/ego swap eases in with the
   * camera dive and back out on deselect. Empty/missing = 0 (no focus intensity,
   * regression-free).
   */
  focusRampById: ReadonlyMap<string, number>;
  /**
   * rank8 — new-node appear ramp (nodeId → 0..1), stepped by `stepTopologyPhysics`.
   * The node draw multiplies effRadius (0.6→1 micro scale) and globalAlpha (0→1)
   * by it so a node introduced on a world rebuild swells in instead of hard-
   * popping. Missing entry = 1 (untracked/existing nodes never fade). Omitted map
   * = no appear animation (regression-free).
   */
  appearById?: ReadonlyMap<string, number>;
  /**
   * Ids of **nodes born during this session** (filled by `use-topology-loop`'s
   * world diff). The appear ramp (`appearById`) already existed, but at overview
   * zoom a new capability's tier alpha is 0, so **the whole animation was being
   * multiplied by zero** — an agent could create a node and the only on-screen
   * change was the domain's child count going 2 → 3 (measured 2026-08-17). Born
   * nodes therefore get the same class of tier exemption as an ego click or a
   * chip expansion, and rise through that existing ramp, swelling from 0.6×.
   *
   * The set persists for the session: appearing and then vanishing IS a flicker.
   */
  bornNodeIds?: ReadonlySet<string> | null;
  /**
   * rank7 — cluster expand/collapse reveal ramp (parentId → 0..1), stepped by the
   * loop. The node pass multiplies a just-expanded disc child's globalAlpha by its
   * nearest expanded-ancestor parent's ramp (fade IN on expand); `drawClusterChip`
   * fades the pill/badge form in by it. Missing/omitted = 1 (no fade).
   */
  chipRevealById?: ReadonlyMap<string, number>;
  /**
   * High-fan batch reveal (2026-07) — per-child batch reveal ramp (childId → 0..1),
   * stepped by the loop with a DOI-ordered center-out stagger. For a batch-
   * revealed disc child this REPLACES the per-parent group fade (`chipRevealById`)
   * as the node's reveal multiplier + drives the micro appearScale (0.6→1), so an
   * expanded parent's first batch resolves child-by-child in DOI order instead of
   * all-at-once. Only children currently in a visible batch have an entry; every
   * other node falls back to the group/world-appear path (regression-free).
   */
  batchAppearById?: ReadonlyMap<string, number>;
  /**
   * rank9 — per-label present ramp (nodeId → 0..1), MUTATED in place by the label
   * pass: rises toward 1 while a label is greedily placed this frame, decays
   * toward 0 while its on-screen candidate loses placement, so LOD churn fades
   * instead of flickering. Omitted = labels draw at full alpha (regression-free).
   */
  labelPresentById?: Map<string, number>;
  /**
   * The node id whose focus classification drives the COLOR ramp — normally the
   * live `focusedNodeId`, but RETAINED by the caller for the ~160ms after a
   * deselect while `focusRampById` decays, so the dim/ego target the colors fade
   * FROM persists instead of snapping to normal (the selection ring and the
   * background dim fade out together).
   * `null` once nothing is focused and the ramp has reached 0. Kept separate
   * from live `focusedNodeId` so labels / tier-reveal / camera never inherit the
   * retention lag — only node body color + rings do.
   */
  colorFocusedNodeId: string | null;
  /** Edge-pair analogue of `colorFocusedNodeId` — the retained selected edge for the color ramp (⑨). */
  colorSelectedEdge: EdgePairFocus | null;
  reducedMotion: boolean;
  /**
   * Live one-shot hover pulses fired by a node hover (`use-topology-loop.ts` owns
   * their lifetime). Drawn as a head plus trail riding the edge curve. Under
   * reduced-motion nothing fires, so this stays empty.
   */
  pulses: readonly Pulse[];
  /**
   * Canvas-emphasis slice §B2 — the just-committed selection's one-shot
   * commit-pulse anchor: which node was just clicked and when
   * (`performance.now()`-compatible timestamp), captured once by
   * `ui/use-topology-loop.ts` on every `focusedSlug` change. `null` when
   * nothing has ever been selected. This frame's elapsed-since-commit is
   * derived here (`now - startAtMs`) and fed through
   * `model/selection-pulse.ts#computeSelectionPulse` — `null`/expired pulses
   * draw nothing extra, leaving only the permanent static selection ring.
   */
  selectionPulse: { nodeId: string; startAtMs: number } | null;
  /**
   * W6 agent visibility — the node id matching the agent heartbeat's current
   * `focus.ontologySlug`, already resolved to the graph's `kind:slug` id
   * form by `views/home/lib/resolve-agent-focus-node.ts`, or `null` when
   * there's no fresh heartbeat / no resolvable focus. Drives the amber
   * agent-focus ring (`render/node-shapes.ts`) and the label-side activity
   * mark (`render/labels.ts`) — both no-op when this is `null`.
   */
  agentFocusNodeId: string | null;
  /**
   * Density condition — ids of nodes inside a collapsed parent's subtree, which
   * this frame will **not** draw. The node, edge, and label passes all skip them.
   */
  clusteredIds: ReadonlySet<string>;
  /** Density condition — the cluster chips this frame draws (world-space anchor, inheriting the parent's tier alpha). */
  clusterChips: readonly ClusterChip[];
  /** Density condition — the hovered cluster parent's id (brightens the chip border), or null. */
  hoveredClusterId: string | null;
  /**
   * The warding ring of a realm expansion. While a realm is entering or active,
   * a 1px indigo hairline circle is drawn at the subtree's bounding radius,
   * self-drawing its stroke over `drawProgress` 0..1 (~200ms at the start of the
   * transition). Null draws nothing.
   */
  wardingRing: { centerX: number; centerY: number; radius: number; drawProgress: number; caption: string | null } | null;
  /** Per-member tier-kind override by depth — inside a realm, tier means re-layout depth. */
  realmTierKinds: ReadonlyMap<string, "project" | "domain" | "capability" | "element"> | null;
  /**
   * The fifth tier-piercing channel — a 0..1 ramp for children revealed by
   * expanding a chip, stepped by `use-topology-loop.ts`. Same shape as the other
   * four, so hit testing follows automatically through `effectiveAlphaById` with
   * no extra wiring.
   */
  expandRevealById?: ReadonlyMap<string, number> | null;
  /**
   * Per-member depth from the realm root (root = 0). While a realm is entering or
   * active this drives depth clarity (alpha and size differentiation) and which
   * parallax band a node belongs to. Null means no depth treatment.
   */
  realmDepthById: ReadonlyMap<string, number> | null;
  /**
   * Depth parallax band offsets (world units). While a realm is active, camera
   * input pushes the RENDER coordinates of depth2 / depth3+ nodes by these — the
   * world coordinates never move. Null means no parallax (at rest, entering, or
   * reduced-motion). Hit testing applies the same offset.
   */
  realmDepthParallax: { depth2: { x: number; y: number }; depth3: { x: number; y: number } } | null;
  /** Radial dust parallax factor 0..1 at the moment of expansion (>0 only during the transition). */
  realmDustParallax: number;
  /**
   * Materialize alpha for outside nodes returning after being hard-culled during
   * a realm exit, computed by `realm-transition.ts#realmOutsideReturnAlpha`:
   * fully away = 0 (invisible) → home = 1 (full alpha). Multiplied into the node's
   * `effectiveAlphaById` entry, so it ramps both the node and — through
   * `edgeTierAlpha`'s min combination — every edge reaching it. This fixes the
   * defect where such a node popped in at full alpha the instant it crossed the
   * viewport cull boundary. Null while entering/active/idle.
   */
  realmOutsideReturnAlphaById: ReadonlyMap<string, number> | null;
  /**
   * Footprints — the **visit ordinals** (1-based) per node; a revisited node has
   * several. Built by `views/home/lib/footprint-trail.ts#buildFootprintSteps`.
   * The caller excludes the currently focused node so its footprint does not
   * double up with the selection ring. An empty map draws no footprints.
   */
  footprintStepsById: ReadonlyMap<string, readonly number[]>;
  /** Footprint appearance preference. Null draws nothing. */
  footprintPref?: FootprintPreference | null;
  /**
   * Keys of consecutively visited node pairs
   * (`model/footprint-steps.ts#buildWalkedEdgeKeys`). Beside-the-line footprints
   * are laid only on those pairs that are real edges. Null = no edge footprints.
   */
  walkedEdgeKeys?: ReadonlySet<string> | null;
  /** Footprint ink RGB — the caller reads it from `--color-footprint-trail` or the indigo token. */
  footprintInk?: FootprintInk;
  /** Ordinal text colour — one step brighter than the footprint ink; small glyphs need more contrast. */
  footprintStepColor?: string;
  /**
   * The node id of the most recent step, plus that step's appear progress [0,1].
   * Only this node's footprint animates; every other sits at 1 (settled) — one
   * input produces one event.
   */
  footprintNewestId?: string | null;
  footprintAppear?: number;
  /**
   * The trail lens — non-null **only** while the trail popover is open. The visited
   * nodes (including the current focus) replace the ego keep-set: they hold their
   * colour and label while every other node, cluster chip, label, and **edge —
   * ego-emphasised edges included** — retreats to the existing ego dim values.
   * No new tokens, no new motion, and deliberately no trail polyline, because in
   * this product a line means a relation.
   *
   * Not rebuilt per frame: the loop hands over a Set it refreshes only when
   * `visitedTrail` changes, so the 60fps loop allocates nothing.
   */
  trailLensIds?: ReadonlySet<string> | null;
  /**
   * The cosmos dust layer inside the warding circle (viewport space, parallaxed
   * from the camera origin). Drawn clipped to the warding circle, and only while a
   * realm is active (`wardingRing` present). Null draws nothing.
   */
  realmCosmosPoints: readonly DustPoint[] | null;
  /**
   * Recent-change spotlight (council design, 2026-07-23) — non-null turns the lens
   * ON: nodes **outside** this set (and edges without both endpoints inside it)
   * sink toward `tokens.spotlightRestAlpha` as `spotlightRamp` advances. Nodes
   * inside are NOT brightened here; the adapter already lights them by swapping the
   * fresh channel's key to an mtime window. The lens sinks, it does not shine.
   * Suspended while an ego or edge focus is active (attention layer order:
   * selection beats lens, never dim twice), and the hovered node is exempt.
   */
  spotlightIds: ReadonlySet<string> | null;
  mapLensKind: TopologyMapLensKind;
  pathEdgeIds: ReadonlySet<string> | null;
  /** Spotlight on/off index ramp 0..1 — loop steps via `stepFocusRamp` (reuses focusDimTau). */
  spotlightRamp: number;
  /** Spotlight dash phase — advanced only during the transition, then held fixed. */
  spotlightDashOffset: number;
  /**
   * Tier-visibility config for the developer / plain mode toggle; defaults to
   * `DEFAULT_TIER_REVEAL` (developer mode). In plain mode `HomePage` passes
   * `PLAIN_TIER_REVEAL` (elements always hidden). The draw must read the same
   * config as hit testing and pan clamping, or the three fall out of lockstep.
   */
  tierReveal?: TierRevealConfig;
  /**
   * Node body render style: `"fill"` (solid geometry, the default) or `"line"`
   * (stroke only). The kind → silhouette mapping is independent of this and never
   * changes. Reads the same store as the DOM glyphs so both surfaces swap together.
   */
  glyphStyle?: "fill" | "line";
  /**
   * Canvas background variant, forwarded to `gridDraw`: dots (the default
   * blueprint grid), constellation, or contour.
   */
  backgroundVariant?: CanvasBackgroundVariant;
  /** Callback that paints the animated background buffer — consumed only by the non-dot variants. See `render/grid.ts`. */
  paintAnimatedBackground?: ((ctx: CanvasRenderingContext2D, width: number, height: number) => void) | null;
  /** Patterns for the three depth-dot layers (consumed only when `variant === "depth"`). Their origins are computed here. */
  depthDotPatterns?: readonly (CanvasPattern | null)[];
  /**
   * Expand preference. This frame uses two of its fields: the expand affordance
   * (whether a chip draws as a pill, bar, or badge) and the label attempt count
   * (the label budget for an expanded disc).
   */
  expand?: ExpandPreference;
  /**
   * Translated bar copy. The canvas renderer never composes strings — the caller
   * translates and passes them in, exactly as the warding caption
   * (`wardingRing.caption`) already does.
   */
  clusterBarLabels?: ClusterBarLabels | null;
  /**
   * 3D projection frame (2026-08-18, opt-in) — ownership draws the Dome and
   * coupling draws the Cloud (`model/dome-view.ts`). This per-node transform map
   * (offset + perspective factor) is refreshed every frame. Nodes, labels, edges,
   * chips, hit testing, and `__atlasMap` all read **the same map**, so a click
   * follows the drawn position even mid-rotation. During a realm expansion the
   * loop rewinds the ramp to null, so realm depth is never encoded twice. Null is
   * pixel-identical to the 2D screen.
   */
  domeFrame?: ReadonlyMap<string, DomeNodeFrame> | null;
  /**
   * Overall progress 0..1 of the dome assembly — the interpolator for
   * presentation-layer switches such as extinguishing the background grid.
   * Per-node progress is carried by `domeFrame`'s `a`. 0 = the 2D presentation.
   */
  domeRamp?: number;
  /**
   * 3D — this frame's **latitude rings** (world coordinates + normalized depth).
   * Why the rings are needed: the `DOME_RING_KINDS` doc-block in
   * `model/dome-view.ts`. Null draws none.
   */
  domeRings?: readonly { a: number; points: readonly { wx: number; wy: number; u: number }[] }[] | null;
  /**
   * 3D — the **meridian control point** for one edge (world 2D). Why an edge must
   * bow rather than run straight: the `DOME_EDGE_BOW` doc-block in
   * `model/dome-view.ts`. Returning null leaves that edge on its 2D control point.
   */
  domeControlFor?:
    | ((sourceId: string, targetId: string, kind: "contains" | "depends") => { wx: number; wy: number } | null)
    | null;
  /**
   * Strength 0..1 of the trail lens — an on/off exponential ramp stepped by the loop.
   *
   * Not a boolean: the trail colour hard-cutting in and out reads as decoration
   * jumping out at you. The two earlier lenses (agent-focus ring, recent-change
   * spotlight) already established ramping. Omitted falls back to 0/1 by whether
   * `trailLensIds` is set.
   */
  trailLensRamp?: number;
}

/** The full per-frame paint, in the prototype's `render()` order (§13): background -> dust -> edges (contains, depends) -> nodes (+ bright-star spikes) -> labels. */
export function drawTopologyFrame(params: FrameDrawParams): void {
  const {
    ctx,
    world,
    camera,
    farT,
    zoomRatio,
    now,
    viewportWidth,
    viewportHeight,
    gridPattern,
    dustPoints,
    tokens,
    focusedNodeId,
    hoveredNodeId,
    emphasizedNeighborId,
    hoveredEdge,
    selectedEdge,
    previewEdge,
    emphasisById,
    egoRevealById,
    focusRampById,
    appearById,
    bornNodeIds,
    chipRevealById,
    batchAppearById,
    labelPresentById,
    colorFocusedNodeId,
    colorSelectedEdge,
    reducedMotion,
    pulses,
    selectionPulse,
    agentFocusNodeId,
    clusteredIds,
    clusterChips,
    hoveredClusterId,
    wardingRing,
    realmTierKinds,
    expandRevealById,
    realmDepthById,
    realmDepthParallax,
    realmDustParallax,
    realmOutsideReturnAlphaById,
    realmCosmosPoints,
    footprintStepsById,
    footprintPref = null,
    walkedEdgeKeys = null,
    footprintInk = [232, 196, 122],
    footprintStepColor = "#e8c47a",
    footprintNewestId = null,
    footprintAppear = 1,
    trailLensIds = null,
    spotlightIds,
    mapLensKind,
    pathEdgeIds,
    spotlightRamp,
    spotlightDashOffset,
    tierReveal = DEFAULT_TIER_REVEAL,
    glyphStyle = "fill",
    backgroundVariant = "dot",
    paintAnimatedBackground = null,
    depthDotPatterns,
    expand = DEFAULT_EXPAND,
    clusterBarLabels = null,
    domeFrame = null,
    domeRamp = 0,
    domeRings = null,
    domeControlFor = null,
    trailLensRamp,
  } = params;

  // Spotlight sink multiplier — live only while the lens is on, the ramp is
  // advancing, and no node/edge focus is active (selection outranks lens). Applied
  // to everything with `inSpotlight === false`.
  const spotlightLensActive =
    spotlightIds !== null && spotlightRamp > 0.001 && colorFocusedNodeId === null && colorSelectedEdge === null;
  const pathLensActive = spotlightLensActive && mapLensKind === "path";
  const recentSpotlightActive = spotlightLensActive && mapLensKind === "recent";
  const spotlightSink = (inSpotlight: boolean): number =>
    spotlightLensActive && !inSpotlight ? 1 - spotlightRamp * (1 - tokens.spotlightRestAlpha) : 1;

  // Trail lens — active only while the trail popover is open. It swaps the ego
  // keep-set from "1-hop neighbours" to "visited nodes" (see `lensNodeEgoState`
  // below) and sinks every edge to dim. It reuses the existing dim values, adding
  // no token and no ramp, so on/off stays within the 200ms contract and closing
  // the popover restores the ego emphasis exactly.
  const trailLensKeepIds = trailLensIds !== null && trailLensIds.size > 0 ? trailLensIds : null;
  const trailLensActive = trailLensKeepIds !== null;
  /**
   * The lens's **strength** — at 0 there is no trail ink at all.
   *
   * On/off (does the set exist) is kept separate from strength (the ramp) because
   * emptying the set the instant the popover closes would hard-cut the colour
   * away. The loop keeps passing the set until the ramp reaches 0; only this value
   * falls.
   */
  const trailRamp = trailLensActive
    ? Math.min(1, Math.max(0, trailLensRamp ?? 1))
    : 0;
  const isTrailKept = (nodeId: string): boolean => trailLensKeepIds !== null && trailLensKeepIds.has(nodeId);
  /** Lens on: classify against the visited keep-set. Lens off: the usual ego/pair classification. */
  const lensNodeEgoState = (nodeId: string, focusId: string | null, neighbors: ReadonlySet<string>, pair: EdgePairFocus | null): NodeEgoState =>
    trailLensKeepIds !== null
      ? resolveTrailLensNodeEgoState(nodeId, focusId, trailLensKeepIds)
      : resolveNodeEgoStateWithPair(nodeId, focusId, neighbors, pair);

  // Realm depth treatment — one place computes a node's render offset (world
  // units, parallax) and its depth clarity multiplier so the whole draw agrees.
  // Outside the realm (absent from `realmDepthById`) or depth ≤ 1 yields offset 0
  // and multiplier 1, i.e. no effect.
  const realmDepthOf = (nodeId: string): number | undefined => realmDepthById?.get(nodeId);
  const realmParallaxOffsetFor = (nodeId: string): { x: number; y: number } => {
    if (!realmDepthParallax || !realmDepthById) return ZERO_PARALLAX;
    return depthParallaxOffsetFor(realmDepthById.get(nodeId), realmDepthParallax.depth2, realmDepthParallax.depth3);
  };

  // 3D view — at ramp 0 the loop passes null, so this frame takes the 2D path.
  const domeOn = domeFrame !== null && domeFrame !== undefined && domeFrame.size > 0;
  /**
   * One node's 3D transform (world offset + perspective factor). Nodes, labels,
   * edge endpoints, and chip anchors all pass through this map, so every mark on a
   * frame shares **one pose** — and hit testing (`renderOffsetForNode`) and the
   * instrument read the same map.
   */
  const domeFrameFor = (nodeId: string): DomeNodeFrame =>
    (domeOn ? domeFrame.get(nodeId) : undefined) ?? ZERO_DOME_FRAME;
  // perf 2026-08-19 — look each node's frame up once, keyed by original index;
  // the alpha loop, node sort, node draw, and label pass all read this array
  // afterwards (see the `domeNodeFrameReused` doc-block). Same objects as
  // `domeFrameFor` returns.
  if (domeOn) {
    domeNodeFrameReused.length = 0;
    for (let i = 0; i < world.nodes.length; i += 1) {
      domeNodeFrameReused.push(domeFrame.get(world.nodes[i].id) ?? ZERO_DOME_FRAME);
    }
  }

  const nodeFrameAt = (index: number): DomeNodeFrame => (domeOn ? domeNodeFrameReused[index] : ZERO_DOME_FRAME);

  // Where world (0,0) currently lands on screen — the blueprint grid rides
  // this so the background belongs to the world, not the display (B3).
  const gridOrigin = worldToScreen(camera, viewportWidth, viewportHeight, 0, 0);
  // Footprint size factor — shrinks with the camera so footprints never blanket
  // the graph when zoomed out.
  const footprintScale = footprintScaleFor(camera.scale.value);
  // Label zoom factor — computed once per frame, shared by every label.
  const labelScale = labelZoomScale(camera.scale.value);

  // Only the constellation background drifts on a **far layer**. Council
  // 2026-07-28, owner: "make it look inertial, like space" (it should carry inertia, like
  // space). Grid and contour are ground, so they stay at factor 1, welded to the
  // world. Zero autonomous motion: purely a function of the camera origin, so when
  // the camera stops the background stops. The whole decision lives in one pure
  // function in `model/background-parallax.ts`, leaving only the line that hands
  // its result to `gridDraw` untested here.
  const bgOrigin = resolveBackgroundOrigin(
    gridOrigin,
    { width: viewportWidth, height: viewportHeight },
    backgroundVariant,
    tokens.canvasBgParallax,
    reducedMotion,
  );

  gridDraw(
    ctx,
    {
      viewportWidth,
      viewportHeight,
      // 3D — the background grid and dots recede into **void**: with a grid
      // present the object reads as resting on a floor rather than floating. The
      // base fill and vignette stay; the pattern layers fold away **on the
      // assembly ramp** (2026-09-02 recording: they used to cut in one frame
      // while the tiers took 1,120 ms to rise — the background hard-cutting
      // under an easing protagonist is the defect the motion rules name). The
      // grid already fades with altitude, so the ramp rides the same `farT`.
      farT: Math.max(farT, domeRamp),
      variant: backgroundVariant,
      gridPattern,
      paintAnimated: domeRamp > 0.001 ? null : paintAnimatedBackground,
      // Each layer derives its parallax origin from the **grid** origin, not the
      // background origin — the latter is already parallaxed once, and applying it
      // twice collapses the layers together.
      depthLayersAlpha: 1 - domeRamp,
      depthLayers:
        depthDotPatterns && domeRamp < 0.999
          ? DEPTH_DOT_LAYERS.map((layer, i) => {
              const o = backgroundParallaxOrigin(gridOrigin, { width: viewportWidth, height: viewportHeight },
                reducedMotion ? 1 : layer.parallax);
              return { pattern: depthDotPatterns[i] ?? null, originX: o.x, originY: o.y, spacing: layer.spacing };
            })
          : undefined,
      originX: bgOrigin.x,
      originY: bgOrigin.y,
    },
    {
      canvasBgNear: tokens.canvasBgNear,
      canvasBgFar: tokens.canvasBgFar,
      vignetteBaseAlpha: tokens.vignetteBaseAlpha,
      vignetteFarAlpha: tokens.vignetteFarAlpha,
    },
  );
  // devicePixelRatio: 1 — ctx is already DPR-transformed once by the caller
  // (`use-topology-loop.ts`), so dust points (already in CSS-pixel space)
  // must not be scaled a second time.
  drawStarDust(ctx, { points: dustPoints, farT, devicePixelRatio: 1, originX: gridOrigin.x, originY: gridOrigin.y, radialParallax: realmDustParallax });

  // While a realm is active, the space **inside** the warding circle becomes
  // cosmos; outside it is clipped away. Independent of `farT` (a realm sits at
  // circuit altitude, where dust is off). Fully still when the camera is still.
  if (wardingRing !== null && realmCosmosPoints !== null && realmCosmosPoints.length > 0) {
    const wc = worldToScreen(camera, viewportWidth, viewportHeight, wardingRing.centerX, wardingRing.centerY);
    drawRealmCosmos(ctx, {
      points: realmCosmosPoints,
      originX: gridOrigin.x,
      originY: gridOrigin.y,
      clip: { cx: wc.x, cy: wc.y, radius: wardingRing.radius * camera.scale.value },
      devicePixelRatio: 1,
      radialParallax: realmDustParallax,
      reducedMotion,
    });
  }

  const project = (x: number, y: number) => worldToScreen(camera, viewportWidth, viewportHeight, x, y);
  // perf 2026-08-19 — the hot passes (edges, nodes, labels) inline **the same
  // formula** `worldToScreen` uses: `(w - cam) * scale + viewport/2`. This removes
  // a call plus a returned object (thousands per frame) and leaves the coordinates
  // identical. The draw is synchronous, so the camera cannot change mid-frame.
  const camX = camera.x.value;
  const camY = camera.y.value;
  const camScale = camera.scale.value;
  const halfW = viewportWidth / 2;
  const halfH = viewportHeight / 2;
  /**
   * Screen projection of an edge's endpoints and control point. In 3D each
   * endpoint follows **its own end node's kind-depth offset**, so it sits on the
   * same layer as that node's disc, and the control point averages the two offsets
   * so the curve bridges the layers. With 3D off the offsets are 0. The edge draw
   * and the hover pulses share this function.
   *
   * perf 2026-08-19 — the return value is the reused `edgePointsScratch` object,
   * consumed before the next call. The edge draw loop passes the endpoint frames it
   * already fetched during depth sorting as `offA`/`offB`, removing the map
   * re-lookup; the pulse resolver omits them and looks them up itself.
   */
  const projectEdgePoints = (
    edge: {
      sourceId: string;
      targetId: string;
      kind: "contains" | "depends";
      ax: number;
      ay: number;
      bx: number;
      by: number;
      controlX: number;
      controlY: number;
    },
    knownOffA?: DomeNodeFrame,
    knownOffB?: DomeNodeFrame,
  ): { a: { x: number; y: number }; b: { x: number; y: number }; control: { x: number; y: number } } => {
    const out = edgePointsScratch;
    if (!domeOn) {
      out.a.x = (edge.ax - camX) * camScale + halfW;
      out.a.y = (edge.ay - camY) * camScale + halfH;
      out.b.x = (edge.bx - camX) * camScale + halfW;
      out.b.y = (edge.by - camY) * camScale + halfH;
      out.control.x = (edge.controlX - camX) * camScale + halfW;
      out.control.y = (edge.controlY - camY) * camScale + halfH;
      return out;
    }
    const offA = knownOffA ?? domeFrameFor(edge.sourceId);
    const offB = knownOffB ?? domeFrameFor(edge.targetId);
    /*
     * On the dome the control point is the **meridian** control point, not the
     * average of the two endpoint offsets (`DOME_EDGE_BOW` in
     * `model/dome-view.ts`). The average is a chord, so the line cuts through the
     * inside of the dome and the silhouette reads as a tent, not a dome.
     *
     * The assembly ramp (`aMin`) crosses from the 2D control point to the meridian
     * one: over the 700ms of switching 3D on the curvature must stay continuous,
     * or the line visibly snaps into its bow.
     */
    const flatControlX = edge.controlX + (offA.dx + offB.dx) / 2;
    const flatControlY = edge.controlY + (offA.dy + offB.dy) / 2;
    const meridian = domeControlFor === null ? null : domeControlFor(edge.sourceId, edge.targetId, edge.kind);
    const aMin = Math.min(offA.a, offB.a);
    const controlX = meridian === null ? flatControlX : flatControlX + (meridian.wx - flatControlX) * aMin;
    const controlY = meridian === null ? flatControlY : flatControlY + (meridian.wy - flatControlY) * aMin;
    out.a.x = (edge.ax + offA.dx - camX) * camScale + halfW;
    out.a.y = (edge.ay + offA.dy - camY) * camScale + halfH;
    out.b.x = (edge.bx + offB.dx - camX) * camScale + halfW;
    out.b.y = (edge.by + offB.dy - camY) * camScale + halfH;
    out.control.x = (controlX - camX) * camScale + halfW;
    out.control.y = (controlY - camY) * camScale + halfH;
    return out;
  };
  const neighborsOfFocusedRaw = focusedNodeId ? world.neighborMap.get(focusedNodeId) ?? EMPTY_NEIGHBOR_SET : EMPTY_NEIGHBOR_SET;
  /*
   * Dome ancestry (2026-08-23, `docs/DECISIONS.md` (107)). In the dome, height IS the containment
   * tier, so a selection's clearest "where am I" is the meridian to the apex. The chain joins the
   * **existing ego grammar** rather than getting its own: ancestors enter the neighbour set (they
   * stay lit and labelled like neighbours), and below, the chain's edges take the same "ego"
   * state a focused relation edge takes. No new ink, alpha, or token — the family line lights the
   * way the neighbourhood already lights. 2D is untouched: the flat map's ego stays 1-hop.
   */
  const parentOf = (id: string) => world.nodeById.get(id)?.parentId;
  const domeAncestryOn =
    domeOn && focusedNodeId !== null &&
    collectDomeAncestry(focusedNodeId, parentOf, domeAncestryNodesReused, domeAncestryEdgesReused) > 0;
  let neighborsOfFocused: ReadonlySet<string> = neighborsOfFocusedRaw;
  if (domeAncestryOn) {
    domeAncestryUnionReused.clear();
    for (const id of neighborsOfFocusedRaw) domeAncestryUnionReused.add(id);
    for (const id of domeAncestryNodesReused) domeAncestryUnionReused.add(id);
    neighborsOfFocused = domeAncestryUnionReused;
  }
  // Click-focus color signature — the ego classification for the COLOR ramp
  // uses the RETAINED focus (`colorFocusedNodeId`/`colorSelectedEdge`), which
  // equals the live focus while a selection is active and lingers ~160ms after
  // a deselect so the fade-out has a dim/ego target to ease from. Everything
  // else on this frame still keys off the live `focusedNodeId` — no retention
  // bleed into labels, tier reveal, or camera.
  const colorNeighborsRaw = colorFocusedNodeId
    ? world.neighborMap.get(colorFocusedNodeId) ?? EMPTY_NEIGHBOR_SET
    : EMPTY_NEIGHBOR_SET;
  let colorNeighbors: ReadonlySet<string> = colorNeighborsRaw;
  if (
    domeOn &&
    colorFocusedNodeId !== null &&
    // The retained colour signature gets the same ancestry, so a deselect fades the chain out
    // through the normal ego fade instead of snapping it to dim one ramp early.
    collectDomeAncestry(
      colorFocusedNodeId,
      parentOf,
      domeAncestryColorNodesReused,
      domeAncestryColorEdgesReused,
    ) > 0
  ) {
    domeAncestryColorUnionReused.clear();
    for (const id of colorNeighborsRaw) domeAncestryColorUnionReused.add(id);
    for (const id of domeAncestryColorNodesReused) domeAncestryColorUnionReused.add(id);
    colorNeighbors = domeAncestryColorUnionReused;
  }
  // perf 2026-08-19 — on a frame with no focus, pair, or lens (the usual rotating
  // or idle state) every node's ego classification is fixed at "normal"
  // (`resolveNodeEgoState`'s first branch). Deciding that once keeps the node and
  // label loops from re-calling the classifier per node — same values, same pixels.
  const egoAllNormal = focusedNodeId === null && selectedEdge === null && trailLensKeepIds === null;
  const colorAllNormal = colorFocusedNodeId === null && colorSelectedEdge === null && trailLensKeepIds === null;
  // perf 2026-08-19 — invalidate the focus-free `NodeVisual` cache when tokens or
  // the motion preference change.
  if (nodeVisualCacheTokens !== tokens || nodeVisualCacheReducedMotion !== reducedMotion) {
    nodeVisualCache.fill(undefined);
    nodeVisualCacheTokens = tokens;
    nodeVisualCacheReducedMotion = reducedMotion;
  }
  // perf 2026-08-19 — one token argument object per frame; it is frame-invariant.
  const traceTokensFrame = {
    edgeContains: tokens.edgeContains,
    edgeContainsL0: tokens.edgeContainsL0,
    edgeContainsL2: tokens.edgeContainsL2,
    edgeDepends: tokens.edgeDepends,
    edgeDim: tokens.edgeDim,
    indigo: tokens.indigo,
    indigoBright: tokens.indigoBright,
    edgeSelected: tokens.edgeSelected,
    // Trail ink is not a token but **the exact colour the footprints use** — the
    // user's yellow/indigo choice has to reach the footprints and the lines at
    // once, or the two stop reading as two notations of one fact.
    edgeTrail: footprintStepColor,
  };
  const nodeShapeTokensFrame = {
    amberHub: tokens.amberHub,
    recentChange: tokens.recentChange,
    numeralShadow: tokens.numeralShadow,
    numeralFace: tokens.numeralFace,
    holeFill: tokens.nodeHoleFill,
    projectHairlineInner: tokens.projectHairlineInner,
    projectPinTick: tokens.projectPinTick,
    selectionIndigo: tokens.selectionRingIndigo,
    selectionHairline: tokens.selectionRingHairline,
    neighborRing: tokens.edgeSelected,
    hoverRing: tokens.hoverRing,
    hoverShimmerSeg: tokens.hoverShimmerSeg,
    hoverShimmerPeriodMs: tokens.hoverShimmerPeriodMs,
    hoverShimmerColor: tokens.indigoBright,
  };

  // Semantic-zoom tier gating (`model/tier-visibility.ts`): at the overview
  // entry only project + domain + hub draw; capabilities/elements (and any edge
  // touching a hidden one) fade in as you zoom IN. Driven by `zoomRatio`, NOT
  // `farT`, so the default circuit expression (farT ≈ 0) still shows only the
  // spine. Precomputed once per frame so nodes/edges/labels agree.
  //
  // C1 A2 — focus ego tier exemption: a node the tier gate would otherwise hide
  // (e.g. a capability at overview zoom) still becomes visible once it's the
  // focused node or a 1-hop neighbor, via `effectiveNodeAlpha` (max of the
  // gate's own alpha and the ego-reveal ramp). `effectiveAlphaById` is what
  // edges/nodes/labels actually draw with; the raw gate value (`tierAlpha`,
  // still `effectiveNodeAlpha`'s first argument) stays a loop local — the old
  // `tierAlphaById` map had no reader left, so its per-node `.set` was a dead
  // store removed in the 2026-08-19 perf pass.
  // perf sweep 2026-07 — reused across frames (`.clear()` instead of `new
  // Map()`) to cut two allocations + hashtable growth per frame off the
  // paint hot path. Safe because `drawTopologyFrame` only ever runs
  // synchronously from the single active rAF loop (`use-topology-loop.ts`) —
  // there is no concurrent/re-entrant call that could see stale entries from
  // a previous frame between the `.clear()` below and this frame's own fill.
  effectiveAlphaByIdReused.clear();
  const effectiveAlphaById = effectiveAlphaByIdReused;
  for (let nodeIndex = 0; nodeIndex < world.nodes.length; nodeIndex += 1) {
    const node = world.nodes[nodeIndex];
    const previewEndpoint = isPreviewEndpoint(previewEdge, node.id);
    // **A collapsed node has no reason to carry an alpha** — one chip stands in
    // for it and it is not drawn this frame (measured at synth=3000: 2,820 of
    // 3,000). All four consumers filter collapse *before* this lookup: both edge
    // loops `continue` when either endpoint is collapsed, the node and label loops
    // guard on the same first line, and hit testing (`isNodeHittable`) returns
    // false on collapse before it reads the alpha map. A chip's parent is by
    // definition not collapsed, and even it falls back to `?? 1`.
    if (isPreviewEndpointHidden(clusteredIds.has(node.id), previewEdge, node.id)) continue;
    const tierKind = realmTierKinds?.get(node.id) ?? node.kind;
    const tierAlpha = nodeTierAlpha(tierKind, node.isHub, zoomRatio, tierReveal);
    const isPairMember =
      focusedNodeId === null &&
      selectedEdge !== null &&
      (node.id === selectedEdge.sourceId || node.id === selectedEdge.targetId);
    // Trail lens — visited nodes ride the same tier-piercing channel as ego
    // members, so a node visited and then zoomed past its tier still stands while
    // the lens is on. The same piercing reaches hit testing, so it stays clickable.
    const trailKept = isTrailKept(node.id);
    const isEgoMember =
      isPairMember ||
      trailKept ||
      previewEndpoint ||
      (focusedNodeId !== null && (node.id === focusedNodeId || neighborsOfFocused.has(node.id)));
    // Spotlight tier-piercing reveal. Owner: "grasp it directly from the node you are
    // looking at" (you should grasp it straight from the node you are looking at). A
    // changed node hidden below the zoom tier (an element, say) stays invisible
    // even with the lens on, so the spotlight ramp joins the same tier-exemption
    // reveal channel ego neighbours use: while the lens is on, changed nodes rise
    // regardless of zoom, and sink again as the ramp decays when it is turned off.
    const spotlightReveal =
      spotlightLensActive && spotlightIds !== null && spotlightIds.has(node.id) ? spotlightRamp : 0;
    // **The fifth tier-piercing channel — chip expansion** (2026-07-31). The other
    // four (edge selection · footprints · ego · spotlight) pierced the tier
    // condition; chip expansion only removed children from `clusteredIds`, and held
    // no privilege at the next checkpoint, the zoom tier condition.
    //
    // So a `+43 more` chip claimed "24 are visible now" while **1 was drawn**
    // (measured frame by frame by the motion seat): at overview magnification an
    // element child has alpha 0 until zoomRatio 2.5, so pressing the chip revealed
    // nothing until the zoom was raised that far — a dead end, not a wait.
    // Pressing a chip is an explicit "show me this", the same class of request as
    // an ego click, so this is the **missing fifth**, not a new concept.
    const chipExpandReveal = expandRevealById?.get(node.id) ?? 0;
    // A just-born node reuses its appear ramp as the exemption channel — not a new
    // concept, just letting an existing ramp reach where it could not (see
    // `bornNodeIds` above).
    const bornReveal = bornNodeIds?.has(node.id)
      ? Math.min(1, Math.max(0, appearById?.get(node.id) ?? 1))
      : 0;
    const baseAlpha = effectiveNodeAlpha(
      tierAlpha,
      isEgoMember || chipExpandReveal > 0 || bornReveal > 0,
      Math.max(
        isPairMember || trailKept ? 1 : (egoRevealById.get(node.id) ?? 0),
        spotlightReveal,
        chipExpandReveal,
        bornReveal,
        previewEndpoint ? previewEdge?.alpha ?? 1 : 0,
      ),
    );
    // An outside node returning during a realm exit is held back by this ramp.
    // Edges reaching it follow automatically on the same frame through
    // `edgeTierAlpha`'s min combination — one node alpha suffices, no separate
    // edge path.
    const returnAlpha = realmOutsideReturnAlphaById?.get(node.id);
    let outAlpha = returnAlpha !== undefined ? baseAlpha * returnAlpha : baseAlpha;
    // 3D — on the dome **every tier takes part in the form**: capabilities and
    // elements the semantic-zoom condition hides still rise on their tier's
    // assembly ramp. At ramp 0 the value is unchanged (2D), at ramp 1 fully
    // revealed. Depth darkening is NOT applied here but carried by the node/edge
    // fog: this map is the single source for hit testing, and mixing fog in would
    // make distant nodes unclickable.
    if (domeOn) {
      const domeA = domeNodeFrameReused[nodeIndex].a;
      if (domeA > 0) outAlpha = outAlpha + (1 - outAlpha) * domeA;
    }
    effectiveAlphaById.set(node.id, outAlpha);
  }

  // Expanded parents (which carry the dashed aura) and their discs (the parent
  // plus the transitive closure of its `contains` descendants). The background dim
  // must only hit nodes unrelated to the expansion, so disc members are collected
  // up front. Both stay empty when nothing is expanded. Ego (`neighbours +N`) chips
  // are excluded. Computed **before** the edge draw because the edge loop's
  // `depends` suppression also reads `anyExpanded`.
  const expandedParentIds = new Set<string>();
  const expandedDiscIds = new Set<string>();
  // The children a chip press **directly** revealed. Owner, from a live report:
  // "When I pressed +, I couldn't tell what was selected" (after pressing +, I can't
  // tell what got selected). A node click reads instantly through the ego dim plus
  // a solid indigo ring, but a chip expansion just made children appear with no
  // membership marking, so the user could not see the result of their own action.
  // Marks **direct children only**, not the transitive closure
  // (`expandedDiscIds`) — grandchildren are a separate cohort opened by their own
  // chip.
  const expandedChildIds = new Set<string>();
  for (const chip of clusterChips) {
    if (!chip.expanded || chip.ego) continue;
    expandedParentIds.add(chip.parentId);
    for (const childId of world.childrenByParent.get(chip.parentId) ?? []) {
      expandedChildIds.add(childId);
    }
    const stack = [chip.parentId];
    while (stack.length > 0) {
      const id = stack.pop() as string;
      if (expandedDiscIds.has(id)) continue;
      expandedDiscIds.add(id);
      const children = world.childrenByParent.get(id);
      if (children) stack.push(...children);
    }
  }
  const anyExpanded = expandedParentIds.size > 0;

  // Comet cap for the `contains` edges incident to the focused node. Exactly the
  // deterministic logic `topology-physics-step.ts` uses to decide whether to
  // advance a phase (incident `contains` edges → the top 24 by seed order), so
  // both produce the same Set on the same frame with no shared state — computing
  // the draw-side condition separately cannot drift.
  const egoContainsComets =
    focusedNodeId === null
      ? EMPTY_EGO_CONTAINS_COMETS
      : selectEgoContainsComets(
          world.edges.filter(
            (edge) => edge.kind === "contains" && (edge.sourceId === focusedNodeId || edge.targetId === focusedNodeId),
          ),
        );

  // Always-on ambient `depends` comet cap — applies the limit of 24 its sibling
  // branch (`contains`) already had to the branch that was missing one. **This
  // does not re-reverse #512** (the owner's restoration of the ambient comets):
  // comets still flow permanently, regardless of focus, at the same speed. What it
  // caps, with the same deterministic ranking the sibling uses, is the previously
  // unbounded number of points flowing at once when the element tier fills the
  // screen with `depends`.
  //
  // The input is "the `depends` edges this frame will actually draw" — only edges
  // that passed the same two conditions as the draw loop (density, tier alpha) may
  // take a cap slot, so an invisible edge can never hold a slot while a visible
  // one loses its comet.
  // perf 2026-08-19 — compute each edge's alpha once, keyed by original index
  // (see the `edgeAlphaReused` doc-block). The ambient comet filter below and the
  // edge draw loop read the same value; predicates and values are unchanged, so
  // the results are too.
  edgeAlphaReused.length = 0;
  for (let i = 0; i < world.edges.length; i += 1) {
    const edge = world.edges[i];
    edgeAlphaReused.push(
      clusteredIds.has(edge.sourceId) || clusteredIds.has(edge.targetId)
        ? -1
        : edgeTierAlpha(effectiveAlphaById.get(edge.sourceId) ?? 1, effectiveAlphaById.get(edge.targetId) ?? 1),
    );
  }
  // Replaces the array `filter` allocated every frame — same elements, same order.
  ambientDependsInputReused.length = 0;
  for (let i = 0; i < world.edges.length; i += 1) {
    const edge = world.edges[i];
    if (edge.kind === "depends" && edgeAlphaReused[i] > 0.02) {
      ambientDependsInputReused.push(edge);
    }
  }
  const ambientDependsComets = selectAmbientDependsComets(ambientDependsInputReused);

  /*
   * ── 3D painter's ordering + depth halos ──────────────────────────────
   *
   * In 2D edges may be drawn in array order — overlap has no front and back. On
   * the dome that becomes a defect: when a line joining a far ring is drawn **over**
   * a line on a near ring, the depth cue flips at random every frame (fog lowers
   * colour, it does not occlude).
   *
   * So edges do what nodes already do (`nodeDrawOrder`): **farthest first**. The
   * sort happens **inside** each kind pass — the ink hierarchy of `contains` below
   * and `depends` above is a convention that outranks depth, and it stays.
   *
   * Sorting alone does not make depth actually occlude; the halo does
   * (the `domeHaloPx` doc-block in `model/dome-view.ts` — Everts et al. 2009). The
   * halo colour is derived by **the same formula** the grid paints its ground
   * with: if the values diverge, the cut leaves a band lighter or darker than the
   * background.
   */
  const domeHaloColor = domeOn ? lerpColorHex(tokens.canvasBgNear, tokens.canvasBgFar, farT) : "";
  /*
   * Depth sort — **never measure depth inside the comparator** (measured 2026-08-19).
   *
   * The old comparator called `domeFrameFor` twice per invocation. Comparisons
   * happen O(n log n) times, so at 1,914 edges (synth=2000 in 3D) that was about
   * 42,000 map lookups per frame, 2.5M per second at 60fps. That is what showed up
   * as `domeFrameFor` alone taking **7.2%** self time in the 3D idle CPU profile.
   *
   * Depth is now measured once per edge (2n lookups) and the sort runs over an
   * index array, so the comparator does two array reads. Indices go in ascending
   * and V8's sort is stable, so **the resulting order is identical, position for
   * position**.
   */
  let edgeDrawOrder: readonly WorldEdge[] = world.edges;
  if (domeOn) {
    const edges = world.edges;
    domeEdgeDepthReused.length = 0;
    domeEdgeIndexReused.length = 0;
    // perf 2026-08-19 — endpoint frames are fetched once here too, keyed by
    // original index. The draw loop's fog computation and `projectEdgePoints` read
    // these two arrays instead of re-fetching — same objects, same values, same
    // pixels.
    domeEdgeFrameAReused.length = 0;
    domeEdgeFrameBReused.length = 0;
    for (let i = 0; i < edges.length; i += 1) {
      const edge = edges[i];
      const fA = domeFrameFor(edge.sourceId);
      const fB = domeFrameFor(edge.targetId);
      domeEdgeFrameAReused.push(fA);
      domeEdgeFrameBReused.push(fB);
      domeEdgeDepthReused.push((fA.u + fB.u) / 2);
      domeEdgeIndexReused.push(i);
    }
    domeEdgeIndexReused.sort((x, y) => domeEdgeDepthReused[y] - domeEdgeDepthReused[x]);
    domeEdgeOrderReused.length = 0;
    for (let i = 0; i < domeEdgeIndexReused.length; i += 1) domeEdgeOrderReused.push(edges[domeEdgeIndexReused[i]]);
    edgeDrawOrder = domeEdgeOrderReused;
  }

  /*
   * ── Latitude rings — lay the stage first ──────────────────────────────
   *
   * Drawn **before** the relation lines. A ring is a coordinate system, not data;
   * above the actors it would start pretending to be data — the same reason the
   * background dot grid is never drawn over nodes. In 3D that grid has receded into
   * void (`gridPattern: null` above) and the rings take its place, because the
   * floor of a 3D scene is a sphere, so its coordinate system must be spherical.
   */
  if (domeOn && domeRings !== null && domeRings.length > 0) {
    domeRingsDraw(
      ctx,
      {
        // Ring projection writes into the scratch in place, rather than
        // allocating 288 objects per frame (see the buffer doc-block above).
        rings: (() => {
          for (let i = 0; i < domeRings.length; i += 1) {
            const ring = domeRings[i];
            let out = domeRingScreenReused[i];
            if (!out) {
              out = { a: 0, points: [] };
              domeRingScreenReused[i] = out;
            }
            out.a = ring.a;
            for (let k = 0; k < ring.points.length; k += 1) {
              const point = ring.points[k];
              const screen = project(point.wx, point.wy);
              const slot = out.points[k];
              if (slot) {
                slot.x = screen.x;
                slot.y = screen.y;
                slot.u = point.u;
              } else {
                out.points[k] = { x: screen.x, y: screen.y, u: point.u };
              }
            }
            out.points.length = ring.points.length;
          }
          domeRingScreenReused.length = domeRings.length;
          return domeRingScreenReused;
        })(),
        baseAlpha: DOME_RING_ALPHA,
        baseWidthPx: DOME_RING_WIDTH_PX,
        // The **same fog ramp** the nodes and edges use: if the coordinate system
        // fogged differently from the data, two things at one depth would render at
        // different brightness and the depth cues would contradict each other.
        fog: domeFogAlpha,
        widthFactor: domeLineWidthFactor,
      },
      { stroke: tokens.domeRing },
    );
  }

  for (const kind of EDGE_KIND_PASSES) {
    for (let drawPos = 0; drawPos < edgeDrawOrder.length; drawPos += 1) {
      const edge = edgeDrawOrder[drawPos];
      if (edge.kind !== kind) continue;
      // perf 2026-08-19 — read the precomputed alpha by original index (in dome
      // mode dereference the sort index; in 2D they coincide). -1 = collapsed by
      // the density condition, ≤0.02 = rejected by tier — both skip, as before.
      const edgeOrigIndex = domeOn ? domeEdgeIndexReused[drawPos] : drawPos;
      const edgeAlpha = edgeAlphaReused[edgeOrigIndex];
      if (edgeAlpha <= 0.02) continue;
      // Endpoint frames come back by original index from the depth-sort pass.
      const edgeFrameA = domeOn ? domeEdgeFrameAReused[edgeOrigIndex] : ZERO_DOME_FRAME;
      const edgeFrameB = domeOn ? domeEdgeFrameBReused[edgeOrigIndex] : ZERO_DOME_FRAME;
      const { a, b, control } = projectEdgePoints(edge, edgeFrameA, edgeFrameB);
      // 3D — depth fog and hairline attenuation. Anything that must be read
      // (hover, selection, ego) is exempted below and brightens back up.
      let domeEdgeFog = 1;
      let domeWidthScale = 1;
      // Halo half-width (screen px), cross-faded on the assembly ramp so no stroke
      // pops into existence during the 2D↔3D transition. Its alpha is set below,
      // once this edge's final alpha is known.
      let domeHaloWidthPx = 0;
      // Far-side detail ramp (`domeDetailFactor` doc-block) — folds the halo away
      // continuously with depth across the back hemisphere. Same cross-fade grammar
      // as the assembly ramp (2D = 1).
      let domeEdgeDetail = 1;
      if (domeOn) {
        const aMin = Math.min(edgeFrameA.a, edgeFrameB.a);
        if (aMin > 0) {
          const uAvg = (edgeFrameA.u + edgeFrameB.u) / 2;
          domeEdgeFog = 1 + (domeFogAlpha(uAvg) - 1) * aMin;
          domeWidthScale = 1 + (domeLineWidthFactor(uAvg) - 1) * aMin;
          domeHaloWidthPx = domeHaloPx(uAvg) * aMin;
          domeEdgeDetail = 1 + (domeDetailFactor(uAvg) - 1) * aMin;
        }
      }
      // Off-screen geometry still cost a full curve + up to 3 comet arcs each
      // before this guard. Hull-based, so it only ever drops strokes that
      // could not have landed on canvas (see `render/viewport-cull.ts`).
      if (isEdgeCulled(a, b, control, EDGE_CULL_MARGIN_PX, viewportWidth, viewportHeight)) continue;
      // A pass-through edge with neither endpoint on screen gets its ink lowered,
      // which is what untangles the hairball.
      const passthrough = isPassthroughEdge(a, b, 24, viewportWidth, viewportHeight);
      const touches = focusedNodeId !== null && (edge.sourceId === focusedNodeId || edge.targetId === focusedNodeId);
      const isSelectedEdge =
        selectedEdge !== null &&
        edge.sourceId === selectedEdge.sourceId &&
        edge.targetId === selectedEdge.targetId;
      const isPathEdge = isPathLensEdge(mapLensKind, edge.id, pathEdgeIds);
      const hovered =
        hoveredEdge !== null &&
        edge.sourceId === hoveredEdge.sourceId &&
        edge.targetId === hoveredEdge.targetId;
      const emphasized =
        !trailLensActive &&
        (hovered ||
          (emphasizedNeighborId !== null &&
            touches &&
            (edge.sourceId === emphasizedNeighborId || edge.targetId === emphasizedNeighborId)));
      // Trail lens — **every** edge dims, ego-emphasised ones included. The blue
      // lines the owner called "dizzying" were exactly these ego
      // relation edges. Not a deletion but a retreat for the duration of the lens:
      // closing the popover brings them straight back.
      let edgeEgoState: EdgeEgoState = trailLensActive
        ? "dim"
        : resolveEdgeEgoStateWithPair(touches, focusedNodeId, selectedEdge, isSelectedEdge);
      if (isPathEdge && !trailLensActive) edgeEgoState = "ego";
      // Dome ancestry — the chain's contains edges take the ego state, the same override slot
      // (and the same reason) as the path lens: this line is what the selection is *about*.
      if (
        domeAncestryOn &&
        !trailLensActive &&
        kind === "contains" &&
        domeAncestryEdgesReused.has(domeAncestryEdgeKey(edge.sourceId, edge.targetId))
      ) {
        edgeEgoState = "ego";
      }
      // Go-fanout layout-publish (2026-07) prescription 4 — suppress depends during expansion. While
      // layout children are revealed in DOI order, if irrelevant depends tangles cover the map, the just-
      // revealed minority won't be read. If anyExpanded and not contains (hierarchy solid lines
      // remain), depends edges that are not already alive via ego/selection/hover/emphasis are
      // downgraded to dim ink. During child hover/ego, touches/emphasized/isSelected are true,
      // so existing comet/emphasis rules revive those edges (regression 0).
      if (
        anyExpanded &&
        kind !== "contains" &&
        edgeEgoState !== "ego" &&
        !isSelectedEdge &&
        !emphasized &&
        !touches
      ) {
        edgeEgoState = "dim";
      }
      // Spotlight — normal ink only when both endpoints are inside the window
      // (a connection between two changed nodes has to show its structure);
      // otherwise it sinks. Hovered and selected edges were already revived as
      // ego/selected by the branch above.
      const edgeSpotlightSink = spotlightSink(
        pathLensActive
          ? isPathEdge
          : spotlightIds !== null &&
              spotlightIds.has(edge.sourceId) &&
              spotlightIds.has(edge.targetId),
      );
      // Trail — only for a consecutively walked pair that is also a **real
      // relation line**. The latter is structurally guaranteed because this loop
      // iterates `world.edges`, the same contract the footprints already rely on.
      // With the lens off the ramp is 0 and the value is unchanged.
      const walkedTrail =
        trailRamp > 0.001 &&
        walkedEdgeKeys !== null &&
        walkedEdgeKeys.has(
          edge.sourceId < edge.targetId
            ? `${edge.sourceId} ${edge.targetId}`
            : `${edge.targetId} ${edge.sourceId}`,
        )
          ? trailRamp
          : 0;
      // 3D fog exemption — relationships highlighted by interaction are not buried by depth.
      const domeEdgeExempt = emphasized || isSelectedEdge || isPathEdge || edgeEgoState === "ego";
      // Omit distant details — same rule as fog exemption: relationships brightened for reading
      // also reclaim their halo (if exempt edges cannot cut through tangled tangles, the exemption is half-hearted).
      if (!domeEdgeExempt && domeEdgeDetail < 1) domeHaloWidthPx *= domeEdgeDetail;
      ctx.globalAlpha =
        (passthrough ? edgeAlpha * tokens.edgePassthroughAlpha : edgeAlpha) *
        edgeSpotlightSink *
        (domeEdgeExempt ? 1 : domeEdgeFog);
      /*
       * A halo's strength follows **how strong this line currently is**: a near
       * (strong) line cuts hard, a far line buried in fog barely cuts at all, which
       * is what keeps the halo from asserting "I am in front". An edge exempted by
       * interaction takes no fog, so it cuts hardest of all.
       *
       * perf 2026-08-19 — the halo argument is reused scratch
       * (`edgeHaloScratch`), the token argument is one per frame
       * (`traceTokensFrame`), and the pair key is computed once per edge object and
       * cached (`edgePairMeta`). The state literals themselves stay spelled out
       * because contract gates (footprint-bloom-exception, review-ring-authorship)
       * pin that wiring.
       */
      if (domeHaloWidthPx > 0.05) {
        edgeHaloScratch.color = domeHaloColor;
        edgeHaloScratch.px = domeHaloWidthPx;
        edgeHaloScratch.alpha = Math.min(DOME_HALO_ALPHA_CAP, ctx.globalAlpha * DOME_HALO_ALPHA_GAIN);
      }
      tracesDraw(
        ctx,
        {
          a,
          b,
          control,
          relationType: kind,
          // The binary `kind` lumps everything that is not containment into
          // `depends`. Whether a directional taper may be drawn is decided by the
          // **original relation type**, not by `kind`.
          directional: isDirectionalRelation(edge.relationType),
          egoState: edgeEgoState,
          selected: (isSelectedEdge || isPathEdge) && !trailLensActive,
          trailWalked: walkedTrail,
          farT,
          t: edge.t,
          emphasized,
          reducedMotion,
          level: edge.level,
          widthScale: domeEdgeExempt ? 1 : domeWidthScale,
          halo: domeHaloWidthPx > 0.05 ? edgeHaloScratch : null,
          containsCometEligible: kind === "contains" ? egoContainsComets.has(edgePairMeta(edge).key) : undefined,
          dependsCometEligible: kind === "depends" ? ambientDependsComets.has(edgePairMeta(edge).key) : undefined,
        },
        traceTokensFrame,
      );
      /**
       * Footprints beside the line — only when this relation was **walked
       * consecutively**. Stamped along the normal, offset from the line rather
       * than on it: a relation line is the channel carrying a typed fact
       * (containment / dependency), and a mark laid on top would make two facts
       * fight over one ink.
       *
       * That only **real edges** among the candidate pairs receive them is
       * guaranteed here, because this loop iterates `world.edges`. Two unrelated
       * nodes visited back to back never reach this point.
       */
      if (
        footprintPref !== null &&
        footprintPref.onEdges &&
        walkedEdgeKeys !== null &&
        walkedEdgeKeys.has(edge.sourceId < edge.targetId ? `${edge.sourceId} ${edge.targetId}` : `${edge.targetId} ${edge.sourceId}`)
      ) {
        drawEdgeFootprints(
          { ctx, pref: footprintPref, ink: footprintInk, scale: footprintScale },
          a.x,
          a.y,
          b.x,
          b.y,
          edgeAlpha * footprintPref.opacity,
        );
      }
      // Always-on comets: the tail is drawn by `tracesDraw` off `edge.t`, together
      // with the edge curve, regardless of focus (dim edges excluded). This pass
      // no longer lays separate firefly points on top.
      ctx.globalAlpha = 1;
    }
  }

  // Draft relation uses the live endpoint geometry but never enters `world.edges`.
  // It therefore cannot pull nodes, heat physics, or alter graph statistics.
  if (previewEdge) {
    const source = world.nodeById.get(previewEdge.sourceId);
    const target = world.nodeById.get(previewEdge.targetId);
    if (source && target) {
      const sourceFrame = domeFrameFor(source.id);
      const targetFrame = domeFrameFor(target.id);
      drawPreviewEdge(ctx, {
        source: project(source.x + sourceFrame.dx, source.y + sourceFrame.dy),
        target: project(target.x + targetFrame.dx, target.y + targetFrame.dy),
        sourceRadius:
          radiusForKind(source.kind, tokens) * source.magnitudeScale * sourceFrame.s * camera.scale.value,
        targetRadius:
          radiusForKind(target.kind, tokens) * target.magnitudeScale * targetFrame.s * camera.scale.value,
        alpha: previewEdge.alpha,
        solid: previewEdge.phase === "committing",
        solidProgress: previewEdge.commitProgress,
        color: tokens.selectionRingIndigo,
      });
    }
  }

  // Hover pulses — one-shot signals (420ms) fired by a node hover, drawn above the
  // edge curves and below the nodes. Under reduced-motion nothing fires, so
  // `pulses` is empty and nothing draws. The curve projects live edge coordinates,
  // so it follows dragging and a settling graph.
  if (pulses.length > 0) {
    const pairKey = (sourceId: string, targetId: string): string => `${sourceId} ${targetId}`;
    const edgeByPair = new Map(world.edges.map((edge): [string, typeof edge] => [pairKey(edge.sourceId, edge.targetId), edge]));
    drawPulses(
      ctx,
      pulses,
      now,
      (pulse) => {
        const edge = edgeByPair.get(pairKey(pulse.sourceId, pulse.targetId));
        if (!edge) return null;
        const points = projectEdgePoints(edge);
        return { a: points.a, control: points.control, b: points.b };
      },
      { head: tokens.indigoBright, trail: tokens.indigo },
    );
    ctx.globalAlpha = 1;
  }

  // rank7 — a just-expanded disc child's reveal multiplier = its NEAREST
  // expanded-ancestor parent's ramp (walk contains-parent chain up). Already-
  // expanded parents sit at ramp 1 → multiply-by-1 (no regression); a parent
  // still ramping fades its direct children (and deeper descendants) IN. Nodes
  // outside any expanded disc → 1.
  const nearestExpandedRevealMul = (nodeId: string): number => {
    if (!chipRevealById || expandedParentIds.size === 0) return 1;
    let cursor = world.nodeById.get(nodeId)?.parentId ?? null;
    let guard = 0;
    while (cursor && guard < 64) {
      if (expandedParentIds.has(cursor)) return chipRevealById.get(cursor) ?? 1;
      cursor = world.nodeById.get(cursor)?.parentId ?? null;
      guard += 1;
    }
    return 1;
  };

  // A label anchor has to follow the disc that was **actually drawn**. The label
  // pass used `radiusForKind × cameraScale`, which omits the node's
  // `magnitudeScale`, its breathe, its appear ramp, and the **1.12 growth on
  // selection**. So a selected node laid its label on its own border (measured:
  // border bottom 215 vs label top 216) and a large node pulled its name inside the
  // shape. Handing over what this pass computed makes both passes see one shape.
  // perf 2026-08-19 — reused instead of a new Map per frame (see
  // `effectiveAlphaByIdReused`).
  drawnScreenRadiusByIdReused.clear();
  const drawnScreenRadiusById = drawnScreenRadiusByIdReused;
  // Discs occupied by ego members and the hovered node, handed to the label placer
  // as reservations so a passive label cannot lay text over them (the same
  // mechanism the chip reservations use).
  const nodeDiscReservations: ReservedBox[] = [];

  // 3D painter's algorithm: draw far nodes (large `u`) first so near ones land on
  // top. Hit testing (`hitTestWorld`'s depth preference) resolves as "the nearer
  // node wins", so the draw order must follow the same rule for what is seen and
  // what is grabbed to agree. In 2D the original array order stands — zero
  // allocation.
  let nodeDrawOrder: readonly WorldNode[] = world.nodes;
  if (domeOn) {
    // perf 2026-08-19 — the same index-sort idiom as the edge sort (see the
    // `edgeDrawOrder` doc-block). The old comparator called `domeFrameFor` twice
    // per invocation, making O(n log n) map lookups. Depth is now read once per
    // node from the already-buffered frame and the comparator does two array
    // reads — stable sort plus identical key, so the order is unchanged.
    domeNodeDepthReused.length = 0;
    domeNodeIndexReused.length = 0;
    for (let i = 0; i < world.nodes.length; i += 1) {
      domeNodeDepthReused.push(domeNodeFrameReused[i].u);
      domeNodeIndexReused.push(i);
    }
    domeNodeIndexReused.sort((x, y) => domeNodeDepthReused[y] - domeNodeDepthReused[x]);
    domeNodeOrderReused.length = 0;
    for (let i = 0; i < domeNodeIndexReused.length; i += 1) domeNodeOrderReused.push(world.nodes[domeNodeIndexReused[i]]);
    nodeDrawOrder = domeNodeOrderReused;
  }

  for (let drawPos = 0; drawPos < nodeDrawOrder.length; drawPos += 1) {
    const node = nodeDrawOrder[drawPos];
    const previewEndpoint = isPreviewEndpoint(previewEdge, node.id);
    const previewTarget = node.id === previewEdge?.targetId;
    // Density condition: nodes inside a collapsed parent's subtree are replaced by
    // a chip and not drawn.
    if (isPreviewEndpointHidden(clusteredIds.has(node.id), previewEdge, node.id)) continue;
    const tierAlpha = effectiveAlphaById.get(node.id) ?? 1;
    // The same constant the hit test and the label ramp floor on — a node that
    // survives this line is grabbable and nameable by construction.
    if (tierAlpha <= HITTABLE_MIN_TIER_ALPHA) continue;
    const egoState = previewTarget
      ? "neighbor"
      : egoAllNormal
        ? "normal"
        : lensNodeEgoState(node.id, focusedNodeId, neighborsOfFocused, selectedEdge);
    // Color signature uses the RETAINED focus classification (persists through a
    // deselect fade) + this node's focus ramp — everything else keeps the live
    // `egoState`.
    const colorEgoState = previewTarget
      ? "neighbor"
      : colorAllNormal
        ? "normal"
        : lensNodeEgoState(node.id, colorFocusedNodeId, colorNeighbors, colorSelectedEdge);
    // The lens introduces no easing of its own: it feeds the exponential ramp the
    // spotlight already uses (`focusDimTau`) straight into the colour ramp. Opening
    // the popover ramps the background down and closing it ramps back up, never a
    // hard cut. On the ordinary focused path the lens is off and nothing changes.
    const focusRamp = trailLensActive ? trailRamp : (focusRampById.get(node.id) ?? 0);
    const emphasis = emphasisById.get(node.id) ?? 0;
    const isEmphasizedNeighbor = emphasizedNeighborId !== null && node.id === emphasizedNeighborId && egoState === "neighbor";
    // perf 2026-08-19 — on a focus-free frame the visual is a function of
    // (kind, fresh, stale) alone and hits the cache (`nodeVisualCache` doc-block).
    // If any condition fails (focus ramp, hover ripple, lens) it is recomputed on
    // the original path.
    let visual: NodeVisual;
    const visualCacheable =
      colorEgoState === "normal" &&
      colorFocusedNodeId === null &&
      !trailLensActive &&
      emphasis <= 0.02 &&
      focusRamp <= 0.001 &&
      !isEmphasizedNeighbor;
    if (visualCacheable) {
      const cacheKey =
        KIND_CACHE_INDEX[node.kind] * 4 + (node.fresh && !node.stale ? 2 : 0) + (node.stale ? 1 : 0);
      const cached = nodeVisualCache[cacheKey];
      if (cached !== undefined) {
        visual = cached;
      } else {
        visual = resolveNodeVisual(node, colorEgoState, emphasis, colorFocusedNodeId, isEmphasizedNeighbor, tokens, reducedMotion, focusRamp);
        nodeVisualCache[cacheKey] = visual;
      }
    } else {
      visual = resolveNodeVisual(node, colorEgoState, emphasis, colorFocusedNodeId, isEmphasizedNeighbor, tokens, reducedMotion, focusRamp);
    }
    /**
     * The trail — **the visited node itself** reads in the trail colour. The
     * earlier lens only left visited nodes at `"normal"`, marking a visit solely
     * with the footprint **beside** the node, so on the screen the owner saw,
     * neither the trail's nodes nor its lines were marked.
     *
     * No new circle (a fourth ring): only the colour of the stroke channel the node
     * **already has** changes, so no orbit and no ink are added. This is what "make
     * it glow" looks like inside the charter — **value and colour contrast** on a
     * darkened field, not a glow (bloom exists only as the opt-in exception in the
     * one footprint-glyph file).
     */
    // perf 2026-08-19 — with the lens off, `kept` is false and the result is always
    // 0 (`trailNodeInkStrength`'s first branch), so it is only called on active
    // frames and no argument object is built per node. Same values.
    const trailInk = trailLensActive
      ? trailNodeInkStrength({
          kept: isTrailKept(node.id),
          ramp: trailRamp,
          colorEgoState,
        })
      : 0;
    if (trailInk > 0.001) {
      visual.stroke = lerpColorHex(visual.stroke, footprintStepColor, trailInk);
    }

    const baseRadius = radiusForKind(node.kind, tokens) * node.magnitudeScale;
    // rank8 — new-node appear ramp: micro scale 0.6→1 + alpha 0→1. rank7 —
    // just-expanded disc child reveal: alpha ×= nearest expanded parent's ramp.
    // Both default to 1 (no map / existing node / not in an expanding disc), so
    // steady state is unchanged (regression 0).
    const appear = Math.min(1, Math.max(0, appearById?.get(node.id) ?? 1));
    // High-fan batch reveal — for a child surfacing in a batch, the per-child
    // stagger ramp (`batchAppearById`) REPLACES the parent group fade
    // (`nearestExpandedRevealMul`) so it never fades twice, and it also drives the
    // micro appear scale. A node outside a batch takes the existing group /
    // world-appear path.
    const batchAppear = batchAppearById?.get(node.id);
    // The fifth tier-piercing channel **replaces the group fade** too, for the same
    // reason as `batchAppear` — it was added later and missed that guard. This
    // node's `tierAlpha` already came through `effectiveAlphaById`, which has the
    // chip-expand ramp folded in (`chipExpandReveal`), so multiplying the group fade
    // in again would make the alpha a **product of two exponentials** and children
    // would keep arriving long after the chip said "expanded" — measured: chip at
    // 90% in 391ms vs children at 621ms, a 230ms gap, past the 120ms "one input =
    // one event" threshold in `.claude/rules/design.md`. Both ramps use the same
    // `clusterRevealTau`, so replacing does not remove the fade — it happens once.
    const chipExpandReveal = expandRevealById?.get(node.id);
    const revealMul =
      batchAppear !== undefined
        ? Math.min(1, Math.max(0, batchAppear))
        : chipExpandReveal !== undefined
          ? 1
          : Math.min(1, Math.max(0, nearestExpandedRevealMul(node.id)));
    const scaleDriver = batchAppear !== undefined ? Math.min(1, Math.max(0, batchAppear)) : appear;
    const appearScale = 0.6 + 0.4 * scaleDriver;
    const appearRevealAlpha = appear * revealMul;
    let breathe = 1;
    if (visual.breatheEnabled) {
      breathe = 1 + tokens.breatheAmplitude * Math.sin((now / 1000) * tokens.breatheFreqRad + phaseForId(node.id));
    }
    let effRadius = baseRadius * breathe * appearScale;
    // Center node grows 1→1.12 ON the focus ramp (eases in with the dive, back
    // out on deselect) — retained `colorEgoState` so the shrink survives the
    // deselect fade.
    if (colorEgoState === "center") effRadius *= 1 + 0.12 * Math.min(1, Math.max(0, focusRamp));
    if (!focusedNodeId) {
      effRadius += emphasis * (node.id === hoveredNodeId ? baseRadius * 0.16 : baseRadius * 0.08);
    } else if (isEmphasizedNeighbor) {
      effRadius += emphasis * baseRadius * 0.12;
    }

    // Realm depth clarity — while a realm is active, deeper rings drop slightly in
    // alpha and size. Hovered and ego members (center/neighbor) return to 100%:
    // whatever the interaction is on stays crisp.
    const isHoveredNode = node.id === hoveredNodeId;
    let realmClarityAlpha = 1;
    if (realmDepthById !== null && !isHoveredNode && !previewEndpoint && !isTrailKept(node.id) && egoState === "normal") {
      const depth = realmDepthOf(node.id);
      if (depth !== undefined) {
        realmClarityAlpha = realmDepthClarityAlpha(depth);
        effRadius *= realmDepthClarityScale(depth);
      }
    }
    // 3D view — the dot radius (perspective already folded into `s`) is geometry,
    // so it is always applied, while depth fog (near 1.0 → far 0.09) exempts
    // whatever the interaction is on (hover, ego, trail): anything that must be
    // read brightens again. This deep attenuation falls outside the 2D ink-contrast
    // floor (3:1) and is a waiver the owner granted for 3D only — see
    // `docs/DECISIONS.md` "3D Waiver List" (the 3D waiver list).
    // perf 2026-08-19 — recovers the buffered frame by sort index, no map re-lookup.
    const nodeDome = domeOn ? domeNodeFrameReused[domeNodeIndexReused[drawPos]] : ZERO_DOME_FRAME;
    // Far-side detail ramp (`domeDetailFactor` doc-block) — folds the extra strokes
    // of back-hemisphere nodes (depth halo, depth shading, metallic sheen, outline,
    // domain pin tick) away continuously with depth. Same exemption rule as the
    // fog: hovered, trail, and ego nodes stay at 1.
    let domeDetail = 1;
    if (domeOn) {
      effRadius *= nodeDome.s;
      if (!isHoveredNode && !previewEndpoint && !isTrailKept(node.id) && egoState === "normal") {
        realmClarityAlpha *= 1 + (domeFogAlpha(nodeDome.u) - 1) * nodeDome.a;
        domeDetail = 1 + (domeDetailFactor(nodeDome.u) - 1) * nodeDome.a;
      }
    }

    // Depth parallax adds the band offset (in world units) to the RENDER
    // coordinates only; the world coordinates never move. The 3D offset follows the
    // same grammar, and hit testing reads the same map.
    const pOff = realmParallaxOffsetFor(node.id);
    // perf 2026-08-19 — `project` inlined plus scratch reuse; identical formula.
    const screen = nodeScreenScratch;
    screen.x = (node.x + pOff.x + nodeDome.dx - camX) * camScale + halfW;
    screen.y = (node.y + pOff.y + nodeDome.dy - camY) * camScale + halfH;
    const screenRadius = effRadius * camera.scale.value;
    // Rings/pulses/labels all key off this same disc, so one guard here drops
    // the whole off-screen node cost (see `render/viewport-cull.ts`).
    if (isNodeCulled(screen, screenRadius * NODE_CULL_SLACK, viewportWidth, viewportHeight)) continue;
    drawnScreenRadiusById.set(node.id, screenRadius);
    // Reserve only ego members (center, neighbor) under an active focus and the
    // hovered node. That leaves the overview's overall label density untouched and
    // addresses just where the reported defect occurs — the ego focus of the
    // default click interaction. The selection ring and expand badge sit just
    // outside the disc, so the ring clearance is reserved with it.
    if (egoState === "center" || egoState === "neighbor" || node.id === hoveredNodeId) {
      const half = screenRadius + EXPANDED_AURA_RING_OFFSET;
      nodeDiscReservations.push({
        ownerId: node.id,
        priority: NODE_DISC_LABEL_PRIORITY,
        bbox: {
          minX: screen.x - half,
          maxX: screen.x + half,
          minY: screen.y - half,
          maxY: screen.y + half,
        },
      });
    }

    // Slight dim on background nodes unrelated to the expansion (disc members,
    // spine, and ego excluded).
    const backgroundDim =
      anyExpanded && !previewEndpoint && egoState === "normal" && !isTrailKept(node.id) && !expandedDiscIds.has(node.id) && !isSpineNode(node)
        ? BACKGROUND_DIM_WHEN_EXPANDED
        : 1;

    // Spotlight — nodes outside the window sink; the hovered one is exempt.
    const nodeSpotlightSink = spotlightSink(
      (spotlightIds !== null && spotlightIds.has(node.id)) || isHoveredNode || previewEndpoint,
    );
    ctx.globalAlpha = tierAlpha * realmClarityAlpha * backgroundDim * appearRevealAlpha * nodeSpotlightSink;
    // Sheen top stop = lerp(fill, tint, blend) — resolved here (token layer)
    // so `render/node-shapes.ts` stays token-free and pure.
    // perf 2026-08-19 — equal fills yield equal result strings (tint and blend are
    // token constants), so this caches per fill instead of re-parsing hex and
    // rebuilding a string per node. Invalidated wholesale when the tokens change.
    if (sheenTopCacheTint !== tokens.nodeSheenTint || sheenTopCacheBlend !== tokens.nodeSheenBlend) {
      sheenTopCache.clear();
      sheenTopCacheTint = tokens.nodeSheenTint;
      sheenTopCacheBlend = tokens.nodeSheenBlend;
    }
    let sheenTop = sheenTopCache.get(visual.fill);
    if (sheenTop === undefined) {
      sheenTop = lerpColorHex(visual.fill, tokens.nodeSheenTint, tokens.nodeSheenBlend);
      if (sheenTopCache.size > 256) sheenTopCache.clear();
      sheenTopCache.set(visual.fill, sheenTop);
    }
    // Far-side detail ramp — converges the metallic sheen gradient toward the flat
    // fill continuously with depth. At detail 0, `sheenTop === fill` (the same
    // string) and `resolveBodyFill` returns early with a flat fill, building no
    // gradient at all. In between it is a colour interpolation that kills the blend
    // factor by detail, so there is no hard cut (detail 1 = the same formula and
    // the same string as the cached value).
    if (domeDetail < 1) {
      sheenTop =
        domeDetail <= 0.01
          ? visual.fill
          : lerpColorHex(visual.fill, tokens.nodeSheenTint, tokens.nodeSheenBlend * domeDetail);
    }
    // Engraved numeral: project/domain only, and only when there's a count to
    // show (prototype `if (n.count && (project||domain) ...)`).
    // 3D — no numeral is engraved on a dot: this layer is about form, not a data table.
    const showCount =
      (node.kind === "project" || node.kind === "domain") && node.count > 0 && !(domeOn && nodeDome.a > 0.5);
    // Canvas-emphasis slice §C — hover ring eligibility. `hoveredNodeId` is
    // already nulled by the caller (`use-topology-loop.ts`) whenever a focus
    // is active, so this is never true at the same time as `egoState ===
    // "center"` in practice.
    const isHovered = node.id === hoveredNodeId;
    // Canvas-emphasis slice §B2 — this node's one-shot commit-pulse visual,
    // or null outside its brief window / when reduced-motion is on (the
    // pulse IS the one animated element this slice adds — the permanent
    // double ring itself never animates, so skipping just the pulse still
    // leaves the selection fact visible).
    let selectionPulseVisual: SelectionPulseVisual | null = null;
    if (!reducedMotion && selectionPulse !== null && selectionPulse.nodeId === node.id) {
      selectionPulseVisual = computeSelectionPulse(now - selectionPulse.startAtMs, tokens.selectPulseDurationMs, tokens.selectPulseScaleDelta);
    }
    /*
     * Node depth halo — the same device the edges use, applied to the disc
     * (`domeHaloPx` doc-block). Nodes are laid down all at once **after every edge
     * is drawn**, so a node always sits above the lines; unless the lines are **cut
     * at the disc's rim** the dot reads as a sticker floating on top. A slightly
     * wider background-colour circle laid first cuts them there, and the dot sits
     * **inside** the bundle. Strength follows the edges' rule: the alpha this node
     * is currently drawn at.
     */
    if (domeOn && nodeDome.a > 0.01) {
      // Far-side detail ramp — the same attenuation as the edge halo: continuous,
      // and unchanged on the near side.
      const haloPx = domeHaloPx(nodeDome.u) * nodeDome.a * domeDetail;
      if (haloPx > 0.05) {
        const prevAlpha = ctx.globalAlpha;
        ctx.globalAlpha = Math.min(DOME_HALO_ALPHA_CAP, prevAlpha * DOME_HALO_ALPHA_GAIN);
        ctx.fillStyle = domeHaloColor;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, screenRadius + haloPx, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = prevAlpha;
      }
    }
    // perf 2026-08-19 — one token argument per frame (`nodeShapeTokensFrame`). The
    // state literals stay spelled out because the review-ring-authorship contract
    // gate pins that wiring.
    nodeShapesDraw(
      ctx,
      {
        // 3D depth shading, cross-faded on the assembly ramp (0 in 2D, adding no
        // strokes). The far-side detail ramp folds its strength to 0 across the back
        // hemisphere, continuously; the 0.01 threshold then skips the second
        // fill + translate pair entirely.
        depthShade: domeOn ? nodeDome.a * domeDetail : 0,
        // Far-side detail ramp — the outline and the domain pin tick recede with it.
        detail: domeDetail,
        kind: node.kind,
        screenX: screen.x,
        screenY: screen.y,
        screenRadius,
        // 3D keeps every node a dot at any zoom (2026-09-02). The far-field
        // shape convergence is what made the cone tree read as dots at fit zoom,
        // and wheeling in used to bring the 2D squares back inside the tree —
        // two visual languages in one frame. The assembly ramp `a` cross-fades
        // in, so 2D is untouched and the switch stays continuous.
        farT: domeOn ? Math.max(farT, nodeDome.a) : farT,
        // Rings (selection double-ring, hub, project decor) follow the RETAINED
        // color ego so the selection ring holds through the deselect fade and
        // clears only once the ramp reaches 0 — instead of snapping off the
        // instant `focusedNodeId` goes null. Equals live `egoState` while a
        // selection is active.
        egoState: colorEgoState,
        fill: visual.fill,
        stroke: visual.stroke,
        lineWidth: visual.lineWidth,
        dash: visual.dash,
        hub: node.isHub,
        sheenTop,
        countLabel: showCount ? String(node.count) : null,
        isHovered,
        // rank5 — hover ring alpha rides this node's hover-ripple emphasis
        // (same scalar the body wake uses) so it fades up instead of hard-popping.
        // Brushing through the lens (hovering a popover row) fires no pointer
        // ripple, so `emphasis` is 0 and the ring would be invisible. A row hover is
        // a discrete event, so solid (1) immediately is correct — the same value the
        // reduced-motion path uses.
        hoverEmphasis: isHovered && trailLensActive ? 1 : emphasis,
        selectionPulse: selectionPulseVisual,
        agentFocus: agentFocusNodeId !== null && node.id === agentFocusNodeId,
        // Spotlight changed-node ring — only with the lens on and the node inside
        // the window. The loop advances `dashOffset` during the bounded transition
        // only: an endless `now`-driven rotation is forbidden, because other canvas
        // activity can outlive the ramp settling. Pinned to 0 under reduced-motion.
        spotlightRing:
          recentSpotlightActive && spotlightIds !== null && spotlightIds.has(node.id)
            ? {
                alpha: spotlightRamp,
                dashOffset: reducedMotion ? 0 : spotlightDashOffset,
              }
            : null,
        now,
        reducedMotion,
        glyphStyle,
      },
      nodeShapeTokensFrame,
    );

    // Diffraction spike: the ranked "bright star" set PLUS the project node
    // unconditionally — reusing the pattern hub nodes already use, i.e. the exact
    // same far-field-only overlay hub/magnitude stars get, just widening
    // eligibility so the Layer-0 anchor reads as luminous too. Colour still derives
    // from `visual.stroke`, hardcoded amber for project, so the spike is amber for
    // free.
    // perf 2026-08-19 — the `farT` test moved first, so at circuit altitude
    // (farT = 0) even the Set lookup is skipped. Same logic.
    if (farT > 0.02 && (world.brightStarIds.has(node.id) || node.kind === "project")) {
      drawDiffractionSpike(ctx, {
        screenX: screen.x,
        screenY: screen.y,
        screenRadius,
        color: egoState === "dim" ? tokens.nodeStrokeDim : visual.stroke,
        alpha: farT * tierAlpha * realmClarityAlpha * backgroundDim * appearRevealAlpha,
      });
    }

    /**
     * Footprints — a pair of shoe prints plus the visit ordinal, at the visited
     * node's top right.
     *
     * This used to be a concentric hairline ring. A ring shares **the circle
     * grammar** of the selection ring, the expand aura, and the warding circle, so
     * it became a fourth circle whose meaning had to be relearned every time, and
     * it could carry neither order nor direction. Prints sit outside that grammar,
     * so nothing collides.
     *
     * The node's tier, dim, and realm-clarity alphas all multiply in, so prints
     * recede naturally with an ego dim or a transition.
     */
    const footprintSteps = footprintStepsById.get(node.id);
    if (footprintSteps !== undefined && footprintPref !== null) {
      const layerAlpha = tierAlpha * realmClarityAlpha * backgroundDim * appearRevealAlpha;
      const paint = {
        ctx,
        pref: footprintPref,
        ink: footprintInk,
        scale: footprintScale,
        // Only the **step just taken** ramps; the rest were already there and are settled.
        appear: node.id === footprintNewestId ? footprintAppear : 1,
      };
      drawNodeFootprint(paint, screen.x, screen.y, screenRadius, layerAlpha * footprintPref.opacity);
      drawFootprintSteps(
        paint,
        screen.x,
        screen.y,
        screenRadius,
        layerAlpha,
        footprintSteps,
        footprintStepColor,
      );
      ctx.globalAlpha = 1;
    }

    // Marks an expanded parent: a dashed aura ring outside the node disc (the
    // selection ego ring is solid, so the channels do not collide). Drawn over the
    // node, but its alpha follows the node's tier alpha.
    //
    // The aura yields on any node where the spotlight changed-node ring (amber
    // dashes, same r+6 orbit) is active: two dash patterns interleaving at one
    // radius read as a two-colour braid (frame evidence, motion review 2026-07-23).
    // For a changed node under the lens, the single amber ring says both "expanded"
    // and "changed" — one signal per orbit. An expanded ancestor that has not
    // changed keeps its indigo aura.
    if (
      expandedParentIds.has(node.id) &&
      !(spotlightLensActive && spotlightIds !== null && spotlightIds.has(node.id))
    ) {
      ctx.save();
      ctx.setLineDash([...EXPANDED_AURA_DASH]);
      ctx.globalAlpha = tierAlpha * EXPANDED_AURA_ALPHA;
      ctx.strokeStyle = tokens.indigo;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, screenRadius + EXPANDED_AURA_RING_OFFSET, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Expanded-cohort membership ring. A **direct child** just revealed by a chip
    // gets **the same dashed geometry** as the parent aura — that is what says
    // "same bundle" — with the ink one step down to desaturated indigo
    // (`expandedCohort`), so the parent stays the protagonist.
    //
    // Why value and geometry rather than colour. Owner: "since selection is blue,
    // make this distinguishable" (selection is already blue, so make this distinguishable).
    // The charter is neutrals plus a single indigo, so a new hue is forbidden;
    // instead it takes one more step down an existing ramp — node selection =
    // saturated indigo **solid**, edge selection = pale indigo, expanded cohort =
    // **desaturated indigo dashed**. Solid vs dashed splits the channel.
    //
    // A selected or hovered child is skipped: its own selection ring is already the
    // protagonist, and two rings on one orbit read as a braid (same rule as dashed
    // aura vs amber ring — one signal per orbit).
    if (
      expandedChildIds.has(node.id) &&
      !expandedParentIds.has(node.id) &&
      node.id !== focusedNodeId &&
      node.id !== hoveredNodeId &&
      !(spotlightLensActive && spotlightIds !== null && spotlightIds.has(node.id))
    ) {
      ctx.save();
      ctx.setLineDash([...EXPANDED_AURA_DASH]);
      ctx.globalAlpha = tierAlpha * EXPANDED_COHORT_ALPHA;
      ctx.strokeStyle = tokens.expandedCohort;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, screenRadius + EXPANDED_AURA_RING_OFFSET, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Realm root anchor ring. Owner, live report 2026-07-23: "the root looks like a ghost"
    // (the root looks like a ghost). During a realm expansion the root (depth 0)
    // gets **the same indigo solid hairline** as the warding circle, so the world's
    // boundary (the large circle) and its centre (the small ring) answer each other
    // in one ink and "this circle is that node's world" reads from geometry alone.
    // Channel-separate from the dashed aura (expansion) and the amber ring; no
    // glow, and no new token (it reuses `tokens.indigo`).
    if (realmDepthById !== null && realmDepthById.get(node.id) === 0 && wardingRing !== null) {
      ctx.save();
      ctx.globalAlpha = tierAlpha * REALM_ROOT_ANCHOR_ALPHA * wardingRing.drawProgress;
      ctx.strokeStyle = tokens.indigo;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, screenRadius + EXPANDED_AURA_RING_OFFSET, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // --- Realm warding circle: the subtree's bounding circle, drawn above the nodes
  // and below the chips and labels. The drama comes from geometry and self-drawing
  // only (glow/neon forbidden) — a 1px indigo hairline. Relations leaving the
  // warding circle are not drawn at all: inside a realm holds only that world, and
  // relations touching the outside are the exit transition's business. ---
  if (wardingRing !== null) {
    const center = project(wardingRing.centerX, wardingRing.centerY);
    const screenRadius = wardingRing.radius * camera.scale.value;
    // The ring self-draws: an arc from the top (-90°) clockwise, `drawProgress` of
    // the way round.
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = tokens.indigo;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const start = -Math.PI / 2;
    ctx.arc(center.x, center.y, Math.max(0, screenRadius), start, start + Math.PI * 2 * wardingRing.drawProgress);
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;

    // Warding count caption — below the circle, in the tracked-caps instrument
    // style (same font and tracking as the domain watermark, at a screen-fixed
    // size), so the circle says what it bounds ("2 ELEMENTS"). Ink is the same
    // neutral as the node labels (`labelDomain`), and it rides the ring's
    // self-drawing progress so the two appear and disappear together. No new token.
    if (wardingRing.caption && wardingRing.drawProgress > 0.05) {
      drawInstrumentCaption(
        ctx,
        wardingRing.caption,
        center.x,
        center.y + screenRadius + WARDING_CAPTION_OFFSET_PX,
        tokens.labelDomain,
        WARDING_CAPTION_ALPHA * wardingRing.drawProgress,
      );
    }
  }

  // --- Density-condition cluster chips, drawn above the nodes and below the
  // labels. A chip's alpha inherits its parent node's effective tier alpha (a spine
  // parent is 1), so a chip disappears with its parent. The children and edges of
  // an unexpanded collapsed chip were already skipped above. The anchor is in world
  // coordinates, so chips pan and zoom with the camera. ---
  const chipScale = clusterChipScale(camera.scale.value);
  // Reset the hover easing anchor when the hover target changes or goes away, so
  // the next hover rises from 0 instead of snapping.
  if (clusterChipHoverAnim !== null && clusterChipHoverAnim.id !== hoveredClusterId) {
    clusterChipHoverAnim = null;
  }
  // Owner, live report: "a +31 overlapping between nodes looks bad too" (a +31
  // overlapping between nodes looks bad too). Collect the rectangles the chips
  // occupy this frame and hand them to the label placer below as **reservations**.
  // Chips draw before labels, so without this the placer would paint labels
  // straight over them. Reuses the existing bbox suppression rather than adding a
  // new avoidance algorithm.
  const chipReservations: ReservedBox[] = [];
  for (const chip of clusterChips) {
    const parentAlpha = effectiveAlphaById.get(chip.parentId) ?? 1;
    if (parentAlpha <= 0.02) continue;
    const isChipHovered = hoveredClusterId === chip.parentId;
    // Hover colour easing progress 0..1 — snaps immediately under reduced-motion.
    let hoverT = 0;
    if (isChipHovered) {
      if (reducedMotion) {
        hoverT = 1;
      } else {
        if (clusterChipHoverAnim === null) clusterChipHoverAnim = { id: chip.parentId, startAt: now };
        hoverT = Math.min(1, (now - clusterChipHoverAnim.startAt) / CLUSTER_CHIP_HOVER_MS);
      }
    }
    // 3D view — chips follow their parent node's ring too, anchor and connector alike.
    const parentNode = world.nodeById.get(chip.parentId);
    const chipDOff = parentNode ? domeFrameFor(parentNode.id) : ZERO_DOME_FRAME;
    const screen = project(chip.anchor.x + chipDOff.dx, chip.anchor.y + chipDOff.dy);
    // The parent→chip dotted connector starts at the parent node's live screen position.
    const parentScreen = parentNode ? project(parentNode.x + chipDOff.dx, parentNode.y + chipDOff.dy) : null;
    // The expand badge sits at the top right of the parent node's BASE screen
    // radius — the same computation hit testing uses. Only the base radius is used
    // so breathe and ego scaling never shake the badge's position.
    const nodeScreenRadius = parentNode
      ? radiusForKind(parentNode.kind, tokens) * parentNode.magnitudeScale * camera.scale.value
      : undefined;
    // Inherit the spotlight sink. Owner, live report: the "+60 ghost chip". The
    // sink is multiplied in during the node draw and is therefore absent from
    // `effectiveAlphaById`, so without inheriting it the parent node sank to 0.35
    // while the chip stayed at full alpha, reading as a button floating alone on an
    // empty canvas. Hover is exempt, the same rule the nodes use.
    //
    // Trail lens — a `+N` chip not belonging to a visited node recedes too. A chip
    // does not inherit the node dim (a colour swap), so it is lowered by value only
    // here, reusing the same multiplier as the background dim during an expansion.
    // No new token.
    ctx.globalAlpha =
      parentAlpha *
      spotlightSink(
        (spotlightIds !== null && spotlightIds.has(chip.parentId)) || isChipHovered,
      ) *
      // Trail lens — **an expand control is not part of the trajectory.** The
      // earlier exception kept chips attached to visited nodes at full strength;
      // once the default affordance became the overhead bar, that exception turned
      // into an opaque slab that **blocked exactly the walked relation line**
      // (measured 2026-08-02: the trail arriving at "Order" was cut off beneath the
      // slab). While the lens is on, chips recede with everything else — one fewer
      // exception, and the trajectory becomes the protagonist. It rides the ramp,
      // so the chip does not hard-cut back when the lens turns off — see
      // `.claude/rules/design.md` "One Input = One Event" (one input = one event).
      (trailLensActive ? 1 - (1 - BACKGROUND_DIM_WHEN_EXPANDED) * trailRamp : 1);
    // The draw and the label reservation are bound to **one input object**. Split
    // them and labels either overlap chips again (a missed reservation) or avoid
    // empty space (a ghost reservation).
    const chipDrawInput = {
      screenX: screen.x,
      screenY: screen.y,
      count: chip.count,
      expanded: chip.expanded,
      hovered: isChipHovered,
      hoverT,
      // An ego (`+N`) chip is never revealed gradually — it is always immediate.
      // Every other chip passes its ramp value.
      revealT: chip.ego ? undefined : chipRevealById?.get(chip.parentId),
      scale: chipScale,
      parentScreenX: parentScreen?.x,
      parentScreenY: parentScreen?.y,
      nodeScreenRadius,
      affordance: expand.affordance,
      batchSize: expand.batchSize,
      barLabels: clusterBarLabels ?? undefined,
      // The existence condition for the "directly above the selected node"
      // affordance. A synthetic ego chip (`neighbours +N`) has the selected node as
      // its parent by definition — leave that out and batch reveal closes entirely.
      focused: chip.ego === true || focusedNodeId === chip.parentId,
    };
    const occupancy = clusterChipOccupancyRect(chipDrawInput);
    if (occupancy) {
      chipReservations.push({
        bbox: {
          minX: occupancy.x,
          minY: occupancy.y,
          maxX: occupancy.x + occupancy.w,
          maxY: occupancy.y + occupancy.h,
        },
        priority: CLUSTER_CHIP_LABEL_PRIORITY,
      });
    }
    drawClusterChip(
      ctx,
      chipDrawInput,
      {
        // At rest, **chrome is darker than content** (measured by the hierarchy
        // seat, 2026-07-31: chip peak 102.5 vs children 28.4, a 3.6× inversion).
        // The chip's rest step sits at the bottom of the ramp (3.01/3.14:1), darker
        // than any node stroke. The key point is that rest uses no indigo: indigo is
        // the single accent, and chrome holding it permanently would compete with
        // the object the user actually asked for. It wakes to indigo on hover
        // (`hover*` below).
        surface: tokens.nodeFillDim,
        border: tokens.clusterChipBorderRest,
        plusInk: tokens.clusterChipInkRest,
        numeralInk: tokens.clusterChipInkRest,
        tether: tokens.edgeContains,
        // The bar is a control the user summoned, so permanent chrome ink leaves
        // its text unreadable (the rest step is 3.0:1, bottom of the ramp, darker
        // than a background node's border). Raised to the same step as the node
        // labels, but still no indigo: indigo belongs to the node the user selected,
        // and the bar is a dependent attached to that node.
        barInk: tokens.numeralFace,
        hoverSurface: tokens.nodeFillCapability,
        hoverBorder: tokens.indigo,
        hoverInk: tokens.indigoBright,
      },
    );
    ctx.globalAlpha = 1;
  }

  // --- labels: viewport/panel cull + priority greedy suppression + ellipsis ---
  // (Design Guardian readability rejection.) Labels used to leak behind the left ReaderLens
  // panel, clip off the right edge, and collide horizontally. Build a candidate
  // per still-visible label, drop any whose anchor is outside the safe rect,
  // word-boundary-ellipsize long titles, then greedily place by priority so no
  // two boxes overlap.
  const safeRect: SafeRect = {
    left: tokens.safeInsetLeft,
    right: viewportWidth - tokens.safeInsetRight,
    top: tokens.safeInsetTop,
    bottom: viewportHeight - tokens.safeInsetBottom,
  };
  interface LabelPayload {
    nodeId: string;
    kind: WorldNode["kind"];
    text: string;
    screenX: number;
    screenY: number;
    screenRadius: number;
    /** The baseline the placer settled on, including a slot flipped above the node. */
    baselineY: number;
    egoState: NodeEgoState;
    isHovered: boolean;
    revealAlpha: number;
    /** W6 agent visibility — this label's node matches the agent heartbeat's current focus. */
    agentFocus: boolean;
  }
  // Label top-K LOD: at the overview/spine and mid (circuit) bands the label budget
  // goes to the highest-degree nodes; at the deepest element zoom the budget lifts
  // and every label returns. Exempt from the budget: ego focus members and the
  // hovered node only.
  //
  // The band is classified against the CANONICAL zoom grammar (DEFAULT_TIER_REVEAL),
  // not the caller's `tierReveal` override. The two answer different questions:
  // the override decides which DOTS exist at this zoom, the budget asks whether the
  // READER is at leaf-reading altitude — and only the camera knows that. The gateway
  // stage conflated them (measured 2026-08-23): it pulls the element band down to 0.45
  // so every dot is drawn at entry (its caption-honesty contract), which silently
  // classified entry zoom as "element", lifted the budget, and let all 82 labels race
  // the greedy placer — 33 landed wherever they fit, leaf labels stacked into walls.
  // The workbench passes no override, so for it this line is byte-identical.
  const applyLabelTopK = classifyZoomTier(zoomRatio) !== "element";
  // High-fan disc density prescription: an expanded phyllotaxis disc can hold dozens–
  // hundreds of children. Blanket-exempting them all (the old behavior) punched
  // a wall of ~60 labels across the map. Instead, per disc only the DOI top-K
  // children (rankEgoNeighborsByDOI: domain > capability > element → degree →
  // slug) are eligible to carry a label; they still compete in the normal
  // LABEL_TOP_K budget, and every child past the cut renders as a dot (hover/ego
  // re-labels it individually). `expandedDiscChildIds` = all expanded children
  // (to force the non-eligible ones to dots); `discLabelEligibleIds` = the
  // per-disc DOI winners.
  const expandedDiscChildIds = new Set<string>();
  const discLabelEligibleIds = (() => {
    if (!applyLabelTopK) return new Set<string>();
    const rankedByDisc: string[][] = [];
    for (const chip of clusterChips) {
      if (!chip.expanded) continue;
      const childIds = world.childrenByParent.get(chip.parentId) ?? [];
      for (const id of childIds) expandedDiscChildIds.add(id);
      rankedByDisc.push(
        rankEgoNeighborsByDOI(
          childIds.map((id) => ({
            id,
            kind: world.nodeById.get(id)?.kind ?? "element",
            degree: world.neighborMap.get(id)?.size ?? 0,
            // Derived from `childrenByParent`, so every relation is `contains` —
            // uniform weight, order unchanged.
            relationType: "contains",
          })),
        ),
      );
    }
    // The budget comes from the preference (expand → label attempts); the constant
    // is only its default.
    return selectDiscLabelEligible(rankedByDisc, expand.labelAttempts);
  })();
  // Label-overlap LOD for the children of a focused domain. `neighborsOfFocused`
  // lights up in full at or below EGO_NEIGHBOR_LIMIT (24) — the selective ego cut
  // only fires above 24 — and all of them used to be unconditionally label-exempt,
  // so focusing a domain with 18 children drew every overlapping label as-is. Same
  // problem as the high-fan disc above, which had a prescription while this did
  // not. The same DOI top-K cut (`selectDiscLabelEligible`) now applies to the
  // neighbour set: only the highest-degree neighbours get an unconditional label,
  // and the rest fall back to ordinary greedy competition — they still appear when
  // nothing overlaps, so no label is erased outright. A focus smaller than the
  // label-attempt count stays fully exempt.
  const egoNeighborLabelEligibleIds: ReadonlySet<string> | null =
    applyLabelTopK && focusedNodeId !== null && neighborsOfFocused.size > expand.labelAttempts
      ? selectDiscLabelEligible(
          [
            rankEgoNeighborsByDOI(
              [...neighborsOfFocused].map((id) => ({
                id,
                kind: world.nodeById.get(id)?.kind ?? "element",
                degree: world.neighborMap.get(id)?.size ?? 0,
              })),
            ),
          ],
          expand.labelAttempts,
        )
      : null;
  const labelRankEntries: LabelRankEntry[] = [];
  const labelCandidates: LabelCandidate<LabelPayload>[] = [];
  /** Per-frame bbox by node id — the instrument reads this after the draw. */
  const labelBboxById = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>();
  // perf 2026-08-19 — when the early exit for on-demand 3D labels is valid: on a
  // frame where a keep (hover, ego, trail) is impossible because there is no focus,
  // pair, or lens, an assembly ramp a ≥ 0.98 gives 1 - a ≤ 0.02, and the label
  // alpha is ≤ 1, so the product is ≤ 0.02 — **the same
  // conclusion** as the existing `<= 0.02` rejection below. Reaching it before the
  // ego classification, the alpha computation, and the projection stops 2,000 nodes
  // from spinning through the front of the label pipeline every rotating frame.
  // The resulting set is unchanged.
  const domeLabelSkipEligible =
    domeOn && focusedNodeId === null && selectedEdge === null && trailLensKeepIds === null;
  for (let index = 0; index < world.nodes.length; index += 1) {
    const node = world.nodes[index];
    const previewEndpoint = isPreviewEndpoint(previewEdge, node.id);
    const previewTarget = node.id === previewEdge?.targetId;
    // Density condition: a collapsed subtree's nodes get no label either, matching
    // the node and edge passes.
    if (isPreviewEndpointHidden(clusteredIds.has(node.id), previewEdge, node.id)) continue;
    if (domeLabelSkipEligible && !previewEndpoint && node.id !== hoveredNodeId && domeNodeFrameReused[index].a >= 0.98) continue;
    // Uses the SAME effective alpha as the node draw pass (C1 A2) — an
    // ego-exempt capability that's now visible must also get a label, or it
    // reads as an unlabeled ghost circle. Also the SAME signal capability/
    // element label eligibility ramps with — if you can grab it, you can read it.
    const revealAlpha = effectiveAlphaById.get(node.id) ?? 1;
    if (revealAlpha <= 0.02) continue;
    const egoState = previewTarget
      ? "neighbor"
      : egoAllNormal
        ? "normal"
        : lensNodeEgoState(node.id, focusedNodeId, neighborsOfFocused, selectedEdge);
    const trailKept = isTrailKept(node.id);
    const pathKept = isPathLensNode(mapLensKind, node.id, spotlightIds);
    const isHovered = hoveredNodeId !== null && node.id === hoveredNodeId;
    // High-fan disc density gate: an expanded-disc child that didn't make its
    // disc's DOI top-K stays a DOT (no label candidate) — unless it's the
    // hovered node or an ego member, which re-earn a label. Skipping here (before
    // the text measure) also avoids the wasted layout work for the dropped ones.
    if (
      applyLabelTopK &&
      expandedDiscChildIds.has(node.id) &&
      !discLabelEligibleIds.has(node.id) &&
      egoState !== "center" &&
      egoState !== "neighbor" &&
      !isHovered &&
      !previewEndpoint &&
      !trailKept &&
      !pathKept
    ) {
      continue;
    }
    const pathLabelSink = pathLensActive
      ? spotlightSink(pathKept || isHovered || previewEndpoint)
      : 1;
    const labelRevealAlpha = revealAlpha * pathLabelSink;
    let compactAlpha = computeLabelAlpha({
      kind: node.kind,
      egoState,
      isHovered,
      revealAlpha: labelRevealAlpha,
    });
    // 3D — labels are **on-demand** (heroic judgment: always-visible labels break the silhouette
    // and draw the eye to text instead of shape). Only nodes highlighted by hover, focus (ego), or trail
    // get names; others slowly recede along the assembly ramp. Ramp 0 = 2D
    // unchanged. Labels are core to the product so they are not removed — only visibility mode
    // determines when they appear.
    const domeLabelKeep =
      egoState === "center" || egoState === "neighbor" || isHovered || trailKept || pathKept;
    // perf 2026-08-19 — use index buffer (`nodeFrameAt`) instead of re-querying frames.
    const labelDome = nodeFrameAt(index);
    const domeLabelGate = domeOn && !domeLabelKeep ? 1 - labelDome.a : 1;
    compactAlpha *= domeLabelGate;
    // One label form per node since the domain watermark was retired
    // (2026-08-29, `render/labels.ts` header), so one alpha decides eligibility.
    // The `Math.max` that used to guard the watermark's separate visibility is
    // gone with it.
    if (compactAlpha <= 0.02) continue;

    // Labels take the same depth parallax offset as the node disc so they travel
    // with it; likewise the 3D offset, so a label follows a disc that moved onto a
    // ring.
    const labelPOff = realmParallaxOffsetFor(node.id);
    const labelDOff = labelDome;
    const screen = labelScreenScratch;
    screen.x = (node.x + labelPOff.x + labelDOff.dx - camX) * camScale + halfW;
    screen.y = (node.y + labelPOff.y + labelDOff.dy - camY) * camScale + halfH;
    // The radius the node pass actually drew, including `magnitudeScale`, breathe,
    // the appear ramp, and the selection growth. Only nodes culled by that pass fall
    // back to the nominal radius.
    const screenRadius =
      drawnScreenRadiusById.get(node.id) ?? radiusForKind(node.kind, tokens) * camera.scale.value;
    // The baseline comes from **the same function** the paint uses. Previously the
    // bbox left the offset unscaled while the paint scaled it, so the box and the
    // glyphs drifted apart.
    const anchorY = resolveLabelBaselineY(node.kind, screen.y, screenRadius, labelScale);
    const text = ellipsizeToWidth(node.label, tokens.labelMaxWidth * labelScale, (candidate) =>
      measureLabelWidth(ctx, node.kind, candidate, labelScale),
    );
    const width = measureLabelWidth(ctx, node.kind, text, labelScale);
    const fontSize = scaledLabelFontSize(node.kind, labelScale);
    const agentFocus = agentFocusNodeId !== null && node.id === agentFocusNodeId;
    // W6 agent visibility — reserve room for the activity mark past the
    // text's own width so greedy suppression doesn't let a neighboring
    // label overlap it.
    const markReserve = agentFocus ? ACTIVITY_MARK_GAP * 2 + ACTIVITY_MARK_RADIUS * 2 : 0;
    // Safe-rect gate — but selected/hovered/ego labels are PROTECTED: instead
    // of dropping (which defeated the "selected → alpha 1" guarantee under the
    // left chrome inset, Guardian follow-up A) their anchor clamps to the
    // nearest safe edge. Everything else culls as before.
    let anchorX = screen.x;
    let clampedAnchorY = anchorY;
    if (!isWithinSafeRect(anchorX, anchorY, safeRect)) {
      // If protected, pull to the inset edge instead of discarding. The check is
      // just `render/label-layout.ts#isSafeRectProtectedLabel` — keeping it inline here
      // would make it impossible to write unit tests that prevent regression, as there's no place
      // to measure outside the canvas — and why project/hub is on that list is also documented there.
      // With only two tiers having few clamp targets, the original concern that "everything stacks in the inset"
      // does not resurface, and collisions are still handled by greedy suppression.
      if (!isSafeRectProtectedLabel({
        egoState,
        isHovered,
        trailKept: trailKept || pathKept,
        kind: node.kind,
        isHub: node.isHub,
      })) {
        continue;
      }
      const clamped = clampAnchorIntoSafeRect(anchorX, anchorY, safeRect, width / 2 + 4, fontSize + 4);
      anchorX = clamped.x;
      clampedAnchorY = clamped.y;
    }
    const shiftX = anchorX - screen.x;
    const shiftY = clampedAnchorY - anchorY;
    if (applyLabelTopK) {
      // Real exempt = the focused center + the hovered node, always. An ego
      // NEIGHBOR is exempt too unless the focus is over the readable DOI-top-K
      // band, in which case only the DOI winners keep the exemption (node audit
      // prescription — see `isEgoNeighborLabelExempt`).
      // Under the lens, visited nodes sit outside the top-K budget: removing the
      // "anonymous box wearing a ring" is the point of this lens, so the name has
      // to stand.
      const exempt =
        egoState === "center" ||
        isHovered ||
        trailKept ||
        pathKept ||
        (egoState === "neighbor" && isEgoNeighborLabelExempt(node.id, egoNeighborLabelEligibleIds));
      labelRankEntries.push({ id: node.id, degree: world.neighborMap.get(node.id)?.size ?? 0, exempt });
    }
    const priority = resolveLabelPriority({
      kind: node.kind,
      isSelected: egoState === "center",
      isHovered,
      isHub: node.isHub,
    });
    // The vertical extent is **measured from the font**. The old approximation
    // (`ascent = fontSize`, `descent = 2` constant) overshot above and undershot
    // below, and because the descent was constant while `fontSize` grew with zoom,
    // **the further you zoomed in the more the bottom leaked**. Measured once per
    // font and cached (`measureLabelVerticalMetrics`); contexts where measurement
    // is unavailable fall back to the old approximation.
    const vertical = measureLabelVerticalMetrics(ctx, node.kind, labelScale);
    const boxAt = (baselineY: number) => ({
      // Reserve `LABEL_SIDE_GAP` extra on each side — **two labels that touch read
      // as one word.** The overlap test (`bboxesOverlap`) does not count touching
      // as overlapping, so in a measurement on 2026-08-02 (fan expansion) "Kakao
      // Alimtok" and "Accumulated Points Ledger" stood side by side 0.7px apart and read as a
      // single string. Same prescription as the mockup's reserved box of
      // `measured width + 6`.
      minX: anchorX - width / 2 - LABEL_SIDE_GAP,
      maxX: anchorX + width / 2 + markReserve + LABEL_SIDE_GAP,
      minY: baselineY - vertical.ascent,
      maxY: baselineY + vertical.descent,
    });
    // When the slot below is blocked by another node's shape, **flip above before
    // discarding the name**. Suppressing outright would recreate the very
    // "unlabelled shape" this work removes, so a label is dropped only after a
    // second slot has been tried. The upper slot mirrors the same offset across the
    // node — no new spacing, no new token.
    let labelBaselineY = clampedAnchorY;
    if (overlapsForeignReserved(boxAt(labelBaselineY), node.id, priority, nodeDiscReservations)) {
      const flipped =
        resolveFlippedLabelBaselineY(screen.y, screenRadius) + (clampedAnchorY - anchorY);
      if (!overlapsForeignReserved(boxAt(flipped), node.id, priority, nodeDiscReservations)) {
        labelBaselineY = flipped;
      }
    }
    const candidateBbox = boxAt(labelBaselineY);
    labelBboxById.set(node.id, candidateBbox);
    labelCandidates.push({
      priority,
      order: index,
      ownerId: node.id,
      bbox: candidateBbox,
      payload: {
        nodeId: node.id,
        kind: node.kind,
        text,
        screenX: screen.x + shiftX,
        screenY: screen.y + shiftY,
        // Pass the baseline the placer settled on: recomputing it inside `draw()`
        // would undo the flipped slot.
        baselineY: labelBaselineY,
        screenRadius,
        egoState,
        isHovered,
        revealAlpha: labelRevealAlpha,
        agentFocus,
      },
    });
  }

  // Apply the top-K budget over the frame's already-viewport/safe-rect-filtered
  // candidates (so "top K" means "top K currently on screen"). Skipped entirely
  // at the element tier — `applyLabelTopK` gates both the entry collection above
  // and the filter here, so no work is done when the budget is lifted.
  const placedLabelCandidates = applyLabelTopK
    ? (() => {
        const allowed = selectTopKLabels(labelRankEntries, LABEL_TOP_K);
        return labelCandidates.filter((candidate) => allowed.has(candidate.payload.nodeId));
      })()
    : labelCandidates;

  // Greedy placement prefers what was placed on the previous frame (hysteresis),
  // which damps LOD churn within one priority band. The resulting placed-id set
  // becomes the next frame's preference.
  const placedResult = greedyPlaceLabels(
    placedLabelCandidates,
    (c) => prevPlacedLabelIds.has(c.payload.nodeId),
    // A **passive** label (domain/capability/element) overlapping a chip's occupied
    // area is dropped. Selected and hovered labels outrank chips and stay: a chip
    // never silences the name the user is looking at. Chip occupancy and ego node
    // discs are reserved together, and labels avoid both.
    [...chipReservations, ...nodeDiscReservations],
  );
  const placedIds = new Set<string>(placedResult.map((c) => c.payload.nodeId));

  // LOD presence ramp. Each on-screen candidate fades linearly toward placed (1)
  // or unplaced (0) over `tipFadeMs` (120ms, reused): placed candidates fade in,
  // and a candidate that just lost placement while still on screen fades out on its
  // remaining ramp instead of hard-cutting. Ids that leave the screen are culled
  // from the ramp, so they rise from 0 again next time. Without `labelPresentById`
  // (the existing test path) only placed labels draw, at alpha 1.
  const presenceById = labelPresentById;
  const drawList: { payload: LabelPayload; presenceAlpha: number }[] = [];
  if (presenceById) {
    const dtSec = lastLabelRampNow === 0 ? 0 : Math.min((now - lastLabelRampNow) / 1000, 0.05);
    lastLabelRampNow = now;
    const stepPer = tokens.tipFadeMs > 0 ? dtSec / (tokens.tipFadeMs / 1000) : 1;
    const onScreenIds = new Set<string>();
    for (const candidate of labelCandidates) {
      const id = candidate.payload.nodeId;
      onScreenIds.add(id);
      const target = placedIds.has(id) ? 1 : 0;
      const prev = presenceById.get(id) ?? (target === 1 && prevPlacedLabelIds.has(id) ? 1 : 0);
      const next = reducedMotion
        ? target
        : Math.min(1, Math.max(0, prev + (target === 1 ? stepPer : -stepPer)));
      presenceById.set(id, next);
      if (next > 0.02) drawList.push({ payload: candidate.payload, presenceAlpha: next });
    }
    for (const id of [...presenceById.keys()]) if (!onScreenIds.has(id)) presenceById.delete(id);
  } else {
    for (const c of placedResult) drawList.push({ payload: c.payload, presenceAlpha: 1 });
  }
  prevPlacedLabelIds = placedIds;

  drawnLabelBoxes = [];
  for (const { payload, presenceAlpha } of drawList) {
    // Only a label the eye can actually read counts as drawn — below this the
    // glyphs are a smudge and cannot collide with anything in a way a reader sees.
    if (presenceAlpha > 0.5) {
      const box = labelBboxById.get(payload.nodeId);
      if (box) drawnLabelBoxes.push({ nodeId: payload.nodeId, text: payload.text, ...box });
    }
    labelsDraw(
      ctx,
      {
        kind: payload.kind,
        text: payload.text,
        screenX: payload.screenX,
        screenY: payload.screenY,
        screenRadius: payload.screenRadius,
        baselineY: payload.baselineY,
        egoState: payload.egoState,
        isHovered: payload.isHovered,
        revealAlpha: payload.revealAlpha,
        agentFocus: payload.agentFocus,
        fontScale: labelScale,
        presenceAlpha,
      },
      {
        labelProject: tokens.labelProject,
        labelDomain: tokens.labelDomain,
        labelCapability: tokens.labelCapability,
        labelElement: tokens.labelElement,
        amberHub: tokens.amberHub,
      },
    );
  }
}
