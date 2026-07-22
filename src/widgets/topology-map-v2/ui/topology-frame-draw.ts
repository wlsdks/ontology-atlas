/**
 * Per-frame Canvas 2D draw pipeline — the composition point for `engine/`,
 * `model/`, and `render/*` (`docs/TOPOLOGY-V2-DESIGN.md` §4 P2-P4, prototype
 * `render()` §13). Camera-space conversions live in `topology-camera-math.ts`
 * (this file only consumes `worldToScreen`, it doesn't own the convention).
 */

import type { CameraAxes } from "../engine/camera";
import { resolveEdgeEgoStateWithPair, resolveNodeEgoStateWithPair, type EdgePairFocus, type NodeEgoState } from "../model/focus-state";
import { resolveFreshnessVisual } from "../model/freshness";
import { computeSelectionPulse, type SelectionPulseVisual } from "../model/selection-pulse";
import { depthParallaxOffsetFor, ZERO_PARALLAX } from "../model/realm-depth-parallax";
import { realmDepthClarityAlpha, realmDepthClarityScale } from "../model/realm-transition";
import { classifyZoomTier, DEFAULT_TIER_REVEAL, edgeTierAlpha, effectiveNodeAlpha, nodeTierAlpha } from "../model/tier-visibility";
import { LABEL_TOP_K, selectTopKLabels, type LabelRankEntry } from "../model/label-lod";
import { draw as gridDraw, lerpColorHex } from "../render/grid";
import {
  ACTIVITY_MARK_GAP,
  ACTIVITY_MARK_RADIUS,
  computeDomainWatermarkAlpha,
  computeLabelAlpha,
  draw as labelsDraw,
  LABEL_OFFSET,
  labelZoomScale,
  measureLabelWidth,
  scaledLabelFontSize,
} from "../render/labels";
import {
  ellipsizeToWidth,
  greedyPlaceLabels,
  clampAnchorIntoSafeRect,
  isWithinSafeRect,
  resolveLabelPriority,
  type LabelCandidate,
  type SafeRect,
} from "../render/label-layout";
import { draw as nodeShapesDraw } from "../render/node-shapes";
import { drawClusterChip, clusterChipScale } from "../render/cluster-chips";
import type { ClusterChip } from "../model/density-gate";
import { drawDiffractionSpike, drawStarDust, type DustPoint } from "../render/starfield";
import { isEdgeCulled, isNodeCulled, isPassthroughEdge } from "../render/viewport-cull";
import { draw as tracesDraw } from "../render/traces";
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
import { radiusForKind, type TopologyWorld, type WorldNode } from "./topology-world";

