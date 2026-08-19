/**
 * Per-frame Canvas 2D draw pipeline — the composition point for `engine/`,
 * `model/`, and `render/*` (`docs/TOPOLOGY-V2-DESIGN.md` §4 P2-P4, prototype
 * `render()` §13). Camera-space conversions live in `topology-camera-math.ts`
 * (this file only consumes `worldToScreen`, it doesn't own the convention).
 */

import type { CameraAxes } from "../engine/camera";
import { rankEgoNeighborsByDOI, resolveEdgeEgoStateWithPair, resolveNodeEgoStateWithPair, resolveTrailLensNodeEgoState, trailNodeInkStrength, type EdgeEgoState, type EdgePairFocus, type NodeEgoState } from "../model/focus-state";
import { resolveFreshnessVisual } from "../model/freshness";
import { backgroundParallaxOrigin, resolveBackgroundOrigin } from "../model/background-parallax";
import { computeSelectionPulse, type SelectionPulseVisual } from "../model/selection-pulse";
import {
  drawEdgeFootprints,
  drawFootprintSteps,
  drawNodeFootprint,
  footprintScaleFor,
  type FootprintInk,
} from "@/shared/lib/footprint-glyph";
import { DEFAULT_EXPAND } from "@/shared/lib/appearance-preferences";
import type { ExpandPreference, FootprintPreference } from "@/shared/lib/appearance-preferences";
import { isDirectionalRelation } from "@/shared/lib/ontology-tree/relations";
import { depthParallaxOffsetFor, ZERO_PARALLAX } from "../model/realm-depth-parallax";
import {
  DOME_HALO_ALPHA_CAP,
  DOME_HALO_ALPHA_GAIN,
  DOME_RING_ALPHA,
  DOME_RING_WIDTH_PX,
  domeFogAlpha,
  domeHaloPx,
  domeLineWidthFactor,
  type DomeNodeFrame,
} from "../model/dome-view";
import { draw as domeRingsDraw } from "../render/dome-rings";
import { realmDepthClarityAlpha, realmDepthClarityScale } from "../model/realm-transition";
import { classifyZoomTier, DEFAULT_TIER_REVEAL, edgeTierAlpha, effectiveNodeAlpha, nodeTierAlpha, type TierRevealConfig } from "../model/tier-visibility";
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
  computeDomainWatermarkAlpha,
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
 * S8 결함 1 — 펼친(확장) 부모 노드를 접힘과 시각 구분하는 파선 오라 링. 선택
 * (ego) 링은 실선이라 채널이 겹치지 않는다. 반지름 = 노드 디스크 + 이 오프셋(px),
 * 1px, 인디고. glow/네온 금지 — 파선 헤어라인만.
 */
const EXPANDED_AURA_RING_OFFSET = 6;
const EXPANDED_AURA_DASH: readonly number[] = [3, 3];
/**
 * 이름 상자를 좌우로 넓히는 여백(px). 두 이름이 **닿기만 해도** 한 단어로
 * 읽히는데 AABB 겹침 판정은 닿는 것을 겹침으로 안 센다 — 그 사각지대를 예약
 * 단계에서 메운다. 값은 시안(`.qa-scratch/proto-expand.html`)의 예약 상자
 * `측정폭 + 6`(좌우 3)과 같다.
 */
const LABEL_SIDE_GAP = 3;
/** 영역 루트 앵커 링 알파 — 결계(0.5)보다 한 단계 또렷한 실선 헤어라인(중심이 주인공). */
const REALM_ROOT_ANCHOR_ALPHA = 0.7;
/** 결계 센서스 각인 — 원 하단 바깥 오프셋(px, 화면 고정)과 잉크 알파. */
const WARDING_CAPTION_OFFSET_PX = 24;
const WARDING_CAPTION_ALPHA = 0.62;
const EXPANDED_AURA_ALPHA = 0.55;
/**
 * S11 — 전개 코호트(직속 자식) 소속 링 알파. 부모 오라(0.55)보다 낮아 부모가
 * attention winner 를 유지한다 — 자식 30개가 부모와 같은 세기로 울면 "전개된
 * 묶음" 이 아니라 "지도가 반짝인다" 로 읽힌다.
 */
const EXPANDED_COHORT_ALPHA = 0.42;
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
// perf sweep 2026-07 — reused frame-scratch Map, see its `.clear()` call
// site in `drawTopologyFrame` below for why this is safe.
const effectiveAlphaByIdReused = new Map<string, number>();

/*
 * ── 프레임당 할당 0 을 향한 스크래치 버퍼들 ──────────────────────────────
 *
 * 3D 는 매 프레임 **깊이순으로 다시 정렬**하고 **링을 화면으로 투영**한다.
 * 그것을 매번 새 배열·새 객체로 만들면 이 볼트에서만 프레임당 배열 2개 +
 * 객체 291개가 태어난다(엣지 258 정렬 배열 · 노드 125 정렬 배열 · 링 3×96 점).
 * 120Hz 에서 그것은 초당 3만 5천 개고, 그 청구서는 프레임 시간이 아니라
 * **GC 가 끼어드는 순간의 튐**으로 온다.
 *
 * 이 저장소가 이미 쓰는 관용구(`effectiveAlphaByIdReused`)와 같다 — 드로우는 단일
 * rAF 루프에서만 동기로 도므로 모듈 스코프 재사용이 안전하다.
 */
const domeEdgeOrderReused: WorldEdge[] = [];
/** 깊이 정렬 보조 — 프레임마다 재사용해 할당 0 (위 `edgeDrawOrder` 블록 참고). */
const domeEdgeDepthReused: number[] = [];
const domeEdgeIndexReused: number[] = [];
const domeNodeOrderReused: WorldNode[] = [];
const domeRingScreenReused: { a: number; points: { x: number; y: number; u: number }[] }[] = [];
/**
 * perf 2026-08-19 — 돔 전달값(DomeNodeFrame) **프레임당 1회 조회** 버퍼.
 *
 * 종전에는 같은 노드의 프레임을 알파 루프·노드 정렬 비교자(O(n log n)!)·
 * 노드 드로우·라벨 패스가 각자 `domeFrame.get(id)`(문자열 해시 조회)로
 * 다시 꺼냈다 — synth=2000 회전 프로파일에서 `domeFrameFor` self 2.6%.
 * 엣지도 깊이 계산·드로우·투영이 끝점당 2~3회씩 다시 꺼냈다. 여기 원본
 * 인덱스 기준으로 한 번만 담아 두고 전부 이 배열을 읽는다. 값이 같은
 * 객체이므로 픽셀은 같고, 노드 정렬은 엣지 정렬과 같은 인덱스-정렬
 * 관용구라 순서도 한 자리도 다르지 않다(안정 정렬 + 동일 비교 기준).
 */
const domeNodeFrameReused: DomeNodeFrame[] = [];
const domeNodeDepthReused: number[] = [];
const domeNodeIndexReused: number[] = [];
const domeEdgeFrameAReused: DomeNodeFrame[] = [];
const domeEdgeFrameBReused: DomeNodeFrame[] = [];
/** 노드 패스가 실제 그린 반지름(E-4) — 프레임마다 `.clear()` 로 재사용. */
const drawnScreenRadiusByIdReused = new Map<string, number>();
/** 앰비언트 depends 코멧 캡 입력 — 매 프레임 `filter` 가 만들던 새 배열의 재사용판. */
const ambientDependsInputReused: WorldEdge[] = [];
/**
 * 엣지 끝점 투영 스크래치 — `projectEdgePoints` 가 매 엣지 4개(점 3 + 래퍼 1)
 * 만들던 임시 객체의 재사용판. 드로우는 단일 rAF 루프에서 동기로만 돌고
 * 반환값은 다음 엣지 전에 소비되므로 안전하다(`effectiveAlphaByIdReused` 근거).
 */
const edgePointsScratch = {
  a: { x: 0, y: 0 },
  b: { x: 0, y: 0 },
  control: { x: 0, y: 0 },
};
/** 노드·라벨 패스의 스크린 좌표 스크래치 — 반복당 1개씩 태어나던 점 객체의 재사용판. */
const nodeScreenScratch = { x: 0, y: 0 };
const labelScreenScratch = { x: 0, y: 0 };
/*
 * perf 2026-08-19 — 엣지 헤일로 인자의 재사용판. `tracesDraw` 는 동기적으로
 * 읽고 보관하지 않으므로(순수 드로우) 같은 객체를 필드만 바꿔 재사용해도
 * 값 — 그러니까 픽셀 — 은 같다. 드로우 호출의 토큰 인자도 프레임 안에서
 * 불변이라 프레임당 1개로 족하다(`traceTokensFrame`/`nodeShapeTokensFrame`).
 */
const edgeHaloScratch = { color: "", px: 0, alpha: 0 };

/** `lerpColorHex(fill, sheenTint, blend)` 캐시 — fill 별로 값이 불변(토큰이 바뀌면 통째 무효화). */
const sheenTopCache = new Map<string, string>();
let sheenTopCacheTint = "";
let sheenTopCacheBlend = -1;
/** kind 2패스 순서 — 프레임마다 배열 리터럴을 새로 만들지 않는다. */
const EDGE_KIND_PASSES = ["contains", "depends"] as const;
/**
 * perf 2026-08-19 — 엣지 알파 사전 계산 버퍼(원본 엣지 인덱스 기준).
 * 종전엔 앰비언트 코멧 필터와 드로우 루프가 각각 엣지당 `clusteredIds.has`
 * 2회 + `effectiveAlphaById.get` 2회를 반복했다. 한 패스에서 계산해 두 소비처가
 * 같은 값을 읽는다. -1 = 밀도 게이트로 접힌 엣지(그리지 않음) 표식.
 */
const edgeAlphaReused: number[] = [];
/**
 * perf 2026-08-19 — 무포커스 프레임의 노드 시각(NodeVisual) 캐시.
 *
 * 회전/유휴 프레임(포커스·페어·렌즈·호버 리플 없음)에서 `resolveNodeVisual`
 * 은 (kind, fresh, stale) 만의 함수인데도 노드마다 매 프레임 freshness 객체 +
 * NodeVisual 객체를 새로 만들었다(2,000 노드 × 60fps). 같은 입력 조합은 같은
 * 객체를 재사용한다 — 값이 같으니 픽셀도 같다. 토큰/모션 설정이 바뀌면 통째로
 * 무효화하고, 캐시 대상이 아닌 프레임(포커스 등)은 종전 경로 그대로다.
 * 캐시된 객체는 어떤 소비처도 변형하지 않는다(트레일 잉크 변형은 렌즈 활성
 * 프레임에만 있고, 그 프레임은 캐시를 안 탄다).
 */
