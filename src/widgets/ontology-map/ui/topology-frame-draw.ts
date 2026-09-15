/**
 * Per-frame Canvas 2D draw pipeline — the composition point for `engine/`,
 * `model/`, and `render/*` (`docs/ONTOLOGY-MAP-DESIGN.md` §4 P2-P4, prototype
 * `render()` §13). Camera-space conversions live in `topology-camera-math.ts`
 * (this file only consumes `worldToScreen`, it doesn't own the convention).
 */

import type { CameraAxes } from "../engine/camera";
import { collectDomeAncestry, domeAncestryEdgeKey } from "../model/dome-ancestry";
import { buildTrailGlintLegs, trailGlintLocalPhase } from "../model/footprint-steps";
import { bodyPresence, filamentPresence, galaxyAppearance, galaxyMeteorPhase, galaxySelectionInk, galaxyTemperatureKey, galaxyTwinkle, starLuminance } from "../model/galaxy";
import { isGalaxyEdgeVisible } from "../model/galaxy-layout";
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
  drawFootprintSteps,
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
  domeEdgeFogAlpha,
  domeEdgeMinWidthPx,
  domeEdgeWidthFactor,
  domeFogAlpha,
  DOME_RIM_FOG_FLOOR,
  domeHaloPx,
  domeLineWidthFactor,
  type DomeNodeFrame,
  type DomeViewKind,
} from "../model/dome-view";
import { draw as domeRingsDraw, drawTierLabels as domeTierLabelsDraw } from "../render/dome-rings";
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
  scaledLabelFont,
} from "../render/labels";
import { placeRelationCaptions, relationCaptionText, type PlacedRelationCaption, type RelationCaption } from '../render/relation-captions';
import {
  CLUSTER_CHIP_LABEL_PRIORITY,
  ellipsizeToWidth,
  greedyPlaceLabels,
  filterFadingLabelCollisions,
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
import { draw as nodeShapesDraw, drawGalaxyNodeStar, drawNodeStar } from "../render/node-shapes";
import { clusterChipOccupancyRect, drawClusterChip, clusterChipScale, type ClusterBarLabels } from "../render/cluster-chips";
import type { ClusterChip } from "../model/density-gate";
import { drawDiffractionSpike, drawRealmCosmos, drawStarDust, type DustPoint } from "../render/starfield";
import { drawGalaxyMeteor, drawGalaxyNebula } from "../render/galaxy-atmosphere";
import { isEdgeCulled, isNodeCulled, isPassthroughEdge } from "../render/viewport-cull";
import { draw as tracesDraw } from "../render/traces";
import {
  drawPreviewEdge,
  isPreviewEndpoint,
  isPreviewEndpointHidden,
} from "../render/preview-edge";
import { drawPulses, edgePairMeta, selectAmbientDependsComets, selectEgoContainsComets, type Pulse } from "../render/edge-fireflies";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
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
import { pressResponse } from "../expressive/mass-spring";
import { beginEdgeGlow, drawNodeBloom, endEdgeGlow } from "../expressive/ego-light";
import { drawNeuralBloom } from "../expressive/neural-bloom";

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
/*
 * ⚠️ **A dimmed node is still a node someone has to find.** At 0.42 the expanded map's
 * background read as "a dark cloud" (owner, 2026-09-03): a leaf ring at 3.2:1 dimmed to about
 * 1.5:1 and vanished into the canvas. 0.8 over the raised ink ladder keeps every background ring
 * at or above 3:1 while the expanded disc, its aura and the ego still stand a clear step above.
 */
const BACKGROUND_DIM_WHEN_EXPANDED = 0.8;

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
const domeRingScreenReused: {
  kind: DomeViewKind;
  a: number;
  points: { x: number; y: number; u: number }[];
  label: { x: number; y: number; text: string } | null;
}[] = [];
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
/** Resting nodes share NodeVisual objects; tint each palette once, not once per node. */
const neuralPaletteCache = new WeakMap<NodeVisual, { ramp: number; ink: string; fill: string; stroke: string }>();
let nodeVisualCacheTokens: OntologyMapTokens | null = null;
let nodeVisualCacheReducedMotion: boolean | null = null;
const KIND_CACHE_INDEX: Record<WorldNode["kind"], number> = { project: 0, domain: 1, capability: 2, element: 3 };
/** The zero dome frame — shared (and never mutated) by dome-off nodes and the 2D path. */
const ZERO_DOME_FRAME: DomeNodeFrame = { dx: 0, dy: 0, s: 1, a: 0, u: 0 };
/**
 * How far the lines NOT touching the hovered node recede at full hover ramp
 * (alpha multiplier 1 − step). 0.3 is a step the eye reads as "pointed away
 * from", still well above the dimmest data ink the contrast contract pins, and
 * small enough that sweeping the cursor across a dense map does not read as the
 * whole map flickering.
 */
const HOVER_RECEDE_ALPHA_STEP = 0.3;

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
 * **How many concepts this frame put on the canvas.**
 *
 * Counted in the node pass, past the collapsed-subtree skip and the tier-alpha
 * floor, so it is the number of marks a person can point at — not the vault's
 * node count and not the tier's nominal budget.
 *
 * Why it has to be counted rather than inferred: the bottom instrument readout
 * used to say "Domains only · zoom in to reveal elements" from the zoom tier
 * alone, and in the Cone view that sentence was simply false — every one of the
 * 125 concepts was already drawn (measured 2026-09-05). An instrument that
 * describes a rule instead of the screen is an instrument that lies.
 */
export function lastDrawnNodeCount(): number {
  return drawnNodeCount;
}
let drawnNodeCount = 0;

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
let drawnRelationCaptions: PlacedRelationCaption[] = [];
export function lastDrawnRelationCaptions(): readonly PlacedRelationCaption[] { return drawnRelationCaptions; }

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

function tierFill(kind: WorldNode["kind"], tokens: OntologyMapTokens): string {
  if (kind === "project") return tokens.nodeFillProject;
  if (kind === "domain") return tokens.nodeFillDomain;
  if (kind === "capability") return tokens.nodeFillCapability;
  return tokens.nodeFillElement;
}

function tierStroke(kind: WorldNode["kind"], tokens: OntologyMapTokens): string {
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
  tokens: OntologyMapTokens,
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

/**
 * How long the trail light takes to travel one relation.
 *
 * Four seconds, and deliberately slow. The travelling light is the only thing on this canvas
 * allowed to move on its own, and it is allowed because it answers a question the person
 * asked by opening the trail lens. A fast one would be a second thing to read while they are
 * trying to read the path.
 */
const TRAIL_GLINT_PERIOD_MS = 4000;

/**
 * How far the bloom swells at the peak of its ignition, as a fraction of its reach.
 *
 * Raised from 0.5 only once `starSwellCurve` moved the peak off the brightness peak. At the
 * old phase the extra reach measured as **+10% apparent radius** and vanished inside the
 * fade-up, so the amplitude was not wrong, it was spent where nothing could see it
 * (design-motion, 2026-09-10).
 */
const TRAIL_STAR_SWELL = 0.7;
/**
 * The ignition sweep: how long one star takes to come up, and how long the whole walk takes.
 *
 * Opening the lens redraws the path in the order it was walked. The span is fixed rather
 * than per-step, because a stride would make a twenty-stop walk take four seconds — the same
 * defect measured on the growth wall, where a fixed stride turned duration into a function of
 * how much the person had done. Inside a second, whatever the walk's length.
 */
const TRAIL_IGNITE_MS = 360;
const TRAIL_IGNITE_SPAN_MS = 900;

/**
 * When the star at step `n` of an `total`-stop walk starts coming up, in ms after the lens
 * opened.
 *
 * ⚠️ **`TRAIL_IGNITE_SPAN_MS` was never a span.** It was divided into a per-step stride and
 * then had one whole `TRAIL_IGNITE_MS` added on the end, so the number in the constant was
 * never the number on the screen: design-motion measured 1000 ms for a four-stop walk against
 * a declared 1400, and derived 1453 at six stops, 1640 at ten and 1827 at thirty (2026-09-10).
 * A budget that drifts with how much the person has done is the same defect the growth wall
 * shipped and had to take back.
 *
 * The stride is now whatever is left of the budget after the last star's own rise, so the
 * total equals the budget at every length: `(total − 1) · stride + TRAIL_IGNITE_MS = SPAN`.
 *
 * The replay is deliberately past the 400 ms Doherty threshold and that is not an oversight —
 * it is a *narrative* replay of a walk, and the acknowledgement a person actually waits on is
 * the popover, which completes in 133 ms. What the budget buys is that the narration cannot
 * grow into a wait.
 */
function trailIgniteStartMs(step: number, total: number): number {
  const stride = (TRAIL_IGNITE_SPAN_MS - TRAIL_IGNITE_MS) / Math.max(1, total - 1);
  return Math.max(0, step - 1) * stride;
}

/**
 * The ignition curve — a star coming out of the dark, not a value going from 0 to 1.
 *
 * ⚠️ **Linear is what makes a light look like a progress bar.** A star does not brighten at a
 * constant rate: it is nothing for a moment, comes up fast through the middle, and settles
 * into place. `smoothstep` is that shape, and the whole difference between "an element
 * appeared" and "something lit" is which of the two curves the alpha rode.
 */
function igniteCurve(t: number): number {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return u * u * (3 - 2 * u);
}

/**
 * The star's own core, which lights faster than it settles.
 *
 * ⚠️ `igniteCurve` is **symmetric** — design-motion measured 133 ms to the halfway point and
 * 167 ms back out — and an ignition in nature is not. Symmetry is exactly why the star read as
 * "a competent fade-up" rather than as a flare (2026-09-10). A cubic ease-out is the same
 * total duration spent differently: most of the light in the first third, then a long settle.
 * The bloom keeps the smoothstep, so the core arrives ahead of the light it throws.
 */
function starAttackCurve(t: number): number {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  const inv = 1 - u;
  return 1 - inv * inv * inv;
}

/**
 * The swell — how far the bloom reaches, over the star's rise.
 *
 * A half-sine, so the reach leaves at 1 and returns to 1 and the settled constellation is
 * dimensionally still. The exponent moves its peak from the middle of the rise to **0.72** of
 * it: at the middle the reach peaked at the same instant as the brightness and the whole
 * gesture measured as +10% apparent radius, invisible inside the fade-up. A star throws its
 * light *after* it lights (design-motion, 2026-09-10).
 */
function starSwellCurve(t: number): number {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.sin(Math.PI * Math.pow(u, TRAIL_SWELL_PHASE_EXP));
}

/** `0.72 ** e = 0.5` — the exponent that puts the half-sine's peak at 0.72 of the rise. */
const TRAIL_SWELL_PHASE_EXP = 2.11;
/**
 * How far a star's light swings as it twinkles, as a fraction of its own level.
 *
 * ⚠️ **This number was twice the subject of a false comment, for the same reason both times:
 * brightness was carrying the walk's order, and a twinkle is noise on whatever channel it
 * rides.** The first version compared the *earliest* stop to the newest — the easy pair — and
 * called the order safe. design-lead measured the pair that decides it: on a seven-step walk
 * adjacent stops differed by 1.10:1 while a 0.18 depth swung each star through 1.44:1, so
 * signal-to-noise was **1.04** and a fifth stop at its peak genuinely out-shone the newest at
 * its trough. Narrowing the swing to 0.05 bought 3.2 and a duller sky.
 *
 * design-infoviz then measured why that trade was not worth making: **no depth fixes it.**
 * Non-overlap needs an adjacent ratio above `(1+d)/(1−d)`, while the ramp can only offer
 * `1/(floor + (1−floor)·(n−1)/n)` — 1.41 at two stops, 1.17 at four, 1.06 at ten. It fails
 * for every walk of length ≥ 2 even at zero depth, because additive light on a dark canvas
 * clips: the measured on-screen order of a seven-step walk was 5 > 6 > 7 > 3.
 *
 * So brightness stopped carrying order. It is now binary — *walked* — and order lives where
 * it was always exact and already direct-labelled: the step ordinal beside the node and the
 * popover's list, both position-on-a-common-scale rather than shading. The twinkle modulates
 * nothing that means anything, which is the only condition under which a sky is allowed to
 * sparkle at all.
 */
const TRAIL_STAR_TWINKLE = 0.14;
/**
 * One twinkle cycle: this base plus up to `TRAIL_STAR_TWINKLE_SPREAD_MS`, per node.
 *
 * Slow enough to read as a star rather than as a blinking indicator — and **varied**, which is
 * the part the first version missed. Every star ran on one 3600 ms clock and differed only in
 * phase, which design-motion named exactly: a sky varies in rate, not only in phase
 * (2026-09-10). The period comes off the same id hash the phase does, so a given node always
 * breathes at its own speed.
 */
const TRAIL_STAR_TWINKLE_MS = 3200;
const TRAIL_STAR_TWINKLE_SPREAD_MS = 1400;
/** The walked line's halo — a wider copy of the curve laid under the ink, in star ink. */
const TRAIL_HALO_PX = 3.2;
const TRAIL_HALO_ALPHA = 0.3;

export interface FrameDrawParams {
  ctx: CanvasRenderingContext2D;
  world: TopologyWorld;
  camera: CameraAxes;
  /** Visual-expression axis (constellation ↔ circuit) — node/edge/label morph, diffraction, vignette. */
  farT: number;
  /**
   * How far the galaxy view has come, 0 (flat) to 1 (sky).
   *
   * A ramp rather than the boolean the person picked, so switching views crossfades instead of
   * cutting — the same shape every other lens on this canvas uses. The loop owns the clock.
   */
  galaxyRamp?: number;
  /** Milliseconds since this Galaxy entry; drives only deterministic atmosphere. */
  galaxyElapsedMs?: number;
  /** Shared world radius of the real-node spiral; aligns the cached sky texture. */
  galaxyLayoutRadius?: number;
  /** Coupling view material: lit cell bodies and softly tapered connections. */
  neuralRamp?: number;
  /** Semantic-zoom axis (`cameraScale / overviewEntryScale`) — drives tier visibility only. */
  zoomRatio: number;
  now: number;
  viewportWidth: number;
  viewportHeight: number;
  /**
   * The ratio `ctx` is transformed by, so a length in CSS px can be converted to
   * device pixels. Only the 3D resting relation line's width floor reads it
   * (`domeEdgeMinWidthPx`); everything else on this canvas is a CSS quantity by
   * design. Defaults to 1 — the value a caller that never scales the context has.
   */
  devicePixelRatio?: number;
  gridPattern: CanvasPattern | null;
  dustPoints: readonly DustPoint[];
  tokens: OntologyMapTokens;
  focusedNodeId: string | null;
  hoveredNodeId: string | null;
  /**
   * The node the press just left, or null. Its swell keeps the press's radius
   * coefficient while its emphasis decays, so a hover-out eases out instead of
   * stepping down by half the bump in one frame (design council, 2026-09-08).
   */
  hoverReleasedNodeId?: string | null;
  /**
   * Press (2026-09-08, direction B): the ms clock at which the current hover began, or
   * null. The hovered node's swell runs the underdamped step response
   * (`expressive/mass-spring.ts#pressResponse`) from that instant instead of the critical
   * emphasis ramp, so a hover reads as a press that gives. Omitted keeps the ramp.
   */
  hoverStartedAt?: number | null;
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
  relationCaptions?: ReadonlyMap<string, string> | null;
  reviewQuestionIds?: ReadonlySet<string> | null;
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
  /**
   * Which way the walk crossed each relation, same keys as `walkedEdgeKeys`.
   *
   * The star mark has no heading, so direction travels the line instead
   * (`model/footprint-steps.ts#buildWalkedEdgeDirections`, 2026-09-10).
   */
  walkedEdgeDirections?: ReadonlyMap<string, boolean> | null;
  /** Step at which the walk arrived along each relation — the line's place in the sweep. */
  walkedEdgeArrivalStep?: ReadonlyMap<string, number> | null;
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
   * Star ink for the walked path's light, as `#rrggbb`. `null` keeps the map dark — the
   * light is the whole notation now, so an absent ink means no trail marking at all.
   */
  trailStarInk?: string | null;
  /** The highest step ordinal in the walk, so recency can be a fraction of it. */
  footprintNewestStep?: number;
  /**
   * When the trail lens opened (`performance.now()`), or 0 while closed.
   *
   * Opening the lens **replays the walk**: stars ignite in the order they were made and the
   * lines follow them. That is the one motion on this canvas that is also an answer — the
   * order and the direction of the path are stated by the sweep itself, not only by the
   * ordinals beside the nodes.
   */
  trailLensOpenedAtMs?: number;
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
  domeRings?:
    | readonly {
        kind: DomeViewKind;
        a: number;
        points: readonly { wx: number; wy: number; u: number }[];
        /** Set only on a Strata plane ring — where that tier's name hangs. */
        label?: { wx: number; wy: number } | null;
      }[]
    | null;
  /**
   * 3D — base opacity for the rings this frame. The cone's small bases and
   * Strata's four full-width planes cannot share one value; `domeRingAlphaFor` in
   * `model/dome-view.ts` owns which is which.
   */
  domeRingAlpha?: number;
  /**
   * 3D — the tier names Strata writes at its plane rims, already translated. Null
   * (or a missing entry) draws the ring without a name rather than an English
   * fallback: a legend in the wrong language is worse than no legend.
   */
  domeTierLabels?: Readonly<Partial<Record<DomeViewKind, string>>> | null;
  /**
   * The Strata tier whose plane ring is raised — the legend row under the pointer
   * (`OntologyMapTierLegend`). Null raises nothing.
   */
  domeTierRaisedKind?: DomeViewKind | null;
  /**
   * 3D — the live projected control point, shared with picking and measurement.
   * Returning null leaves that edge on its planar assembly starting point.
   */
  domeControlFor?:
    | ((edge: WorldEdge) => { x: number; y: number } | null)
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
    galaxyRamp: galaxyRampProp = 0,
    galaxyElapsedMs = 0,
    galaxyLayoutRadius = 0,
    neuralRamp: neuralRampProp = 0,
    zoomRatio,
    now,
    viewportWidth,
    viewportHeight,
    devicePixelRatio: canvasDpr = 1,
    gridPattern,
    dustPoints,
    tokens,
    focusedNodeId,
    hoveredNodeId,
    hoverReleasedNodeId = null,
    hoverStartedAt = null,
    emphasizedNeighborId,
    hoveredEdge,
    selectedEdge,
    relationCaptions,
    reviewQuestionIds,
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
    walkedEdgeDirections = null,
    walkedEdgeArrivalStep = null,
    footprintInk = [232, 196, 122],
    footprintStepColor = "#e8c47a",
    footprintNewestId = null,
    footprintAppear = 1,
    trailStarInk = null,
    footprintNewestStep = 1,
    trailLensOpenedAtMs = 0,
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
    domeRingAlpha = DOME_RING_ALPHA,
    domeTierLabels = null,
    domeTierRaisedKind = null,
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
  /*
   * Phase of the light travelling every walked relation, 0-1.
   *
   * One clock for the whole trail rather than one per edge, so the path reads as a single
   * thing being retraced instead of a scatter of dots each on its own errand. Four seconds
   * a lap: slow enough that it never competes with reading.
   *
   * ⚠️ **This is a lap position, not a per-line position.** `buildTrailGlintLegs` cuts the lap
   * into slices proportional to each walked relation's length, so exactly one light exists at
   * a time and it walks the path in order at one constant speed. The previous shape — this
   * same number handed to every line at once — put three lights on screen simultaneously at a
   * 2.9x speed spread; the arithmetic is in that function's header.
   *
   * ⚠️ The claim that once stood here — that four seconds is "the rule this canvas lives under
   * since the ambient drift came off it on 2026-09-08" — was a **misattributed citation**. That
   * decision is *"The Library graph stands still; hover changes ink, never position"*, it
   * governs the Library's canvas rather than this one, and its own falsifier is "any rAF over
   * three idle seconds on a settled canvas" — which this loop fails for as long as the lens is
   * open (design-motion, 2026-09-10). The real licence is narrower and is stated where it
   * belongs, on the travelling light itself in `render/traces.ts`: a lens the person
   * deliberately opened may animate; a canvas nobody asked about may not.
   */
  const trailGlint = trailRamp > 0.001 ? ((now % TRAIL_GLINT_PERIOD_MS) / TRAIL_GLINT_PERIOD_MS) : 0;
  /*
   * The lap's division between the walked relations, rebuilt per frame from world-space chords
   * (the camera scales every edge alike, so world proportions are screen proportions). Null
   * with the lens shut, which is also the cheap path: no allocation on an ordinary frame.
   */
  const trailGlintLegs =
    trailRamp > 0.001 && walkedEdgeArrivalStep !== null && walkedEdgeArrivalStep.size > 0
      ? buildTrailGlintLegs(
          [...walkedEdgeArrivalStep.entries()]
            .sort((left, right) => left[1] - right[1])
            .map(([key]) => {
              const [sourceId, targetId] = key.split(" ");
              const from = world.nodeById.get(sourceId ?? "");
              const to = world.nodeById.get(targetId ?? "");
              return {
                key,
                length: from && to ? Math.hypot(to.x - from.x, to.y - from.y) : 0,
              };
            }),
        )
      : null;
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
  const neural = domeOn ? Math.min(1, Math.max(0, neuralRampProp)) : 0;

  /*
   * **How much of the sky is out.** One number for the whole frame, because the galaxy is an
   * *altitude* and not a property of any node: the owner picked distance over a toggle, so there
   * is nothing here to switch and nothing to keep in sync. `model/galaxy.ts` owns the maths and
   * the reasoning; this file only spends it.
   *
   * ⚠️ **2D only.** The galaxy is one of the two *flat* views, and the dome is a different view
   * with its own contract — it carries contrast floors that assume relations stay readable
   * against its ground. While it shipped as an altitude the two collided outright:
   * `filamentPresence` thinned containment lines in every 3D arrangement to a measured
   * **1.22:1 against a 1.9:1 floor** (`tests/e2e/map-3d-relation-ink.spec.ts`, caught on CI
   * 2026-09-10). The picker cannot produce that state any more — choosing a dome writes the
   * galaxy off — but the guard stays, because a preference pair that *can* disagree eventually
   * will.
   */
  const galaxy = domeOn ? 0 : galaxyRampProp;
  const galaxyOn = galaxy > 0.001;
  const galaxyPhase = galaxyAppearance(galaxy);
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
  const labelScale = Math.max(labelZoomScale(camera.scale.value), domeOn ? 1 + Math.min(1, domeRamp) * 0.3 : 1);

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
      // The grid already fades with altitude. Galaxy uses the same established
      // depth path so the blueprint recedes behind stars and relations instead
      // of competing with them; no separate background style is introduced.
      farT: Math.max(farT, domeRamp, galaxy),
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
  if (galaxyOn && galaxyLayoutRadius > 0) {
    const core = worldToScreen(camera, viewportWidth, viewportHeight, 0, 0);
    drawGalaxyNebula(ctx, {
      centerX: core.x,
      centerY: core.y,
      radius: galaxyLayoutRadius * camera.scale.value,
      alpha: Math.max(galaxyPhase.field * 0.88, galaxyPhase.corona * 0.7),
      warmInk: tokens.galaxyProject,
      coolInk: tokens.galaxyElement,
      accentInk: tokens.indigo,
    });
  }
  // devicePixelRatio: 1 — ctx is already DPR-transformed once by the caller
  // (`use-topology-loop.ts`), so dust points (already in CSS-pixel space)
  // must not be scaled a second time.
  drawStarDust(ctx, {
    points: dustPoints,
    // Galaxy borrows the existing seeded depth texture while its grid recedes.
    // Point count, ink, and alpha remain the far-field contract; this only lets
    // the chosen mode reach it without requiring an altitude change.
    farT: Math.max(farT, galaxy),
    devicePixelRatio: 1,
    opacityScale: galaxyOn ? 1.8 : 1,
    originX: reducedMotion ? 0 : gridOrigin.x,
    originY: reducedMotion ? 0 : gridOrigin.y,
    radialParallax: reducedMotion ? 0 : realmDustParallax,
  });
  if (galaxyOn && !reducedMotion) {
    drawGalaxyMeteor(
      ctx,
      galaxyMeteorPhase(galaxyElapsedMs),
      viewportWidth,
      viewportHeight,
      tokens.galaxyCapability,
      galaxyPhase.corona * 0.82,
    );
  }

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
    edge: WorldEdge,
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
    // The shared projection resolves the live frame once for drawing, picking,
    // and graph measurements; the planar curve remains the assembly starting point.
    const flatControlX = edge.controlX + (offA.dx + offB.dx) / 2;
    const flatControlY = edge.controlY + (offA.dy + offB.dy) / 2;
    const curve = domeControlFor === null ? null : domeControlFor(edge);
    const controlX = curve?.x ?? flatControlX;
    const controlY = curve?.y ?? flatControlY;
    out.a.x = (edge.ax + offA.dx - camX) * camScale + halfW;
    out.a.y = (edge.ay + offA.dy - camY) * camScale + halfH;
    out.b.x = (edge.bx + offB.dx - camX) * camScale + halfW;
    out.b.y = (edge.by + offB.dy - camY) * camScale + halfH;
    out.control.x = (controlX - camX) * camScale + halfW;
    out.control.y = (controlY - camY) * camScale + halfH;
    return out;
  };
  // Reach was drawn here until the design council of 2026-09-08 cut it: a ground halo
  // sized by the farthest 1-hop neighbour enclosed 290 non-neighbours out of 410 nodes
  // across 36 focus states, and a degree-3 node produced the same radius as a degree-15
  // one, so the disc lit whatever the layout happened to put inside it. The 1-hop fact
  // stays with the edge glow below, which can only touch a real relation.
  // Ego light (2026-09-08): the glow under the focused node's lines and the bloom under the
  // node ride the centre's focus ramp, so they arrive with the dive and leave with the fade.
  const egoGlowRamp =
    (!domeOn || neural > 0.001) && colorFocusedNodeId !== null ? Math.min(1, Math.max(0, focusRampById.get(colorFocusedNodeId) ?? 0)) : 0;
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
    edgeContains: lerpColorHex(tokens.edgeContains, tokens.indigo, neural * 0.12),
    edgeContainsL0: lerpColorHex(tokens.edgeContainsL0, tokens.indigoBright, neural * 0.12),
    edgeContainsL2: lerpColorHex(tokens.edgeContainsL2, tokens.indigo, neural * 0.12),
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
    // Galaxy's overview is the complete star field. The mode ramp reveals
    // every real concept while Flat keeps its semantic-zoom tiers unchanged.
    if (galaxyOn) outAlpha = outAlpha + (1 - outAlpha) * galaxy;
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
  const captionCandidates: RelationCaption[] = [];
  drawnRelationCaptions = [];
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
  let domeRingsState: Parameters<typeof domeRingsDraw>[1] | null = null;
  let domeRingsTokens: Parameters<typeof domeRingsDraw>[2] | null = null;
  if (domeOn && domeRings !== null && domeRings.length > 0) {
    domeRingsState = {
        // Ring projection writes into the scratch in place, rather than
        // allocating 288 objects per frame (see the buffer doc-block above).
        rings: (() => {
          for (let i = 0; i < domeRings.length; i += 1) {
            const ring = domeRings[i];
            let out = domeRingScreenReused[i];
            if (!out) {
              out = { kind: ring.kind, a: 0, points: [], label: null };
              domeRingScreenReused[i] = out;
            }
            out.kind = ring.kind;
            out.a = ring.a;
            const tierName = domeTierLabels?.[ring.kind];
            if (ring.label && tierName) {
              const at = project(ring.label.wx, ring.label.wy);
              out.label = { x: at.x, y: at.y, text: tierName };
            } else {
              out.label = null;
            }
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
        baseAlpha: domeRingAlpha,
        baseWidthPx: DOME_RING_WIDTH_PX,
        // The **same fog ramp** the nodes and edges use: if the coordinate system
        // fogged differently from the data, two things at one depth would render at
        // different brightness and the depth cues would contradict each other.
        fog: domeFogAlpha,
        widthFactor: domeLineWidthFactor,
        // The same right edge node labels are culled against, so a tier name and
        // a concept name obey one boundary.
        labelMaxX: viewportWidth - tokens.safeInsetRight,
        raisedKind: domeTierRaisedKind,
    };
    domeRingsTokens = {
        stroke: tokens.domeRing,
        // The hovered plane's ring only — it borrows the application's tertiary
        // text step rather than adding a colour (`domeRingRaised`).
        strokeRaised: tokens.domeRingRaised,
        // The dimmest node-label ink: a tier name must be read, so it stands a
        // step above the hairline it names, and it borrows an existing token
        // rather than introducing a colour for four words.
        labelFill: tokens.labelElement,
        // The capability step of the label ramp (`render/labels.ts`) — no larger
        // than a data label, because the stage never outranks the actors.
        labelFont: scaledLabelFont("capability", labelScale),
    };
    domeRingsDraw(ctx, domeRingsState, domeRingsTokens);
  }

  for (const kind of EDGE_KIND_PASSES) {
    for (let drawPos = 0; drawPos < edgeDrawOrder.length; drawPos += 1) {
      const edge = edgeDrawOrder[drawPos];
      if (edge.kind !== kind) continue;
      const sourceNode = world.nodeById.get(edge.sourceId);
      const targetNode = world.nodeById.get(edge.targetId);
      const galaxyFilamentInk =
        galaxyOn && sourceNode && targetNode
          ? galaxySelectionInk(
              tokens[galaxyTemperatureKey(sourceNode.kind)],
              tokens[galaxyTemperatureKey(targetNode.kind)],
              0.5,
            )
          : undefined;
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
      /**
       * The smallest stroke a resting line here may be drawn at, in CSS px
       * (`domeEdgeMinWidthPx`). Cross-faded on the same assembly ramp as the width
       * factor beside it, so the 2D↔3D morph cannot step a stroke, and 0 in 2D.
       */
      let domeMinWidthPx = 0;
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
          // The **edge** fog carries a floor under its product with the width
          // factor (`domeEdgeFogAlpha`); nodes and rings keep the raw ramp.
          domeEdgeFog = 1 + (domeEdgeFogAlpha(uAvg) - 1) * aMin;
          domeWidthScale = 1 + (domeEdgeWidthFactor(uAvg) - 1) * aMin;
          domeMinWidthPx = domeEdgeMinWidthPx(canvasDpr) * aMin;
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
        edge.targetId === selectedEdge.targetId &&
        (!selectedEdge.relationType || edge.relationType === selectedEdge.relationType);
      const isPathEdge = isPathLensEdge(mapLensKind, edge.id, pathEdgeIds);
      const hovered =
        hoveredEdge !== null &&
        edge.sourceId === hoveredEdge.sourceId &&
        edge.targetId === hoveredEdge.targetId &&
        edge.relationType === hoveredEdge.relationType;
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
      const walkedKey =
        edge.sourceId < edge.targetId
          ? `${edge.sourceId} ${edge.targetId}`
          : `${edge.targetId} ${edge.sourceId}`;
      /*
       * A line waits for the star it arrives at. During the ignition sweep the path draws
       * itself node by node, so the eye follows the walk in the order it happened instead of
       * being handed the finished shape all at once — which is the difference between a
       * picture of a path and a replay of one.
       */
      const walkedSweep =
        trailLensOpenedAtMs > 0 && footprintNewestStep > 0
          ? igniteCurve(
              (now -
                trailLensOpenedAtMs -
                trailIgniteStartMs(walkedEdgeArrivalStep?.get(walkedKey) ?? 1, footprintNewestStep)) /
                TRAIL_IGNITE_MS,
            )
          : 1;
      const walkedTrail =
        trailRamp > 0.001 && walkedEdgeKeys !== null && walkedEdgeKeys.has(walkedKey)
          ? trailRamp * walkedSweep
          : 0;
      if (
        galaxyOn &&
        !isGalaxyEdgeVisible(edge, {
          focusedNodeId,
          hoveredNodeId,
          selected: isSelectedEdge,
          path: isPathEdge,
          walked: walkedTrail > 0.01,
        })
      ) {
        continue;
      }
      /*
       * The stored direction is in key order (low id → high id); the line is drawn from
       * `edge.sourceId` to `edge.targetId`. When those disagree the light has to run the
       * other way, or it would confidently point at the wrong end.
       */
      const walkedLowToHigh = walkedEdgeDirections?.get(walkedKey);
      const trailDirection =
        walkedLowToHigh === undefined
          ? undefined
          : edge.sourceId < edge.targetId
            ? walkedLowToHigh
            : !walkedLowToHigh;
      // 3D fog exemption — relationships highlighted by interaction are not buried by depth.
      const domeEdgeExempt = emphasized || isSelectedEdge || isPathEdge || edgeEgoState === "ego";
      // Omit distant details — same rule as fog exemption: relationships brightened for reading
      // also reclaim their halo (if exempt edges cannot cut through tangled tangles, the exemption is half-hearted).
      if (!domeEdgeExempt && domeEdgeDetail < 1) domeHaloWidthPx *= domeEdgeDetail;
      /*
       * Hover lift (2026-09-02) — with nothing focused, the lines of the hovered
       * node rise toward the ego ink and every other line recedes a step, both on
       * the hovered node's own emphasis ramp (`emphasisById`, τ 90 ms), so the
       * change eases in with the ring and eases out when the cursor leaves. The
       * recede is deliberately mild: a focus dims to hide, a hover only points.
       * Nodes keep their ink — only lines move, which is what makes a hover read
       * as "these are its connections" without the screen changing under the
       * cursor. Suppressed under focus and lenses, which own attention there.
       */
      const hoverRamp =
        focusedNodeId === null && hoveredNodeId !== null && !trailLensActive && !pathLensActive
          ? Math.min(1, Math.max(0, emphasisById.get(hoveredNodeId) ?? 0))
          : 0;
      const hoverTouches = hoverRamp > 0 && (edge.sourceId === hoveredNodeId || edge.targetId === hoveredNodeId);
      const hoverLift = hoverTouches && edgeEgoState === "normal" ? hoverRamp : 0;
      const hoverRecede =
        hoverRamp > 0 && !hoverTouches && !isSelectedEdge && !isPathEdge ? 1 - HOVER_RECEDE_ALPHA_STEP * hoverRamp : 1;
      // In 3D the hovered node's lines also climb out of the depth fog on the
      // same ramp — the fog (near 1.0 → far 0.09) otherwise swallows the lift on
      // the far side of the cone tree, and a hover that lights only the near
      // half reads as broken rather than as depth.
      const domeEdgeFogForEdge = domeEdgeExempt ? 1 : 1 + (domeEdgeFog - 1) * (1 - hoverLift);
      // A line is never brighter than its dimmer endpoint's appear ramp: a node
      // swelling into view (new node, growth replay) brings its lines with it
      // instead of the lines arriving first.
      const edgeAppear = appearById
        ? Math.min(1, Math.max(0, Math.min(appearById.get(edge.sourceId) ?? 1, appearById.get(edge.targetId) ?? 1)))
        : 1;
      /*
       * Relations thin to **filaments** as the sky comes out — gas between the stars rather
       * than wiring between components. They are floored well above invisibility on purpose:
       * a galaxy with no structure between its stars is a scatter plot, and the structure is
       * the thing Atlas exists to show (`model/galaxy.ts`). A walked relation is exempt, since
       * it is the answer to a question the reader asked by opening the lens.
       */
      const filament = galaxyOn && walkedTrail <= 0.01 ? filamentPresence(galaxyPhase.filament) : 1;
      ctx.globalAlpha =
        (passthrough ? edgeAlpha * tokens.edgePassthroughAlpha : edgeAlpha) *
        edgeSpotlightSink *
        hoverRecede *
        edgeAppear *
        filament *
        domeEdgeFogForEdge;
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
       * because contract gates (footprint-trail-ink, review-ring-authorship)
       * pin that wiring.
       */
      if (domeHaloWidthPx > 0.05) {
        edgeHaloScratch.color = domeHaloColor;
        edgeHaloScratch.px = domeHaloWidthPx;
        edgeHaloScratch.alpha = Math.min(DOME_HALO_ALPHA_CAP, ctx.globalAlpha * DOME_HALO_ALPHA_GAIN);
      }
      /*
       * ⚠️ **The walked line's own light, laid under it.** A canvas shadow alone was measured
       * too faint to read as glow on a dashed relation — the line came out white but flat.
       * The depth halo already strokes a wider copy of the exact same curve beneath the ink,
       * which is a real light rather than a blur hint, so a walked relation borrows it in
       * star ink. It overrides the dome halo for the same edge on purpose: while the lens is
       * open, what this line is *for* outranks how far away it is.
       */
      if (walkedTrail > 0.01 && trailStarInk !== null) {
        edgeHaloScratch.color = trailStarInk;
        edgeHaloScratch.px = TRAIL_HALO_PX * walkedTrail;
        edgeHaloScratch.alpha = TRAIL_HALO_ALPHA * walkedTrail;
      }
      const galaxyEdgeInk = galaxyFilamentInk
        ? hoverLift > 0 || edgeEgoState === "ego" || isSelectedEdge
          ? tokens.indigoBright
          : galaxyFilamentInk
        : undefined;
      // Ego line glow — a blurred copy of the line under itself, indigo, on the centre's
      // focus ramp. Only the ego lines carry it (≤ degree per frame), so the blur's cost
      // stays bounded; everything else draws exactly as before.
      /*
       * ⚠️ **The walked line glows, and it is the only line that does while the lens is on.**
       * The owner asked for the connecting lines to light up with the nodes; the ego glow
       * stands down under the lens for the reason it always did — two glows in two inks on
       * one canvas would make the reader decide which light they are being shown.
       */
      const edgeGlows =
        walkedTrail > 0.01 && trailStarInk !== null
          ? beginEdgeGlow(
              ctx,
              walkedTrail,
              // The trail's own glow values, not the ego's — a constellation line is light,
              // and at the ego alpha it read as a slightly brighter dash.
              {
                ...tokens,
                egoGlowAlpha: tokens.trailGlowAlpha,
                egoGlowBlurPx: tokens.trailGlowBlurPx,
              },
              trailStarInk,
            )
          : edgeEgoState === "ego" && !trailLensActive
            ? beginEdgeGlow(ctx, egoGlowRamp, tokens)
            : galaxyEdgeInk
              ? beginEdgeGlow(
                  ctx,
                  galaxyPhase.filament * (hoverLift > 0 ? 0.82 : 0.36),
                  {
                    ...tokens,
                    egoGlowAlpha: tokens.egoGlowAlpha * 0.7,
                    egoGlowBlurPx: tokens.egoGlowBlurPx * 0.8,
                  },
                  galaxyEdgeInk,
                )
              : false;
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
          trailDirection,
          trailGlint:
            trailGlintLegs === null
              ? null
              : trailGlintLocalPhase(trailGlintLegs.get(walkedKey), trailGlint),
          farT,
          t: edge.t,
          emphasized,
          hoverLift,
          galaxyInk: galaxyEdgeInk,
          galaxyGlint:
            kind === "depends" && galaxyEdgeInk && !reducedMotion
              ? galaxyPhase.filament * (hoverLift > 0 || edgeEgoState === "ego" ? 0.78 : 0.32)
              : 0,
          reducedMotion,
          level: edge.level,
          widthScale: domeEdgeExempt ? 1 : 1 + (domeWidthScale - 1) * (1 - hoverLift),
          // The device-pixel floor rides the same population and the same ramp as
          // the depth width factor above it: only the lines depth is allowed to
          // thin, and only as far as the assembly ramp has brought them into 3D,
          // so the 2D↔3D morph cannot step a stroke.
          minWidthPx: domeEdgeExempt ? 0 : domeMinWidthPx,
          halo: domeHaloWidthPx > 0.05 ? edgeHaloScratch : null,
          containsCometEligible: kind === "contains" ? egoContainsComets.has(edgePairMeta(edge).key) : undefined,
          dependsCometEligible: kind === "depends" ? ambientDependsComets.has(edgePairMeta(edge).key) : undefined,
        },
        traceTokensFrame,
      );
      if (edgeGlows) endEdgeGlow(ctx);
      const caption = edge.id ? relationCaptions?.get(edge.id) : null;
      const directionalCaption = isDirectionalRelation(edge.relationType);
      const captionInFocus = selectedEdge ? isSelectedEdge : focusedNodeId ? touches : true;
      if (caption && captionInFocus && ctx.globalAlpha >= 0.5 && !passthrough && (directionalCaption || isSelectedEdge || touches || hovered)) {
        captionCandidates.push({ edgeId: edge.id!, text: relationCaptionText(caption, a, b, directionalCaption), x: (a.x + 2 * control.x + b.x) / 4, y: (a.y + 2 * control.y + b.y) / 4, priority: isSelectedEdge ? 5 : touches ? 4 : hovered ? 3 : edge.kind === 'contains' ? 2 : 1 });
      }
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
      /*
       * ⚠️ **No marks along the line.** Marks strung down a relation were the last of the
       * footprint notation — small objects a reader had to find and tie back to the line
       * they sat on. The owner cut them on 2026-09-10 (*"get rid of the footprint thing"*),
       * and the line does the work instead: a walked relation glows in star ink, which is
       * what a constellation line is. Nothing is drawn here at all now; the paint happens
       * in `tracesDraw` above, under the edge glow this frame turns on for it.
       */
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

  drawnNodeCount = 0;
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
    drawnNodeCount += 1;
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
    /*
     * Hover-out. The press bump is 0.16·r and the ripple bump is 0.08·r, so handing a
     * released node straight back to the ripple halved its bump in one frame — a ~1.4px
     * hard cut on the one mark the hand had just been on, while everything around it
     * eased (design council, 2026-09-08). The node the press left keeps the press
     * coefficient AND its bloom and rides its own emphasis decay to 0 (the bloom used to
     * be keyed to the live hover alone, so the re-recording after the council still
     * stepped 25.5 → 22.0 px in one frame at hover-out). It gives both up the moment it
     * becomes a neighbour of the NEW hover, because then it is a ripple member and 0.08
     * is what it is.
     */
    const releasedPress =
      node.id === hoverReleasedNodeId &&
      node.id !== hoveredNodeId &&
      !(hoveredNodeId !== null && (world.neighborMap.get(hoveredNodeId) ?? EMPTY_NEIGHBOR_SET).has(node.id));
    if (!focusedNodeId) {
      if (node.id === hoveredNodeId && !reducedMotion && hoverStartedAt !== null) {
        // Press: the underdamped step from the hover's first instant — it swells past
        // its rest (peak ≈ 1.31× at ζ 0.35) and settles, a press that gives. Hover-out
        // hands the node to the emphasis decay at the same coefficient (see below), so
        // the two curves meet without a step.
        const press = pressResponse((now - hoverStartedAt) / 1000, { omega: tokens.pressAngFreq, zeta: tokens.pressZeta });
        effRadius += Math.max(0, press) * baseRadius * 0.16;
      } else {
        effRadius +=
          emphasis * (node.id === hoveredNodeId || releasedPress ? baseRadius * 0.16 : baseRadius * 0.08);
      }
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
    // read brightens again. The 3D waiver that let this attenuation run past the
    // 2D 3:1 ink floor (`docs/DECISIONS.md`, the 3D waiver list) now stops at the
    // node's **rim**: the fill may still sink to 0.09, the edge may not
    // (`DOME_RIM_FOG_FLOOR`, 2026-09-05).
    // perf 2026-08-19 — recovers the buffered frame by sort index, no map re-lookup.
    const nodeDome = domeOn ? domeNodeFrameReused[domeNodeIndexReused[drawPos]] : ZERO_DOME_FRAME;
    // Far-side detail ramp (`domeDetailFactor` doc-block) — folds the extra strokes
    // of back-hemisphere nodes (depth halo, depth shading, metallic sheen, domain
    // pin tick) away continuously with depth. The outline left that list on
    // 2026-09-05 and is held at the rim floor instead. Same exemption rule as the
    // fog: hovered, trail, and ego nodes stay at 1.
    let domeDetail = 1;
    /*
     * The rim's share of its unfogged alpha (`NodeShapeDrawState.rimAlphaScale`).
     * Fog multiplies the whole node and bottoms out at 0.09, which left the
     * median rim at 1.15 : 1 against the background beside it and 117 of 125
     * nodes under 3 : 1 (measured 2026-09-05, sample vault at 1920). The fill,
     * shading, halo, line width, perspective size and draw order still carry
     * depth; only the edge gets a floor.
     */
    let domeRimAlphaScale = 1;
    if (domeOn) {
      effRadius *= nodeDome.s;
      if (!isHoveredNode && !previewEndpoint && !isTrailKept(node.id) && egoState === "normal") {
        // Neural depth keeps a visible cell body rather than leaving a bright
        // rim around an almost-black centre. Perspective and shading retain depth.
        const fog = Math.max(domeFogAlpha(nodeDome.u), neural * DOME_RIM_FOG_FLOOR);
        const domeFog = 1 + (fog - 1) * nodeDome.a;
        realmClarityAlpha *= domeFog;
        domeDetail = 1 + (domeDetailFactor(nodeDome.u) - 1) * nodeDome.a;
        domeRimAlphaScale = domeFog > 1e-4 ? Math.max(1, DOME_RIM_FOG_FLOOR / domeFog) : 1;
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
    // Every drawn disc reserves its own footprint, so a passive label never
    // paints across a neighbouring shape. This used to cover only ego members and
    // the hovered node, to leave the overview's label density alone; measured
    // 2026-09-03 on the sample vault with every domain open, twelve labels
    // crossed a leaf or hub ring once the ink ladder made those rings readable,
    // and a name over a shape makes both unreadable. A label blocked below flips
    // above before it is dropped (the placement further down), so the overview
    // keeps its names wherever a slot exists. Ego members and the hovered node
    // reserve the ring clearance too, because the selection ring and expand
    // badge sit just outside the disc.
    const attended = egoState === "center" || egoState === "neighbor" || node.id === hoveredNodeId;
    const reservedHalf = attended ? screenRadius + EXPANDED_AURA_RING_OFFSET : screenRadius + 1;
    nodeDiscReservations.push({
      ownerId: node.id,
      priority: NODE_DISC_LABEL_PRIORITY,
      bbox: {
        minX: screen.x - reservedHalf,
        maxX: screen.x + reservedHalf,
        minY: screen.y - reservedHalf,
        maxY: screen.y + reservedHalf,
      },
    });

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
    const nodeLayerAlpha = tierAlpha * realmClarityAlpha * backgroundDim * appearRevealAlpha * nodeSpotlightSink;
    /*
     * The body gives way to the light. It fades faster than the sky arrives (`bodyPresence` is
     * quadratic), so there is no altitude at which a node is both a solid shape and a bright
     * star — that frame is the one that would read as a rendering bug rather than as a galaxy.
     */
    ctx.globalAlpha = nodeLayerAlpha * (galaxyOn ? bodyPresence(galaxy) : 1);
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
    let bodyFill = visual.fill;
    let bodyStroke = visual.stroke;
    if (neural > 0.001 && colorEgoState !== "dim") {
      const ink = node.kind === "project" ? tokens.amberHub : tokens.indigoBright;
      let palette = neuralPaletteCache.get(visual);
      if (!palette || palette.ramp !== neural || palette.ink !== ink) {
        const fill = lerpColorHex(visual.fill, ink, neural * 0.85);
        palette = { ramp: neural, ink, fill, stroke: lerpColorHex(visual.stroke, fill, neural * 0.85) };
        neuralPaletteCache.set(visual, palette);
      }
      bodyFill = palette.fill;
      if (colorEgoState === "normal") bodyStroke = palette.stroke;
    }
    let sheenTop = sheenTopCache.get(bodyFill);
    if (sheenTop === undefined) {
      sheenTop = lerpColorHex(bodyFill, tokens.nodeSheenTint, tokens.nodeSheenBlend);
      if (sheenTopCache.size > 256) sheenTopCache.clear();
      sheenTopCache.set(bodyFill, sheenTop);
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
    // Bloom — a blurred indigo disc under the focused node (on the focus ramp) or the
    // hovered node (on its emphasis ramp): light marks the one thing the hand is on.
    // 2D only; the 3D views keep their depth grammar.
    if (!domeOn && !galaxyOn) {
      const bloomRamp =
        colorEgoState === "center"
          ? egoGlowRamp
          : !focusedNodeId && (node.id === hoveredNodeId || releasedPress)
            ? Math.min(1, Math.max(0, emphasis))
            : 0;
      drawNodeBloom(ctx, { x: screen.x, y: screen.y, r: screenRadius }, bloomRamp, tokens);
    }
    if (neural > 0.001 && colorEgoState !== "dim") {
      // Each glow hugs a real cell body. No region or inferred edge is painted.
      const strength = attended ? 1 : node.kind === "element" ? 0.35 : 0.6;
      drawNeuralBloom(ctx, { x: screen.x, y: screen.y, r: screenRadius }, neural, strength, tokens, canvasDpr,
        node.kind === "project" ? { core: tokens.amberHub, halo: tokens.amberHub } : undefined);
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
        // Far-side detail ramp — the domain pin tick and the depth shading recede
        // with it. The outline does not: `rimAlphaScale` holds it at the 3:1 floor.
        detail: domeDetail,
        rimAlphaScale: domeRimAlphaScale,
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
        fill: bodyFill,
        stroke: bodyStroke,
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
    /*
     * ⚠️ **This spike used to stand down on a walked node, and no longer needs to.** For one day
     * the walked star wore this same four-point cross, so a node that was both walked and bright
     * drew two of them at one point in two inks (design-system, 2026-09-10) and the walked one
     * won. The walked star has no cross now — `shared/lib/star-emission.ts` says why — so there
     * is nothing to collide with, and suppressing magnitude here would delete a fact to avoid a
     * conflict that has already been removed.
     */
    if (!galaxyOn && farT > 0.02 && (world.brightStarIds.has(node.id) || node.kind === "project")) {
      drawDiffractionSpike(ctx, {
        screenX: screen.x,
        screenY: screen.y,
        screenRadius,
        /*
         * The spike is the star's own light up here, so it takes the star's own temperature.
         * Left on `visual.stroke` it painted a **dim grey crosshair over a bright core** — the
         * kind ink is a near-black on this canvas, and a solid fill over an additive star reads
         * as a scratch on it rather than as light coming off it (measured 2026-09-10).
         */
        color: galaxyOn
          ? lerpColorHex(
              egoState === "dim" ? tokens.nodeStrokeDim : visual.stroke,
              tokens[galaxyTemperatureKey(node.kind)],
              galaxy,
            )
          : egoState === "dim"
            ? tokens.nodeStrokeDim
            : visual.stroke,
        alpha: farT * tierAlpha * realmClarityAlpha * backgroundDim * appearRevealAlpha,
      });
    }

    /*
     * **Every node is a star up here.**
     *
     * Not a second mark beside the node and not a mode: the same emitter the walked path uses
     * (`shared/lib/star-emission.ts`), spent on the whole field as altitude rises. Brightness is
     * `starMagnitude` — the very expression `brightStarIds` is ranked by, kept per node instead
     * of thresholded — and the ink is the kind's colour temperature, which is where kind goes
     * once `interpolateCornerRadius` and `FULL_CIRCLE_FAR_T` have melted every silhouette into
     * the same circle. Radius is untouched, so how much a node contains still reads as size.
     *
     * Drawn before the walked star so that a node which is both keeps the walk's own ink on top:
     * inside an open trail lens, "you were here" outranks "this is how connected you are", the
     * same precedence this file already applies to the ambient comet on a walked relation.
     */
    if (galaxyOn) {
      // Selection borrows the existing indigo state channel. The remaining
      // stars keep their kind temperature, so the inspected fact is distinct
      // from ordinary variation in magnitude.
      const temperatureInk = tokens[galaxyTemperatureKey(node.kind)];
      const galaxyInk = colorEgoState === "center"
        ? galaxySelectionInk(temperatureInk, tokens.indigoBright, focusRamp)
        : temperatureInk;
      const attention = colorEgoState === "center"
        ? focusRamp
        : isHovered
          ? Math.min(1, Math.max(0, emphasis))
          : 0;
      const luminance = nodeLayerAlpha * starLuminance(node.starMagnitude);
      const atmosphere = galaxyTwinkle(node.id, now, reducedMotion);
      const atmosphericLuminance = luminance * atmosphere.intensity;
      drawGalaxyNodeStar(ctx, {
        x: screen.x,
        y: screen.y,
        // Paint expands on the existing focus ramp while canonical hit and
        // label geometry remain unchanged. A low-magnitude selected concept
        // must still read as the protagonist beside brighter hubs.
        radius: screenRadius * (1 + 0.32 * attention),
        ink: galaxyInk,
        lit: Math.min(
          1,
          Math.max(
            atmosphericLuminance * galaxyPhase.core * (1 + 0.3 * attention),
            0.82 * attention * galaxyPhase.core,
          ),
        ),
        coronaLit: Math.min(
          1,
          Math.max(
            atmosphericLuminance * galaxyPhase.corona * (1 + 0.55 * attention),
            0.72 * attention * galaxyPhase.corona,
          ),
        ),
        presence: nodeLayerAlpha * galaxyPhase.field,
        glint:
          (world.brightStarIds.has(node.id) || attention > 0
            ? atmosphere.glint * galaxyPhase.corona
            : 0),
        glintRotation: atmosphere.rotation,
      });
    }


    /**
     * **A node you walked is lit like a star** (owner, 2026-09-10: *"I meant the node's own
     * border lighting up so it looks like a real star — get rid of the footprint thing, and
     * make the lines glow too"*).
     *
     * Two notations came before this one and both put a *second object* beside the node: a
     * concentric hairline ring, which became a fourth circle in a grammar already holding
     * the selection ring, the expand aura and the warding circle; then a pair of shoe
     * prints, which escaped that collision but was still a mark you had to find, read, and
     * relate back to the node it belonged to.
     *
     * The light is neither. It is the node, brighter — nothing to find, nothing to relate,
     * and it costs no space on a canvas whose whole problem is space. It is also the map's
     * own idiom: `render/starfield.ts` already says magnitude by brightness under a header
     * naming the language ("B1 constellation DNA"), so a walked node reading as a bright
     * star is this canvas finishing a sentence it had already started.
     *
     * **Brightness is binary: walked.** It said *recency* for one day and could not — see
     * `TRAIL_STAR_TWINKLE` for the arithmetic, but the short version is that additive light
     * on a dark canvas clips, so the ramp's own adjacent ratio falls under any discrimination
     * threshold by the second stop and the measured on-screen order of a seven-step walk came
     * out 5 > 6 > 7 > 3. Order is carried by the step ordinal beside the node and by the
     * popover's list; the end of the walk is carried by the cross, a categorical mark. One
     * fact per channel, and none of them shading.
     */
    const footprintSteps = footprintStepsById.get(node.id);
    if (footprintSteps !== undefined && footprintPref !== null && trailStarInk !== null) {
      const layerAlpha = tierAlpha * realmClarityAlpha * backgroundDim * appearRevealAlpha;
      // The stop's own place in the walk, used only to give the ignition sweep its order —
      // never to set a level. Every walked star settles at the same brightness.
      const newest = Math.max(...footprintSteps);
      /*
       * The step just taken **ignites** rather than being there already: its light comes up
       * on the same ramp the old prints used to slide out on, so arriving somewhere still
       * reads as an event. Every earlier star is settled at 1 and does not re-animate,
       * which is what stops the whole path flickering each time a step is added.
       */
      /*
       * The sweep. Each star waits for its turn in the walk, then comes up over
       * `TRAIL_IGNITE_MS`. Once the lens has been open past the span everything is at 1, so
       * this costs nothing in the settled state — and `footprintAppear` still owns the case
       * that matters after that: a step taken *while* the lens is open ignites on its own.
       */
      let sweepT = 1;
      /*
       * ⚠️ **Reduced motion takes the constellation settled, not swept.** The twinkle and the
       * travelling light were gated; this was not, and it drives a *size* animation through
       * `drawNodeStar`'s swell — the one kind of movement the preference exists to remove.
       * Nothing is lost by skipping it: brightness-carries-recency is a static encoding, so
       * the order of the walk is fully readable on the first frame (design-system, 2026-09-10).
       */
      if (!reducedMotion && trailLensOpenedAtMs > 0 && footprintNewestStep > 0) {
        const startAt = trailIgniteStartMs(newest, footprintNewestStep);
        sweepT = (now - trailLensOpenedAtMs - startAt) / TRAIL_IGNITE_MS;
        sweepT = sweepT < 0 ? 0 : sweepT > 1 ? 1 : sweepT;
      }
      // The core takes the fast attack; the bloom's reach keeps the smoothstep, one curve
      // behind it, so the light is thrown after it is struck.
      const ignite = (node.id === footprintNewestId ? footprintAppear : 1) * starAttackCurve(sweepT);
      /*
       * Each star keeps its own phase, derived from its id, so the constellation shimmers
       * rather than blinking in unison — a chorus of lights on one clock reads as a warning,
       * not as a sky. Still under reduced motion: the level stays, the swing goes.
       */
      let twinkle = 1;
      if (!reducedMotion) {
        let h = 0;
        for (let i = 0; i < node.id.length; i += 1) h = (h * 31 + node.id.charCodeAt(i)) % 6283;
        const periodMs = TRAIL_STAR_TWINKLE_MS + (h % TRAIL_STAR_TWINKLE_SPREAD_MS);
        twinkle = 1 + TRAIL_STAR_TWINKLE * Math.sin((now / periodMs) * Math.PI * 2 + h / 1000);
      }
      const lit = layerAlpha * footprintPref.opacity * trailRamp * ignite * twinkle;
      /*
       * ⚠️ **The node you are standing on is lit too, in the selection's own ink.**
       *
       * It used to be cut out of the walk entirely — `use-topology-loop` deleted the focused
       * node's step — under a rule written when the mark was a shoe print *beside* the node
       * and would have sat in the selection ring's own orbit. The mark became the node, the
       * collision went with it, and the deletion stayed: design-lead measured the stop a
       * person had just arrived at rendering **19x darker than the ones behind it**, so the
       * end of the walk read as a gap in it.
       *
       * Two facts, two channels, no gap: the emission says *walked*, the hue says *here now*.
       * The selection's double ring keeps the silhouette underneath, and lighting the same
       * node in the same indigo strengthens it rather than arguing with it — which the star
       * ink, at 2.95:1 against that indigo and clipping to white over it, did.
       */
      const starInk = node.id === focusedNodeId ? tokens.selectionRingIndigo : trailStarInk;
      if (galaxyOn) {
        const atmosphere = galaxyTwinkle(node.id, now, reducedMotion);
        drawGalaxyNodeStar(ctx, {
          x: screen.x,
          y: screen.y,
          radius: screenRadius,
          ink: starInk,
          lit: Math.min(1, lit * atmosphere.intensity),
          coronaLit: Math.min(1, lit * atmosphere.intensity),
          presence: layerAlpha * trailRamp,
          glint: atmosphere.glint * trailRamp,
          glintRotation: atmosphere.rotation,
        });
      } else {
        drawNodeStar(
          ctx,
          node.kind,
          screen.x,
          screen.y,
          // The light swells out of the node as it ignites and settles back — a star arriving
          // has a size, not only a brightness. It reaches 1 by the time the sweep is done, so
          // the settled constellation is dimensionally still.
          screenRadius,
          farT,
          starInk,
          lit,
          1 + TRAIL_STAR_SWELL * starSwellCurve(sweepT),
        );
      }
      /*
       * ⚠️ Gated on the ramp, not only on the ink. With the lens closed these survived their
       * own stars — measured as orphan 11px numerals floating up-right of unmarked nodes
       * (design-lead, 2026-09-10). A label outliving the thing it labels is not a label.
       */
      if (trailRamp > 0.001) drawFootprintSteps(
        { ctx, pref: footprintPref, ink: footprintInk, scale: footprintScale },
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
      ctx.globalAlpha = tierAlpha * EXPANDED_AURA_ALPHA * bodyPresence(galaxy);
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
      ctx.globalAlpha = tierAlpha * EXPANDED_COHORT_ALPHA * bodyPresence(galaxy);
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

  /*
   * Strata's tier names, after the relations and nodes. A ring is the stage and
   * goes under them; the name of the tier is a legend and has to survive them —
   * see `drawTierLabels`.
   */
  if (domeRingsState !== null && domeRingsTokens !== null) {
    domeTierLabelsDraw(ctx, domeRingsState, domeRingsTokens);
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
    /** This frame's normalised depth, 0 near … 1 far (always 0 in 2D) — the paint order. */
    depthU: number;
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
  const labelZoomTier = classifyZoomTier(zoomRatio);
  const applyLabelTopK = labelZoomTier !== "element";
  // At Galaxy overview altitude the named constellations are the project and
  // its real domains. Capability/element names return when the reader leans in
  // or points/focuses, so the initial sky does not promote whichever leaves
  // happened to win a global degree ranking over the domain anchors.
  const galaxyOverviewLabelsOnly =
    galaxyOn && labelZoomTier === "spine" && focusedNodeId === null && selectedEdge === null;
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
  /** Per candidate: the slot above its node, in case the one below is blocked. */
  const labelFlipSlots = new Map<string, { baselineY: number; ascent: number; descent: number }>();
  for (let index = 0; index < world.nodes.length; index += 1) {
    const node = world.nodes[index];
    const previewEndpoint = isPreviewEndpoint(previewEdge, node.id);
    const previewTarget = node.id === previewEdge?.targetId;
    // Density condition: a collapsed subtree's nodes get no label either, matching
    // the node and edge passes.
    if (isPreviewEndpointHidden(clusteredIds.has(node.id), previewEdge, node.id)) continue;
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
    if (
      galaxyOverviewLabelsOnly &&
      node.kind !== "project" &&
      node.kind !== "domain" &&
      !isHovered &&
      !previewEndpoint &&
      !trailKept &&
      !pathKept
    ) {
      continue;
    }
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
    const compactAlpha = computeLabelAlpha({
      kind: node.kind,
      egoState,
      isHovered,
      revealAlpha: labelRevealAlpha,
    });
    /*
     * 3D used to draw **no resting labels at all**: every node that was not
     * hovered, ego or trail-kept had its label multiplied by `1 - assembly ramp`,
     * which is 0 once the cone stands. The judgment behind it was that
     * always-visible labels break the silhouette — but measured on the sample
     * vault (2026-09-05) it meant 125 anonymous dots, and the reader had to point
     * at each one to learn what it was.
     *
     * The flat map has never needed that trade, because it does not draw every
     * label either: the greedy placer below drops a name that has no room
     * (`render/label-layout.ts`), node discs are reserved so a name never lands on
     * a foreign shape, and the top-K budget caps how many compete. The cone now
     * uses the same three rules. Nothing here decides visibility any more.
     */
    // perf 2026-08-19 — use index buffer (`nodeFrameAt`) instead of re-querying frames.
    const labelDome = nodeFrameAt(index);
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
    const text = ellipsizeToWidth(reviewQuestionIds?.has(node.id) ? `? ${node.label}` : node.label, tokens.labelMaxWidth * labelScale, (candidate) =>
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
      if (!(galaxyOn && node.kind === "domain") && !isSafeRectProtectedLabel({
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
        (galaxyOn && (node.kind === "project" || node.kind === "domain")) ||
        egoState === "center" ||
        isHovered ||
        trailKept ||
        pathKept ||
        (egoState === "neighbor" && isEgoNeighborLabelExempt(node.id, egoNeighborLabelEligibleIds));
      labelRankEntries.push({ id: node.id, degree: world.neighborMap.get(node.id)?.size ?? 0, exempt });
    }
    const priority = galaxyOn && (node.kind === "project" || node.kind === "domain") ? 1 : resolveLabelPriority({
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
    const candidateBbox = boxAt(clampedAnchorY);
    labelBboxById.set(node.id, candidateBbox);
    /*
     * The upper slot this label would take if the lower one turns out to be
     * blocked. Deciding that here would mean scanning **every** node's disc
     * reservation for **every** candidate — O(n²), and on a 2,000-node vault it
     * took the 3D drag frame from 8.8 ms to 37 ms p95 (measured 2026-09-05, the
     * frame the cone's resting labels were switched on). The decision moves below
     * the top-K budget instead, where it runs for the labels that can still be
     * placed rather than for every node on screen. The slot itself is unchanged.
     */
    labelFlipSlots.set(node.id, {
      baselineY: resolveFlippedLabelBaselineY(screen.y, screenRadius) + (clampedAnchorY - anchorY),
      ascent: vertical.ascent,
      descent: vertical.descent,
    });
    labelCandidates.push({
      priority,
      /*
       * **Nearer wins the slot.** Within one priority band the placer settles ties
       * by `order`, so in the cone that order is depth: a node at the front of the
       * structure keeps its name and the one behind it yields, which is the same
       * answer occlusion already gives the eye. In 2D there is no depth and the
       * array index stands, exactly as before.
       */
      order: domeOn ? Math.round(labelDome.u * 100000) : index,
      ownerId: node.id,
      bbox: candidateBbox,
      payload: {
        nodeId: node.id,
        kind: node.kind,
        text,
        screenX: screen.x + shiftX,
        screenY: screen.y + shiftY,
        // Pass the baseline the placer settled on: recomputing it inside `draw()`
        // would undo the flipped slot. Rewritten by the flip pass below when the
        // lower slot turns out to be blocked.
        baselineY: clampedAnchorY,
        screenRadius,
        egoState,
        isHovered,
        revealAlpha: labelRevealAlpha,
        agentFocus,
        depthU: domeOn ? labelDome.u : 0,
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

  /*
   * **Blocked below, flip above** — for the candidates that survived the budget.
   * Suppressing outright would recreate the very "unlabelled shape" this
   * mechanism removes, so a label is dropped only after a second slot has been
   * tried. The upper slot mirrors the same offset across the node: no new
   * spacing, no new token. It runs here rather than inside the candidate loop for
   * the cost reason given at `labelFlipSlots`.
   */
  for (const candidate of placedLabelCandidates) {
    const nodeId = candidate.payload.nodeId;
    if (!overlapsForeignReserved(candidate.bbox, nodeId, candidate.priority, nodeDiscReservations)) {
      continue;
    }
    const slot = labelFlipSlots.get(nodeId);
    if (slot === undefined) continue;
    const flipped = {
      minX: candidate.bbox.minX,
      maxX: candidate.bbox.maxX,
      minY: slot.baselineY - slot.ascent,
      maxY: slot.baselineY + slot.descent,
    };
    if (overlapsForeignReserved(flipped, nodeId, candidate.priority, nodeDiscReservations)) continue;
    candidate.bbox = flipped;
    candidate.payload.baselineY = slot.baselineY;
    labelBboxById.set(nodeId, flipped);
  }

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
  let drawList: { payload: LabelPayload; presenceAlpha: number }[] = [];
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
  if (domeOn) {
    // A departing label may fade in empty space, but cannot keep painting over
    // a placed label during a 3D fit/morph. Legibility wins at the collision.
    drawList = filterFadingLabelCollisions(drawList,
      entry => placedIds.has(entry.payload.nodeId), entry => labelBboxById.get(entry.payload.nodeId));
  }
  prevPlacedLabelIds = placedIds;

  /*
   * Nearer names land on top of farther ones, the same painter's order the node
   * pass uses. Without it the paint order was the world array's, so a label from
   * the back of the cone could cross one at the front and read as the front
   * node's name. Stable, and a no-op in 2D where every `depthU` is 0.
   */
  if (domeOn) drawList.sort((a, b) => b.payload.depthU - a.payload.depthU);

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
        // A label is never brighter than its node's appear ramp — a node still
        // swelling in (new node, growth replay) must not be named before it is there.
        presenceAlpha: presenceAlpha * (appearById ? Math.min(1, Math.max(0, appearById.get(payload.nodeId) ?? 1)) : 1),
      },
      {
        labelProject: tokens.labelProject,
        labelDomain: tokens.labelDomain,
        labelCapability: tokens.labelCapability,
        labelElement: tokens.labelElement,
        amberHub: tokens.amberHub,
        labelHalo: tokens.canvasBgNear,
      },
    );
  }
  if (captionCandidates.length) {
    drawnRelationCaptions = placeRelationCaptions(captionCandidates, [...nodeDiscReservations.map((item) => item.bbox), ...chipReservations.map((item) => item.bbox), ...drawnLabelBoxes], safeRect, (text) => measureLabelWidth(ctx, 'capability', text, 1), scaledLabelFontSize('capability', 1) + 8);
    ctx.save();
    ctx.font = scaledLabelFont('capability', 1);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = 1;
    for (const caption of drawnRelationCaptions) {
      ctx.fillStyle = tokens.canvasBgNear;
      ctx.fillRect(caption.minX, caption.minY, caption.maxX - caption.minX, caption.maxY - caption.minY);
      ctx.fillStyle = tokens.labelCapability;
      ctx.fillText(caption.text, caption.x, caption.y);
    }
    ctx.restore();
  }
}