const EMPTY_NEIGHBOR_SET: ReadonlySet<string> = new Set();
// perf sweep 2026-07 — reused frame-scratch Maps, see their `.clear()` call
// site in `drawTopologyFrame` below for why this is safe.
const tierAlphaByIdReused = new Map<string, number>();
const effectiveAlphaByIdReused = new Map<string, number>();
// Project bumped 2 → 1.5 (canvas-emphasis slice §A1) to match the owner spec's
// "외곽 스트로크 1.5px 앰버" exactly — the outer stroke itself now hardcodes
// amber for project (see `resolveNodeVisual` below), so its width is spec'd
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

  // Canvas-emphasis slice §A1 — the project (Layer-0 container) hexagon's own
  // outer stroke is hardcoded amber, NOT tier-neutral-then-ego-tinted like
  // every other kind (design.md explicitly reserves amber for "Hub 노드와
  // Layer 0 컨테이너"). Selection/hover/neighbor emphasis is still fully
  // visible for project — it just moves to the dedicated ring overlays
  // (`render/node-shapes.ts`'s `strokeKindOutline` calls under
  // `egoState === "center"` / `isHovered`) instead of recoloring the body, so
  // the amber identity never gets muddied by an indigo lerp.
  if (node.kind === "project") {
    return { fill: tierFill(node.kind, tokens), stroke: tokens.amberHub, dash: freshness.dash, lineWidth, breatheEnabled: freshness.breatheEnabled };
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
  /** P3c — 호버 중 엣지 (마이크로카드와 같은 상태) — 해당 엣지 잉크 강조. */
  hoveredEdge: { sourceId: string; targetId: string; relationType: string } | null;
  /** 엣지 선택 = 페어 포커스 — 양끝만 밝히고 나머지 dim, 선택 엣지는 pale 인디고. */
  selectedEdge: EdgePairFocus | null;
  emphasisById: ReadonlyMap<string, number>;
  /** C1 A2 — ego tier-reveal ramp (`topology-physics-step.ts` steps it), consumed by `effectiveNodeAlpha`. */
  egoRevealById: ReadonlyMap<string, number>;
  reducedMotion: boolean;
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
   * 밀도 게이트 (fable 설계) — 접힌 부모의 서브트리에 속해 이 프레임에서
   * **그리지 않을** 노드 id 집합. 노드·엣지·라벨 패스 모두 이 집합을 건너뛴다.
   */
  clusteredIds: ReadonlySet<string>;
  /** 밀도 게이트 — 이 프레임에 그릴 클러스터 칩(월드 anchor, 부모 티어 알파 상속). */
  clusterChips: readonly ClusterChip[];
  /** 밀도 게이트 — 호버 중인 클러스터 부모 id (칩 보더 강조), 없으면 null. */
  hoveredClusterId: string | null;
  /**
   * S4 "영역 전개" — 결계 링. 영역 활성(entering/active) 시 서브트리 바운딩
   * 반경에 1px 인디고 헤어라인 원을 두른다. `drawProgress` 0..1 로 stroke 를
   * 자기 드로잉한다(전환 초반 ~200ms). null 이면 미표시(회귀 0).
   */
  wardingRing: { centerX: number; centerY: number; radius: number; drawProgress: number } | null;
  /**
   * S4 — 영역 멤버 id (결계를 가로지르는 관계의 안쪽 끝을 판정). 결계 밖으로
   * 나가는 엣지는 안쪽 노드에서 결계 방향으로 페이드 스텁으로만 그린다.
   */
  realmMemberIds: ReadonlySet<string> | null;
  /** S4 — 멤버별 깊이 기반 티어 kind 오버라이드 (영역 세계의 티어 = 재배치 깊이). */
  realmTierKinds: ReadonlyMap<string, "project" | "domain" | "capability" | "element"> | null;
  /**
   * S5 — 멤버별 루트 깊이(루트=0). 영역 활성(entering/active) 시 깊이 선명도
   * (알파·스케일 차등)와 시차 밴드 판정에 쓴다. null 이면 깊이 연출 없음(회귀 0).
   */
  realmDepthById: ReadonlyMap<string, number> | null;
  /**
   * S5 — 깊이 시차 밴드 오프셋(월드 단위). 영역 active 중 카메라 입력에 반응해
   * depth2/depth3+ 노드의 렌더 좌표를 이 오프셋만큼 밀어 그린다(월드 좌표 불변).
   * null 이면 시차 없음(정지/entering/reduced-motion). 히트테스트도 같은 오프셋.
   */
  realmDepthParallax: { depth2: { x: number; y: number }; depth3: { x: number; y: number } } | null;
  /** S4 — 전개 순간의 도트 방사 시차 팩터 0..1 (전환 중에만 >0). */
  realmDustParallax: number;
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
    emphasisById,
    egoRevealById,
    reducedMotion,
    selectionPulse,
    agentFocusNodeId,
    clusteredIds,
    clusterChips,
    hoveredClusterId,
    wardingRing,
    realmMemberIds,
    realmTierKinds,
    realmDepthById,
    realmDepthParallax,
    realmDustParallax,
  } = params;

  // S5 깊이 연출 — 노드 하나의 렌더 오프셋(월드 단위, 시차)과 깊이 선명도
  // 배수를 한 곳에서 계산해 드로우 전체가 일관되게 쓴다. 영역 밖(depthById 에
  // 없음)·depth≤1 은 오프셋 0, 선명도 배수 1(무효과) — 회귀 0.
  const realmDepthOf = (nodeId: string): number | undefined => realmDepthById?.get(nodeId);
  const realmParallaxOffsetFor = (nodeId: string): { x: number; y: number } => {
    if (!realmDepthParallax || !realmDepthById) return ZERO_PARALLAX;
    return depthParallaxOffsetFor(realmDepthById.get(nodeId), realmDepthParallax.depth2, realmDepthParallax.depth3);
  };

  // Where world (0,0) currently lands on screen — the blueprint grid rides
  // this so the background belongs to the world, not the display (B3).
  const gridOrigin = worldToScreen(camera, viewportWidth, viewportHeight, 0, 0);
  // B5 — 라벨 줌 스케일 (프레임당 1회, 전 라벨 공용).
  const labelScale = labelZoomScale(camera.scale.value);

  gridDraw(
    ctx,
    { viewportWidth, viewportHeight, farT, gridPattern, originX: gridOrigin.x, originY: gridOrigin.y },
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
  // perf sweep 2026-07 — reused across frames (`.clear()` instead of `new
  // Map()`) to cut two allocations + hashtable growth per frame off the
  // paint hot path. Safe because `drawTopologyFrame` only ever runs
  // synchronously from the single active rAF loop (`use-topology-loop.ts`) —
  // there is no concurrent/re-entrant call that could see stale entries from
  // a previous frame between the `.clear()` below and this frame's own fill.
  tierAlphaByIdReused.clear();
  effectiveAlphaByIdReused.clear();
  const tierAlphaById = tierAlphaByIdReused;
  const effectiveAlphaById = effectiveAlphaByIdReused;
  for (const node of world.nodes) {
    const tierKind = realmTierKinds?.get(node.id) ?? node.kind;
    const tierAlpha = nodeTierAlpha(tierKind, node.isHub, zoomRatio, DEFAULT_TIER_REVEAL);
    tierAlphaById.set(node.id, tierAlpha);
    const isPairMember =
      focusedNodeId === null &&
      selectedEdge !== null &&
      (node.id === selectedEdge.sourceId || node.id === selectedEdge.targetId);
    const isEgoMember =
      isPairMember ||
      (focusedNodeId !== null && (node.id === focusedNodeId || neighborsOfFocused.has(node.id)));
    effectiveAlphaById.set(
      node.id,
      effectiveNodeAlpha(tierAlpha, isEgoMember, isPairMember ? 1 : (egoRevealById.get(node.id) ?? 0)),
    );
  }

  for (const kind of ["contains", "depends"] as const) {
    for (const edge of world.edges) {
      if (edge.kind !== kind) continue;
      // 밀도 게이트: 접힌 부모 서브트리에 닿는 엣지는 그리지 않는다.
      if (clusteredIds.has(edge.sourceId) || clusteredIds.has(edge.targetId)) continue;
      const edgeAlpha = edgeTierAlpha(effectiveAlphaById.get(edge.sourceId) ?? 1, effectiveAlphaById.get(edge.targetId) ?? 1);
      if (edgeAlpha <= 0.02) continue;
      const a = project(edge.ax, edge.ay);
      const b = project(edge.bx, edge.by);
      const control = project(edge.controlX, edge.controlY);
      // Off-screen geometry still cost a full curve + up to 3 comet arcs each
      // before this guard. Hull-based, so it only ever drops strokes that
      // could not have landed on canvas (see `render/viewport-cull.ts`).
      if (isEdgeCulled(a, b, control, EDGE_CULL_MARGIN_PX, viewportWidth, viewportHeight)) continue;
      // B2 잔여 — 끝점이 하나도 안 보이는 관통 엣지는 잉크 강등 (실타래 해소).
      const passthrough = isPassthroughEdge(a, b, 24, viewportWidth, viewportHeight);
      const touches = focusedNodeId !== null && (edge.sourceId === focusedNodeId || edge.targetId === focusedNodeId);
      const isSelectedEdge =
        selectedEdge !== null &&
        edge.sourceId === selectedEdge.sourceId &&
        edge.targetId === selectedEdge.targetId;
      const hovered =
        hoveredEdge !== null &&
        edge.sourceId === hoveredEdge.sourceId &&
        edge.targetId === hoveredEdge.targetId;
      const emphasized =
        hovered ||
        (emphasizedNeighborId !== null &&
          touches &&
          (edge.sourceId === emphasizedNeighborId || edge.targetId === emphasizedNeighborId));
      ctx.globalAlpha = passthrough ? edgeAlpha * tokens.edgePassthroughAlpha : edgeAlpha;
      tracesDraw(
        ctx,
        {
          a,
          b,
          control,
          relationType: kind,
          egoState: resolveEdgeEgoStateWithPair(touches, focusedNodeId, selectedEdge, isSelectedEdge),
          selected: isSelectedEdge,
          farT,
          t: edge.t,
          emphasized,
          reducedMotion,
          level: edge.level,
        },
        {
          edgeContains: tokens.edgeContains,
          edgeContainsL0: tokens.edgeContainsL0,
          edgeContainsL2: tokens.edgeContainsL2,
          edgeDepends: tokens.edgeDepends,
          edgeDim: tokens.edgeDim,
          indigo: tokens.indigo,
          indigoBright: tokens.indigoBright,
          edgeSelected: tokens.edgeSelected,
        },
      );
      ctx.globalAlpha = 1;
    }
  }

  for (const node of world.nodes) {
    // 밀도 게이트: 접힌 부모의 서브트리 노드는 칩으로 대체되어 그리지 않는다.
    if (clusteredIds.has(node.id)) continue;
    const tierAlpha = effectiveAlphaById.get(node.id) ?? 1;
    if (tierAlpha <= 0.02) continue;
    const egoState = resolveNodeEgoStateWithPair(node.id, focusedNodeId, neighborsOfFocused, selectedEdge);
    const emphasis = emphasisById.get(node.id) ?? 0;
    const isEmphasizedNeighbor = emphasizedNeighborId !== null && node.id === emphasizedNeighborId && egoState === "neighbor";
    const visual = resolveNodeVisual(node, egoState, emphasis, focusedNodeId, isEmphasizedNeighbor, tokens, reducedMotion);

    const baseRadius = radiusForKind(node.kind, tokens) * node.magnitudeScale;
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

    // S5 깊이 선명도 — 영역 활성 중 깊은 링을 알파·스케일로 살짝 낮춘다. 호버·
    // ego 멤버(center/neighbor)는 100% 복귀 — 상호작용 대상은 항상 또렷하게.
    const isHoveredNode = node.id === hoveredNodeId;
    let realmClarityAlpha = 1;
    if (realmDepthById !== null && !isHoveredNode && egoState === "normal") {
      const depth = realmDepthOf(node.id);
      if (depth !== undefined) {
        realmClarityAlpha = realmDepthClarityAlpha(depth);
        effRadius *= realmDepthClarityScale(depth);
      }
    }

    // S5 깊이 시차 — 렌더 좌표에만 밴드 오프셋(월드)을 더한다(월드 좌표 불변).
    const pOff = realmParallaxOffsetFor(node.id);
    const screen = project(node.x + pOff.x, node.y + pOff.y);
    const screenRadius = effRadius * camera.scale.value;
    // Rings/pulses/labels all key off this same disc, so one guard here drops
    // the whole off-screen node cost (see `render/viewport-cull.ts`).
    if (isNodeCulled(screen, screenRadius * NODE_CULL_SLACK, viewportWidth, viewportHeight)) continue;

    ctx.globalAlpha = tierAlpha * realmClarityAlpha;
    // Sheen top stop = lerp(fill, tint, blend) — resolved here (token layer)
    // so `render/node-shapes.ts` stays token-free and pure.
    const sheenTop = lerpColorHex(visual.fill, tokens.nodeSheenTint, tokens.nodeSheenBlend);
    // Engraved numeral: project/domain only, and only when there's a count to
    // show (prototype `if (n.count && (project||domain) ...)`).
    const showCount = (node.kind === "project" || node.kind === "domain") && node.count > 0;
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
        isHovered,
        selectionPulse: selectionPulseVisual,
        agentFocus: agentFocusNodeId !== null && node.id === agentFocusNodeId,
      },
      {
        amberHub: tokens.amberHub,
        numeralShadow: tokens.numeralShadow,
        numeralFace: tokens.numeralFace,
        holeFill: tokens.nodeHoleFill,
        projectHairlineInner: tokens.projectHairlineInner,
        projectPinTick: tokens.projectPinTick,
        selectionIndigo: tokens.selectionRingIndigo,
        selectionHairline: tokens.selectionRingHairline,
        hoverRing: tokens.hoverRing,
      },
    );

    // Diffraction spike: the ranked "bright star" set PLUS the project node
    // unconditionally (canvas-emphasis slice §A3, "허브 노드에 이미 쓰는 패턴
    // 재사용") — reuses the exact same far-field-only overlay hub/magnitude
    // stars already get, just widening eligibility so the Layer-0 anchor
    // reads as luminous too. Color still derives from `visual.stroke`, which
    // is now hardcoded amber for project, so the spike is amber for free.
    if ((world.brightStarIds.has(node.id) || node.kind === "project") && farT > 0.02) {
      drawDiffractionSpike(ctx, {
        screenX: screen.x,
        screenY: screen.y,
        screenRadius,
        color: egoState === "dim" ? tokens.nodeStrokeDim : visual.stroke,
        alpha: farT * tierAlpha * realmClarityAlpha,
      });
    }
    ctx.globalAlpha = 1;
  }

  // --- S4 "영역 전개" 결계(warding) — 서브트리 바운딩 원 + 경계 넘는 관계의
  // 페이드 스텁. 노드 위, 칩/라벨 아래. 드라마는 기하·자기드로잉으로만(glow/네온
  // 금지) — 1px 인디고 헤어라인. ---
  if (wardingRing !== null) {
    const center = project(wardingRing.centerX, wardingRing.centerY);
    const screenRadius = wardingRing.radius * camera.scale.value;
    // 결계 밖으로 나가는 관계: 안쪽 노드에서 결계 방향으로만 페이드 스텁.
    if (realmMemberIds !== null && wardingRing.drawProgress > 0.05) {
      ctx.save();
      ctx.strokeStyle = tokens.indigo;
      ctx.lineWidth = 1;
      for (const edge of world.edges) {
        const sIn = realmMemberIds.has(edge.sourceId);
        const tIn = realmMemberIds.has(edge.targetId);
        if (sIn === tIn) continue; // 둘 다 안/밖 = 경계 아님
        const insideWX = sIn ? edge.ax : edge.bx;
        const insideWY = sIn ? edge.ay : edge.by;
        const dx = insideWX - wardingRing.centerX;
        const dy = insideWY - wardingRing.centerY;
        const dist = Math.hypot(dx, dy) || 1;
        // 결계까지의 스텁 끝점(방사 방향, 링 반경).
        const tipWX = wardingRing.centerX + (dx / dist) * wardingRing.radius;
        const tipWY = wardingRing.centerY + (dy / dist) * wardingRing.radius;
        const a = project(insideWX, insideWY);
        const b = project(tipWX, tipWY);
        ctx.globalAlpha = 0.22 * wardingRing.drawProgress;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();
    }
    // 결계 링 자기 드로잉: 위(-90°)에서 시계방향으로 drawProgress 만큼 호를 그린다.
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
  }

  // --- 밀도 게이트 클러스터 칩 (fable 설계) — 노드 위, 라벨 아래에 그린다.
  // 칩 알파는 부모 노드의 effective 티어 알파를 상속한다(스파인 부모=1). 부모가
  // 티어로 사라지면 칩도 사라진다. 미확장 접힘 칩의 자식/엣지는 이미 위에서
  // 스킵됐다. anchor 는 월드 좌표라 카메라 팬/줌을 함께 탄다. ---
  const chipScale = clusterChipScale(camera.scale.value);
  for (const chip of clusterChips) {
    const parentAlpha = effectiveAlphaById.get(chip.parentId) ?? 1;
    if (parentAlpha <= 0.02) continue;
    const screen = project(chip.anchor.x, chip.anchor.y);
    // 부모→칩 점선 커넥터의 시작점 = 부모 노드의 라이브 스크린 좌표.
    const parentNode = world.nodeById.get(chip.parentId);
    const parentScreen = parentNode ? project(parentNode.x, parentNode.y) : null;
    ctx.globalAlpha = parentAlpha;
    drawClusterChip(
      ctx,
      {
        screenX: screen.x,
        screenY: screen.y,
        count: chip.count,
        expanded: chip.expanded,
        hovered: hoveredClusterId === chip.parentId,
        scale: chipScale,
        childKind: chip.childKind,
        parentScreenX: parentScreen?.x,
        parentScreenY: parentScreen?.y,
      },
      {
        surface: tokens.nodeFillDim,
        border: tokens.indigo,
        glyph: tokens.nodeStrokeDim,
        text: tokens.indigoBright,
      },
    );
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
  interface LabelPayload {
    nodeId: string;
    kind: WorldNode["kind"];
    text: string;
    screenX: number;
    screenY: number;
    screenRadius: number;
    egoState: NodeEgoState;
    isHovered: boolean;
    revealAlpha: number;
    /** W6 agent visibility — this label's node matches the agent heartbeat's current focus. */
    agentFocus: boolean;
  }
  // Label top-K LOD (S3 마감 폴리시, fable 설계): at the overview/spine and mid
  // (circuit) bands the label budget goes to the highest-degree nodes; at the
  // deepest element zoom the budget lifts and every label returns. Exempt from
  // the budget: ego focus members, the hovered node, and the children of an
  // EXPANDED cluster disc (you clicked the chip to read them).
  const applyLabelTopK = classifyZoomTier(zoomRatio) !== "element";
  const expandedDiscChildIds = new Set<string>();
  if (applyLabelTopK) {
    for (const chip of clusterChips) {
      if (!chip.expanded) continue;
      for (const childId of world.childrenByParent.get(chip.parentId) ?? []) {
        expandedDiscChildIds.add(childId);
      }
    }
  }
  const labelRankEntries: LabelRankEntry[] = [];
  const labelCandidates: LabelCandidate<LabelPayload>[] = [];
  world.nodes.forEach((node, index) => {
    // 밀도 게이트: 접힌 서브트리 노드는 라벨도 그리지 않는다(노드/엣지와 동일).
    if (clusteredIds.has(node.id)) return;
    // Uses the SAME effective alpha as the node draw pass (C1 A2) — an
    // ego-exempt capability that's now visible must also get a label, or it
    // reads as an unlabeled ghost circle. Also the SAME signal capability/
    // element label eligibility ramps with (label-clarity — "잡을 수 있으면
    // 읽을 수 있다").
    const revealAlpha = effectiveAlphaById.get(node.id) ?? 1;
    if (revealAlpha <= 0.02) return;
    const egoState = resolveNodeEgoStateWithPair(node.id, focusedNodeId, neighborsOfFocused, selectedEdge);
    const isHovered = hoveredNodeId !== null && node.id === hoveredNodeId;
    const compactAlpha = computeLabelAlpha({ kind: node.kind, farT, egoState, isHovered, revealAlpha });
    // Domain draws TWO effects at once (the always-readable compact label AND
    // the separate far-field watermark) — a candidate must be built whenever
    // EITHER is visible, or the watermark silently vanishes once the compact
    // label alpha hits 0 at farT=1 (label-clarity fix, far-field regression).
    const watermarkAlpha = node.kind === "domain" ? computeDomainWatermarkAlpha(farT, egoState) : 0;
    if (Math.max(compactAlpha, watermarkAlpha) <= 0.02) return;

    // S5 — 라벨도 노드 디스크와 같은 깊이 시차 오프셋으로 그려 붙어 다닌다.
    const labelPOff = realmParallaxOffsetFor(node.id);
    const screen = project(node.x + labelPOff.x, node.y + labelPOff.y);
    const screenRadius = radiusForKind(node.kind, tokens) * camera.scale.value;
    const anchorY = screen.y + screenRadius + LABEL_OFFSET[node.kind];
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
      // Protected = the focused node, its ego neighbors, or the hovered node —
      // NOT "dim"/"normal" bystanders, or every off-rect label would clamp to
      // the inset edge and pile up there.
      const isProtected = egoState === "center" || egoState === "neighbor" || isHovered;
      if (!isProtected) return;
      const clamped = clampAnchorIntoSafeRect(anchorX, anchorY, safeRect, width / 2 + 4, fontSize + 4);
      anchorX = clamped.x;
      clampedAnchorY = clamped.y;
    }
    const shiftX = anchorX - screen.x;
    const shiftY = clampedAnchorY - anchorY;
    if (applyLabelTopK) {
      const exempt =
        egoState === "center" ||
        egoState === "neighbor" ||
        isHovered ||
        expandedDiscChildIds.has(node.id);
      labelRankEntries.push({ id: node.id, degree: world.neighborMap.get(node.id)?.size ?? 0, exempt });
    }
    labelCandidates.push({
      priority: resolveLabelPriority({
        kind: node.kind,
        isSelected: egoState === "center",
        isHovered,
        isHub: node.isHub,
      }),
      order: index,
      bbox: { minX: anchorX - width / 2, maxX: anchorX + width / 2 + markReserve, minY: clampedAnchorY - fontSize, maxY: clampedAnchorY + 2 },
      payload: {
        nodeId: node.id,
        kind: node.kind,
        text,
        screenX: screen.x + shiftX,
        screenY: screen.y + shiftY,
        screenRadius,
        egoState,
        isHovered,
        revealAlpha,
        agentFocus,
      },
    });
  });

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

  for (const { payload } of greedyPlaceLabels(placedLabelCandidates)) {
    labelsDraw(
      ctx,
      {
        kind: payload.kind,
        text: payload.text,
        screenX: payload.screenX,
        screenY: payload.screenY,
        screenRadius: payload.screenRadius,
        farT,
        egoState: payload.egoState,
        isHovered: payload.isHovered,
        revealAlpha: payload.revealAlpha,
        agentFocus: payload.agentFocus,
        fontScale: labelScale,
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