const nodeVisualCache: (NodeVisual | undefined)[] = new Array(16);
let nodeVisualCacheTokens: TopologyV2Tokens | null = null;
let nodeVisualCacheReducedMotion: boolean | null = null;
const KIND_CACHE_INDEX: Record<WorldNode["kind"], number> = { project: 0, domain: 1, capability: 2, element: 3 };
/** 3D 전달값의 0 값 — 돔이 꺼진 노드·2D 경로가 공유(불변). */
const ZERO_DOME_FRAME: DomeNodeFrame = { dx: 0, dy: 0, s: 1, a: 0, u: 0 };

/**
 * **이번 프레임에 실제로 그려진 노드 알파** — 히트테스트의 단일 출처.
 *
 * 티어 관통 면제 채널이 드로우에는 넷인데(엣지 선택 · 발자국 렌즈 · ego 포커스 ·
 * 최근변경 스포트라이트) 히트에는 ego 하나뿐이라, 발자국 렌즈로 떠오른 노드가
 * **보이는데 안 눌렸다**(2026-07-31 전수 검사). 인자를 하나씩 더 넘기면 다음에
 * 채널이 늘 때 또 어긋나므로, 드로우가 이미 만드는 이 맵을 그대로 읽게 한다.
 *
 * 안전한 이유는 `effectiveAlphaByIdReused` 의 주석과 같다 — `drawTopologyFrame`
 * 은 단일 rAF 루프에서 **동기적으로만** 돌고, 포인터 이벤트가 그 사이에 끼어들
 * 수 없다. 히트가 읽는 값은 항상 **완결된 직전 프레임**이고, 그건 오히려 더
 * 정확하다: 사용자는 **자기가 본 것**을 클릭한다.
 */
