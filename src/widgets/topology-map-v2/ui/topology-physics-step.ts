/**
 * One frame's physics — camera spring, altitude, hover-ripple emphasis, and
 * ambient comet-tail progress (prototype `frame()` §14: `updateCamera` ->
 * `updateAltitude` -> `updateEmphasis` -> `updateParticles`). Split out of
 * `use-topology-loop.ts`'s rAF callback to keep that file under budget.
 * Mutates `input.world.edges[].t` and `input.emphasisById` in place — this is
 * the one place per-frame mutation is expected, matching the engine's own
 * "live state, stepped every frame" contract (`engine/camera.ts`).
 */

import { computePanBounds, stepCamera, type CameraAxes, type CameraTarget } from "../engine/camera";
import { computeAltitudeBand, computeFarT } from "../model/altitude";
import { isNodeEmphasisActive, resolveEdgePulseSpeed, stepEmphasis, stepFocusRamp } from "../model/focus-state";
import { edgePairKey, selectEgoContainsComets, updateParticles } from "../render/edge-fireflies";
import { computeZoomRatio, DEFAULT_TIER_REVEAL, isSpineOnlyZoom, type TierRevealConfig } from "../model/tier-visibility";
import type { TopologyV2Tokens } from "../tokens/read-topology-v2-tokens";
import { computeEffectiveCameraScaleMax, computeEffectiveCameraScaleMin } from "./topology-camera-math";
import type { TopologyWorld } from "./topology-world";

/** No focus → no ego contains comets. Reused so the no-focus path allocates nothing. */
const EMPTY_EGO_CONTAINS_COMETS: ReadonlySet<string> = new Set();

export interface PhysicsStepInput {
  world: TopologyWorld;
  camera: CameraAxes;
  target: CameraTarget;
  damping: number;
  overviewScale: number;
  tokens: TopologyV2Tokens;
  /**
   * Dive-zoom fix (owner: "줌 인/아웃이 느림") — which of the two split spring
   * tokens (`--topology-v2-camera-spring-angfreq-interactive/-transition`) this
   * frame's camera step uses. The caller (`use-topology-loop.ts`) tracks the
   * mode: interactive while a wheel gesture is live (crisp scale + pan), reset
   * to transition on every programmatic camera move (focus dive, deselect
   * return, Auto-arrange, fit-view — cinematic but snappier than the old
   * shared value). Threaded in rather than read from `tokens` directly so this
   * function stays a pure function of its inputs.
   */
  cameraAngularFrequency: number;
  dt: number;
  now: number;
  focusedNodeId: string | null;
  /**
   * True while an edge-pair focus is live (`selectedEdge !== null`) with no node
   * focus — the click-focus dim ramp treats edge selection as "the scene is
   * focused" too, so selecting/deselecting a line ramps the same normal↔dim
   * transition instead of snapping (⑨ 엣지 선택 dim 스냅 제거). Only the ramp
   * gate uses it; the ego/pair CLASSIFICATION still lives in the draw pass.
   */
  pairFocusActive: boolean;
  hoveredNodeId: string | null;
  /**
   * The one neighbor the user is hovering in the detail panel's "연결된 노드"
   * list, or null. Under focus (hover suppressed) this node still ramps its
   * emphasis so the panel row and the on-canvas node/edge light up together
   * ("emphasis ripple" linkage, lead spec §4). Null until the panel-hover API
   * feeds it in.
   */
  panelEmphasisNodeId: string | null;
  /** True while the pointer is actively dragging — suppresses the elastic pan-bounds clamp (see `engine/camera.ts`). */
  isDragging: boolean;
  /**
   * A8 — `prefers-reduced-motion: reduce`. Springs and ramps snap straight to
   * their targets: the user gets every end state (focus dive lands, ripple
   * emphasis applies, ego children appear) without the interpolated journey.
   */
  reducedMotion: boolean;
  /**
   * S3 마감 폴리시 (fable 설계) — when true the camera is being driven
   * externally by the cubic transition tween (`model/camera-easing.ts`, owned
   * by `use-topology-loop.ts`): the spring step + pan-bounds clamp + reduced-
   * motion snap are all skipped and `camera` is used verbatim as this frame's
   * result. `farT`/`zoomRatio` and every emphasis/ego-reveal/edge-pulse ramp
   * still derive from that eased camera, so a tween in flight animates the rest
   * of the scene exactly as a spring move would. Default/false = spring as
   * before. The loop only sets this while a programmatic tween is live and
   * `prefers-reduced-motion` is off, so `freezeCamera && reducedMotion` never
   * co-occur.
   */
  freezeCamera?: boolean;
  /** Mutated in place — the hook owns this map's lifetime across frames. */
  emphasisById: Map<string, number>;
  rippleStartById: ReadonlyMap<string, number>;
  /**
   * C1 A2 (focus ego tier exemption) — mutated in place, like `emphasisById`.
   * Ramps toward 1 for the focused node + its 1-hop neighbors while a focus is
   * active (so semantic-zoom-gated tiers still fade IN under focus instead of
   * staying invisible/unclickable), toward 0 otherwise. Kept separate from
   * `emphasisById` (the hover-ripple map) because that map's "active" condition
   * under focus is narrowly the panel-hover row, not the whole ego set — reusing
   * it here would either break that contract or require loosening it.
   */
  egoRevealById: Map<string, number>;
  /**
   * Click-focus signature — mutated in place like `emphasisById`. Each node's
   * scalar 0..1 ramps toward 1 while ANY focus is live (node OR edge-pair) and
   * toward 0 otherwise, on `--topology-v2-focus-dim-tau`. `topology-frame-draw.ts`
   * lerps normal→dim/ego color and eases the center radius by this factor, so
   * the dim/ego swap a click triggers rides the camera-dive time axis instead of
   * hard-cutting (and reverses on deselect). Per-node (not one scalar) so a node
   * that appears mid-focus — e.g. an expanded cluster child — ramps INTO dim
   * from 0 rather than snapping in already-dimmed.
   */
  focusRampById: Map<string, number>;
  /**
   * rank8 — new-node appear ramp, mutated in place like `emphasisById`. Seeded
   * to 0 for nodes that first appear on a world rebuild (existing nodes stay 1)
   * by `use-topology-loop.ts`; stepped here toward 1 for every present node on
   * `egoRevealRiseTau` (reused — same "content resolves onto the scene" rise as
   * the ego reveal). `topology-frame-draw.ts` multiplies effRadius (0.6→1 micro
   * scale) and globalAlpha (0→1) by it so a new node swells in instead of
   * hard-popping. reduced-motion snaps to 1. Missing entry defaults to 1 (never
   * fades an untracked node).
   */
  appearById: Map<string, number>;
  /**
   * 슬라이스 C (개발/비개발 모드 토글) — 티어 게이트 config. 생략 시
   * `DEFAULT_TIER_REVEAL`. 팬-클램프의 spine-only 판정이 드로우/히트와 같은
   * config 를 봐야 한다.
   */
  tierReveal?: TierRevealConfig;
}

