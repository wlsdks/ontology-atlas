/**
 * Per-frame Canvas 2D draw pipeline — the composition point for `engine/`,
 * `model/`, and `render/*` (`docs/TOPOLOGY-V2-DESIGN.md` §4 P2-P4, prototype
 * `render()` §13). Camera-space conversions live in `topology-camera-math.ts`
 * (this file only consumes `worldToScreen`, it doesn't own the convention).
 */

import type { CameraAxes } from "../engine/camera";
import { rankEgoNeighborsByDOI, resolveEdgeEgoStateWithPair, resolveNodeEgoStateWithPair, type EdgePairFocus, type NodeEgoState } from "../model/focus-state";
import { resolveFreshnessVisual } from "../model/freshness";
import { computeSelectionPulse, type SelectionPulseVisual } from "../model/selection-pulse";
import { footprintRingStyle, FOOTPRINT_RING_OFFSET } from "../model/footprint-ring";
import { depthParallaxOffsetFor, ZERO_PARALLAX } from "../model/realm-depth-parallax";
import { realmDepthClarityAlpha, realmDepthClarityScale } from "../model/realm-transition";
import { classifyZoomTier, DEFAULT_TIER_REVEAL, edgeTierAlpha, effectiveNodeAlpha, nodeTierAlpha } from "../model/tier-visibility";
import { DISC_LABEL_TOP_K, LABEL_TOP_K, selectDiscLabelEligible, selectTopKLabels, type LabelRankEntry } from "../model/label-lod";
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
import { drawDiffractionSpike, drawRealmCosmos, drawStarDust, type DustPoint } from "../render/starfield";
import { isEdgeCulled, isNodeCulled, isPassthroughEdge } from "../render/viewport-cull";
import { draw as tracesDraw } from "../render/traces";
import { drawPulses, edgePairKey, selectEgoContainsComets, type Pulse } from "../render/edge-fireflies";
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
import { isSpineNode, radiusForKind, type TopologyWorld, type WorldNode } from "./topology-world";

/**
 * S8 결함 1 — 펼친(확장) 부모 노드를 접힘과 시각 구분하는 파선 오라 링. 선택
 * (ego) 링은 실선이라 채널이 겹치지 않는다. 반지름 = 노드 디스크 + 이 오프셋(px),
 * 1px, 인디고. glow/네온 금지 — 파선 헤어라인만.
 */
const EXPANDED_AURA_RING_OFFSET = 6;
const EXPANDED_AURA_DASH: readonly number[] = [3, 3];
const EXPANDED_AURA_ALPHA = 0.55;
/**
 * S8 결함 1 — 확장 디스크와 무관한 배경 노드를 확장 중 미세 dim 해 "어지러움"을
 * 줄인다(확장이 없으면 1.0, 회귀 0). 색이 아니라 알파만 낮춘다.
 * 고팬아웃 배치-공개(2026-07) 처방 5 — 배치가 소수(상위 24)만 크게 드러내므로
 * 배경을 한 단계 더 낮춰(0.5→0.42) 드러난 배치가 더 또렷이 읽히게 한다.
 */
const BACKGROUND_DIM_WHEN_EXPANDED = 0.42;

const EMPTY_NEIGHBOR_SET: ReadonlySet<string> = new Set();
/** Design Guardian 처방 E — 포커스 없음(또는 인시던트 contains 0개)일 때 재사용하는 빈 캡 Set. */
const EMPTY_EGO_CONTAINS_COMETS: ReadonlySet<string> = new Set();
// perf sweep 2026-07 — reused frame-scratch Maps, see their `.clear()` call
// site in `drawTopologyFrame` below for why this is safe.
const tierAlphaByIdReused = new Map<string, number>();
const effectiveAlphaByIdReused = new Map<string, number>();
// 그룹 A — 클러스터 칩 hover 색 이징 앵커. 어느 칩이 언제부터 hover 됐는지
// 하나만 추적한다(동시 hover 는 1개). rest→hover 색 램프(~150ms)를 이 시작
// 시각으로 유도한다. reduced-motion 이면 즉시 스냅이라 앵커를 안 쓴다.
const CLUSTER_CHIP_HOVER_MS = 150;
let clusterChipHoverAnim: { id: string; startAt: number } | null = null;
// rank9 — 지난 프레임에 배치된 라벨 id 집합(히스테리시스: 같은 우선순위 안에서
// 직전 placed 를 우대) + present 램프 스텝용 직전 타임스탬프(dt 유도, `now`
// 는 monotonic). 모듈 상태 — `clusterChipHoverAnim` 과 같은 프레임-지속 패턴.
let prevPlacedLabelIds: ReadonlySet<string> = new Set();
let lastLabelRampNow = 0;
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