export function lastDrawnNodeAlphas(): ReadonlyMap<string, number> {
  return effectiveAlphaByIdReused;
}
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
   * **이번 세션에 새로 생긴 노드**의 id (`use-topology-loop` 의 월드 diff 가
   * 채운다). 등장 램프(`appearById`)는 원래 있었지만, 새 역량은 개요 배율에서
   * 티어 알파가 0 이라 **그 연출이 0 에 곱해지고 있었다** — 에이전트가 노드를
   * 만들어도 화면에는 도메인의 자식 수 숫자만 2→3 으로 바뀌었다(2026-08-17
   * 실측). 그래서 새로 생긴 노드는 ego 클릭·칩 펼침과 같은 급의 면제를 받아
   * 그려지고, 이미 있던 그 램프를 타고 0.6배에서 부풀며 떠오른다.
   *
   * 세션 동안 유지된다 — 잠시 보였다 사라지면 그게 곧 깜빡임이다.
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
  wardingRing: { centerX: number; centerY: number; radius: number; drawProgress: number; caption: string | null } | null;
  /** S4 — 멤버별 깊이 기반 티어 kind 오버라이드 (영역 세계의 티어 = 재배치 깊이). */
  realmTierKinds: ReadonlyMap<string, "project" | "domain" | "capability" | "element"> | null;
  /**
   * 다섯째 티어 관통 채널 — **칩 펼침으로 드러난 자식**의 0..1 램프.
   * `use-topology-loop.ts` 가 스텝한다. 앞의 넷과 같은 문법이라 히트 경로는
   * `effectiveAlphaById` 를 통해 자동으로 따라온다(별도 배선 불필요).
   */
  expandRevealById?: ReadonlyMap<string, number> | null;
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
   * S7 — 영역 퇴장(exiting) 중 하드 컬됐던 밖 노드의 귀환 materialize 알파
   * (모션 감사 처방 B). `realm-transition.ts#realmOutsideReturnAlpha` 로 계산 —
   * 완전 이탈=0(안 보임) → 홈=1(풀 알파). 이 노드의 `effectiveAlphaById` 항목에
   * 곱해져 노드 자신과, `edgeTierAlpha`(min 결합)를 통해 그 노드로 향하는 엣지
   * 모두를 램프시킨다 — 뷰포트 컬 경계에 걸리는 순간 풀 알파로 팝인하던 결함의
   * 수정. null 이면 미적용(entering/active/idle — 회귀 0).
   */
  realmOutsideReturnAlphaById: ReadonlyMap<string, number> | null;
  /**
   * 발자국 — 노드별 **방문 순번 목록**(1부터). 재방문 노드는 여러 개를 갖는다.
   * `views/home/lib/footprint-trail.ts#buildFootprintSteps` 가 만든다.
   * 현재 포커스 노드는 호출부가 제외해 선택 링과 이중이 안 된다.
   * 빈 map = 발자국 없음(회귀 0).
   */
  footprintStepsById: ReadonlyMap<string, readonly number[]>;
  /** 발자국 표현 설정. null 이면 아무것도 그리지 않는다. */
  footprintPref?: FootprintPreference | null;
  /**
   * 연달아 방문한 노드 쌍의 키 집합(`model/footprint-steps.ts#buildWalkedEdgeKeys`).
   * 이 중 실재하는 관계선에만 선 옆 자국이 얹힌다. null = 선 자국 없음.
   */
  walkedEdgeKeys?: ReadonlySet<string> | null;
  /** 발자국 잉크 RGB — 호출부가 `--color-footprint-trail` 또는 인디고 토큰에서 읽는다. */
  footprintInk?: FootprintInk;
  /** 순번 글자색 — 자국 잉크보다 한 단 밝다(작은 글자라 대비가 더 필요). */
  footprintStepColor?: string;
  /**
   * 가장 최근 걸음의 노드 id + 그 걸음의 등장 진행 [0,1]. 이 노드의 자국만
   * 램프를 받고 나머지는 1(정착)이다 — 한 입력이 낳은 사건은 하나다.
   */
  footprintNewestId?: string | null;
  footprintAppear?: number;
  /**
   * 걸어온 길 렌즈 — 트레일 팝오버가 열려 있는 동안 **그 동안만** non-null.
   * 방문 노드 집합(현재 포커스 포함)을 ego keep-set 대신 쓴다: 방문 노드는
   * 값(색·라벨)을 지키고 나머지 노드·클러스터 칩·라벨·**엣지 전부(ego 강조
   * 엣지 포함)** 는 기존 ego dim 값으로 후퇴한다. 지도가 잠시 "관계 읽기"를
   * 접고 "궤적 읽기"에 양보하는 일시 렌즈다 — 새 토큰 0, 새 모션 0, 궤적
   * 폴리라인 없음(이 제품에서 선 = 관계다). null/빈 집합 = 렌즈 off(회귀 0).
   *
   * 매 프레임 새로 만들지 않는다 — loop 가 `visitedTrail` 이 바뀔 때만 갱신하는
   * Set 을 그대로 넘긴다(60fps 루프 안 신규 할당 0).
   */
  trailLensIds?: ReadonlySet<string> | null;
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
  /** 스포트라이트 파선 위상 — transition 중에만 갱신되고 이후 고정된다. */
  spotlightDashOffset: number;
  /**
   * 슬라이스 C (개발/비개발 모드 토글) — 티어 게이트 config. 생략 시
   * `DEFAULT_TIER_REVEAL`(개발 모드). 비개발(plain) 모드는 HomePage 가
   * `PLAIN_TIER_REVEAL`(element 상시 숨김)을 넘긴다 — 그리기 게이트도 히트/
   * 팬-클램프와 같은 config 를 봐야 lockstep 이 깨지지 않는다.
   */
  tierReveal?: TierRevealConfig;
  /**
   * 아이콘 세트 (Phase 5 #21) — 노드 바디 렌더 스타일. `"fill"`(기하, 기본) /
   * `"line"`(라인, stroke-only). kind→실루엣 매핑은 이 값과 무관(불변). DOM
   * 글리프와 같은 스토어를 읽어 두 표면이 함께 스왑. 생략 시 `"fill"`(회귀 0).
   */
  glyphStyle?: "fill" | "line";
  /**
   * 캔버스 배경 세트 (Phase 5 #20) — `gridDraw` 로 전달. 도트(기본, blueprint
   * grid)·성좌·등고선. 생략 시 `"dot"`(회귀 0).
   */
  backgroundVariant?: CanvasBackgroundVariant;
  /** 움직이는 배경 버퍼를 얹는 콜백(도트가 아닐 때만 소비) — `render/grid.ts` 참고. */
  paintAnimatedBackground?: ((ctx: CanvasRenderingContext2D, width: number, height: number) => void) | null;
  /** 깊이 도트 세 층의 패턴(`variant === "depth"` 일 때만 소비). 원점은 여기서 계산한다. */
  depthDotPatterns?: readonly (CanvasPattern | null)[];
  /**
   * 확장 설정 — 이 프레임이 쓰는 것은 둘이다: **펼치기 표시**(칩을 알약/막대/
   * 배지 중 무엇으로 그리나)와 **이름을 시도할 개수**(펼친 원반의 라벨 예산).
   * 생략 시 `DEFAULT_EXPAND`(설정을 안 건드린 화면과 동일).
   */
  expand?: ExpandPreference;
  /**
   * 막대 문구(번역문). 캔버스 렌더러는 문자열을 만들지 않는다 — 결계 캡션
   * (`wardingRing.caption`)이 이미 쓰는 그 경로 그대로 호출부가 번역해 넘긴다.
   */
  clusterBarLabels?: ClusterBarLabels | null;
  /**
   * 3D 보기 (2026-08-18, 옵트인) — 지도를 kind 동심 링의 돔으로 다시 배치해
   * 그리는 뷰 모드(`model/dome-view.ts`). 루프가 매 프레임 갱신하는 노드별
   * 전달 맵(오프셋 + 원근 배율) — 노드·라벨·엣지·칩이 전부 이 맵을 지나고,
   * 히트테스트·계기(`__atlasMap`)도 **같은 맵**을 읽어 회전 중에도 클릭이
   * 그려진 자리를 따라온다. 영역 전개(realm) 중에는 루프가 램프를 되감아
   * null 이 된다(영역의 S5 깊이 문법과 이중 인코딩 방지). 생략/null = 종전
   * 화면과 픽셀 동일(회귀 0).
   */
  domeFrame?: ReadonlyMap<string, DomeNodeFrame> | null;
  /**
   * 3D 조립 시계의 전체 진행 0..1 — 표현층 전환(배경 격자 소등 등)의 보간자.
   * 노드별 진행은 `domeFrame` 의 `a` 가 나른다. 생략/0 = 2D 표현 그대로.
   */
  domeRamp?: number;
  /**
   * 3D — 이번 프레임의 **위도 링**(월드 좌표 + 정규화 깊이). 링이 왜 필요한지는
   * `model/dome-view.ts` 의 `DOME_RING_KINDS` 독블록. 생략/null = 안 그린다.
   */
  domeRings?: readonly { a: number; points: readonly { wx: number; wy: number; u: number }[] }[] | null;
  /**
   * 3D — 한 관계선의 **자오선 제어점**(월드 2D). 왜 직선이 아니라 휘어야
   * 하는지는 `model/dome-view.ts` 의 `DOME_EDGE_BOW` 독블록. 생략/null 을
   * 돌려주면 그 엣지는 2D 제어점을 그대로 쓴다(회귀 0).
   */
  domeControlFor?: ((sourceId: string, targetId: string) => { wx: number; wy: number } | null) | null;
  /**
   * 「걸어온 길」 렌즈의 세기 0..1 — on/off 지수 램프(loop 가 스텝).
   *
   * 왜 boolean 이 아닌가: 렌즈가 켜지면 방문 노드와 **밟은 관계선**이 트레일
   * 색으로 올라오는데, 그 색이 하드컷으로 나타나고 사라지면 «장식이 튀어나왔다»
   * 로 읽힌다. 선행 렌즈 예외 둘(에이전트 포커스 링 · 최근 변경 스포트라이트)이
   * 이미 램프로 소멸하는 문법을 세워 뒀고, 이 렌즈도 같은 문법을 쓴다.
   * 생략 시 `trailLensIds` 유무로 0/1(하위호환).
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

  // 스포트라이트 침강 배수 — 렌즈 ON + 램프 진행 중 + 포커스/엣지선택 비활성
  // 일 때만 유효(선택 > 렌즈 우선순위). inSpotlight=false 대상에 적용한다.
  const spotlightLensActive =
    spotlightIds !== null && spotlightRamp > 0.001 && colorFocusedNodeId === null && colorSelectedEdge === null;
  const spotlightSink = (inSpotlight: boolean): number =>
    spotlightLensActive && !inSpotlight ? 1 - spotlightRamp * (1 - tokens.spotlightRestAlpha) : 1;

  // 걸어온 길 렌즈 — 트레일 팝오버가 열려 있는 동안만. 켜지면 ego keep-set 이
  // "1-hop 이웃"에서 "방문 노드"로 바뀐다(아래 `lensNodeEgoState`), 엣지는 전부
  // dim 으로 내려앉는다. 새 토큰·새 램프 없이 기존 dim 값만 재사용하므로 on/off
  // 는 즉시 전환이고(200ms 이내 계약), 닫으면 ego 강조가 그대로 복귀한다.
  const trailLensKeepIds = trailLensIds !== null && trailLensIds.size > 0 ? trailLensIds : null;
  const trailLensActive = trailLensKeepIds !== null;
  /**
   * 렌즈의 **세기** — 0 이면 아무 트레일 잉크도 없다.
   *
   * 켜짐(집합 유무)과 세기(램프)를 갈라 둔 이유: 팝오버를 닫는 순간 집합을
   * 비우면 색이 하드컷으로 사라진다. loop 가 램프가 0 에 닿을 때까지 집합을
   * 계속 넘기고, 이 값만 내려간다.
   */
  const trailRamp = trailLensActive
    ? Math.min(1, Math.max(0, trailLensRamp ?? 1))
    : 0;
  const isTrailKept = (nodeId: string): boolean => trailLensKeepIds !== null && trailLensKeepIds.has(nodeId);
  /** 렌즈 ON 이면 방문 keep-set 기준 분류, OFF 면 기존 ego/페어 분류 그대로. */
  const lensNodeEgoState = (nodeId: string, focusId: string | null, neighbors: ReadonlySet<string>, pair: EdgePairFocus | null): NodeEgoState =>
    trailLensKeepIds !== null
      ? resolveTrailLensNodeEgoState(nodeId, focusId, trailLensKeepIds)
      : resolveNodeEgoStateWithPair(nodeId, focusId, neighbors, pair);

  // S5 깊이 연출 — 노드 하나의 렌더 오프셋(월드 단위, 시차)과 깊이 선명도
  // 배수를 한 곳에서 계산해 드로우 전체가 일관되게 쓴다. 영역 밖(depthById 에
  // 없음)·depth≤1 은 오프셋 0, 선명도 배수 1(무효과) — 회귀 0.
  const realmDepthOf = (nodeId: string): number | undefined => realmDepthById?.get(nodeId);
  const realmParallaxOffsetFor = (nodeId: string): { x: number; y: number } => {
    if (!realmDepthParallax || !realmDepthById) return ZERO_PARALLAX;
    return depthParallaxOffsetFor(realmDepthById.get(nodeId), realmDepthParallax.depth2, realmDepthParallax.depth3);
  };

  // 3D 보기 — 램프가 0 이면 루프가 null 을 넘겨 이 프레임은 종전 2D 경로다.
  const domeOn = domeFrame !== null && domeFrame !== undefined && domeFrame.size > 0;
  /**
   * 한 노드의 3D 렌더 전달값(월드 오프셋 + 원근 배율). 노드·라벨·엣지 끝점·칩
   * 앵커가 전부 이 맵을 지나므로 한 프레임의 모든 마크가 **하나의 자세**를
   * 공유한다 — 히트테스트(`renderOffsetForNode`)·계기도 같은 맵을 읽는다.
   */
  const domeFrameFor = (nodeId: string): DomeNodeFrame =>
    (domeOn ? domeFrame.get(nodeId) : undefined) ?? ZERO_DOME_FRAME;
  // perf 2026-08-19 — 노드 프레임을 원본 인덱스 기준으로 한 번만 조회해 두고,
  // 이후의 알파 루프·노드 정렬·노드 드로우·라벨 패스가 전부 이 배열을 읽는다
  // (`domeNodeFrameReused` 독블록). 값은 `domeFrameFor` 와 동일한 객체다.
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
  // 발자국 크기 계수 — 줌아웃에서 자국이 그래프를 덮지 않게 함께 줄인다.
  const footprintScale = footprintScaleFor(camera.scale.value);
  // B5 — 라벨 줌 스케일 (프레임당 1회, 전 라벨 공용).
  const labelScale = labelZoomScale(camera.scale.value);

  // 성좌 배경만 **먼 층**으로 흘린다 (2026-07-28 카운슬 — 소유자 "우주처럼
  // 관성 있어보이게"). 격자·등고선은 지면이라 계수 1(세계에 용접) 그대로다.
  // 자율 운동 0 — 카메라 원점의 함수일 뿐이라 카메라가 서면 배경도 선다.
  // 결정 전체가 `model/background-parallax.ts` 의 순수 함수 한 개에 있다 —
  // 여기 남는 미검증 표면은 "그 결과를 gridDraw 에 넘기는가" 한 줄뿐이다.
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
      farT,
      variant: backgroundVariant,
      // 3D — 배경 격자·도트는 **공(void)** 으로 물러난다(히어로 판정: 격자가
      // 있으면 물체가 떠 있지 않고 바닥에 놓여 보인다). 바탕 채움·비네트는
      // 유지 — 꺼지는 것은 무늬 층뿐이다.
      gridPattern: domeRamp > 0.001 ? null : gridPattern,
      paintAnimated: domeRamp > 0.001 ? null : paintAnimatedBackground,
      // 층별 시차 원점은 배경 원점이 아니라 **격자 원점**에서 각자 계산한다 —
      // 배경 원점은 이미 한 번 시차가 걸려 있어 두 번 걸면 층이 뭉친다.
      depthLayers:
        depthDotPatterns && domeRamp <= 0.001
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
  // perf 2026-08-19 — 핫 패스(엣지·노드·라벨)의 투영은 `worldToScreen` 과
  // **같은 식**을 인라인으로 계산한다: `(w - cam) * scale + viewport/2`.
  // 함수 호출 + 반환 객체 할당(프레임당 수천 개)을 없앨 뿐 좌표는 동일하다.
  // 드로우는 동기라 카메라 값이 프레임 중간에 변하지 않는다.
  const camX = camera.x.value;
  const camY = camera.y.value;
  const camScale = camera.scale.value;
  const halfW = viewportWidth / 2;
  const halfH = viewportHeight / 2;
  /**
   * 엣지 끝점·제어점의 스크린 투영 — 3D 보기가 켜지면 **각 끝점이 자기 끝
   * 노드의 kind 깊이 오프셋**을 따라간다(끝 노드 디스크와 같은 층). 제어점은
   * 두 끝 오프셋의 평균 — 커브가 두 층 사이를 잇는다. 꺼져 있으면 오프셋 0
   * (기존 경로와 동일). 엣지 드로우와 호버 펄스가 같은 함수를 쓴다.
   *
   * perf 2026-08-19 — 반환값은 `edgePointsScratch` 재사용 객체다(다음 호출
   * 전에 소비 완료). 엣지 드로우 루프는 깊이 정렬 때 이미 꺼낸 끝점 프레임을
   * `offA`/`offB` 로 넘겨 Map 재조회를 없앤다(펄스 리졸버는 생략 → 자체 조회).
   */
  const projectEdgePoints = (
    edge: {
      sourceId: string;
      targetId: string;
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
     * 제어점 — 돔에서는 «두 끝점 오프셋의 평균»이 아니라 **자오선 제어점**이다
     * (`model/dome-view.ts` 의 `DOME_EDGE_BOW`). 평균은 곧 현(chord)이라 선이
     * 돔 속을 가로지르고, 그 실루엣은 돔이 아니라 천막이 된다.
     *
     * 조립 램프(`aMin`)로 2D 제어점에서 자오선 제어점으로 **건너간다** — 3D 를
     * 켜는 700ms 동안 곡률이 이어져야 선이 «툭» 휘지 않는다.
     */
    const flatControlX = edge.controlX + (offA.dx + offB.dx) / 2;
    const flatControlY = edge.controlY + (offA.dy + offB.dy) / 2;
    const meridian = domeControlFor === null ? null : domeControlFor(edge.sourceId, edge.targetId);
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
  // perf 2026-08-19 — 포커스·페어·렌즈가 전부 없는 프레임(회전·유휴의 통상
  // 상태)은 모든 노드의 ego 분류가 "normal" 로 정해져 있다(`resolveNodeEgoState`
  // 첫 분기). 노드·라벨 루프가 노드마다 분류 함수를 다시 부르지 않게 한 번만
  // 판정해 둔다 — 값이 같으므로 픽셀도 같다.
  const egoAllNormal = focusedNodeId === null && selectedEdge === null && trailLensKeepIds === null;
  const colorAllNormal = colorFocusedNodeId === null && colorSelectedEdge === null && trailLensKeepIds === null;
  // perf 2026-08-19 — 무포커스 NodeVisual 캐시 무효화(토큰/모션 설정 변경 시).
  if (nodeVisualCacheTokens !== tokens || nodeVisualCacheReducedMotion !== reducedMotion) {
    nodeVisualCache.fill(undefined);
    nodeVisualCacheTokens = tokens;
    nodeVisualCacheReducedMotion = reducedMotion;
  }
  // perf 2026-08-19 — 드로우 호출의 토큰 인자(프레임 안 불변)를 프레임당 1개로.
  const traceTokensFrame = {
    edgeContains: tokens.edgeContains,
    edgeContainsL0: tokens.edgeContainsL0,
    edgeContainsL2: tokens.edgeContainsL2,
    edgeDepends: tokens.edgeDepends,
    edgeDim: tokens.edgeDim,
    indigo: tokens.indigo,
    indigoBright: tokens.indigoBright,
    edgeSelected: tokens.edgeSelected,
    // 트레일 잉크는 토큰이 아니라 **발자국이 쓰는 그 색 그대로**다 —
    // 사용자가 설정에서 고른 노랑/인디고 2택이 자국과 선에 동시에 적용돼야
    // 둘이 같은 사실의 두 표기로 읽힌다.
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
    reviewRing: tokens.reviewRing,
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
    // **접힌 노드는 알파를 가질 이유가 없다** — 칩 하나로 대체돼 이 프레임에
    // 그려지지 않는다(실측 synth=3000: 3000 중 2820개). 소비처 넷이 전부 이
    // 조회 «앞에서» 접힘을 이미 거른다: 엣지 루프 둘은 양 끝이 접히면 continue,
    // 노드/라벨 루프는 첫 줄이 같은 가드, 히트 판정(`isNodeHittable`)은 알파
    // 맵을 읽기 전에 접힘으로 false 를 낸다. 칩 부모는 정의상 접히지 않으며
    // 그마저 `?? 1` 기본값을 갖는다.
    if (clusteredIds.has(node.id)) continue;
    const tierKind = realmTierKinds?.get(node.id) ?? node.kind;
    const tierAlpha = nodeTierAlpha(tierKind, node.isHub, zoomRatio, tierReveal);
    const isPairMember =
      focusedNodeId === null &&
      selectedEdge !== null &&
      (node.id === selectedEdge.sourceId || node.id === selectedEdge.targetId);
    // 걸어온 길 렌즈 — 방문 노드는 ego 멤버와 같은 티어 관통 채널을 탄다.
    // 방문한 뒤 줌아웃해 티어 아래로 내려간 노드도 렌즈 동안엔 서 있어야
    // "방문 노드만 이름을 갖고 서 있는" 상태가 성립하고, 같은 관통이
    // 히트테스트에도 걸려 지도에서 바로 다시 클릭할 수 있다.
    const trailKept = isTrailKept(node.id);
    const isEgoMember =
      isPairMember ||
      trailKept ||
      (focusedNodeId !== null && (node.id === focusedNodeId || neighborsOfFocused.has(node.id)));
    // 스포트라이트 티어 관통 공개 (소유자: "눈으로 보는 노드를 보고 바로
    // 파악") — 변경 노드가 줌 티어 아래(element 등)에 숨어 있으면 렌즈가
    // 켜져도 안 보인다. ego 이웃과 같은 tier-exemption reveal 채널에
    // 스포트라이트 램프를 합류시켜, 렌즈 ON 동안 변경 노드는 줌 무관하게
    // 램프로 떠오른다(끄면 램프 감쇠로 자연 강하).
    const spotlightReveal =
      spotlightLensActive && spotlightIds !== null && spotlightIds.has(node.id) ? spotlightRamp : 0;
    // **다섯째 티어 관통 채널 — 칩 펼침** (2026-07-31).
    //
    // 앞의 넷(엣지 선택 · 발자국 · ego · 스포트라이트)은 티어를 관통하는데 칩
    // 펼침만 없었다. 칩은 자식을 `clusteredIds`(=안 그림)에서 빼줄 뿐, 그
    // 다음 관문인 줌 티어 게이트 앞에서는 아무 특권이 없었다.
    //
    // 그래서 `+43 더보기` 칩이 "24개가 지금 보인다"고 주장하는데 **1개가
    // 그려졌다**(모션석 프레임 실측). 개요 배율에서 element 자식은 zoomRatio
    // 2.5 까지 알파 0 이다 — 칩을 눌러도 2.5 초 동안이 아니라 **줌을 그만큼
    // 올릴 때까지** 아무것도 안 나온다.
    //
    // 사용자가 칩을 눌렀다는 것은 "이걸 보겠다"는 명시적 요청이라 ego 클릭과
    // 같은 급이다. 새 개념이 아니라 **빠진 다섯 번째**다.
    const chipExpandReveal = expandRevealById?.get(node.id) ?? 0;
    // 방금 생긴 노드 — 등장 램프를 그대로 면제 채널로 쓴다. 새 개념이 아니라
    // 이미 있던 램프가 닿지 못하던 자리에 닿게 하는 것이다(위 `bornNodeIds`).
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
      ),
    );
    // S7 — 영역 퇴장 중 귀환하는 밖 노드는 이 램프로 강등(모션 감사 처방 B). 이
    // 노드로 향하는 엣지는 `edgeTierAlpha`(min 결합)를 통해 같은 프레임에서
    // 자동으로 따라온다 — 별도 엣지 경로 없이 노드 alpha 하나로 충분.
    const returnAlpha = realmOutsideReturnAlphaById?.get(node.id);
    let outAlpha = returnAlpha !== undefined ? baseAlpha * returnAlpha : baseAlpha;
    // 3D — 돔은 **모든 티어가 형태를 이룬다**(히어로 판정): 시맨틱 줌 게이트가
    // 숨겨 둔 capability/element 도 자기 티어의 조립 램프를 타고 떠오른다.
    // 램프 0 이면 종전 값 그대로(2D 회귀 0), 램프 1 이면 완전 공개. 깊이에
    // 따른 어두움은 여기가 아니라 노드/엣지의 안개(fog)가 나른다 — 이 맵은
    // 히트 판정의 단일 출처라 안개를 섞으면 먼 노드가 안 잡히게 된다.
    if (domeOn) {
      const domeA = domeNodeFrameReused[nodeIndex].a;
      if (domeA > 0) outAlpha = outAlpha + (1 - outAlpha) * domeA;
    }
    effectiveAlphaById.set(node.id, outAlpha);
  }

  // S8 결함 1 — 펼친 부모(파선 오라 대상) + 그 디스크(부모 + contains 하위 전이
  // 폐포) 집합. 배경 dim 은 "확장 중" 무관 노드에만 걸어야 하므로 디스크 멤버를
  // 미리 모은다. 확장이 없으면 둘 다 비어 회귀 0. ego(`이웃 +N`) 칩은 제외.
  // 엣지 루프의 depends 억제(고팬아웃 배치-공개 처방 4)도 `anyExpanded` 를
  // 읽으므로 엣지 그리기 **앞**에서 계산한다.
  const expandedParentIds = new Set<string>();
  const expandedDiscIds = new Set<string>();
  // S11 결함 (소유자 실보고 "+ 버튼 눌렀을때는 뭐가 선택된건지 모르겠거든?") —
  // 칩을 눌러 **직접 드러난** 자식 집합. 노드 클릭은 ego dim + 실선 인디고 링으로
  // "무엇이 골라졌는지"가 즉시 읽히는데, 칩 전개는 자식이 그냥 나타날 뿐 소속
  // 표시가 없어 사용자가 자기 행동의 결과를 못 봤다. 전이 폐포(`expandedDiscIds`)가
  // 아니라 **직속 자식**만 표시한다 — 손자는 자기 칩으로 열린 별개 코호트다.
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

  // 상시 앰비언트 `depends` 코멧 캡 — 형제 갈래(contains)가 이미 갖는 24 상한을
  // 빠진 쪽에 적용한다. **#512(소유자의 앰비언트 복원)를 재뒤집는 게 아니다**:
  // 혜성은 여전히 상시로, 포커스 무관하게, 같은 속도로 흐른다. 다만 element
  // 티어에서 화면이 depends 로 찰 때 **동시에 흐르는 점 개수에 천장이 없던**
  // 것을 형제와 같은 결정론 랭킹으로 막는다.
  //
  // 입력은 "이 프레임에 실제로 그려질 depends 엣지" 다 — 드로우 루프와 같은
  // 두 게이트(밀도 게이트 · 티어 알파)를 통과한 것만 캡 슬롯을 차지해야,
  // 안 보이는 엣지가 슬롯을 물고 보이는 엣지가 코멧을 잃는 일이 없다.
  // perf 2026-08-19 — 엣지 알파를 원본 인덱스 기준으로 한 번만 계산한다
  // (`edgeAlphaReused` 독블록). 아래 앰비언트 코멧 필터와 엣지 드로우 루프가
  // 같은 값을 읽는다 — 술어·값이 종전과 동일하므로 결과도 동일하다.
  edgeAlphaReused.length = 0;
  for (let i = 0; i < world.edges.length; i += 1) {
    const edge = world.edges[i];
    edgeAlphaReused.push(
      clusteredIds.has(edge.sourceId) || clusteredIds.has(edge.targetId)
        ? -1
        : edgeTierAlpha(effectiveAlphaById.get(edge.sourceId) ?? 1, effectiveAlphaById.get(edge.targetId) ?? 1),
    );
  }
  // `filter` 가 매 프레임 만들던 배열을 재사용 버퍼로 대체(원소·순서 동일).
  ambientDependsInputReused.length = 0;
  for (let i = 0; i < world.edges.length; i += 1) {
    const edge = world.edges[i];
    if (edge.kind === "depends" && edgeAlphaReused[i] > 0.02) {
      ambientDependsInputReused.push(edge);
    }
  }
  const ambientDependsComets = selectAmbientDependsComets(ambientDependsInputReused);

  /*
   * ── 3D 화가 정렬 + 깊이 헤일로 ────────────────────────────────────────
   *
   * 2D 에서 엣지는 배열 순서대로 그려도 된다 — 겹침에 앞뒤가 없다. 돔에서는
   * 그것이 곧 결함이다: 뒤쪽 링을 잇는 선이 앞쪽 링의 선 **위에** 그려지면
   * 깊이 단서가 매 프레임 무작위로 뒤집힌다(안개는 색만 낮추지 가리지 못한다).
   *
   * 그래서 노드가 이미 하는 것(`nodeDrawOrder`)을 엣지에도 한다: **먼 것부터**
   * 그린다. 정렬은 kind 패스 **안에서** 한다 — contains 아래, depends 위라는
   * 잉크 위계는 깊이보다 위의 규약이라 그대로 둔다.
   *
   * 깊이를 실제로 «가리게» 만드는 것은 정렬만으로는 안 되고 헤일로가 한다
   * (`model/dome-view.ts` 의 `domeHaloPx` 독블록 — Everts et al. 2009).
   * 헤일로 색은 그리드가 칠한 그 바탕과 **같은 식**으로 낸다: 값이 어긋나면
   * 잘린 자리가 배경보다 밝거나 어두운 띠로 남는다.
   */
  const domeHaloColor = domeOn ? lerpColorHex(tokens.canvasBgNear, tokens.canvasBgFar, farT) : "";
  /*
   * 깊이 정렬 — **깊이를 비교자 «안» 에서 재지 않는다** (2026-08-19 실측).
   *
   * 종전 비교자는 호출마다 `domeFrameFor` 를 두 번 불렀다. 정렬 비교는
   * O(n log n) 번 일어나므로 엣지 1,914개(synth=2000 의 3D) 기준 프레임당
   * 약 42,000회의 Map 조회가 됐고, 60fps 로 초당 2.5M 회다. CPU 프로파일에서
   * `domeFrameFor` 단독 self time 이 3D 유휴의 **7.2%** 로 잡힌 것이 이것이다.
   *
   * 깊이는 엣지당 «한 번»만 재고(2n 조회), 정렬은 인덱스 배열로 돌린다 —
   * 비교자는 배열 읽기 둘뿐이다. 인덱스가 오름차순으로 들어가고 V8 정렬이
   * 안정적이므로 **결과 순서는 종전과 한 자리도 다르지 않다**.
   */
  let edgeDrawOrder: readonly WorldEdge[] = world.edges;
  if (domeOn) {
    const edges = world.edges;
    domeEdgeDepthReused.length = 0;
    domeEdgeIndexReused.length = 0;
    // perf 2026-08-19 — 끝점 프레임도 여기서 한 번만 꺼내 담는다(원본 인덱스
    // 기준). 드로우 루프의 안개 계산과 `projectEdgePoints` 가 재조회하지 않고
    // 이 두 배열을 읽는다 — 같은 객체라 값도 픽셀도 같다.
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
   * ── 위도 링 — 무대를 먼저 깐다 ─────────────────────────────────────────
   *
   * 관계선보다 **먼저** 그린다. 링은 데이터가 아니라 좌표계라, 배우(노드·관계)
   * 위에 오면 그 순간 데이터인 척하게 된다 — 배경 도트 격자를 노드 위에 그리지
   * 않는 것과 같은 이유다. 3D 에서 그 도트 격자는 «공(void)» 으로 물러나 있고
   * (위 `gridDraw` 의 `gridPattern: null`), 링이 그 빈자리를 대신한다: 3D 의
   * 바닥은 평면이 아니라 구면이므로 좌표계도 구면의 것이어야 한다.
   */
  if (domeOn && domeRings !== null && domeRings.length > 0) {
    domeRingsDraw(
      ctx,
      {
        // 링 투영도 스크래치에 제자리로 쓴다 — 매 프레임 288개 객체를 새로
        // 만들지 않는다(위 버퍼 독블록).
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
        // 노드·엣지와 **같은 램프**를 넘긴다 — 좌표계가 데이터와 다른 안개를
        // 쓰면 같은 깊이의 둘이 다른 밝기가 되어 깊이 단서가 서로를 부정한다.
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
      // perf 2026-08-19 — 원본 인덱스(돔이면 정렬 인덱스 역참조, 2D 는 그대로)
      // 로 사전 계산된 알파를 읽는다. -1 = 밀도 게이트 접힘(종전 continue 와
      // 동일), ≤0.02 = 티어 반려(동일).
      const edgeOrigIndex = domeOn ? domeEdgeIndexReused[drawPos] : drawPos;
      const edgeAlpha = edgeAlphaReused[edgeOrigIndex];
      if (edgeAlpha <= 0.02) continue;
      // 끝점 프레임은 깊이 정렬 때 담아 둔 것을 원본 인덱스로 되찾는다.
      const edgeFrameA = domeOn ? domeEdgeFrameAReused[edgeOrigIndex] : ZERO_DOME_FRAME;
      const edgeFrameB = domeOn ? domeEdgeFrameBReused[edgeOrigIndex] : ZERO_DOME_FRAME;
      const { a, b, control } = projectEdgePoints(edge, edgeFrameA, edgeFrameB);
      // 3D — 깊이 안개·헤어라인 감쇠(히어로의 fog·lw 그대로). 읽어야 할 때
      // (호버·선택·ego)는 아래에서 면제돼 도로 밝아진다.
      let domeEdgeFog = 1;
      let domeWidthScale = 1;
      // 헤일로 반폭(화면 px) — 조립 램프로 크로스페이드해 2D↔3D 전환 중에도
      // 획이 «툭» 생기지 않는다. 알파는 아래에서 이 엣지의 최종 알파를 안 뒤에.
      let domeHaloWidthPx = 0;
      if (domeOn) {
        const aMin = Math.min(edgeFrameA.a, edgeFrameB.a);
        if (aMin > 0) {
          const uAvg = (edgeFrameA.u + edgeFrameB.u) / 2;
          domeEdgeFog = 1 + (domeFogAlpha(uAvg) - 1) * aMin;
          domeWidthScale = 1 + (domeLineWidthFactor(uAvg) - 1) * aMin;
          domeHaloWidthPx = domeHaloPx(uAvg) * aMin;
        }
      }
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
        !trailLensActive &&
        (hovered ||
          (emphasizedNeighborId !== null &&
            touches &&
            (edge.sourceId === emphasizedNeighborId || edge.targetId === emphasizedNeighborId)));
      // 걸어온 길 렌즈 — 엣지는 **전부** dim(ego 강조 엣지 포함). 소유자가
      // "어지럽다"고 한 파란 선의 정체가 바로 이 ego 관계 엣지였다. 삭제가
      // 아니라 렌즈 동안의 후퇴다 — 팝오버를 닫으면 그대로 돌아온다.
      let edgeEgoState: EdgeEgoState = trailLensActive
        ? "dim"
        : resolveEdgeEgoStateWithPair(touches, focusedNodeId, selectedEdge, isSelectedEdge);
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
      // 「걸어온 길」 — 연달아 밟은 쌍이면서 **실재하는 관계선**일 때만. 이 루프가
      // `world.edges` 를 돌기 때문에 후자는 구조적으로 보장된다(발자국이 이미
      // 쓰는 그 계약). 렌즈가 꺼져 있으면 램프가 0 이라 값이 종전과 같다.
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
      // 3D 안개 면제 — 상호작용이 짚은 관계는 깊이에 묻히지 않는다.
      const domeEdgeExempt = emphasized || isSelectedEdge || edgeEgoState === "ego";
      ctx.globalAlpha =
        (passthrough ? edgeAlpha * tokens.edgePassthroughAlpha : edgeAlpha) *
        edgeSpotlightSink *
        (domeEdgeExempt ? 1 : domeEdgeFog);
      /*
       * 헤일로의 진하기는 **이 선이 지금 얼마나 진한가**를 따라간다 —
       * 가까운(=진한) 선은 세게 자르고, 안개에 묻힌 먼 선은 거의 안
       * 자른다. 그래야 헤일로 자체가 «내가 앞에 있다»는 주장을 하지
       * 않는다. 상호작용이 짚어 면제된 엣지는 안개를 안 받으므로 자동으로
       * 가장 세게 자른다 — 읽으라고 밝힌 선이 뒤엉킨 실타래에 다시 묻히면
       * 면제가 반쪽이다.
       *
       * perf 2026-08-19 — 헤일로 인자는 재사용 스크래치(`edgeHaloScratch`),
       * 토큰 인자는 프레임당 1개(`traceTokensFrame`), 페어 키는 엣지 객체당
       * 1회 계산 캐시(`edgePairMeta`)다. 상태 리터럴 자체는 계약 게이트
       * (footprint-bloom-exception · review-ring-authorship)가 배선 표기를
       * 핀으로 잡고 있어 그대로 둔다.
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
          // 2치 `kind` 는 "containment 가 아닌 것 전부" 를 depends 로 묶는다.
          // 방향 테이퍼를 그려도 되는지는 **원 관계 타입**이 정한다.
          directional: isDirectionalRelation(edge.relationType),
          egoState: edgeEgoState,
          selected: isSelectedEdge && !trailLensActive,
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
       * 선 옆 발자국 — 이 관계선을 **연달아 밟았을 때만**. 선 위가 아니라
       * 법선 방향으로 비켜 찍는다: 관계선은 타입 있는 사실(포함/의존)을 나르는
       * 채널이라, 그 위에 마크를 얹으면 두 사실이 한 잉크를 다툰다.
       *
       * 후보(연속 방문 쌍) 중 **실재하는 엣지**에만 얹히는 것이 여기서 보장된다 —
       * 이 루프는 `world.edges` 를 돌기 때문이다. 관계 없는 두 노드를 연달아
       * 방문했다면 그 쌍은 여기 오지 않는다.
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

  // 진입 검수 E-4 — 라벨 앵커는 **실제로 그려진** 디스크를 따라가야 한다.
  // 라벨 패스는 `radiusForKind × cameraScale` 만 썼는데, 그 값에는 노드의
  // magnitudeScale·breathe·등장 램프·**선택 시 1.12 성장**이 전부 빠져 있다.
  // 그래서 선택 노드는 자기 라벨을 자기 테두리 위에 얹고(실측: 테두리 bottom
  // 215 vs 라벨 top 216), 큰 노드는 이름이 도형 안으로 들어갔다. 이 패스가
  // 계산한 값을 그대로 넘겨 두 패스가 같은 도형을 본다.
  // perf 2026-08-19 — 프레임마다 새 Map 대신 재사용(`effectiveAlphaByIdReused` 근거).
  drawnScreenRadiusByIdReused.clear();
  const drawnScreenRadiusById = drawnScreenRadiusByIdReused;
  // ego 멤버/호버 노드가 점유한 원판 — 수동적 라벨이 그 위에 글자를 얹지
  // 못하게 라벨 배치기에 예약으로 넘긴다(칩 예약과 같은 메커니즘 재사용).
  const nodeDiscReservations: ReservedBox[] = [];

  // 3D — 화가 알고리즘: 먼 노드(u 큼)부터 그려 가까운 노드가 위에 얹힌다.
  // 히트테스트(`hitTestWorld`의 depth 우선)가 «가까운 노드가 이긴다» 로
  // 판정하므로, 그리는 순서가 같은 규칙을 따라야 눈에 보이는 것과 잡히는
  // 것이 일치한다. 2D(domeOn 아님)는 종전 배열 순서 그대로 — 할당 0.
  let nodeDrawOrder: readonly WorldNode[] = world.nodes;
  if (domeOn) {
    // perf 2026-08-19 — 엣지 정렬과 같은 인덱스-정렬 관용구(위 `edgeDrawOrder`
    // 독블록). 종전 비교자는 호출마다 `domeFrameFor` 를 두 번 불러 O(n log n)
    // 번의 Map 조회가 됐다. 깊이는 노드당 한 번(이미 담아 둔 프레임에서),
    // 비교자는 배열 읽기 둘뿐 — 안정 정렬 + 동일 기준이라 순서는 종전과 같다.
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
    // 밀도 게이트: 접힌 부모의 서브트리 노드는 칩으로 대체되어 그리지 않는다.
    if (clusteredIds.has(node.id)) continue;
    const tierAlpha = effectiveAlphaById.get(node.id) ?? 1;
    if (tierAlpha <= 0.02) continue;
    const egoState = egoAllNormal ? "normal" : lensNodeEgoState(node.id, focusedNodeId, neighborsOfFocused, selectedEdge);
    // Color signature uses the RETAINED focus classification (persists through a
    // deselect fade) + this node's focus ramp — everything else keeps the live
    // `egoState`.
    const colorEgoState = colorAllNormal ? "normal" : lensNodeEgoState(node.id, colorFocusedNodeId, colorNeighbors, colorSelectedEdge);
    // 렌즈는 자기 easing 을 만들지 않는다(신규 이징 0) — 스포트라이트가 이미 쓰는
    // 지수 램프(`focusDimTau`)를 그대로 색 램프로 꽂는다. 그래서 팝오버를 열면
    // 배경이 램프로 내려앉고, 닫으면 램프로 되돌아온다(하드컷 없음). 포커스가
    // 있는 통상 경로에선 렌즈가 꺼져 있어 값이 바뀌지 않는다(회귀 0).
    const focusRamp = trailLensActive ? trailRamp : (focusRampById.get(node.id) ?? 0);
    const emphasis = emphasisById.get(node.id) ?? 0;
    const isEmphasizedNeighbor = emphasizedNeighborId !== null && node.id === emphasizedNeighborId && egoState === "neighbor";
    // perf 2026-08-19 — 무포커스 프레임의 시각은 (kind, fresh, stale) 만의
    // 함수라 캐시를 탄다(`nodeVisualCache` 독블록). 조건이 하나라도 어긋나면
    // (포커스 램프·호버 리플·렌즈) 종전 경로 그대로 새로 계산한다.
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
     * 「걸어온 길」 — **방문한 노드 자신**이 트레일 색으로 읽힌다.
     *
     * 종전 렌즈는 방문 노드를 `"normal"` 로 «남기기만» 했다. 나머지가 dim 이라
     * 상대적으로 도드라지긴 했지만, 방문 표시는 노드 **옆** 발자국뿐이라
     * 소유자가 본 화면에는 「걸어온 길」의 노드도 선도 없었다.
     *
     * 새 원(넷째 링)을 두르지 않는다 — 노드가 **이미 가진 stroke 채널**의 색만
     * 바꾼다. 그래서 궤도가 늘지 않고, 잉크도 늘지 않고, 램프로 되돌아온다.
     * 「빛나게」의 헌장 안 형태가 이것이다: 어두워진 장 위의 **값·색 대비**이지
     * glow 가 아니다(번짐은 발자국 글리프 한 파일의 opt-in 예외로만 존재한다).
     */
    // perf 2026-08-19 — 렌즈가 꺼져 있으면 kept=false 라 항상 0 이다
    // (`trailNodeInkStrength` 첫 분기). 노드마다 인자 객체를 만들지 않게
    // 활성 프레임에서만 부른다 — 값 동일.
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
    // 고팬아웃 배치-공개 — 배치로 드러나는 자식은 per-child stagger 램프
    // (`batchAppearById`)가 부모 그룹 페이드(`nearestExpandedRevealMul`)를
    // 대체한다(이중 페이드 방지) + 미세 appearScale 을 이 값으로 몬다. 배치
    // 자식이 아니면 기존 그룹/월드-등장 경로(회귀 0).
    const batchAppear = batchAppearById?.get(node.id);
    // 다섯째 티어 관통 채널도 **그룹 페이드를 대체한다** — `batchAppear` 와 같은
    // 이유다. 이 노드의 `tierAlpha` 는 이미 `effectiveAlphaById` 를 거쳐 나오고,
    // 그 값에 칩-펼침 램프가 들어 있다(`chipExpandReveal`). 여기서 그룹 페이드를
    // 또 곱하면 알파가 **두 지수의 곱**이 되어, 칩이 "펼쳐졌다"고 말한 뒤로도
    // 자식이 한참 오는 중이다(실측: 칩 90% 391ms vs 자식 621ms — 230ms 차,
    // `design.md` 의 120ms "한 입력 = 한 사건" 임계 초과).
    //
    // 위 `batchAppear` 주석이 "이중 페이드 방지"라고 이미 적어 둔 그 가드인데,
    // 이 채널이 나중에 붙느라 안 들어갔다. 두 램프가 같은 `clusterRevealTau` 를
    // 쓰므로, 대체해도 페이드는 사라지지 않고 **한 번만** 일어난다.
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

    // S5 깊이 선명도 — 영역 활성 중 깊은 링을 알파·스케일로 살짝 낮춘다. 호버·
    // ego 멤버(center/neighbor)는 100% 복귀 — 상호작용 대상은 항상 또렷하게.
    const isHoveredNode = node.id === hoveredNodeId;
    let realmClarityAlpha = 1;
    if (realmDepthById !== null && !isHoveredNode && !isTrailKept(node.id) && egoState === "normal") {
      const depth = realmDepthOf(node.id);
      if (depth !== undefined) {
        realmClarityAlpha = realmDepthClarityAlpha(depth);
        effRadius *= realmDepthClarityScale(depth);
      }
    }
    // 3D 보기 — 점 반지름(원근 포함, `s` 에 역산돼 있다)은 기하라 항상 곱하고,
    // 깊이 안개(히어로 fog: 가까움 1.0 → 멂 0.09)는 상호작용 대상(호버·ego·
    // 트레일)을 면제한다 — «읽어야 할 때는 다시 밝아진다». 이 깊은 감쇠는
    // 2D 잉크 대비 바닥(3:1) 밖이며 소유자가 3D 한정으로 연 유예다
    // (`docs/DECISIONS.md` «3D 유예 목록»).
    // perf 2026-08-19 — 정렬 인덱스로 담아 둔 프레임을 되찾는다(Map 재조회 0).
    const nodeDome = domeOn ? domeNodeFrameReused[domeNodeIndexReused[drawPos]] : ZERO_DOME_FRAME;
    if (domeOn) {
      effRadius *= nodeDome.s;
      if (!isHoveredNode && !isTrailKept(node.id) && egoState === "normal") {
        realmClarityAlpha *= 1 + (domeFogAlpha(nodeDome.u) - 1) * nodeDome.a;
      }
    }

    // S5 깊이 시차 — 렌더 좌표에만 밴드 오프셋(월드)을 더한다(월드 좌표 불변).
    // 3D 오프셋도 같은 문법 — 히트테스트가 같은 맵을 읽는다.
    const pOff = realmParallaxOffsetFor(node.id);
    // perf 2026-08-19 — `project` 인라인 + 스크래치 재사용(좌표 식 동일).
    const screen = nodeScreenScratch;
    screen.x = (node.x + pOff.x + nodeDome.dx - camX) * camScale + halfW;
    screen.y = (node.y + pOff.y + nodeDome.dy - camY) * camScale + halfH;
    const screenRadius = effRadius * camera.scale.value;
    // Rings/pulses/labels all key off this same disc, so one guard here drops
    // the whole off-screen node cost (see `render/viewport-cull.ts`).
    if (isNodeCulled(screen, screenRadius * NODE_CULL_SLACK, viewportWidth, viewportHeight)) continue;
    drawnScreenRadiusById.set(node.id, screenRadius);
    // 포커스가 있을 때의 ego 멤버(중심·이웃)와 호버 노드만 예약한다 — 개관
    // 화면 전체의 라벨 밀도를 바꾸지 않고, 보고된 결함(기본 클릭 상호작용의
    // ego 포커스)이 나는 자리만 다룬다. 선택 링/펼침 배지가 원판 바로 밖에
    // 앉으므로 링 여유를 함께 예약한다.
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

    // S8 결함 1 — 확장 중 무관 배경 노드 미세 dim(디스크 멤버·스파인·ego 제외).
    const backgroundDim =
      anyExpanded && egoState === "normal" && !isTrailKept(node.id) && !expandedDiscIds.has(node.id) && !isSpineNode(node)
        ? BACKGROUND_DIM_WHEN_EXPANDED
        : 1;

    // 스포트라이트 — 창 밖 노드 침강(호버는 면제: 상호작용 대상은 또렷).
    const nodeSpotlightSink = spotlightSink(
      (spotlightIds !== null && spotlightIds.has(node.id)) || isHoveredNode,
    );
    ctx.globalAlpha = tierAlpha * realmClarityAlpha * backgroundDim * appearRevealAlpha * nodeSpotlightSink;
    // Sheen top stop = lerp(fill, tint, blend) — resolved here (token layer)
    // so `render/node-shapes.ts` stays token-free and pure.
    // perf 2026-08-19 — fill 이 같으면 결과 문자열도 같다(tint·blend 는 토큰
    // 상수). 노드마다 hex 파싱+문자열 조립을 반복하지 않도록 fill 별 캐시 —
    // 토큰이 바뀌면(테마 전환) 통째로 무효화한다.
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
    // Engraved numeral: project/domain only, and only when there's a count to
    // show (prototype `if (n.count && (project||domain) ...)`).
    // 3D — 점에는 숫자를 새기지 않는다(데이터 표가 아니라 형태를 보는 층).
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
     * 노드 깊이 헤일로 — 엣지와 같은 장치를 원판에 건다(`domeHaloPx` 독블록).
     *
     * 엣지끼리는 위에서 정렬 + 헤일로로 앞뒤가 생겼는데, 노드는 **엣지를 전부
     * 그린 뒤** 한 번에 얹힌다. 그래서 노드 자체는 늘 선 위에 오지만, 선이
     * 노드 원판 **가장자리에서 끊기지 않으면** 점이 선 위에 «떠» 있는 스티커로
     * 보인다. 원판보다 조금 넓은 바탕색 원을 먼저 깔면 그 자리에서 선이 잘려,
     * 점이 선다발 **속에** 앉는다.
     *
     * 진하기 규칙은 엣지와 같다 — 이 노드가 지금 그려지는 알파를 따라간다.
     */
    if (domeOn && nodeDome.a > 0.01) {
      const haloPx = domeHaloPx(nodeDome.u) * nodeDome.a;
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
    // perf 2026-08-19 — 토큰 인자는 프레임당 1개(`nodeShapeTokensFrame`).
    // 상태 리터럴은 계약 게이트(review-ring-authorship)가 배선 표기를 핀으로
    // 잡고 있어 그대로 둔다.
    nodeShapesDraw(
      ctx,
      {
        // 3D 입체 음영 — 조립 램프로 크로스페이드(2D 는 0, 획 0개 추가).
        depthShade: domeOn ? nodeDome.a : 0,
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
        // 렌즈 브러싱(팝오버 행 hover)은 포인터 리플을 발사하지 않아 emphasis 가
        // 0 이다 — 그대로 두면 링 알파가 0 이라 안 보인다. 행 hover 는 이산
        // 이벤트라 즉시 solid(1)가 맞다(reduced-motion 경로와 같은 값).
        hoverEmphasis: isHovered && trailLensActive ? 1 : emphasis,
        selectionPulse: selectionPulseVisual,
        agentFocus: agentFocusNodeId !== null && node.id === agentFocusNodeId,
        // 값이 **정확히** `human` 일 때만. 부재는 unknown 이지 사람이 아니다.
        reviewPending: node.createdBy === "human",
        // 스포트라이트 변경-노드 링 (Image #14) — 렌즈 ON + 창 안 노드에만.
        // dashOffset는 loop가 bounded transition 중에만 갱신한다. 램프가
        // 정착한 뒤에도 다른 캔버스 활동이 남아 있을 수 있으므로 now 기반
        // 무한 회전은 금지한다. reduced-motion은 0으로 고정한다.
        spotlightRing:
          spotlightLensActive && spotlightIds !== null && spotlightIds.has(node.id)
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
    // unconditionally (canvas-emphasis slice §A3, "허브 노드에 이미 쓰는 패턴
    // 재사용") — reuses the exact same far-field-only overlay hub/magnitude
    // stars already get, just widening eligibility so the Layer-0 anchor
    // reads as luminous too. Color still derives from `visual.stroke`, which
    // is now hardcoded amber for project, so the spike is amber for free.
    // perf 2026-08-19 — farT 게이트를 앞으로(회로 고도 farT=0 에선 Set 조회도 생략). 논리 동일.
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
     * 발자국 — 방문했던 노드 우상단에 신발 자국(양발) + 방문 순번.
     *
     * 종전은 동심 헤어라인 링이었다. 링은 선택 링·확장 오라·결계와 **같은
     * 원 문법**이라 넷째 원이 되어 "이건 무슨 원인가"를 매번 다시 배워야 했고,
     * 순서와 방향을 나를 수 없었다. 자국은 그 문법 밖이라 충돌이 없다.
     *
     * 노드 티어·dim·영역 선명도 알파를 함께 곱해 ego dim/전환에 자연히 물러난다.
     */
    const footprintSteps = footprintStepsById.get(node.id);
    if (footprintSteps !== undefined && footprintPref !== null) {
      const layerAlpha = tierAlpha * realmClarityAlpha * backgroundDim * appearRevealAlpha;
      const paint = {
        ctx,
        pref: footprintPref,
        ink: footprintInk,
        scale: footprintScale,
        // 램프는 **방금 생긴 걸음**에만. 나머지는 이미 거기 있던 것이라 정착 상태다.
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

    // S8 결함 1 — 펼친 부모 구분: 노드 디스크 바깥에 파선 오라 링(선택 ego 링은
    // 실선이라 채널 충돌 없음). 노드 위에 얹되 알파는 노드 티어 알파를 따른다.
    // 단, 스포트라이트 변경-노드 링(앰버 파선, 같은 r+6 궤도)이 활성인 노드에선
    // 오라를 양보한다 — 두 파선이 같은 반경에서 인터리브되어 두-색 브레이드로
    // 읽히는 결함(모션 검수 2026-07-23 프레임 증거). 렌즈 중 변경 노드는 앰버
    // 링 하나가 "전개+변경"을 다 말한다(궤도당 신호 1개); 변경 아닌 전개
    // 조상(티어 관통 전개)은 기존 인디고 오라 유지.
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

    // S11 — 전개 코호트 소속 링. 칩으로 방금 드러난 **직속 자식**에 부모 오라와
    // **같은 파선 기하**(같은 묶음이라는 뜻)를 두르되 잉크는 탈채도 인디고
    // (`expandedCohort`)로 한 단계 낮춘다: 부모가 주인공, 자식은 소속 표시.
    //
    // 왜 색이 아니라 값·기하인가 (소유자 "선택했을때 파란색이니까 다르게
    // 구분되도록"): 헌장은 무채색 + 단일 인디고라 새 hue 가 금지다. 대신 이미
    // 있는 사다리를 한 칸 더 쓴다 — 노드 선택 = 채도 있는 인디고 **실선**,
    // 엣지 선택 = pale 인디고, 전개 코호트 = **탈채도 인디고 파선**. 실선/파선이
    // 채널을 갈라 "선택" 과 "전개" 가 한눈에 다르게 읽힌다.
    //
    // 선택/호버 중인 자식은 건너뛴다 — 그 노드는 이미 자기 선택 링이 주인공이고,
    // 두 링이 같은 궤도에서 겹치면 브레이드로 읽힌다(파선 오라 ↔ 앰버 링과 같은
    // 규칙: 궤도당 신호 1개).
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

    // 영역 루트 앵커 링 (소유자 실보고 2026-07-23 "루트가 유령 같다") — 영역
    // 전개 중 루트(depth 0)에 결계와 **같은 인디고 실선 헤어라인** 링을 두른다.
    // 세계의 경계(큰 원)와 그 중심(작은 링)이 같은 잉크로 호응해 "이 원은 이
    // 노드의 세계" 가 기하만으로 읽힌다. 파선 오라(확장)·앰버 링과 채널 분리,
    // glow 0, 신규 토큰 0 (tokens.indigo 재사용).
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

    // 결계 센서스 각인 — 원 하단 바깥, tracked-caps 계기 문법(도메인 워터마크와
    // 동일 폰트/트래킹, 화면 고정 크기). 원이 "무엇의 경계인지" 스스로 말한다
    // ("2 ELEMENTS" 류). 잉크는 노드 라벨과 같은 neutral(labelDomain), 링
    // 자기드로잉 진행도에 실려 함께 나타나고 함께 지워진다. 신규 토큰 0.
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
  // S11 결함 (소유자 실보고 "노드 사이에 +31 이 겹쳐지는것도 보기싫은데") — 칩이
  // 이번 프레임에 점유한 사각형을 모아 아래 라벨 배치기에 **예약**으로 넘긴다.
  // 칩은 라벨보다 먼저 그려지므로, 배치기가 이걸 모르면 라벨이 칩 위에 그대로
  // 덮어 그려진다. 새 회피 알고리즘을 만들지 않고 기존 bbox 억제를 재사용한다.
  const chipReservations: ReservedBox[] = [];
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
    // 3D 보기 — 칩도 부모 노드의 링을 따라간다(앵커·커넥터 둘 다).
    const parentNode = world.nodeById.get(chip.parentId);
    const chipDOff = parentNode ? domeFrameFor(parentNode.id) : ZERO_DOME_FRAME;
    const screen = project(chip.anchor.x + chipDOff.dx, chip.anchor.y + chipDOff.dy);
    // 부모→칩 점선 커넥터의 시작점 = 부모 노드의 라이브 스크린 좌표.
    const parentScreen = parentNode ? project(parentNode.x + chipDOff.dx, parentNode.y + chipDOff.dy) : null;
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
    // 걸어온 길 렌즈 — 방문 노드에 속하지 않은 칩(`+N`)도 함께 물러난다. 칩은
    // 노드 dim(색 스왑)을 상속하지 않으므로 여기서만 값으로 낮춘다. 배수는 확장
    // 중 배경 dim 과 같은 값 재사용 — 신규 토큰 0.
    ctx.globalAlpha =
      parentAlpha *
      spotlightSink(
        (spotlightIds !== null && spotlightIds.has(chip.parentId)) || isChipHovered,
      ) *
      // 걸어온 길 렌즈 — **확장 컨트롤은 궤적이 아니다.** 종전에는 방문 노드에
      // 붙은 칩만 예외로 남겼는데, 기본 어포던스가 「머리 위 막대」가 되면서 그
      // 예외가 불투명한 판이 되어 **밟은 관계선을 정확히 가로막았다**(실측
      // 2026-08-02: 「주문」에 도착하는 트레일이 판 밑에서 끊겼다). 렌즈가 켜져
      // 있는 동안에는 칩도 함께 물러난다 — 예외가 하나 줄고 궤적이 주인공이 된다.
      // 램프를 타므로 렌즈가 꺼질 때 칩만 하드컷으로 돌아오지 않는다
      // (모션 §「한 입력 = 한 사건」).
      (trailLensActive ? 1 - (1 - BACKGROUND_DIM_WHEN_EXPANDED) * trailRamp : 1);
    // draw 와 라벨 예약이 **같은 입력**을 보게 하나로 묶는다 — 갈라지면 라벨이
    // 칩 위에 다시 겹치거나(예약 누락) 빈 곳을 피한다(유령 예약).
    const chipDrawInput = {
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
      affordance: expand.affordance,
      batchSize: expand.batchSize,
      barLabels: clusterBarLabels ?? undefined,
      // 「고른 노드 바로 위」 어포던스의 존재 조건. ego 합성 칩(`이웃 +N`)의
      // 부모는 정의상 고른 노드다 — 그걸 빼면 배치 공개가 통째로 닫힌다.
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
        // rest = **크롬은 콘텐츠보다 어둡다**(2026-07-31 위계석 실측: 칩 피크
        // 102.5 대 자식 28.4 = 3.6배 역전). 칩 전용 rest 단은 램프 맨 아래이고
        // (3.01/3.14:1) 어느 노드 stroke 보다 어둡다. rest 에서 인디고를 쓰지
        // 않는 것이 핵심 — 인디고는 단일 악센트라 크롬이 상시로 쓰면 사용자가
        // 부른 목적물과 경쟁한다. hover 에서 인디고로 깨어난다(아래 hover*).
        surface: tokens.nodeFillDim,
        border: tokens.clusterChipBorderRest,
        plusInk: tokens.clusterChipInkRest,
        numeralInk: tokens.clusterChipInkRest,
        tether: tokens.edgeContains,
        // 막대는 **부른 컨트롤**이라 상시 크롬 잉크로는 글자가 안 읽힌다
        // (rest 단은 3.0:1 로 램프 맨 아래 — 배경 노드 테두리보다 어둡다).
        // 노드 라벨과 같은 단으로 올리되 인디고는 쓰지 않는다 — 인디고는
        // 사용자가 고른 노드의 것이고, 막대는 그 노드에 붙은 종속물이다.
        barInk: tokens.numeralFace,
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
    /** E-4 — 배치기가 확정한 라벨 베이스라인(위로 뒤집힌 자리 포함). */
    baselineY: number;
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
  const applyLabelTopK = classifyZoomTier(zoomRatio, tierReveal) !== "element";
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
    // 예산은 설정(「확장 → 이름을 시도할 개수」)이 정한다. 상수는 그 기본값.
    return selectDiscLabelEligible(rankedByDisc, expand.labelAttempts);
  })();
  // 노드 감사 처방 — 포커스(ego) 도메인 자식 라벨 겹침 LOD. `neighborsOfFocused`
  // 는 EGO_NEIGHBOR_LIMIT(24) 이하면 전원 full 점등되고(선택적 ego 컷은 >24 에서만
  // 발동), 이전엔 그 전원이 무조건 라벨 exempt 였다 — 자식 18개짜리 도메인을
  // 포커스하면 겹치는 라벨이 그대로 다 그려졌다(위 high-fan disc 처방과 같은
  // 문제, 여긴 처방이 없었다). 같은 DOI-top-K 컷(`selectDiscLabelEligible`)을
  // 이웃 집합에도 적용 — 상위 degree 이웃만 무조건 라벨, 컷 밖은 일반 greedy
  // 경쟁으로 강등(겹치지 않으면 여전히 뜬다 — "과하지 않게", 라벨 다 지우지
  // 않음). 「이름을 시도할 개수」 이하 소규모 포커스는 전원 그대로 exempt(회귀 0).
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
  // perf 2026-08-19 — 3D 라벨 온디맨드 조기 탈출의 성립 조건: keep(호버·ego·
  // 트레일)이 불가능한 프레임(포커스·페어·렌즈 전부 없음)에서 조립 램프 a ≥
  // 0.98 이면 gate = 1-a ≤ 0.02 이고, compact/watermark 알파는 둘 다 ≤1 이라
  // 곱이 ≤0.02 — 아래 기존 `<= 0.02` 반려와 **같은 결론**이다. 그 결론을
  // ego 분류·알파 계산·투영을 하기 전에 내려, 회전 중 2,000 노드가 매 프레임
  // 라벨 파이프라인 앞부분을 헛돌던 것을 없앤다(결과 집합 불변).
  const domeLabelSkipEligible =
    domeOn && focusedNodeId === null && selectedEdge === null && trailLensKeepIds === null;
  for (let index = 0; index < world.nodes.length; index += 1) {
    const node = world.nodes[index];
    // 밀도 게이트: 접힌 서브트리 노드는 라벨도 그리지 않는다(노드/엣지와 동일).
    if (clusteredIds.has(node.id)) continue;
    if (domeLabelSkipEligible && node.id !== hoveredNodeId && domeNodeFrameReused[index].a >= 0.98) continue;
    // Uses the SAME effective alpha as the node draw pass (C1 A2) — an
    // ego-exempt capability that's now visible must also get a label, or it
    // reads as an unlabeled ghost circle. Also the SAME signal capability/
    // element label eligibility ramps with (label-clarity — "잡을 수 있으면
    // 읽을 수 있다").
    const revealAlpha = effectiveAlphaById.get(node.id) ?? 1;
    if (revealAlpha <= 0.02) continue;
    const egoState = egoAllNormal ? "normal" : lensNodeEgoState(node.id, focusedNodeId, neighborsOfFocused, selectedEdge);
    const trailKept = isTrailKept(node.id);
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
      !trailKept
    ) {
      continue;
    }
    let compactAlpha = computeLabelAlpha({ kind: node.kind, farT, egoState, isHovered, revealAlpha });
    // 3D — 라벨은 **온디맨드**다(히어로 판정: 상시 라벨이 실루엣을 부수고
    // 시선이 형태 대신 텍스트로 간다). 호버·포커스(ego)·트레일이 짚은 노드만
    // 이름을 얻고, 나머지는 조립 램프를 따라 서서히 물러난다. 램프 0 = 2D
    // 그대로. 라벨은 제품의 핵심이라 없애지 않는다 — 언제 보이느냐만 모드가
    // 정한다.
    const domeLabelKeep = egoState === "center" || egoState === "neighbor" || isHovered || trailKept;
    // perf 2026-08-19 — 프레임 재조회 대신 인덱스 버퍼(`nodeFrameAt`) 사용.
    const labelDome = nodeFrameAt(index);
    const domeLabelGate = domeOn && !domeLabelKeep ? 1 - labelDome.a : 1;
    compactAlpha *= domeLabelGate;
    // Domain draws TWO effects at once (the always-readable compact label AND
    // the separate far-field watermark) — a candidate must be built whenever
    // EITHER is visible, or the watermark silently vanishes once the compact
    // label alpha hits 0 at farT=1 (label-clarity fix, far-field regression).
    // 렌즈 동안 원거리 워터마크는 침묵한다 — 방문 노드는 `"normal"` 로 남는데
    // 워터마크는 그 상태에서만 켜지므로, 그대로 두면 궤적 읽기 화면에 장식
    // 잉크가 되살아난다(포커스 중 워터마크를 끄는 기존 규칙과 같은 결).
    const watermarkAlpha =
      (node.kind === "domain" && !trailLensActive ? computeDomainWatermarkAlpha(farT, egoState) : 0) *
      domeLabelGate;
    if (Math.max(compactAlpha, watermarkAlpha) <= 0.02) continue;

    // S5 — 라벨도 노드 디스크와 같은 깊이 시차 오프셋으로 그려 붙어 다닌다.
    // 3D 오프셋도 동일 — 라벨이 링으로 옮겨 간 디스크를 따라간다.
    const labelPOff = realmParallaxOffsetFor(node.id);
    const labelDOff = labelDome;
    const screen = labelScreenScratch;
    screen.x = (node.x + labelPOff.x + labelDOff.dx - camX) * camScale + halfW;
    screen.y = (node.y + labelPOff.y + labelDOff.dy - camY) * camScale + halfH;
    // E-4 — 노드 패스가 실제로 그린 반지름(magnitudeScale·breathe·등장 램프·
    // 선택 성장 포함). 그 패스에서 컬링된 노드만 nominal 로 되돌린다.
    const screenRadius =
      drawnScreenRadiusById.get(node.id) ?? radiusForKind(node.kind, tokens) * camera.scale.value;
    // E-4 — 페인트와 **같은 함수**로 베이스라인을 잡는다(종전엔 bbox 는
    // 오프셋 미스케일, 페인트는 스케일 적용이라 상자와 글자가 갈라졌다).
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
      // 보호 대상이면 버리는 대신 인셋 가장자리로 당긴다. 판정식은
      // `render/label-layout.ts#isSafeRectProtectedLabel` 하나이고 — 이 파일에
      // 인라인으로 두면 캔버스 밖에서 잴 수 없어 회귀를 막는 단위 테스트를 붙일
      // 자리가 없다 — project/hub 가 왜 그 목록에 들어갔는지도 거기 적혀 있다.
      // 클램프 대상이 적은 두 등급뿐이라 「전부 인셋에 쌓인다」는 원래 우려는
      // 되살아나지 않고, 부딪히는 것은 여전히 greedy 억제가 가른다.
      if (!isSafeRectProtectedLabel({ egoState, isHovered, trailKept, kind: node.kind, isHub: node.isHub })) {
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
      // band, in which case only the DOI winners keep the exemption (노드 감사
      // 처방 — see `isEgoNeighborLabelExempt`).
      // 렌즈 동안 방문 노드는 top-K 예산 밖 — 8-0 실측의 "링 낀 익명 상자"를
      // 없애는 게 이 렌즈의 핵심이라 이름은 반드시 서 있어야 한다.
      const exempt =
        egoState === "center" ||
        isHovered ||
        trailKept ||
        (egoState === "neighbor" && isEgoNeighborLabelExempt(node.id, egoNeighborLabelEligibleIds));
      labelRankEntries.push({ id: node.id, degree: world.neighborMap.get(node.id)?.size ?? 0, exempt });
    }
    const priority = resolveLabelPriority({
      kind: node.kind,
      isSelected: egoState === "center",
      isHovered,
      isHub: node.isHub,
    });
    // 세로 범위는 **폰트에서 실측**한다 — 종전의 `ascent = fontSize` /
    // `descent = 2`(상수) 근사는 위로 과잉·아래로 부족이었고, descent 가
    // 상수인데 fontSize 는 줌에 따라 커져서 **확대할수록 아래가 더 샜다**.
    // 폰트당 1회 측정 후 캐시(`measureLabelVerticalMetrics`), 실측 불가한
    // 컨텍스트는 종전 근사로 폴백해 회귀 0.
    const vertical = measureLabelVerticalMetrics(ctx, node.kind, labelScale);
    const boxAt = (baselineY: number) => ({
      // 좌우로 `LABEL_SIDE_GAP` 만큼 넓혀 예약한다 — **닿는 두 이름은 한
      // 단어로 읽힌다.** 겹침 판정(`bboxesOverlap`)은 «닿는 것» 을 겹침으로
      // 안 세므로, 실측에서 「카카오 알림톡」과 「적립금 원장」이 0.7px 간격으로
      // 나란히 서서 한 문자열처럼 읽혔다(2026-08-02, 부챗살 펼침). 시안이 예약
      // 상자를 `측정폭 + 6` 으로 잡는 것과 같은 처방이다.
      minX: anchorX - width / 2 - LABEL_SIDE_GAP,
      maxX: anchorX + width / 2 + markReserve + LABEL_SIDE_GAP,
      minY: baselineY - vertical.ascent,
      maxY: baselineY + vertical.descent,
    });
    // E-4 — 아래가 남의 노드 도형으로 막혔으면 **이름을 버리기 전에 위로
    // 뒤집는다**. 억제만 하면 이 슬라이스가 없애려던 "이름 없는 도형"이 다시
    // 생기므로, 자리를 하나 더 시도한 다음에만 떨어진다. 위쪽 자리는 같은
    // 오프셋을 노드 위로 대칭 이동한 것 — 새 간격/토큰 0.
    let labelBaselineY = clampedAnchorY;
    if (overlapsForeignReserved(boxAt(labelBaselineY), node.id, priority, nodeDiscReservations)) {
      const flipped =
        resolveFlippedLabelBaselineY(screen.y, screenRadius) + (clampedAnchorY - anchorY);
      if (!overlapsForeignReserved(boxAt(flipped), node.id, priority, nodeDiscReservations)) {
        labelBaselineY = flipped;
      }
    }
    labelCandidates.push({
      priority,
      order: index,
      ownerId: node.id,
      bbox: boxAt(labelBaselineY),
      payload: {
        nodeId: node.id,
        kind: node.kind,
        text,
        screenX: screen.x + shiftX,
        screenY: screen.y + shiftY,
        // 배치기가 확정한 베이스라인을 그대로 넘긴다 — `draw()` 가 다시
        // 계산하면 뒤집힌 자리가 되돌려진다.
        baselineY: labelBaselineY,
        screenRadius,
        egoState,
        isHovered,
        revealAlpha,
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

  // rank9 — greedy 배치에 직전 프레임 placed 우대(히스테리시스)로 같은 우선순위
  // 안의 LOD churn 을 억제한다. 결과 placed id 집합을 다음 프레임 우대 기준으로
  // 남긴다.
  const placedResult = greedyPlaceLabels(
    placedLabelCandidates,
    (c) => prevPlacedLabelIds.has(c.payload.nodeId),
    // S11 — 칩이 점유한 영역과 겹치는 **수동적** 라벨(도메인/역량/요소)은 떨어뜨린다.
    // 선택/호버 라벨은 칩보다 상위라 그대로 남는다(사용자가 보고 있는 이름을 칩이
    // 침묵시키지 않는다).
    // 칩 점유 + ego 노드 원판을 함께 예약한다 — 라벨은 둘 다 피한다.
    [...chipReservations, ...nodeDiscReservations],
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
        baselineY: payload.baselineY,
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