export interface PhysicsStepResult {
  camera: CameraAxes;
  /** Visual-expression axis — constellation (1) ↔ circuit (0). Drives node/edge/label morph. */
  farT: number;
  /**
   * Semantic-zoom axis — `cameraScale / overviewEntryScale`. `1.0` at the
   * overview entry, `>1` zoomed in, `<1` zoomed out. Drives tier visibility
   * (`model/tier-visibility.ts`), NOT `farT`, so the default circuit entry can
   * still show only the project/domain/hub spine.
   */
  zoomRatio: number;
}

export function stepTopologyPhysics(input: PhysicsStepInput): PhysicsStepResult {
  const {
    world,
    camera,
    target,
    damping,
    overviewScale,
    tokens,
    cameraAngularFrequency,
    dt,
    now,
    focusedNodeId,
    pairFocusActive,
    hoveredNodeId,
    panelEmphasisNodeId,
    isDragging,
    reducedMotion,
    freezeCamera,
    emphasisById,
    rippleStartById,
    egoRevealById,
    focusRampById,
    appearById,
    tierReveal = DEFAULT_TIER_REVEAL,
  } = input;

  // Tier visibility rides a SEPARATE zoom-ratio signal (not farT): entry scale
  // is `overviewScale × overviewEntryRatio`, so ratio = 1 at the overview
  // entry. Computed up-front (not just after the camera step) because the
  // camera's own effective zoom-in ceiling (C1 A1) is now DERIVED from this
  // same entry scale.
  const overviewEntryScale = overviewScale * tokens.overviewEntryRatio;

  // Focus-aware pan clamp (drag-while-focused must not lose the subject): while
  // a node is ego-focused AND the camera is zoomed IN past the overview scale,
  // clamp the pan so the camera centre stays within `cameraFocusPanMargin` world
  // units of the FOCUSED NODE — so an empty-space pan can look around the cluster
  // but the subject can never leave the frame; overshooting rubber-bands back
  // (Obsidian feel). Clamping to the focused node's own point (not the whole ego
  // bbox) is what keeps the subject on screen: a wide ego bbox + margin would let
  // the camera reach the cluster's far corner and slide the focused node off the
  // opposite edge. The zoom gate is essential: "지도 전체 맞추기"/fit-view keeps the
  // node selected (focusedNodeId stays set) while springing OUT to the overview;
  // once the camera scale drops below the overview fit scale the clamp reverts to
  // the full world bounds, so fit-view/close-focus recovery is never fought.
  const focusNode = focusedNodeId !== null && camera.scale.value > overviewScale
    ? world.nodeById.get(focusedNodeId)
    : undefined;
  // Unfocused clamp source = the VISIBLE tier's bounds. At spine-only zoom the
  // full-graph bounds cover the vast legal-but-empty de-pileup fan (only the
  // ~8-node spine draws), so the elastic clamp would happily leave the camera
  // stranded over nothing (owner's "캔버스가 사라져버림", QA 소실 A). Uses the
  // pre-step camera scale — one frame of lag is imperceptible at spring speeds.
  const preStepZoomRatio = computeZoomRatio(camera.scale.value, overviewScale * tokens.overviewEntryRatio);
  const panBounds = focusNode
    ? computePanBounds(
        { minX: focusNode.x, minY: focusNode.y, maxX: focusNode.x, maxY: focusNode.y },
        tokens.cameraFocusPanMargin,
      )
    : computePanBounds(
        isSpineOnlyZoom(preStepZoomRatio, tierReveal) ? world.spineBounds : world.bounds,
      );

  // C1 A1: the camera's real zoom-in ceiling is now ratio-based (viewport-
  // relative), not the absolute `cameraScaleMax` token — see
  // `topology-camera-math.ts#computeEffectiveCameraScaleMax`'s JSDoc for the
  // audit finding this fixes (capability/element tiers were unreachable).
  const effectiveScaleMax = computeEffectiveCameraScaleMax(overviewEntryScale, tokens.cameraMaxZoomRatio, tokens.cameraScaleMax);
  const effectiveScaleMin = computeEffectiveCameraScaleMin(overviewEntryScale, tokens.cameraMinZoomRatio, tokens.cameraScaleMin);
  // freezeCamera: the cubic transition tween owns the camera this frame — use
  // the (already-eased) `camera` verbatim, skipping the spring + pan clamp +
  // reduced snap. Everything downstream still derives from `nextCamera`.
  const nextCamera: CameraAxes = freezeCamera
    ? { x: { ...camera.x }, y: { ...camera.y }, scale: { ...camera.scale } }
    : stepCamera({
        camera,
        target,
        dt,
        damping,
        angularFrequency: cameraAngularFrequency,
        scaleMin: effectiveScaleMin,
        scaleMax: effectiveScaleMax,
        panBounds,
        isDragging,
      });
  // A8 — reduced motion: the camera arrives instead of travelling. Snapping
  // AFTER `stepCamera` (not instead of it) keeps its clamp/bounds work — only
  // the spring interpolation is discarded. Velocities zero out so a later
  // preference flip can't inherit stale momentum. (Never runs while frozen —
  // the tween is disabled under reduced motion, so the spring path handles the
  // snap.)
  if (!freezeCamera && reducedMotion) {
    nextCamera.x.value = target.tx;
    nextCamera.y.value = target.ty;
    nextCamera.scale.value = Math.min(effectiveScaleMax, Math.max(effectiveScaleMin, target.tscale));
    nextCamera.x.velocity = 0;
    nextCamera.y.velocity = 0;
    nextCamera.scale.velocity = 0;
  }

  const band = computeAltitudeBand(overviewScale, tokens.altitudeFarHighRatio, tokens.altitudeFarLowRatio);
  const farT = computeFarT(nextCamera.scale.value, band.farLow, band.farHigh);

  const zoomRatio = computeZoomRatio(nextCamera.scale.value, overviewEntryScale);

  const activeEgoId = focusedNodeId ? null : hoveredNodeId;
  const neighborsOfFocused = focusedNodeId ? world.neighborMap.get(focusedNodeId) : undefined;
  // Click-focus signature — the whole scene is "focused" if a node OR an
  // edge-pair is selected. One shared gate so node-click and edge-click drive
  // the same normal↔dim color ramp (owner headline motion).
  const focusActive = focusedNodeId !== null || pairFocusActive;
  for (const node of world.nodes) {
    const isHoverEgoMember =
      !!activeEgoId && (node.id === activeEgoId || world.neighborMap.get(activeEgoId)?.has(node.id) === true);
    const isInActiveEgoSet = isNodeEmphasisActive(node.id, focusedNodeId, isHoverEgoMember, panelEmphasisNodeId);
    const rippleHasStarted = now >= (rippleStartById.get(node.id) ?? 0);
    const previous = emphasisById.get(node.id) ?? 0;
    emphasisById.set(
      node.id,
      reducedMotion
        ? (isInActiveEgoSet && rippleHasStarted ? 1 : 0)
        : stepEmphasis(previous, isInActiveEgoSet, rippleHasStarted, dt, tokens.emphasisRiseTau, tokens.emphasisDecayTau),
    );

    // C1 A2 — ego tier-reveal ramp: while a node is focused, it + its 1-hop
    // neighbors ramp toward full reveal (consumed by
    // `model/tier-visibility.ts#effectiveNodeAlpha` in the draw pass) even if
    // the semantic-zoom tier gate itself hasn't opened yet at this zoomRatio.
    const isEgoMember =
      focusedNodeId !== null && (node.id === focusedNodeId || neighborsOfFocused?.has(node.id) === true);
    const previousReveal = egoRevealById.get(node.id) ?? 0;
    // A6 — the ego reveal has its OWN taus (rise 0.22 / decay 0.12), no longer
    // borrowing the hover ripple's (0.09/0.15). With the hover taus the
    // children finished appearing at ~0.41s while the camera dive was still
    // travelling until ~1.01s — content popped onto a moving camera. The
    // slower rise lands the children WITH the camera; the fast decay is
    // deliberate asymmetry (exits don't earn time).
    egoRevealById.set(
      node.id,
      reducedMotion
        ? (isEgoMember ? 1 : 0)
        : stepEmphasis(previousReveal, isEgoMember, true, dt, tokens.egoRevealRiseTau, tokens.egoRevealDecayTau),
    );

    // Click-focus color ramp — one exp-smoothing step toward "scene focused"
    // (1) or not (0). A8 reduced motion snaps to the end state (the color swap
    // still lands, just without the interpolated journey).
    const previousFocusRamp = focusRampById.get(node.id) ?? 0;
    focusRampById.set(
      node.id,
      reducedMotion ? (focusActive ? 1 : 0) : stepFocusRamp(previousFocusRamp, focusActive, dt, tokens.focusDimTau),
    );

    // rank8 — new-node appear ramp: rise every present node's value toward 1
    // (seed 0 for fresh nodes / 1 for existing set upstream). Reuses the ego
    // reveal's rise τ so a new node resolves with the same cadence content does.
    const previousAppear = appearById.get(node.id) ?? 1;
    appearById.set(
      node.id,
      reducedMotion ? 1 : stepEmphasis(previousAppear, true, true, dt, tokens.egoRevealRiseTau, tokens.egoRevealRiseTau),
    );
  }

  // Design Guardian 승인 처방 E — 선택(ego) 시 인시던트 contains 엣지도 코멧
  // 흐름을 태운다. 포커스 노드에 물린 contains 엣지만 후보(= "인시던트"), 그
  // 중 seed 순 상위 24개만 실제로 전진(`selectEgoContainsComets` 캡 — 팬아웃
  // 큰 노드가 파티클 다발이 되지 않게). `render/traces.ts`의 드로우 게이트도
  // 같은 캡 판정을 써야 하므로 이 Set 은 프레임 드로우(`topology-frame-draw.ts`)
  // 에서 동일 로직으로 재계산한다(둘 다 결정론이라 같은 프레임 안에서 값이
  // 일치 — 상태 공유 없이도 drift 없음).
  const egoContainsComets =
    focusedNodeId === null
      ? EMPTY_EGO_CONTAINS_COMETS
      : selectEgoContainsComets(
          world.edges.filter(
            (edge) => edge.kind === "contains" && (edge.sourceId === focusedNodeId || edge.targetId === focusedNodeId),
          ),
        );

  // R6 상시 혜성 — depends 엣지의 코멧 위상을 항상 전진시킨다(`updateParticles`,
  // 순수 모델 `render/edge-fireflies.ts`). ambient(edgePulseSpeed)로 포커스와
  // 무관하게 흐르되, 포커스 서브그래프에 물린 엣지는 "전류가 더 흐른다"고
  // 가속(edgePulseSpeedEgo, `resolveEdgePulseSpeed`, lead spec §2). reduced-motion
  // 이면 updateParticles 가 전진을 건너뛰어(정지) 유휴 게이트가 성립한다.
  updateParticles(
    world.edges,
    dt,
    reducedMotion,
    (edge) => {
      const touchesFocused =
        focusedNodeId !== null && (edge.sourceId === focusedNodeId || edge.targetId === focusedNodeId);
      return resolveEdgePulseSpeed(touchesFocused, focusedNodeId, tokens.edgePulseSpeed, tokens.edgePulseSpeedEgo);
    },
    (edge) => egoContainsComets.has(edgePairKey(edge.sourceId, edge.targetId)),
  );

  return { camera: nextCamera, farT, zoomRatio };
}
