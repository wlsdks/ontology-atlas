/**
 * Per-frame Canvas 2D draw pipeline — the composition point for `engine/`,
 * `model/`, and `render/*` (`docs/TOPOLOGY-V2-DESIGN.md` §4 P2-P4, prototype
 * `render()` §13). Camera-space conversions live in `topology-camera-math.ts`
 * (this file only consumes `worldToScreen`, it doesn't own the convention).
 */

import type { CameraAxes } from "../engine/camera";
import { resolveEdgeEgoState, resolveNodeEgoState, type NodeEgoState } from "../model/focus-state";
import { resolveFreshnessVisual } from "../model/freshness";
import { DEFAULT_TIER_REVEAL, edgeTierAlpha, effectiveNodeAlpha, nodeTierAlpha } from "../model/tier-visibility";
import { draw as gridDraw, lerpColorHex } from "../render/grid";
import {
  computeLabelAlpha,
  draw as labelsDraw,
  LABEL_FONT_SIZE,
  LABEL_OFFSET,
  measureLabelWidth,
} from "../render/labels";
import {
  ellipsizeToWidth,
  greedyPlaceLabels,
  isWithinSafeRect,
  type LabelCandidate,
  type SafeRect,
} from "../render/label-layout";
import { draw as nodeShapesDraw } from "../render/node-shapes";
import { drawDiffractionSpike, drawStarDust, type DustPoint } from "../render/starfield";
import { draw as tracesDraw } from "../render/traces";
import type { TopologyV2Tokens } from "../tokens/read-topology-v2-tokens";
import { worldToScreen } from "./topology-camera-math";
import { radiusForKind, type TopologyWorld, type WorldNode } from "./topology-world";

const EMPTY_NEIGHBOR_SET: ReadonlySet<string> = new Set();
const LINE_WIDTH_BY_KIND: Record<WorldNode["kind"], number> = {
  project: 2,
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

/** Deterministic per-node breathe-phase offset — a stable hash stands in for the prototype's seeded-RNG phase (layout has no PRNG in this contract, `model/layout.ts` JSDoc). */
function phaseForId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(hash) % 1000) / 1000) * Math.PI * 2;
}

interface NodeVisual {
  fill: string;
  stroke: string;
  dash: readonly number[];
  lineWidth: number;
  breatheEnabled: boolean;
}