/**
 * The one place the click-focus color signature lives. Instead of hard-
 * switching to the dim/ego palette the instant a focus commits, it computes
 * BOTH the node's normal (no-focus) look and its focused-state target, then
 * lerps between them by `focusRamp` (0..1, `stepFocusRamp`). So a click's
 * dim (background→gray) / ego (neighbor→indigo, center→bright) color swap eases
 * IN on the camera-dive time axis (owner headline: "하드 컷으로 읽히지 않게"),
 * and a deselect eases it back OUT — the caller keeps `colorEgoState` pinned to
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
  /** P3c — 호버 중 엣지 (마이크로카드와 같은 상태) — 해당 엣지 잉크 강조. */
  hoveredEdge: { sourceId: string; targetId: string; relationType: string } | null;
  /** 엣지 선택 = 페어 포커스 — 양끝만 밝히고 나머지 dim, 선택 엣지는 pale 인디고. */
  selectedEdge: EdgePairFocus | null;
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
   * rank7 — cluster expand/collapse reveal ramp (parentId → 0..1), stepped by the
   * loop. The node pass multiplies a just-expanded disc child's globalAlpha by its
   * nearest expanded-ancestor parent's ramp (fade IN on expand); `drawClusterChip`
   * fades the pill/badge form in by it. Missing/omitted = 1 (no fade).
   */
  chipRevealById?: ReadonlyMap<string, number>;
  /**
   * 고팬아웃 배치-공개(2026-07) — per-child batch reveal ramp (childId → 0..1),
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
   * FROM persists instead of snapping to normal (④ 선택 링 · 배경 dim 페이드아웃).
   * `null` once nothing is focused and the ramp has reached 0. Kept separate
   * from live `focusedNodeId` so labels / tier-reveal / camera never inherit the
   * retention lag — only node body color + rings do.
   */
  colorFocusedNodeId: string | null;
  /** Edge-pair analogue of `colorFocusedNodeId` — the retained selected edge for the color ramp (⑨). */
  colorSelectedEdge: EdgePairFocus | null;
  reducedMotion: boolean;
  /**
   * R6 호버 펄스 — 노드 호버가 발사한 활성 일회성 신호들(`use-topology-loop.ts`가
   * 수명 관리). 엣지 커브 위에 헤드+트레일로 그린다. reduced-motion 이면 발사가
   * 없어 항상 비어 미표시.
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
  /**
   * 발자국 트레일 (fable 설계) — 세션 동안 방문(ego 포커스)한 노드의 최근성
   * rank(0 = 가장 최근). `model/footprint-ring.ts#buildFootprintRanks` 가 만든다.
   * 각 방문 노드에 옅은 pale 인디고 헤어라인 링을 최근성으로 감쇠해 얹는다
   * (정적 표기). 현재 포커스 노드는 이미 제외돼 있어 선택 링과 이중이 안 된다.
   * 빈 map = 발자국 없음(회귀 0).
   */
  footprintRanksById: ReadonlyMap<string, number>;
  /**
   * S8 결함 6 — 결계 안 우주 도트 레이어(뷰포트 스페이스, 카메라 원점 시차).
   * 영역 활성(wardingRing 존재) 시에만 결계 원으로 클립해 그린다. null 이면 미표시.
   */
  realmCosmosPoints: readonly DustPoint[] | null;
  /**
   * 최근 변경 스포트라이트 (협의회 설계 2026-07-23) — non-null 이면 렌즈 ON:
   * 이 집합 **밖** 노드(와 양끝이 모두 집합 안이 아닌 엣지)를 `spotlightRamp`
   * 진행에 따라 `tokens.spotlightRestAlpha` 까지 침강시킨다. 집합 안 노드는
   * 여기서 밝히지 않는다 — 어댑터가 fresh 채널 키를 mtime 창으로 교체해 이미
   * 켠다("빛내기"가 아니라 "가라앉히기"). ego/엣지 포커스가 활성인 동안은
   * 침강을 적용하지 않는다(주의 레이어: 선택 > 렌즈, 이중 dim 금지). 호버
   * 노드도 면제(상호작용 대상은 항상 또렷 — realm 선명도와 같은 규칙).
   * null = off (회귀 0).
   */
  spotlightIds: ReadonlySet<string> | null;
  /** 스포트라이트 on/off 지수 램프 0..1 — loop 가 `stepFocusRamp`(focusDimTau 재사용)로 step. */
  spotlightRamp: number;
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
    focusRampById,
    appearById,
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
    realmDepthById,
    realmDepthParallax,
    realmDustParallax,
    realmCosmosPoints,
    footprintRanksById,
    spotlightIds,
    spotlightRamp,
  } = params;

  // 스포트라이트 침강 배수 — 렌즈 ON + 램프 진행 중 + 포커스/엣지선택 비활성
  // 일 때만 유효(선택 > 렌즈 우선순위). inSpotlight=false 대상에 적용한다.
  const spotlightLensActive =
    spotlightIds !== null && spotlightRamp > 0.001 && colorFocusedNodeId === null && colorSelectedEdge === null;
  const spotlightSink = (inSpotlight: boolean): number =>
    spotlightLensActive && !inSpotlight ? 1 - spotlightRamp * (1 - tokens.spotlightRestAlpha) : 1;

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

  // S8 결함 6 — 영역 활성 중 결계 **안**을 우주로. 결계 밖은 도트 없음(클립).
  // farT 무관(영역은 circuit 고도라 dust 는 꺼져 있다). 카메라 정지 시 완전 정지.
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
  const neighborsOfFocused = focusedNodeId ? world.neighborMap.get(focusedNodeId) ?? EMPTY_NEIGHBOR_SET : EMPTY_NEIGHBOR_SET;
  // Click-focus color signature — the ego classification for the COLOR ramp
  // uses the RETAINED focus (`colorFocusedNodeId`/`colorSelectedEdge`), which
  // equals the live focus while a selection is active and lingers ~160ms after
  // a deselect so the fade-out has a dim/ego target to ease from. Everything
  // else on this frame still keys off the live `focusedNodeId` — no retention
  // bleed into labels, tier reveal, or camera.
  const colorNeighbors = colorFocusedNodeId
    ? world.neighborMap.get(colorFocusedNodeId) ?? EMPTY_NEIGHBOR_SET
    : EMPTY_NEIGHBOR_SET;

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
    // 스포트라이트 티어 관통 공개 (소유자: "눈으로 보는 노드를 보고 바로
    // 파악") — 변경 노드가 줌 티어 아래(element 등)에 숨어 있으면 렌즈가
    // 켜져도 안 보인다. ego 이웃과 같은 tier-exemption reveal 채널에
    // 스포트라이트 램프를 합류시켜, 렌즈 ON 동안 변경 노드는 줌 무관하게
    // 램프로 떠오른다(끄면 램프 감쇠로 자연 강하).
    const spotlightReveal =
      spotlightLensActive && spotlightIds !== null && spotlightIds.has(node.id) ? spotlightRamp : 0;
    effectiveAlphaById.set(
      node.id,
      effectiveNodeAlpha(
        tierAlpha,
        isEgoMember,
        Math.max(isPairMember ? 1 : (egoRevealById.get(node.id) ?? 0), spotlightReveal),
      ),
    );
  }

  // S8 결함 1 — 펼친 부모(파선 오라 대상) + 그 디스크(부모 + contains 하위 전이
  // 폐포) 집합. 배경 dim 은 "확장 중" 무관 노드에만 걸어야 하므로 디스크 멤버를
  // 미리 모은다. 확장이 없으면 둘 다 비어 회귀 0. ego(`이웃 +N`) 칩은 제외.
  // 엣지 루프의 depends 억제(고팬아웃 배치-공개 처방 4)도 `anyExpanded` 를
  // 읽으므로 엣지 그리기 **앞**에서 계산한다.
  const expandedParentIds = new Set<string>();
  const expandedDiscIds = new Set<string>();
  for (const chip of clusterChips) {
    if (!chip.expanded || chip.ego) continue;
    expandedParentIds.add(chip.parentId);
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

  // Design Guardian 승인 처방 E — 선택(ego) 시 인시던트 contains 엣지 코멧
  // 캡. `topology-physics-step.ts`가 위상 전진을 게이트하는 것과 정확히 같은
  // 결정론 로직(포커스 노드에 물린 contains 엣지 → seed 순 상위 24개)이라,
  // 상태 공유 없이 같은 프레임에서 같은 Set 이 나온다 — 드로우 게이트만 별도
  // 계산해도 drift 없음.
  const egoContainsComets =
    focusedNodeId === null
      ? EMPTY_EGO_CONTAINS_COMETS
      : selectEgoContainsComets(
          world.edges.filter(
            (edge) => edge.kind === "contains" && (edge.sourceId === focusedNodeId || edge.targetId === focusedNodeId),
          ),
        );

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
      let edgeEgoState = resolveEdgeEgoStateWithPair(touches, focusedNodeId, selectedEdge, isSelectedEdge);
      // 고팬아웃 배치-공개(2026-07) 처방 4 — 펼침 중 depends 억제. 배치 자식이
      // DOI 순으로 드러나는 동안 무관한 depends 실타래가 지도를 뒤덮으면 방금
      // 드러난 소수가 안 읽힌다. anyExpanded 이고 contains 가 아니며(계층 실선은
      // 유지) 이미 ego/선택/호버/emphasis 로 살아있지 않은 depends 엣지는 dim
      // 잉크로 강등한다. 자식 hover/ego 시 touches/emphasized/isSelected 가 참이라
      // 기존 코멧/강조 규칙이 그 엣지를 되살린다(회귀 0).
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
      // 스포트라이트 — 양끝이 모두 창 안일 때만 정상 잉크(변경 노드 간 연결
      // 은 구조를 보여줘야 함), 아니면 침강. 호버/선택 엣지는 이미 위 분기가
      // ego/selected 로 살린다.
      const edgeSpotlightSink = spotlightSink(
        spotlightIds !== null && spotlightIds.has(edge.sourceId) && spotlightIds.has(edge.targetId),
      );
      ctx.globalAlpha = (passthrough ? edgeAlpha * tokens.edgePassthroughAlpha : edgeAlpha) * edgeSpotlightSink;
      tracesDraw(
        ctx,
        {
          a,
          b,
          control,
          relationType: kind,
          egoState: edgeEgoState,
          selected: isSelectedEdge,
          farT,
          t: edge.t,
          emphasized,
          reducedMotion,
          level: edge.level,
          containsCometEligible: kind === "contains" ? egoContainsComets.has(edgePairKey(edge.sourceId, edge.targetId)) : undefined,
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
      // R6 상시 혜성 — 코멧 꼬리 자체는 `tracesDraw`가 `edge.t`를 읽어
      // 엣지 커브와 함께 그린다(포커스 무관, dim 제외). 이 프레임 패스는 더
      // 이상 별도 반딧불 점을 얹지 않는다(구 S10 포커스-게이트형 삭제).
      ctx.globalAlpha = 1;
    }
  }

  // R6 호버 펄스 — 노드 호버가 발사한 일회성 신호(420ms). 엣지 커브 위, 노드
  // 아래. reduced-motion 이면 애초에 발사가 없어 pulses 가 비므로 자연히 미표시.
  // 곡선은 라이브 엣지 좌표를 스크린으로 투영(드래그/살아있는 그래프 추종).
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
        return { a: project(edge.ax, edge.ay), control: project(edge.controlX, edge.controlY), b: project(edge.bx, edge.by) };
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

  for (const node of world.nodes) {
    // 밀도 게이트: 접힌 부모의 서브트리 노드는 칩으로 대체되어 그리지 않는다.
    if (clusteredIds.has(node.id)) continue;
    const tierAlpha = effectiveAlphaById.get(node.id) ?? 1;
    if (tierAlpha <= 0.02) continue;
    const egoState = resolveNodeEgoStateWithPair(node.id, focusedNodeId, neighborsOfFocused, selectedEdge);
    // Color signature uses the RETAINED focus classification (persists through a
    // deselect fade) + this node's focus ramp — everything else keeps the live
    // `egoState`.
    const colorEgoState = resolveNodeEgoStateWithPair(node.id, colorFocusedNodeId, colorNeighbors, colorSelectedEdge);
    const focusRamp = focusRampById.get(node.id) ?? 0;
    const emphasis = emphasisById.get(node.id) ?? 0;
    const isEmphasizedNeighbor = emphasizedNeighborId !== null && node.id === emphasizedNeighborId && egoState === "neighbor";
    const visual = resolveNodeVisual(node, colorEgoState, emphasis, colorFocusedNodeId, isEmphasizedNeighbor, tokens, reducedMotion, focusRamp);

    const baseRadius = radiusForKind(node.kind, tokens) * node.magnitudeScale;
    // rank8 — new-node appear ramp: micro scale 0.6→1 + alpha 0→1. rank7 —
    // just-expanded disc child reveal: alpha ×= nearest expanded parent's ramp.
    // Both default to 1 (no map / existing node / not in an expanding disc), so
    // steady state is unchanged (regression 0).
    const appear = Math.min(1, Math.max(0, appearById?.get(node.id) ?? 1));
    // 고팬아웃 배치-공개 — 배치로 드러나는 자식은 per-child stagger 램프
    // (`batchAppearById`)가 부모 그룹 페이드(`nearestExpandedRevealMul`)를
    // 대체한다(이중 페이드 방지) + 미세 appearScale 을 이 값으로 몬다. 배치
    // 자식이 아니면 기존 그룹/월드-등장 경로(회귀 0).
    const batchAppear = batchAppearById?.get(node.id);
    const revealMul =
      batchAppear !== undefined
        ? Math.min(1, Math.max(0, batchAppear))
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

    // S8 결함 1 — 확장 중 무관 배경 노드 미세 dim(디스크 멤버·스파인·ego 제외).
    const backgroundDim =
      anyExpanded && egoState === "normal" && !expandedDiscIds.has(node.id) && !isSpineNode(node)
        ? BACKGROUND_DIM_WHEN_EXPANDED
        : 1;

    // 스포트라이트 — 창 밖 노드 침강(호버는 면제: 상호작용 대상은 또렷).
    const nodeSpotlightSink = spotlightSink(
      (spotlightIds !== null && spotlightIds.has(node.id)) || isHoveredNode,
    );
    ctx.globalAlpha = tierAlpha * realmClarityAlpha * backgroundDim * appearRevealAlpha * nodeSpotlightSink;
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
        // Rings (selection double-ring, hub, project decor) follow the RETAINED
        // color ego so the selection ring holds through the deselect fade and
        // clears only once the ramp reaches 0 — instead of snapping off the
        // instant `focusedNodeId` goes null (④). Equals live `egoState` while a
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
        hoverEmphasis: emphasis,
        selectionPulse: selectionPulseVisual,
        agentFocus: agentFocusNodeId !== null && node.id === agentFocusNodeId,
        now,
        reducedMotion,
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
        hoverShimmerSeg: tokens.hoverShimmerSeg,
        hoverShimmerPeriodMs: tokens.hoverShimmerPeriodMs,
        hoverShimmerColor: tokens.indigoBright,
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
        alpha: farT * tierAlpha * realmClarityAlpha * backgroundDim * appearRevealAlpha,
      });
    }

    // 발자국 트레일 링 (fable 설계) — 방문했던 노드에 옅은 pale 인디고 헤어라인
    // 링(정적). 최근성 rank 로 감쇠(가장 최근이 진하고 두껍게)해 "걸어온 순서"가
    // 색으로 읽히게 한다. 색은 edge-selected(pale 인디고) 재사용 — 새 hue/glow
    // 금지. 노드 티어·dim·영역 선명도 알파를 함께 곱해 ego dim/전환에도 자연히
    // 물러난다. 위계는 선택 링(실선)·확장 오라(파선)·결계보다 항상 낮다.
    const footprintRank = footprintRanksById.get(node.id);
    if (footprintRank !== undefined) {
      const ringStyle = footprintRingStyle(footprintRank);
      ctx.save();
      ctx.globalAlpha = tierAlpha * realmClarityAlpha * backgroundDim * appearRevealAlpha * ringStyle.alpha;
      ctx.strokeStyle = tokens.edgeSelected;
      ctx.lineWidth = ringStyle.lineWidth;
      ctx.beginPath();
      // 노드 모양 추종 — 사각 계열(domain/capability)은 둥근 사각 링, 나머지는 원.
      // 원형 링이 사각 노드를 두르면 "동그라미+네모" 이형 겹침으로 읽힌다 (소유자 실보고).
      if (node.kind === "domain" || node.kind === "capability") {
        const half = screenRadius + FOOTPRINT_RING_OFFSET;
        ctx.roundRect(screen.x - half, screen.y - half, half * 2, half * 2, Math.max(3, half * 0.28));
      } else {
        ctx.arc(screen.x, screen.y, screenRadius + FOOTPRINT_RING_OFFSET, 0, Math.PI * 2);
      }
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // S8 결함 1 — 펼친 부모 구분: 노드 디스크 바깥에 파선 오라 링(선택 ego 링은
    // 실선이라 채널 충돌 없음). 노드 위에 얹되 알파는 노드 티어 알파를 따른다.
    if (expandedParentIds.has(node.id)) {
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
    ctx.globalAlpha = 1;
  }

  // --- S4 "영역 전개" 결계(warding) — 서브트리 바운딩 원. 노드 위, 칩/라벨
  // 아래. 드라마는 기하·자기드로잉으로만(glow/네온 금지) — 1px 인디고 헤어라인.
  // S8 — 결계 밖으로 나가는 외부 관계는 아예 그리지 않는다(페이드 스텁 제거):
  // 영역 안은 그 세계만 담고, 바깥과 닿은 관계는 S7 대장이 담당한다. ---
  if (wardingRing !== null) {
    const center = project(wardingRing.centerX, wardingRing.centerY);
    const screenRadius = wardingRing.radius * camera.scale.value;
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
  // 그룹 A — hover 이징 앵커 정리: hover 대상이 바뀌거나 사라지면 리셋해
  // 다시 hover 될 때 램프가 0 부터 다시 오르게 한다(스냅 방지).
  if (clusterChipHoverAnim !== null && clusterChipHoverAnim.id !== hoveredClusterId) {
    clusterChipHoverAnim = null;
  }
  for (const chip of clusterChips) {
    const parentAlpha = effectiveAlphaById.get(chip.parentId) ?? 1;
    if (parentAlpha <= 0.02) continue;
    const isChipHovered = hoveredClusterId === chip.parentId;
    // hover 색 이징 진행도 0..1 — reduced-motion 이면 즉시 스냅.
    let hoverT = 0;
    if (isChipHovered) {
      if (reducedMotion) {
        hoverT = 1;
      } else {
        if (clusterChipHoverAnim === null) clusterChipHoverAnim = { id: chip.parentId, startAt: now };
        hoverT = Math.min(1, (now - clusterChipHoverAnim.startAt) / CLUSTER_CHIP_HOVER_MS);
      }
    }
    const screen = project(chip.anchor.x, chip.anchor.y);
    // 부모→칩 점선 커넥터의 시작점 = 부모 노드의 라이브 스크린 좌표.
    const parentNode = world.nodeById.get(chip.parentId);
    const parentScreen = parentNode ? project(parentNode.x, parentNode.y) : null;
    // S10 결함 2 — 펼침 배지는 부모 노드 base 스크린 반지름 기준으로 우상단에
    // 앉는다(히트테스트와 같은 계산). breathe/ego 배율은 배지 위치를 흔들지
    // 않도록 base 반지름만 쓴다.
    const nodeScreenRadius = parentNode
      ? radiusForKind(parentNode.kind, tokens) * parentNode.magnitudeScale * camera.scale.value
      : undefined;
    // 스포트라이트 침강 상속 (소유자 실보고 Image #13 — "+60 유령 칩"):
    // 침강은 노드 draw 에서 직접 곱해 effectiveAlphaById 에 없으므로, 칩이
    // 이걸 상속하지 않으면 부모 노드는 0.35 로 가라앉았는데 칩만 풀 알파로
    // 남아 빈 캔버스에 혼자 떠 있는 버튼처럼 읽힌다. 호버는 면제(상호작용
    // 대상 또렷 — 노드와 같은 규칙).
    ctx.globalAlpha =
      parentAlpha *
      spotlightSink(
        (spotlightIds !== null && spotlightIds.has(chip.parentId)) || isChipHovered,
      );
    drawClusterChip(
      ctx,
      {
        screenX: screen.x,
        screenY: screen.y,
        count: chip.count,
        expanded: chip.expanded,
        hovered: isChipHovered,
        hoverT,
        // rank7 — ego(`+N`) 칩은 reveal 대상 아님(항상 즉시). 그 외엔 램프값 전달.
        revealT: chip.ego ? undefined : chipRevealById?.get(chip.parentId),
        scale: chipScale,
        parentScreenX: parentScreen?.x,
        parentScreenY: parentScreen?.y,
        nodeScreenRadius,
      },
      {
        // rest = 조용한 중립 pill(border=nodeStrokeDomain) — 진짜 노드 선택
        // 인디고와 경쟁 안 함. `＋`=인디고, 숫자=중립 numeralFace(포커스 중에도
        // 포커스 노드가 attention winner). hover 에서만 인디고로 깨어난다.
        surface: tokens.nodeFillDim,
        border: tokens.nodeStrokeDomain,
        plusInk: tokens.indigo,
        numeralInk: tokens.numeralFace,
        tether: tokens.edgeContains,
        hoverSurface: tokens.nodeFillCapability,
        hoverBorder: tokens.indigo,
        hoverInk: tokens.indigoBright,
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
  // the budget: ego focus members and the hovered node only.
  const applyLabelTopK = classifyZoomTier(zoomRatio) !== "element";
  // High-fan disc 밀도 처방: an expanded phyllotaxis disc can hold dozens–
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
            // childrenByParent 유도 = 전원 contains — 균일 가중치, 순서 불변.
            relationType: "contains",
          })),
        ),
      );
    }
    return selectDiscLabelEligible(rankedByDisc, DISC_LABEL_TOP_K);
  })();
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
      !isHovered
    ) {
      return;
    }
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
      // Real exempt = ego focus members + the hovered node only. Expanded-disc
      // children are NOT exempt: the ones that survived the per-disc DOI cut
      // above compete in the normal LABEL_TOP_K budget like any other node.
      const exempt = egoState === "center" || egoState === "neighbor" || isHovered;
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

  // rank9 — greedy 배치에 직전 프레임 placed 우대(히스테리시스)로 같은 우선순위
  // 안의 LOD churn 을 억제한다. 결과 placed id 집합을 다음 프레임 우대 기준으로
  // 남긴다.
  const placedResult = greedyPlaceLabels(placedLabelCandidates, (c) =>
    prevPlacedLabelIds.has(c.payload.nodeId),
  );
  const placedIds = new Set<string>(placedResult.map((c) => c.payload.nodeId));

  // rank9 — LOD present 램프. 화면 안 후보별로 placed(1)/미배치(0) 를 향해
  // tipFadeMs(120ms, 재사용)에 걸쳐 선형 페이드한다. placed 는 램프로 페이드-인,
  // 방금 이탈했지만 아직 화면 안인 후보는 잔여 램프로 페이드-아웃(하드 컷 제거).
  // 화면 밖으로 나간 id 는 컬링이므로 램프에서 제거(다음 등장 시 0 부터 재상승).
  // `labelPresentById` 미제공(기존 테스트 경로)이면 종전과 동일하게 placed 만
  // 알파 1 로 그린다(회귀 0).
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

  for (const { payload, presenceAlpha } of drawList) {
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