function resolveNodeVisual(
  node: WorldNode,
  egoState: NodeEgoState,
  emphasis: number,
  focusedNodeId: string | null,
  isEmphasizedNeighbor: boolean,
  tokens: TopologyV2Tokens,
  reducedMotion: boolean,
): NodeVisual {
  const freshness = resolveFreshnessVisual({ fresh: node.fresh, stale: node.stale, hub: node.isHub }, reducedMotion);
  const lineWidth = LINE_WIDTH_BY_KIND[node.kind];

  if (egoState === "dim") {
    return { fill: tokens.nodeFillDim, stroke: tokens.nodeStrokeDim, dash: freshness.dash, lineWidth, breatheEnabled: false };
  }
  if (freshness.useStaleFillStroke) {
    return { fill: tokens.nodeFillStale, stroke: tokens.nodeStrokeStale, dash: freshness.dash, lineWidth, breatheEnabled: false };
  }

  let stroke = tierStroke(node.kind, tokens);
  if (freshness.strokeIndigoLerp > 0) stroke = lerpColorHex(stroke, tokens.indigo, freshness.strokeIndigoLerp);
  if (!focusedNodeId && emphasis > 0.02) stroke = lerpColorHex(stroke, tokens.indigo, Math.min(1, emphasis));
  if (egoState === "neighbor") stroke = lerpColorHex(stroke, tokens.indigo, 0.5);
  // Panel-linked ripple: the hovered detail-row's neighbor pushes past the flat
  // 0.5 neighbor tint toward the brightest indigo, tracking its emphasis ramp.
  if (isEmphasizedNeighbor && emphasis > 0.02) stroke = lerpColorHex(stroke, tokens.indigoBright, Math.min(1, emphasis));
  if (egoState === "center") stroke = tokens.indigoBright;

  return { fill: tierFill(node.kind, tokens), stroke, dash: freshness.dash, lineWidth, breatheEnabled: freshness.breatheEnabled };
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
  emphasisById: ReadonlyMap<string, number>;
  /** C1 A2 — ego tier-reveal ramp (`topology-physics-step.ts` steps it), consumed by `effectiveNodeAlpha`. */
  egoRevealById: ReadonlyMap<string, number>;
  reducedMotion: boolean;
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
    emphasisById,
    egoRevealById,
    reducedMotion,
  } = params;

  gridDraw(
    ctx,
    { viewportWidth, viewportHeight, farT, gridPattern },
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
  drawStarDust(ctx, { points: dustPoints, farT, devicePixelRatio: 1 });

  const project = (x: number, y: number) => worldToScreen(camera, viewportWidth, viewportHeight, x, y);
  const neighborsOfFocused = focusedNodeId ? world.neighborMap.get(focusedNodeId) ?? EMPTY_NEIGHBOR_SET : EMPTY_NEIGHBOR_SET;

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
  // edges/nodes/labels actually draw with; `tierAlphaById` stays the raw gate
  // value (still needed as `effectiveNodeAlpha`'s first argument).
  const tierAlphaById = new Map<string, number>();
  const effectiveAlphaById = new Map<string, number>();
  for (const node of world.nodes) {
    const tierAlpha = nodeTierAlpha(node.kind, node.isHub, zoomRatio, DEFAULT_TIER_REVEAL);
    tierAlphaById.set(node.id, tierAlpha);
    const isEgoMember =
      focusedNodeId !== null && (node.id === focusedNodeId || neighborsOfFocused.has(node.id));
    effectiveAlphaById.set(node.id, effectiveNodeAlpha(tierAlpha, isEgoMember, egoRevealById.get(node.id) ?? 0));
  }

  for (const kind of ["contains", "depends"] as const) {
    for (const edge of world.edges) {
      if (edge.kind !== kind) continue;
      const edgeAlpha = edgeTierAlpha(effectiveAlphaById.get(edge.sourceId) ?? 1, effectiveAlphaById.get(edge.targetId) ?? 1);
      if (edgeAlpha <= 0.02) continue;
      const touches = focusedNodeId !== null && (edge.sourceId === focusedNodeId || edge.targetId === focusedNodeId);
      const emphasized =
        emphasizedNeighborId !== null &&
        touches &&
        (edge.sourceId === emphasizedNeighborId || edge.targetId === emphasizedNeighborId);
      ctx.globalAlpha = edgeAlpha;
      tracesDraw(
        ctx,
        {
          a: project(edge.ax, edge.ay),
          b: project(edge.bx, edge.by),
          control: project(edge.controlX, edge.controlY),
          relationType: kind,
          egoState: resolveEdgeEgoState(touches, focusedNodeId),
          farT,
          t: edge.t,
          emphasized,
        },
        {
          edgeContains: tokens.edgeContains,
          edgeDepends: tokens.edgeDepends,
          edgeDim: tokens.edgeDim,
          indigo: tokens.indigo,
          indigoBright: tokens.indigoBright,
        },
      );
      ctx.globalAlpha = 1;
    }
  }

  for (const node of world.nodes) {
    const tierAlpha = effectiveAlphaById.get(node.id) ?? 1;
    if (tierAlpha <= 0.02) continue;
    const egoState = resolveNodeEgoState(node.id, focusedNodeId, neighborsOfFocused);
    const emphasis = emphasisById.get(node.id) ?? 0;
    const isEmphasizedNeighbor = emphasizedNeighborId !== null && node.id === emphasizedNeighborId && egoState === "neighbor";
    const visual = resolveNodeVisual(node, egoState, emphasis, focusedNodeId, isEmphasizedNeighbor, tokens, reducedMotion);

    const baseRadius = radiusForKind(node.kind, tokens);
    let breathe = 1;
    if (visual.breatheEnabled) {
      breathe = 1 + tokens.breatheAmplitude * Math.sin((now / 1000) * tokens.breatheFreqRad + phaseForId(node.id));
    }
    let effRadius = baseRadius * breathe;
    if (egoState === "center") effRadius *= 1.12;
    if (!focusedNodeId) {
      effRadius += emphasis * (node.id === hoveredNodeId ? baseRadius * 0.16 : baseRadius * 0.08);
    } else if (isEmphasizedNeighbor) {
      effRadius += emphasis * baseRadius * 0.12;
    }

    const screen = project(node.x, node.y);
    const screenRadius = effRadius * camera.scale.value;

    ctx.globalAlpha = tierAlpha;
    // Sheen top stop = lerp(fill, tint, blend) — resolved here (token layer)
    // so `render/node-shapes.ts` stays token-free and pure.
    const sheenTop = lerpColorHex(visual.fill, tokens.nodeSheenTint, tokens.nodeSheenBlend);
    // Engraved numeral: project/domain only, and only when there's a count to
    // show (prototype `if (n.count && (project||domain) ...)`).
    const showCount = (node.kind === "project" || node.kind === "domain") && node.count > 0;
    nodeShapesDraw(
      ctx,
      {
        kind: node.kind,
        screenX: screen.x,
        screenY: screen.y,
        screenRadius,
        farT,
        egoState,
        fill: visual.fill,
        stroke: visual.stroke,
        lineWidth: visual.lineWidth,
        dash: visual.dash,
        hub: node.isHub,
        sheenTop,
        countLabel: showCount ? String(node.count) : null,
      },
      {
        amberHub: tokens.amberHub,
        numeralShadow: tokens.numeralShadow,
        numeralFace: tokens.numeralFace,
        holeFill: tokens.nodeHoleFill,
      },
    );

    if (world.brightStarIds.has(node.id) && farT > 0.02) {
      drawDiffractionSpike(ctx, {
        screenX: screen.x,
        screenY: screen.y,
        screenRadius,
        color: egoState === "dim" ? tokens.nodeStrokeDim : visual.stroke,
        alpha: farT * tierAlpha,
      });
    }
    ctx.globalAlpha = 1;
  }

  // --- labels: viewport/panel cull + priority greedy suppression + ellipsis ---
  // (Design Guardian 가독성 반려) Labels used to leak behind the left ReaderLens
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
  const KIND_PRIORITY: Record<WorldNode["kind"], number> = { project: 0, domain: 1, capability: 2, element: 3 };
  interface LabelPayload {
    kind: WorldNode["kind"];
    text: string;
    screenX: number;
    screenY: number;
    screenRadius: number;
    egoState: NodeEgoState;
  }
  const labelCandidates: LabelCandidate<LabelPayload>[] = [];
  world.nodes.forEach((node, index) => {
    // Uses the SAME effective alpha as the node draw pass (C1 A2) — an
    // ego-exempt capability that's now visible must also get a label, or it
    // reads as an unlabeled ghost circle.
    if ((effectiveAlphaById.get(node.id) ?? 1) <= 0.02) return;
    const egoState = resolveNodeEgoState(node.id, focusedNodeId, neighborsOfFocused);
    if (computeLabelAlpha(node.kind, farT, camera.scale.value, egoState) <= 0.02) return;

    const screen = project(node.x, node.y);
    const screenRadius = radiusForKind(node.kind, tokens) * camera.scale.value;
    const anchorY = screen.y + screenRadius + LABEL_OFFSET[node.kind];
    if (!isWithinSafeRect(screen.x, anchorY, safeRect)) return;

    const text = ellipsizeToWidth(node.label, tokens.labelMaxWidth, (candidate) =>
      measureLabelWidth(ctx, node.kind, candidate),
    );
    const width = measureLabelWidth(ctx, node.kind, text);
    const fontSize = LABEL_FONT_SIZE[node.kind];
    labelCandidates.push({
      priority: KIND_PRIORITY[node.kind],
      order: index,
      bbox: { minX: screen.x - width / 2, maxX: screen.x + width / 2, minY: anchorY - fontSize, maxY: anchorY + 2 },
      payload: { kind: node.kind, text, screenX: screen.x, screenY: screen.y, screenRadius, egoState },
    });
  });

  for (const { payload } of greedyPlaceLabels(labelCandidates)) {
    labelsDraw(
      ctx,
      {
        kind: payload.kind,
        text: payload.text,
        screenX: payload.screenX,
        screenY: payload.screenY,
        screenRadius: payload.screenRadius,
        farT,
        cameraScale: camera.scale.value,
        egoState: payload.egoState,
      },
      {
        labelProject: tokens.labelProject,
        labelDomain: tokens.labelDomain,
        labelCapability: tokens.labelCapability,
        labelElement: tokens.labelElement,
      },
    );
  }
}
