/**
 * Pointer/wheel event handlers — the click-safe contract
 * (`interaction/pointer-state-machine.ts`) plus camera pan/zoom/flick
 * (`engine/momentum.ts`, prototype §9 `pointerdown`/`pointermove`/
 * `releaseDrag()`/`wheel`). Split out of `use-topology-loop.ts` to keep both
 * files under the 300-line budget — `Ref<T>` here is any mutable box the
 * hook owns (`useRef`'s `.current`), not necessarily React's own ref type.
 *
 * FIX (owner + QA — flick proportionality): `projectFlickLanding` now projects
 * a landing PROPORTIONAL to release velocity (iOS deceleration, ~−249 world
 * units for a 0.5px/ms flick at scale 1), so a small flick glides a small
 * distance and a big flick a big distance. `handlePointerUp` still clamps the
 * projected target into the world's pan bounds
 * (`engine/camera.ts#computePanBounds`) — but now that only engages when the
 * projection genuinely EXCEEDS the bounds, so within-bounds flicks glide freely
 * and only edge-exceeding flicks rubber-band (the seeded velocity overshoots the
 * clamped bound, then `stepCamera`'s per-frame `clampAxisToPanBounds` elastically
 * returns it — INTERACTION-DESIGN §1 "경계는 러버밴드"). The old port inflated
 * the projection ~60× so EVERY flick slammed to the same edge (the reported
 * snap); see `engine/momentum.ts`.
 */

import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

import { clampPointToPanBounds, computePanBounds, type CameraAxes, type CameraTarget } from "../engine/camera";
import type { CameraTween } from "../model/camera-easing";
import { projectFlickLanding, sampleReleaseVelocity } from "../engine/momentum";
import { EGO_NEIGHBOR_CHIP_ID, parseClusterMoreChipId, scheduleRipple } from "../model/focus-state";
import { type Pulse } from "../render/edge-fireflies";
import type { ForceSimulation } from "../model/force-layout";
import { computeZoomRatio, DEFAULT_TIER_REVEAL, isNodeHittable, isSpineOnlyZoom, type TierRevealConfig } from "../model/tier-visibility";
import { computeDragTugSets, type DragTugSets } from "../interaction/drag-tug";
import { hitTestEdges, type EdgeHitCandidate } from "./topology-edge-hit";
import { clusterBadgeLabel, clusterBadgeRect, clusterChipLabel, clusterChipRect, clusterChipScale } from "../render/cluster-chips";
import type { ClusterChip } from "../model/density-gate";
import { depthParallaxOffsetFor, type DepthParallaxOffset } from "../model/realm-depth-parallax";
import { computeGrabOffsetWorld, computePinWorld, type WorldOffset } from "../interaction/node-drag";
import {
  INITIAL_POINTER_MACHINE_STATE,
  resolveClickAction,
  transitionPointerState,
  type PointerMachineState,
} from "../interaction/pointer-state-machine";
import { computeWheelZoomFactor, normalizeWheelDeltaY, shouldIgnoreWheelGlide } from "../interaction/wheel";
import { computeEffectiveCameraScaleMax, computeEffectiveCameraScaleMin, hitTestWorld, screenToWorld, worldToScreen } from "./topology-camera-math";
import { readTopologyV2TokensOrNull } from "./topology-read-tokens";
import { radiusForKind, type TopologyWorld } from "./topology-world";

/**
 * Sim warmth topped up while a node is actively pin-dragged, in MILLISECONDS
 * (kept warm so neighbors keep reflowing). A4: heat used to be a frame count,
 * which made the same gesture settle twice as fast on a 120Hz display as on a
 * 60Hz one — time budgets are refresh-rate invariant. 350ms ≈ the old
 * 20-frame top-up at 60Hz. The release settle budget is the
 * `--topology-v2-node-release-settle-ms` token (900).
 */
export const NODE_DRAG_HEAT_MS = 350;

/** Active node-drag: which node is pinned + the world-space grab offset (respects where inside the node it was grabbed). */
export interface NodeDragState {
  nodeId: string;
  offset: WorldOffset;
}

/** Prototype `startRipple()` — the +12ms/neighbor stagger has no separate token (design doc §2.4). */
const RIPPLE_PER_NEIGHBOR_DELAY_MS = 12;

interface Ref<T> {
  current: T;
}

export interface PointerHandlerRefs {
  /**
   * 휠이 누구 것인가 — **표면마다 다르다** (2026-07-28 모션석 실측).
   *
   * `'zoom'`(기본, 워크벤치): 지도가 화면 전체이고 스크롤할 페이지가 없으므로
   * 휠은 전부 줌이고 `preventDefault` 로 페이지 유출을 막는 것이 맞다.
   *
   * `'page-scroll'`(관문): 지도가 **스크롤하는 문서 안의 밴드**다. 같은 줄이
   * 여기서는 트랩으로 뒤집힌다 — 실측: `/download` 의 캔버스가 뷰포트의
   * **62.1%** 인데 휠을 무조건 삼켜서, 랜딩에 착지한 방문자가 가장 먼저 하는
   * 행동(스크롤)이 아무것도 안 하고 지도만 줌됐다. 접힘 아래에 판매 논증이
   * 전부 있는데 거기 도달할 수 없었다. 이 모드에서 평 휠은 페이지에 양보하고,
   * 줌은 **명시적 핀치**(`ctrlKey` wheel)에만 반응한다.
   *
   * 한 표면을 위한 결정이 그 전제가 성립하지 않는 표면으로 새어 나간 형태라,
   * 상수가 아니라 계약으로 올린다.
   */
  wheelIntent?: "zoom" | "page-scroll";
  worldRef: Ref<TopologyWorld | null>;
  cameraRef: Ref<CameraAxes>;
  cameraTargetRef: Ref<CameraTarget>;
  /**
   * S3 마감 폴리시 — the live cubic camera transition (`model/camera-easing.ts`).
   * Any interactive gesture (wheel zoom, pointer-down for pan/select) clears it
   * so the spring immediately regains control from wherever the ease left the
   * camera. Optional — omitted keeps the pre-tween behavior.
   */
  cameraTweenRef?: Ref<CameraTween | null>;
  dampingRef: Ref<number>;
  /**
   * Dive-zoom fix (owner: "줌 인/아웃이 느림") — `handleWheel` sets this to
   * `--topology-v2-camera-spring-angfreq-interactive` on every live wheel
   * tick, so the scale axis (and pan while wheel-zooming) settles crisp
   * instead of at the slower cinematic rate programmatic camera moves use.
   * `null` is a valid "not yet set" state (the rAF loop's own fallback).
   */
  cameraAngularFreqRef: Ref<number | null>;
  viewportRef: Ref<{ width: number; height: number; dpr: number }>;
  pointerMachineRef: Ref<PointerMachineState>;
  dragHistoryRef: Ref<{ x: number; y: number; t: number }[]>;
  camStartAtDownRef: Ref<{ x: number; y: number }>;
  /**
   * Cached canvas bounding rect. `getBoundingClientRect()` forces a synchronous
   * layout/reflow; calling it on every `pointermove` was a per-drag-frame
   * reflow (a real source of the owner-reported "pan is janky"). We snapshot it
   * once at `pointerdown` and reuse it for the whole gesture instead.
   */
  canvasRectRef: Ref<{ left: number; top: number } | null>;
  /**
   * rank4 — the canvas element itself, so `pointerup`/`pointercancel` (which
   * carry no event target of their own here) can restore the cursor after a
   * node pin-drag ends ("grabbing" → default). Optional; omitted keeps the
   * cursor unmanaged on release (the next `pointermove` still recomputes it).
   */
  canvasRef?: Ref<HTMLCanvasElement | null>;
  focusedSlugRef: Ref<string | null>;
  hoveredNodeIdRef: Ref<string | null>;
  rippleStartRef: Ref<Map<string, number>>;
  /**
   * R6 호버 펄스 — 호버가 발사한 일회성 신호 리스트(프레임 루프가 수명 관리).
   * 호버 노드 변경 시 닿는 엣지들로 바깥 방향 펄스를 append 한다. 생략 시 발사
   * 없음(하위호환).
   */
  pulsesRef?: Ref<Pulse[]>;
  reducedMotionRef: Ref<boolean>;
  /**
   * WCAG 2.2 §2.3.3 — "the camera's last mover was the user's hand."
   * Every gesture that writes `cameraTargetRef` (wheel · pinch · pan · flick)
   * flips this true; the programmatic setters in `use-topology-loop.ts` flip it
   * back. `stepTopologyPhysics` reads it to scope the reduced-motion camera snap
   * to **app-initiated** travel only — direct manipulation is the hand's
   * extension, not vestibular motion, and the standard exempts it explicitly.
   * Optional so existing test fixtures keep working.
   */
  userDrivenCameraRef?: Ref<boolean>;
  /** The live force simulation (`model/force-layout.ts`) — pin/movePin/clearPin during node-drag. Null before the world is built. */
  simRef: Ref<ForceSimulation | null>;
  /** Frames of remaining sim warmth — the rAF loop ticks the sim while > 0 (or while a node is pinned). Bumped by node-drag. */
  heatRef: Ref<number>;
  /** Active node pin-drag, or null when the drag is a camera pan / no drag. */
  nodeDragRef: Ref<NodeDragState | null>;
  /**
   * C1 B1/B2 — the dragged node's own 1-hop/2-hop neighbor sets, captured
   * once at grab time (`interaction/drag-tug.ts#computeDragTugSets`). Consumed
   * both to propagate the explicit neighbor tug (B1) and to restrict the
   * release-settle FA2 tick to this local cluster (B2, `model/force-layout.ts`
   * `tick`'s `restrictToIds`). Persists through the post-release settle burst —
   * only cleared once that burst's heat reaches 0 (`use-topology-loop.ts`) or a
   * NEW drag starts.
   */
  dragAffectedSetRef: Ref<{ draggedId: string; oneHop: DragTugSets["oneHop"]; twoHop: DragTugSets["twoHop"] } | null>;
  /** C1 B1 — the dragged node's world position at grab time, for computing this drag's total displacement (Δ). Null once the drag ends (post-release tug decays toward 0, no more Δ to track). */
  dragStartPosRef: Ref<{ x: number; y: number } | null>;
  /** The altitude band's "100%" fit scale — used to derive farT for tier-aware (visible-only) hit-testing. */
  overviewScaleRef: Ref<number>;
  /**
   * 터치 핀치줌 (반응형 감사 rank4, 2026-07-23) — 활성 터치 포인터
   * (pointerId → 캔버스 좌표). 훅이 소유하는 ref 여야 한다: 이 팩토리는 매
   * 렌더 재호출되므로 팩토리-로컬 상태는 제스처 중 리렌더에 증발한다.
   * 생략 시 핀치 비활성(하위호환 — 기존 테스트/호출부 무변경).
   */
  activeTouchesRef?: Ref<Map<number, { x: number; y: number }>>;
  /**
   * rank4 — 진행 중 핀치의 직전 프레임 상태(두 손가락 거리 + 중점). null =
   * 핀치 아님. 줌 배율은 거리 비율, 팬은 중점 이동에서 유도한다.
   */
  pinchRef?: Ref<{ dist: number; midX: number; midY: number } | null>;
  onSelect?: (slug: string) => void;
  /** P3b — 노드가 잡히지 않은 지점의 클릭이 엣지 근접일 때. */
  onSelectEdge?: (edge: { sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null }) => void;
  /**
   * P3c — 엣지 호버 마이크로카드. idle 이동 중 노드 미히트 지점이 엣지
   * 근접이면 발화(식별 변경 시에만), 벗어나면 null. 드로우 패스의 hover
   * 잉크 강조가 같은 ref 를 읽는다. 클릭(P3b 상세)과 별개의 가벼운 의미
   * 미리보기 — 사용 신호(소유자 요청) 확인 후 게이트 해제.
   */
  hoveredEdgeRef?: Ref<{ sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null } | null>;
  /** 엣지 선택(페어 포커스) 상태 미러 — 바닥 클릭 해제 판정에 필요. */
  selectedEdgeRef?: Ref<{ sourceId: string; targetId: string } | null>;
  /** 밀도 게이트 — 이번 프레임의 클러스터 칩(월드 anchor). 칩 히트테스트용. */
  clusterChipsRef?: Ref<readonly ClusterChip[]>;
  /**
   * S3 마감 폴리시 (S2 known gap) — 이번 프레임에 그리지 않은 노드 집합(밀도
   * 게이트 접힘 + 선택적 ego 숨김 이웃). 노드/엣지 히트테스트가 이 집합을
   * 제외해 숨은 노드가 클릭·호버되지 않게 한다. 생략 시 전부 히트 대상.
   */
  clusteredIdsRef?: Ref<ReadonlySet<string>>;
  /** 밀도 게이트 — 호버 중 클러스터 부모 id 미러(커서 + 보더 강조). */
  hoveredClusterIdRef?: Ref<string | null>;
  /**
   * S5 깊이 시차 — 영역 active 중 rAF 가 채우는 밴드별 렌더 오프셋 + depthById.
   * 히트테스트가 드로우와 **같은** 오프셋을 노드에 적용해 클릭 어긋남을 막는다.
   * null(정지/미영역)이면 오프셋 없음.
   */
  realmParallaxRef?: Ref<{
    depthById: ReadonlyMap<string, number>;
    depth2: DepthParallaxOffset;
    depth3: DepthParallaxOffset;
  } | null>;
  /**
   * S10 결함 3 — 영역 전개 중 이번 프레임의 **깊이 기반 티어 kind** 오버라이드
   * (`topology-realm-runtime.ts#tierKindById`). 드로우가 이 맵으로 티어 알파를
   * 계산하므로 히트도 같은 맵을 써야 depth1 element 자식이 잡힌다. 루프가 매
   * 프레임 드로우와 **같은 게이트**로 채운다(영역 비활성이면 null).
   */
  realmTierKindsRef?: Ref<ReadonlyMap<string, "project" | "domain" | "capability" | "element"> | null>;
  /**
   * 슬라이스 C (개발/비개발 모드 토글) — 티어 게이트 config 미러(드로우와
   * **같은** config 여야 히트/팬-클램프가 그려진 것과 lockstep). 생략 시
   * `DEFAULT_TIER_REVEAL`.
   */
  tierRevealRef?: Ref<TierRevealConfig>;
  onHoverEdge?: (
    edge: { sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null } | null,
    position: { x: number; y: number } | null,
  ) => void;
  onPaneClick?: () => void;
  /** 밀도 게이트 — 클러스터 칩 클릭 → 부모 확장 토글(URL 왕복). */
  onToggleCluster?: (parentId: string) => void;
  /**
   * S2 파트 5C — 클러스터 칩 호버 툴팁. 호버 대상이 바뀔 때만 발화(식별 변경),
   * 벗어나면 null. HomePage 가 부모 제목/카운트로 문장을 만들어 마이크로카드로
   * 렌더한다(엣지 호버 카드와 같은 계약).
   */
  onHoverCluster?: (
    info: {
      parentId: string;
      /** 이 티어에서 접힌(숨김) 직속 게이트 자식 수 — 칩의 `+N`. */
      count: number;
      /** 패널3-S6 숫자 계약 — 부모의 하위 전체 자손 수(노드 뱃지와 같은 출처). */
      descendantTotal: number;
      expanded: boolean;
      position: { x: number; y: number };
    } | null,
  ) => void;
  /** S2 파트 3a — `이웃 +N` 칩 클릭 → 다음 이웃 배치 점등(URL 토글과 별개). */
  onExpandEgoNeighbors?: () => void;
  /**
   * 고팬아웃 배치-공개(2026-07) — 펼친 클러스터 부모의 `+N 더보기` 칩 클릭 →
   * 그 부모의 다음 배치 점등(URL 토글=접기 와 별개, 세션 임시). 인자는 합성
   * 칩 id 에서 해석한 **실제 부모** id.
   */
  onExpandClusterBatch?: (parentId: string) => void;
  /**
   * W2-B node right-click context menu. Called with the hit node's id and the
   * event's viewport-space coordinates (`clientX`/`clientY`, matching the
   * cursor-anchored menu position contract). Omitted keeps `handleContextMenu`
   * a no-op over nodes too (browser default menu still suppressed off-node
   * only — see that handler's own doc).
   */
  onContextMenuNode?: (slug: string, position: { x: number; y: number }) => void;
}

export interface TopologyPointerHandlers {
  handlePointerDown: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  handlePointerMove: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  /**
   * rank4 — 이벤트는 optional: JSX 배선(onPointerUp)은 이벤트를 넘겨 터치
   * 부기가 돌고, 내부 no-arg 호출(stuck-drag guard 등)은 부기를 생략한다.
   */
  handlePointerUp: (e?: ReactPointerEvent<HTMLCanvasElement>) => void;
  handlePointerCancel: (e?: ReactPointerEvent<HTMLCanvasElement>) => void;
  /**
   * FIX (QA first-light pass — console error sweep): takes a native
   * `WheelEvent`, not React's synthetic `WheelEvent<...>`. React attaches its
   * delegated `wheel` listener as passive by default, so a JSX `onWheel`
   * prop calling `e.preventDefault()` logs "Unable to preventDefault inside
   * passive event listener invocation" on every scroll/pinch and silently
   * fails to stop the page from also scrolling underneath the canvas
   * (reproduced via chrome-devtools: 37 warnings from one zoom gesture).
   * `use-topology-loop.ts` now attaches this via a native, explicitly
   * `{ passive: false }` listener instead of the JSX prop.
   */
  handleWheel: (e: WheelEvent) => void;
  /**
   * W2-B — native browser context menu is suppressed ONLY when the
   * right-click lands on a hittable node (design gate: "캔버스 기본 브라우저
   * 컨텍스트 메뉴 억제는 노드 위에서만"). Off-node right-clicks fall through
   * to the OS/browser menu unchanged — panning/empty-canvas right-click
   * behavior is untouched.
   */
  handleContextMenu: (e: ReactMouseEvent<HTMLCanvasElement>) => void;
}

/** Builds the five pointer/wheel handlers, closing over the hook's refs (cheap — plain closures, no hook rules to satisfy). */
export function createTopologyPointerHandlers(refs: PointerHandlerRefs): TopologyPointerHandlers {
  const {
    wheelIntent = "zoom",
    worldRef,
    cameraRef,
    cameraTargetRef,
    cameraTweenRef,
    dampingRef,
    cameraAngularFreqRef,
    viewportRef,
    pointerMachineRef,
    dragHistoryRef,
    camStartAtDownRef,
    canvasRectRef,
    canvasRef,
    focusedSlugRef,
    hoveredNodeIdRef,
    rippleStartRef,
    pulsesRef,
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
    clusteredIdsRef,
    hoveredClusterIdRef,
    realmParallaxRef,
    realmTierKindsRef,
    tierRevealRef,
    onSelect,
    onSelectEdge,
    onHoverEdge,
    onPaneClick,
    onContextMenuNode,
    onToggleCluster,
    onHoverCluster,
    onExpandEgoNeighbors,
    onExpandClusterBatch,
  } = refs;

  /**
   * 밀도 게이트 — 클릭/호버 지점이 어떤 클러스터 칩 위인지 판정한다. 칩
   * anchor(월드)를 스크린으로 투영하고 드로우와 **같은** `clusterChipRect` 로
   * 사각형을 만들어 point-in-rect 테스트한다(좌표 어긋남 0). 히트 시 부모 id.
   */
  const hitTestClusterChip = (px: number, py: number): string | null => {
    const chips = clusterChipsRef?.current;
    if (!chips || chips.length === 0) return null;
    const { width, height } = viewportRef.current;
    const camera = cameraRef.current;
    const world = worldRef.current;
    const tokens = readTopologyV2TokensOrNull();
    // 드로우(`topology-frame-draw.ts`)와 **같은** 줌 스케일을 써 사각형이 어긋나지 않게.
    const scale = clusterChipScale(camera.scale.value);
    for (const chip of chips) {
      let rect: ReturnType<typeof clusterChipRect>;
      if (chip.expanded) {
        // S10 결함 2 — 펼침은 부모 노드 우상단 배지. 드로우와 **같은**
        // `clusterBadgeRect`(부모 스크린 좌표 + base 스크린 반지름) 로 사각형 유도.
        const parentNode = world?.nodeById.get(chip.parentId);
        if (!parentNode || !tokens) continue;
        const parentScreen = worldToScreen(camera, width, height, parentNode.x, parentNode.y);
        const nodeScreenRadius = radiusForKind(parentNode.kind, tokens) * parentNode.magnitudeScale * camera.scale.value;
        rect = clusterBadgeRect(parentScreen.x, parentScreen.y, nodeScreenRadius, clusterBadgeLabel(chip.count), scale);
      } else {
        const screen = worldToScreen(camera, width, height, chip.anchor.x, chip.anchor.y);
        rect = clusterChipRect(screen.x, screen.y, clusterChipLabel(chip.count, chip.expanded), scale);
      }
      if (px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h) {
        return chip.parentId;
      }
    }
    return null;
  };

  /**
   * Tier-aware hit test — only nodes currently visible at this altitude
   * (`model/tier-visibility.ts`) can be grabbed/hovered, so the pointer never
   * grabs an invisible semantic-zoom-gated capability/element.
   */
  const hitVisibleNode = (
    world: TopologyWorld,
    camera: CameraAxes,
    tokens: ReturnType<typeof readTopologyV2TokensOrNull>,
    px: number,
    py: number,
  ): string | null => {
    if (!tokens) return null;
    // Tier hittability rides the same zoom-ratio signal as the draw pass
    // (`model/tier-visibility.ts`), NOT `farT` — so the pointer never grabs a
    // semantic-zoom-hidden capability/element even at the circuit default entry.
    const overviewEntryScale = overviewScaleRef.current * tokens.overviewEntryRatio;
    const zoomRatio = computeZoomRatio(camera.scale.value, overviewEntryScale);
    // C1 A2 — focus ego tier exemption: the focused node + its 1-hop neighbors
    // are hittable even below the tier's own alpha threshold, matching the
    // draw pass's `effectiveNodeAlpha` exemption (`topology-frame-draw.ts`) —
    // otherwise a capability that's now VISIBLE (ego-revealed) would still be
    // unclickable, defeating the entire "click a domain to expand it" flow.
    const focusedNodeId = focusedSlugRef.current;
    const neighborsOfFocused = focusedNodeId ? world.neighborMap.get(focusedNodeId) : undefined;
    // S3 — 이번 프레임에 그리지 않은(밀도게이트 접힘 + 선택적 ego 숨김) 노드는
    // 히트 대상에서 제외 — 숨은 ego 이웃이 클릭되던 S2 갭 차단.
    const clusteredIds = clusteredIdsRef?.current;
    // S10 결함 3 — 영역 전개 중 깊이 기반 티어 오버라이드(드로우와 같은 맵).
    const realmTierKinds = realmTierKindsRef?.current ?? null;
    // S5 — 영역 시차가 활성이면 드로우와 같은 밴드 오프셋을 히트에도 적용.
    const parallax = realmParallaxRef?.current ?? null;
    const renderOffsetForNode = parallax
      ? (node: { id: string }) =>
          depthParallaxOffsetFor(parallax.depthById.get(node.id), parallax.depth2, parallax.depth3)
      : undefined;
    return hitTestWorld(
      world,
      camera,
      viewportRef.current.width,
      viewportRef.current.height,
      tokens,
      px,
      py,
      (node) => isNodeHittable(node, zoomRatio, focusedNodeId, neighborsOfFocused, tierRevealRef?.current ?? DEFAULT_TIER_REVEAL, clusteredIds, realmTierKinds),
      renderOffsetForNode,
    );
  };

  /** Reuse the cached rect during a gesture; refresh lazily if we somehow don't have one yet. */
  const currentRect = (el: HTMLCanvasElement): { left: number; top: number } => {
    const cached = canvasRectRef.current;
    if (cached) return cached;
    const rect = el.getBoundingClientRect();
    const snapshot = { left: rect.left, top: rect.top };
    canvasRectRef.current = snapshot;
    return snapshot;
  };


  /**
   * 후보 캐시 — **같은 입력이면 다시 만들지 않는다** (2026-07-28 코드 리뷰 수정).
   *
   * 이 함수는 노드 전량 필터(O(N)) + 엣지 전량 투영(O(E), 엣지마다 좌표 변환
   * 세 번 + Map 조회 두 번) + 배열 전량 할당을 한다. 그런데 호출 지점이
   * **노드에 안 걸린 지점의 모든 `pointermove`** 다 — 최대 ~125Hz. 배경 위에서
   * 마우스를 움직이는 것만으로 프레임마다 그래프 전체를 훑고 새 배열을 만든다.
   * 97노드 도그푸드에선 안 보이지만 이 엔진의 설계 목표는 2~3k 노드다.
   *
   * 그런데 그 프레임들의 입력은 **대부분 같다** — 카메라가 멈춰 있으면 후보도
   * 그대로다. 그래서 입력이 하나라도 달라질 때만 다시 만든다. 팬·줌 중에는
   * 카메라 값이 매 프레임 달라지므로 자연히 매번 재계산되고(그때는 정확성이
   * 우선), 정지 상태의 호버에서는 첫 프레임 이후 전부 캐시 적중이다.
   *
   * 키에 `world` 참조가 들어가므로 그래프가 갈리면 즉시 무효화된다.
   */
  let edgeCandidateCache: {
    key: string;
    world: unknown;
    clusteredIds: unknown;
    realmTierKinds: unknown;
    tierReveal: unknown;
    value: EdgeHitCandidate[];
  } | null = null;

  /** P3b/P3c 공용 — 현재 tier 에서 양 끝이 히트 가능한 엣지의 스크린 투영 후보. */
  const buildEdgeCandidates = (): EdgeHitCandidate[] => {
    const world = worldRef.current;
    if (!world) return [];
    const tokens = readTopologyV2TokensOrNull();
    if (!tokens) return [];
    const { width, height } = viewportRef.current;
    const overviewEntryScale = overviewScaleRef.current * tokens.overviewEntryRatio;
    const zoomRatio = computeZoomRatio(cameraRef.current.scale.value, overviewEntryScale);
    const focusedNodeId = focusedSlugRef.current;
    // 캐시 키 — 후보 목록을 정하는 모든 입력. 카메라 세 축이 들어가므로
    // 팬/줌 중에는 매 프레임 새 키가 되고, 정지 상태에서는 같은 키가 된다.
    const cacheKey = [
      cameraRef.current.x.value,
      cameraRef.current.y.value,
      cameraRef.current.scale.value,
      width,
      height,
      zoomRatio,
      focusedNodeId ?? "",
    ].join("|");
    // 집합·맵은 **참조로** 비교한다 — 크기만 보면 같은 크기의 다른 내용이
    // 통과한다(가장 조용한 종류의 캐시 오류다). 이 값들은 새 객체로 교체되지
    // 제자리에서 고쳐지지 않으므로 참조 비교가 정확하다.
    const clusteredIds = clusteredIdsRef?.current;
    const realmTierKinds = realmTierKindsRef?.current ?? null;
    const tierReveal = tierRevealRef?.current ?? DEFAULT_TIER_REVEAL;
    if (
      edgeCandidateCache &&
      edgeCandidateCache.world === world &&
      edgeCandidateCache.key === cacheKey &&
      edgeCandidateCache.clusteredIds === clusteredIds &&
      edgeCandidateCache.realmTierKinds === realmTierKinds &&
      edgeCandidateCache.tierReveal === tierReveal
    ) {
      return edgeCandidateCache.value;
    }

    const neighborsOfFocused = focusedNodeId ? world.neighborMap.get(focusedNodeId) : undefined;
    const hittable = new Set(
      world.nodes
        .filter((n) => isNodeHittable(n, zoomRatio, focusedNodeId, neighborsOfFocused, tierReveal, clusteredIds, realmTierKinds))
        .map((n) => n.id),
    );
    // 히트테스트 역전 방지(패널3-S3) — 끝 노드 몸통 반경(스크린 px)을
    // `hitTestWorld` 와 **같은 식**(radiusForKind × magnitudeScale × scale + 5)
    // 으로 계산해 넘긴다. 노드 히트 영역과 정확히 맞물려 노드 몸통/근접 클릭이
    // 방사형 엣지로 새지 않게 한다(노드 바디 > 엣지).
    const scale = cameraRef.current.scale.value;
    const bodyRadius = (id: string): number | undefined => {
      const node = world.nodeById.get(id);
      if (!node) return undefined;
      return radiusForKind(node.kind, tokens) * node.magnitudeScale * scale + 5;
    };
    const candidates: EdgeHitCandidate[] = [];
    for (const edge of world.edges) {
      if (!hittable.has(edge.sourceId) || !hittable.has(edge.targetId)) continue;
      candidates.push({
        edge,
        a: worldToScreen(cameraRef.current, width, height, edge.ax, edge.ay),
        b: worldToScreen(cameraRef.current, width, height, edge.bx, edge.by),
        control: worldToScreen(cameraRef.current, width, height, edge.controlX, edge.controlY),
        aRadius: bodyRadius(edge.sourceId),
        bRadius: bodyRadius(edge.targetId),
      });
    }
    edgeCandidateCache = { key: cacheKey, world, clusteredIds, realmTierKinds, tierReveal, value: candidates };
    return candidates;
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const tokens = readTopologyV2TokensOrNull();
    const world = worldRef.current;
    if (!tokens || !world) return;
    // S3 — any pointer interaction (pan / select) abandons a live camera tween
    // so the spring takes over from wherever the ease currently sits. A click
    // that ends up selecting a node begins a fresh tween in the focus effect.
    if (cameraTweenRef) cameraTweenRef.current = null;
    // R4 관성 활강 중단(interruptibility) — 새 포인터다운은 진행 중이던 flick
    // 감속을 즉시 잡는다(iOS 스크롤 catch). 카메라 속도를 0 으로, 스프링 타깃을
    // 현재 위치로 고정해 지금 자리에 정지시킨다 — 이어질 팬/선택은 각자 새
    // 타깃을 세운다(팬: pointermove, 선택: 포커스 이펙트 트윈). 속도가 이미
    // 0 이면 정지 상태라 타깃을 건드리지 않는다(불필요한 상태 변경 회피).
    {
      const cam = cameraRef.current;
      if (cam.x.velocity !== 0 || cam.y.velocity !== 0) {
        cameraRef.current = { ...cam, x: { value: cam.x.value, velocity: 0 }, y: { value: cam.y.value, velocity: 0 } };
        cameraTargetRef.current = { ...cameraTargetRef.current, tx: cam.x.value, ty: cam.y.value };
        dampingRef.current = tokens.cameraDampingDefault;
      }
    }
    // Capture the pointer for the whole gesture — without this, releasing over
    // the analysis rail / outside the window never delivers `pointerup` to the
    // canvas, the state machine sticks in `dragging`, and the camera then
    // follows a button-less mouse until it strands off-graph (owner's
    // "드래그하면 캔버스가 사라져버림", QA 소실 B). Implicit release on
    // pointerup/cancel is per-spec automatic.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // jsdom / test envs may not implement pointer capture — the buttons===0
      // guard in `handlePointerMove` covers the fallback.
    }
    // Snapshot the rect once per gesture (see `canvasRectRef` JSDoc).
    const domRect = e.currentTarget.getBoundingClientRect();
    canvasRectRef.current = { left: domRect.left, top: domRect.top };
    const rect = canvasRectRef.current;
    const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    // rank4 터치 핀치줌 — 터치 포인터 등록. 두 번째 손가락이 닿는 순간 진행
    // 중이던 단일 손가락 제스처(프레스/팬)를 클릭 커밋 없이 취소하고 핀치로
    // 전환한다(두 손가락을 얹는 행위가 노드 선택이 되면 안 됨). 세 번째 이상
    // 손가락은 무시 — 핀치는 처음 두 포인터의 좌표만 본다(Map 삽입 순서 보존).
    if (activeTouchesRef && e.pointerType === "touch") {
      activeTouchesRef.current.set(e.pointerId, { x: point.x, y: point.y });
      if (activeTouchesRef.current.size === 2 && pinchRef) {
        handlePointerCancel();
        const pts = [...activeTouchesRef.current.values()];
        pinchRef.current = {
          dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
          midX: (pts[0].x + pts[1].x) / 2,
          midY: (pts[0].y + pts[1].y) / 2,
        };
        return; // 기계 전이 없음 — 이 제스처는 카메라 전용
      }
      if (activeTouchesRef.current.size > 2) return;
    }
    const hitNodeId = hitVisibleNode(world, cameraRef.current, tokens, point.x, point.y);
    const { next } = transitionPointerState(pointerMachineRef.current, { type: "pointerdown", point, hitNodeId }, tokens.hysteresisPx);
    pointerMachineRef.current = next;
    camStartAtDownRef.current = { x: cameraRef.current.x.value, y: cameraRef.current.y.value };
    dragHistoryRef.current = [{ x: point.x, y: point.y, t: performance.now() }];
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const tokens = readTopologyV2TokensOrNull();
    const world = worldRef.current;
    if (!tokens || !world) return;
    const rect = currentRect(e.currentTarget);
    const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    // rank4 터치 핀치줌 — 두 손가락 이동을 카메라 줌+팬으로. 수학은
    // `handleWheel` 과 동일 계약: 카메라 TARGET 기준 합성(스프링 지연 무관),
    // effective min/max 클램프, 인터랙티브 스프링. 직전 중점 아래 월드 좌표가
    // 새 중점 아래로 오도록 tx/ty 를 풀면 줌 앵커와 두-손가락 팬이 한 식으로
    // 떨어진다: tx' = worldAtPrevMid − (mid' − c)/scale'.
    if (activeTouchesRef && e.pointerType === "touch" && activeTouchesRef.current.has(e.pointerId)) {
      activeTouchesRef.current.set(e.pointerId, { x: point.x, y: point.y });
      const pinch = pinchRef?.current;
      if (pinch && pinchRef && activeTouchesRef.current.size >= 2) {
        const pts = [...activeTouchesRef.current.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        if (pinch.dist > 0 && dist > 0) {
          // 카메라 모션 시작 — 호버 카드류는 즉시 강등(휠과 같은 규칙).
          clearEdgeHover();
          clearClusterHover();
          if (cameraTweenRef) cameraTweenRef.current = null;
          const { width, height } = viewportRef.current;
          const target = cameraTargetRef.current;
          const overviewEntryScale = overviewScaleRef.current * tokens.overviewEntryRatio;
          const effectiveScaleMax = computeEffectiveCameraScaleMax(overviewEntryScale, tokens.cameraMaxZoomRatio, tokens.cameraScaleMax);
          const effectiveScaleMin = computeEffectiveCameraScaleMin(overviewEntryScale, tokens.cameraMinZoomRatio, tokens.cameraScaleMin);
          const newScale = Math.min(effectiveScaleMax, Math.max(effectiveScaleMin, target.tscale * (dist / pinch.dist)));
          const worldAtPrevMidX = (pinch.midX - width / 2) / target.tscale + target.tx;
          const worldAtPrevMidY = (pinch.midY - height / 2) / target.tscale + target.ty;
          const afterX = worldAtPrevMidX - (midX - width / 2) / newScale;
          const afterY = worldAtPrevMidY - (midY - height / 2) / newScale;
          cameraTargetRef.current = { tx: afterX, ty: afterY, tscale: newScale };
          if (userDrivenCameraRef) userDrivenCameraRef.current = true;
          dampingRef.current = tokens.cameraDampingDefault;
          cameraAngularFreqRef.current = tokens.cameraSpringAngFreqInteractive;
          // 잔여 플릭 속도 차단(휠과 동일) — 핀치는 타깃 구동.
          const cam = cameraRef.current;
          if (cam.x.velocity !== 0 || cam.y.velocity !== 0) {
            cameraRef.current = { ...cam, x: { value: cam.x.value, velocity: 0 }, y: { value: cam.y.value, velocity: 0 } };
          }
          // WCAG 2.3.3 — 핀치는 **사용자가 개시한** 확대다. 예전엔 여기서
          // 카메라를 목적지로 스냅했는데, 그러면 감속 사용자에게 뷰포트 전체가
          // 한 프레임에 순간이동한다(2026-07-28 실측: diff 1프레임 뒤 0.00 영구)
          // — 대체하려던 이동보다 전정계에 더 나쁘고, "내가 어디로 갔나" 를
          // 읽을 단서까지 사라진다. 직접 조작은 손의 연장이라 시간을 지킨다.
        }
        pinchRef.current = { dist, midX, midY };
        return; // 핀치 중엔 단일 포인터 이동 로직(팬/호버/드래그)을 타지 않는다
      }
    }

    // Stuck-drag guard (QA 소실 B fallback): a button-less move during an
    // active gesture means we missed the real `pointerup` (capture unsupported
    // or interrupted). Treat it as that pointerup — the stationary-release path
    // holds the camera exactly where it is — and let the NEXT move resume as a
    // plain hover on the now-idle machine.
    if (pointerMachineRef.current.phase !== "idle" && e.buttons === 0) {
      handlePointerUp();
      return;
    }

    // Capture the pressed node BEFORE the transition — the pressed→dragging
    // transition clears `pressedNodeId`, but we need it to know whether this
    // drag grabbed a node (pin-drag) or empty space (camera pan).
    const pressedNodeId = pointerMachineRef.current.pressedNodeId;
    const { next } = transitionPointerState(pointerMachineRef.current, { type: "pointermove", point }, tokens.hysteresisPx);
    pointerMachineRef.current = next;

    if (next.phase === "dragging") {
      const sim = simRef.current;
      const { width, height } = viewportRef.current;

      // Start a node pin-drag the moment we cross into dragging on a node.
      if (nodeDragRef.current === null && pressedNodeId !== null && sim?.hasNode(pressedNodeId)) {
        const grabNode = world.nodeById.get(pressedNodeId);
        if (grabNode) {
          const pw = screenToWorld(cameraRef.current, width, height, point.x, point.y);
          const offset = computeGrabOffsetWorld(grabNode.x, grabNode.y, pw.x, pw.y);
          sim.pin(pressedNodeId, grabNode.x, grabNode.y);
          nodeDragRef.current = { nodeId: pressedNodeId, offset };
          heatRef.current = NODE_DRAG_HEAT_MS;
          // C1 B1/B2 — capture the tug/settle-restriction set + start position
          // once, at grab time (not recomputed per frame).
          const tugSets = computeDragTugSets(world.neighborMap, pressedNodeId);
          dragAffectedSetRef.current = { draggedId: pressedNodeId, oneHop: tugSets.oneHop, twoHop: tugSets.twoHop };
          dragStartPosRef.current = { x: grabNode.x, y: grabNode.y };
        }
      }

      // Active node pin-drag: move the pin 1:1 in world space, keep the sim
      // warm so neighbors reflow. The camera does NOT pan (headline fix — a
      // node drag moves the NODE, not the whole viewport).
      clearEdgeHover(); // 드래그 중 카드 잔존 방지
      clearClusterHover();
      const drag = nodeDragRef.current;
      if (drag && sim) {
        const pw = screenToWorld(cameraRef.current, width, height, point.x, point.y);
        const pin = computePinWorld(pw.x, pw.y, drag.offset);
        sim.movePin(pin.x, pin.y);
        heatRef.current = NODE_DRAG_HEAT_MS;
        // rank4 — 노드를 쥐고 옮기는 동안 "grabbing" 커서(순수 CSS). 놓으면
        // pointerup/cancel 이 복원한다.
        e.currentTarget.style.cursor = "grabbing";
        return;
      }

      // 미는 동안은 `grabbing` — 노드 드래그(위 분기)와 같은 응답이라 "지금
      // 내 손에 뭔가 잡혀 있다" 가 두 경우에 같은 글자로 읽힌다.
      e.currentTarget.style.cursor = "grabbing";

      const anchor = next.downPoint ?? point;
      const worldDX = (point.x - anchor.x) / cameraRef.current.scale.value;
      const worldDY = (point.y - anchor.y) / cameraRef.current.scale.value;
      const nextX = camStartAtDownRef.current.x - worldDX;
      const nextY = camStartAtDownRef.current.y - worldDY;
      // 1:1 tracking, no lag — drag follows the pointer directly, the spring
      // only takes back over once the flick is released (`engine/momentum.ts`).
      cameraRef.current = { ...cameraRef.current, x: { value: nextX, velocity: 0 }, y: { value: nextY, velocity: 0 } };
      cameraTargetRef.current = { ...cameraTargetRef.current, tx: nextX, ty: nextY };
      if (userDrivenCameraRef) userDrivenCameraRef.current = true;
      dragHistoryRef.current.push({ x: point.x, y: point.y, t: performance.now() });
      // Keep ~10 samples (~160ms at 60fps) so the release-velocity window
      // (`--topology-v2-camera-release-velocity-window-ms`) is always covered,
      // even on lower-frame-rate devices. The sampler filters by timestamp, so
      // extra old samples are harmless.
      if (dragHistoryRef.current.length > 10) dragHistoryRef.current.shift();
      return;
    }

    // 드래그(팬/노드 이동)는 위 블록에서 이미 return — 여기 도달은
    // idle|pressed 뿐이다. 엣지 호버는 포커스(ego) 중에도 동작한다 —
    // 엣지 클릭(P3b)이 포커스 중에도 되므로 호버도 같아야 한다("잡을 수
    // 있으면 읽을 수 있다"; 사용자 실보고 "노드 클릭한 상태에선 선 호버
    // 툴팁이 안 나온다"의 근원). 후보는 buildEdgeCandidates 가 포커스
    // tier 히트 규칙을 이미 반영한다.
    const hitNodeId = hitVisibleNode(world, cameraRef.current, tokens, point.x, point.y);

    // P3c — 노드 미히트 지점의 엣지 근접 = 호버 마이크로카드. 식별이 바뀔
    // 때만 발화 (같은 엣지 위 이동은 재발화 없음 — 카드 안정). 노드 위에
    // 오르면 엣지 호버는 즉시 해제 (노드가 우선).
    // 엣지 히트는 커서 판정에도 쓰이므로 아래 호버 블록 **밖**에서 구한다 —
    // 커서 어포던스가 엣지-호버 배선(`hoveredEdgeRef && onHoverEdge`)의 존재
    // 여부에 얹혀 있으면, 그 배선이 없는 소비처에서 커서가 아예 안 정해진다
    // (2026-07-28: 실제로 그 가드 안에 있었다).
    const edgeHit =
      hitNodeId === null && hoveredEdgeRef && onHoverEdge
        ? hitTestEdges(buildEdgeCandidates(), point.x, point.y, 6)
        : null;

    if (hoveredEdgeRef && onHoverEdge) {
      const prev = hoveredEdgeRef.current;
      const sameEdge =
        edgeHit !== null &&
        prev !== null &&
        prev.sourceId === edgeHit.sourceId &&
        prev.targetId === edgeHit.targetId &&
        prev.relationType === edgeHit.relationType;
      if (!sameEdge && (edgeHit !== null || prev !== null)) {
        const payload = edgeHit
          ? {
              sourceId: edgeHit.sourceId,
              targetId: edgeHit.targetId,
              relationType: edgeHit.relationType,
              declaredBySlug: edgeHit.declaredBySlug,
            }
          : null;
        hoveredEdgeRef.current = payload;
        onHoverEdge(payload, payload ? { x: e.clientX, y: e.clientY } : null);
      }
    }

    // 커서 어포던스 — **각 표면은 자기 1차 행동을 보여준다** (2026-07-28
    // 디자인 카운슬 「상호작용」 처방 + 실측 정정).
    //
    // 종전: 노드 = `grab`, 엣지 = `pointer`, **배경 = 아무것도 없음**.
    // 노드의 `grab` 은 거짓이 아니었다(진짜로 pin-drag 된다). 진짜 결함은
    // 배경이었다 — 배경은 **팬 가능한데 어포던스를 하나도 안 줬다**(실측:
    // 배경 호버 커서 `auto`). 그래서 "이 지도를 밀 수 있다" 를 아무도 알려
    // 주지 않았고, 정작 못 미는 노드 위에서만 "집으라" 는 손이 떴다.
    //
    // 이제 1차 행동으로 가른다:
    // - 노드·엣지·칩 → `pointer` (누르면 열린다 — 힌트 바가 말하는 그 행동)
    // - 배경 → `grab` (밀면 지도가 따라온다), 미는 동안 `grabbing`
    // 노드 드래그는 여전히 되고 `grabbing` 으로 응답한다 — 강화 기능이라
    // 어포던스를 1차 자리에서 양보한다(드래그로 발견되는 것이 허용되는
    // 부류라는 것이 카운슬 판정).
    //
    // 이 배정이 위 호버 블록 **밖**인 것도 계약이다 — 안에 있으면 엣지-호버
    // 배선이 없는 소비처에서 커서가 아예 안 정해진다.
    e.currentTarget.style.cursor =
      hitNodeId !== null || edgeHit !== null ? "pointer" : "grab";

    // 밀도 게이트 — 클러스터 칩 호버: 커서 pointer + 보더 강조 미러(노드
    // 미히트 지점만; 노드가 우선). 노드 클릭=ego 포커스 계약은 불변이고 칩은
    // 자식이 숨은 빈 공간에 서므로 여기서만 겹친다.
    if (hoveredClusterIdRef) {
      const chipHit = hitNodeId === null ? hitTestClusterChip(point.x, point.y) : null;
      if (hoveredClusterIdRef.current !== chipHit) {
        hoveredClusterIdRef.current = chipHit;
        // S2 파트 5C — 호버 대상 변경 시에만 툴팁 발화(안정). 칩이 잡히면
        // 엣지 호버는 즉시 해제(둘 다 빈 공간이라 겹칠 수 있음 — 칩 우선).
        if (onHoverCluster) {
          if (chipHit === null || chipHit === EGO_NEIGHBOR_CHIP_ID) {
            // ego `이웃 +N` 칩은 부모 제목이 없어 툴팁을 띄우지 않는다(커서/보더만).
            onHoverCluster(null);
          } else {
            clearEdgeHover();
            const chip = clusterChipsRef?.current?.find((c) => c.parentId === chipHit);
            if (chip) {
              // 고팬아웃 배치-공개 — `+N 더보기` 칩은 합성 id 라 실제 부모로
              // 해석해 툴팁이 부모 제목/자손 수를 찾게 한다(기존 접힘 툴팁 문구
              // 재사용 — 새 i18n 없이 "접힘 N · 하위 전체 M"). expanded 는
              // 이미 false(접힘 pill)라 접힘 문구가 뜬다.
              const realParent = parseClusterMoreChipId(chip.parentId) ?? chip.parentId;
              onHoverCluster({
                parentId: realParent,
                count: chip.count,
                // 패널3-S6 — 부모의 하위 전체 자손 수(노드 뱃지와 동일 출처
                // `WorldNode.count` = descendantCount). 라이브 월드에서 조회.
                descendantTotal: world.nodeById.get(realParent)?.count ?? chip.count,
                expanded: chip.expanded,
                position: { x: e.clientX, y: e.clientY },
              });
            }
          }
        }
      }
      if (chipHit !== null) e.currentTarget.style.cursor = "pointer";
    }

    if (next.phase !== "idle" || focusedSlugRef.current) return; // 리플은 idle+비포커스 전용 (기존 계약)
    if (hitNodeId === hoveredNodeIdRef.current) return;
    hoveredNodeIdRef.current = hitNodeId;
    if (hitNodeId) {
      const neighborIds = [...(world.neighborMap.get(hitNodeId) ?? [])];
      const schedule = scheduleRipple(hitNodeId, performance.now(), neighborIds, tokens.rippleStaggerMs, RIPPLE_PER_NEIGHBOR_DELAY_MS, tokens.rippleStaggerMaxMs);
      for (const entry of schedule) rippleStartRef.current.set(entry.nodeId, entry.startAtMs);
      // 호버 펄스는 소유자 실보고("쌀알 날아가는 효과 — 없애라, 이상해")로
      // 은퇴 (2026-07-23). 상시 혜성만 유지 — 호버 반응은 리플·커서로 충분.
    }
  };

  const handlePointerUp = (e?: ReactPointerEvent<HTMLCanvasElement>) => {
    // rank4 터치 핀치줌 — 터치 해제 부기. 핀치(또는 핀치의 잔여 손가락) up 은
    // 클릭/플릭 로직을 타지 않는다: 핀치 진입 시 기계는 이미 cancel 로 idle 이고,
    // 일반 단일 탭은 up 시점 phase 가 pressed/dragging 이라 이 조기 반환에
    // 걸리지 않는다. (내부 no-arg 호출 — stuck-drag guard — 은 부기 생략.)
    if (e && activeTouchesRef && e.pointerType === "touch" && activeTouchesRef.current.has(e.pointerId)) {
      activeTouchesRef.current.delete(e.pointerId);
      if (pinchRef?.current && activeTouchesRef.current.size < 2) pinchRef.current = null;
      if (pointerMachineRef.current.phase === "idle") return;
    }
    const tokens = readTopologyV2TokensOrNull();
    if (!tokens) return;
    // P3b — 클릭 지점(드래그가 아니면 downPoint 가 곧 클릭 좌표) 스냅샷.
    const clickPoint = pointerMachineRef.current.downPoint;
    const wasDragging = pointerMachineRef.current.phase === "dragging";
    const { next, commitClick } = transitionPointerState(pointerMachineRef.current, { type: "pointerup" }, tokens.hysteresisPx);
    pointerMachineRef.current = next;

    // 손을 놓았으면 쥔 모양도 놓는다 (2026-07-28). 종전엔 **노드 드래그
    // 분기에서만** 복원해서, 배경을 밀고 놓은 뒤 마우스를 그대로 두면 커서가
    // `grabbing` 인 채 남았다 — 놓았는데 화면은 아직 쥐고 있다고 말한다.
    // `""` 로 지우면 캔버스의 기본값 `grab` 으로 떨어지고(팬 가능이라는 참인
    // 신호), 다음 pointermove 가 노드 위면 `pointer` 로 덮는다.
    if (canvasRef?.current) canvasRef.current.style.cursor = "";

    // Node pin-drag release: unpin and give the graph a settle burst so it
    // (and the dropped node) relaxes around the drop, Obsidian-style. No
    // camera flick, no click commit (the state machine already suppressed the
    // click for a drag).
    if (nodeDragRef.current !== null) {
      simRef.current?.clearPin();
      nodeDragRef.current = null;
      heatRef.current = Math.max(heatRef.current, tokens.nodeReleaseSettleMs);
      // C1 B1: stop tracking Δ (drag ended) — `dragAffectedSetRef` stays set
      // through the settle burst above (B2), cleared once heat reaches 0
      // (`use-topology-loop.ts`'s rAF loop).
      dragStartPosRef.current = null;
      // rank4 — 드래그가 끝났으니 "grabbing" 커서를 해제한다(다음 pointermove 가
      // 호버 여부에 따라 grab/pointer/"" 로 다시 세팅).
      if (canvasRef?.current) canvasRef.current.style.cursor = "";
      return;
    }

    if (wasDragging) {
      // 정지 릴리스 게이트 (owner spec: "드래그 후 멈추면 그 자리에 정지") — sample
      // the last ~80ms of pointer motion; a stationary release yields isFlick=false
      // and the camera holds exactly here (no momentum glide). Only a release WITH
      // motion (a flick) projects a landing target.
      const release = sampleReleaseVelocity({
        history: dragHistoryRef.current,
        releaseTime: performance.now(),
        windowMs: tokens.cameraReleaseVelocityWindowMs,
        minSpeedPxPerMs: tokens.cameraFlickMinSpeed,
      });

      if (reducedMotionRef.current || !release.isFlick) {
        // Hold in place: pin the spring target to the current camera position and
        // clear any residual velocity so it comes to rest exactly here.
        cameraTargetRef.current = { tx: cameraRef.current.x.value, ty: cameraRef.current.y.value, tscale: cameraTargetRef.current.tscale };
        cameraRef.current = {
          ...cameraRef.current,
          x: { value: cameraRef.current.x.value, velocity: 0 },
          y: { value: cameraRef.current.y.value, velocity: 0 },
        };
        dampingRef.current = tokens.cameraDampingDefault;
        return;
      }
      const vx = release.vx;
      const vy = release.vy;
      const px = projectFlickLanding({
        velocityPxPerMs: vx,
        cameraPosition: cameraRef.current.x.value,
        cameraScale: cameraRef.current.scale.value,
        decay: tokens.cameraMomentumDecay,
      });
      const py = projectFlickLanding({
        velocityPxPerMs: vy,
        cameraPosition: cameraRef.current.y.value,
        cameraScale: cameraRef.current.scale.value,
        decay: tokens.cameraMomentumDecay,
      });
      // The projected landing is proportional to velocity (see file header) and
      // usually within the graph's pan bounds — clamp it only so a landing that
      // WOULD exceed the bounds rubber-bands at the edge instead of overshooting
      // into blank canvas. Within-bounds flicks are unaffected by this clamp.
      // The clamp source is the VISIBLE tier's bounds: at spine-only zoom the
      // full 295-node bounds cover a huge legal-but-empty fan region (only ~8
      // spine nodes draw), so a strong flick could land the camera on nothing
      // (owner's "캔버스가 사라져버림", QA 소실 A). Once capabilities start
      // revealing, the full bounds become honest again.
      const world = worldRef.current;
      let clampedLanding = { x: px.landingTarget, y: py.landingTarget };
      if (world) {
        const overviewEntryScale = overviewScaleRef.current * tokens.overviewEntryRatio;
        const zoomRatio = computeZoomRatio(cameraRef.current.scale.value, overviewEntryScale);
        const boundsSource = isSpineOnlyZoom(zoomRatio, tierRevealRef?.current ?? DEFAULT_TIER_REVEAL) ? world.spineBounds : world.bounds;
        clampedLanding = clampPointToPanBounds(px.landingTarget, py.landingTarget, computePanBounds(boundsSource));
      }
      cameraTargetRef.current = { tx: clampedLanding.x, ty: clampedLanding.y, tscale: cameraTargetRef.current.tscale };
      if (userDrivenCameraRef) userDrivenCameraRef.current = true;
      cameraRef.current = {
        ...cameraRef.current,
        x: { value: cameraRef.current.x.value, velocity: px.worldVelocity },
        y: { value: cameraRef.current.y.value, velocity: py.worldVelocity },
      };
      dampingRef.current = tokens.cameraDampingFlick;
      return;
    }

    const action = resolveClickAction(commitClick, focusedSlugRef.current);
    if (action.type === "select") {
      onSelect?.(action.nodeId);
      return;
    }
    // 밀도 게이트 — 빈 공간(노드 미히트) 클릭이 클러스터 칩 위면 확장 토글.
    // 엣지 선택/바닥 해제보다 우선한다(칩은 명시적 대화형 크롬). 노드 클릭=ego
    // 포커스 계약은 위 select 분기에서 이미 처리돼 여기 도달하지 않는다.
    if (
      commitClick &&
      commitClick.nodeId === null &&
      clickPoint &&
      (onToggleCluster || onExpandEgoNeighbors || onExpandClusterBatch)
    ) {
      const chipParent = hitTestClusterChip(clickPoint.x, clickPoint.y);
      if (chipParent === EGO_NEIGHBOR_CHIP_ID) {
        // S2 파트 3a — `이웃 +N` 칩: URL 토글이 아니라 다음 이웃 배치를 점등.
        onExpandEgoNeighbors?.();
        clearClusterHover();
        return;
      }
      // 고팬아웃 배치-공개 — `+N 더보기` 칩(합성 id): URL 토글(접기)이 아니라
      // 그 부모의 다음 배치를 점등. 실제 부모 id 로 해석해 전달.
      const moreParent = chipParent === null ? null : parseClusterMoreChipId(chipParent);
      if (moreParent !== null) {
        onExpandClusterBatch?.(moreParent);
        clearClusterHover();
        return;
      }
      if (chipParent !== null && onToggleCluster) {
        onToggleCluster(chipParent);
        // 토글로 상태(접힘↔펼침)가 바뀌었으니 툴팁을 닫는다 — 재호버 시 새 문구.
        clearClusterHover();
        return;
      }
    }
    // P3b — 빈 공간 클릭: 엣지 근접이면 엣지 선택 (엣지 = 1급 객체).
    // 후보는 양 끝점이 현재 tier 에서 히트 가능한 엣지로 제한 — 안 보이는
    // 엣지가 클릭되는 계약 위반 방지. 실패 시에만 기존 deselect.
    if (commitClick && commitClick.nodeId === null && clickPoint && onSelectEdge) {
      const hit = hitTestEdges(buildEdgeCandidates(), clickPoint.x, clickPoint.y, 7);
      if (hit) {
        onSelectEdge({
          sourceId: hit.sourceId,
          targetId: hit.targetId,
          relationType: hit.relationType,
          declaredBySlug: hit.declaredBySlug,
        });
        return;
      }
    }
    // 엣지만 선택된 상태(노드 포커스 없음)의 바닥 클릭도 해제다 —
    // resolveClickAction 은 노드 포커스만 보므로 여기서 보강 (사용자
    // 실보고: "선 클릭했다가 바닥 클릭하면 원래대로 돌아와야").
    const emptyGroundWithEdgeSelected =
      commitClick !== null && commitClick.nodeId === null && (selectedEdgeRef?.current ?? null) !== null;
    if (action.type === "deselect" || emptyGroundWithEdgeSelected) onPaneClick?.();
  };

  const clearEdgeHover = () => {
    if (hoveredEdgeRef && hoveredEdgeRef.current !== null) {
      hoveredEdgeRef.current = null;
      onHoverEdge?.(null, null);
    }
  };

  /** S2 파트 5C — 클러스터 칩 호버 툴팁 해제(드래그/취소/토글 시). */
  const clearClusterHover = () => {
    if (hoveredClusterIdRef && hoveredClusterIdRef.current !== null) {
      hoveredClusterIdRef.current = null;
      onHoverCluster?.(null);
    }
  };

  const handlePointerCancel = (e?: ReactPointerEvent<HTMLCanvasElement>) => {
    // rank4 터치 핀치줌 — 취소된 터치 포인터 부기(브라우저 제스처 가로채기 등).
    if (e && activeTouchesRef && e.pointerType === "touch") {
      activeTouchesRef.current.delete(e.pointerId);
      if (pinchRef?.current && activeTouchesRef.current.size < 2) pinchRef.current = null;
    }
    clearEdgeHover();
    clearClusterHover();
    const tokens = readTopologyV2TokensOrNull();
    // Abort any in-flight node pin-drag cleanly (release the pin, let it settle).
    if (nodeDragRef.current !== null) {
      simRef.current?.clearPin();
      nodeDragRef.current = null;
      heatRef.current = Math.max(heatRef.current, tokens?.nodeReleaseSettleMs ?? 900);
      dragStartPosRef.current = null;
      // rank4 — 취소도 "grabbing" 커서를 복원한다.
      if (canvasRef?.current) canvasRef.current.style.cursor = "";
    }
    if (!tokens) {
      pointerMachineRef.current = INITIAL_POINTER_MACHINE_STATE;
      return;
    }
    const { next } = transitionPointerState(pointerMachineRef.current, { type: "pointercancel" }, tokens.hysteresisPx);
    pointerMachineRef.current = next;
  };

  const handleWheel = (e: WheelEvent) => {
    // 관문 계약 — 평 휠은 페이지 것이다. 여기서 `preventDefault` 를 하지
    // **않는** 것이 요점이라, 어떤 가드보다 먼저 빠져나간다.
    if (wheelIntent === "page-scroll" && !e.ctrlKey) return;
    e.preventDefault();
    const tokens = readTopologyV2TokensOrNull();
    if (!tokens) return;
    // 트랙패드 글라이드 가드 (소유자 실보고 2026-07-23) — 손가락이 얹힌 채
    // 흘러나오는 |delta| < 4px 미세 wheel 노이즈는 줌으로 합성하지 않는다.
    // 이 노이즈가 "엣지에 마우스만 올려도 화면이 움직/흔들림"의 유입로였다.
    // 핀치(ctrlKey wheel)와 의도적 노치/스크롤은 그대로 통과. preventDefault
    // 는 유지(페이지 스크롤 유출 방지), 호버 카드도 유지(모션이 없으므로).
    const { height: vpH } = viewportRef.current;
    const glideDeltaY = normalizeWheelDeltaY(e.deltaY, e.deltaMode, vpH);
    if (shouldIgnoreWheelGlide(glideDeltaY, e.ctrlKey)) return;
    // 엣지/클러스터 호버 카드 잔류(패널2/3) — 휠/카메라 모션이 시작되는 순간
    // 카드는 즉시 사라져야 한다. 카드는 idle 호버에만 앵커되므로, 줌으로
    // 좌표가 흐르는 동안 pointermove 없이 잔류해 3티어 줌을 관통해 남았다.
    // 모션의 첫 틱에 dismiss 해 카드가 지도 위에 떠다니지 않게 한다.
    clearEdgeHover();
    clearClusterHover();
    // S3 — a live wheel zoom is interactive input; abandon any programmatic
    // camera tween so the crisp interactive spring owns this gesture.
    if (cameraTweenRef) cameraTweenRef.current = null;
    const { width, height } = viewportRef.current;
    const rect = currentRect(e.currentTarget as HTMLCanvasElement);
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    // C1 A1 follow-up (owner feedback — rapid wheel notches felt "dead" even
    // after the ceiling fix): compound off the camera's TARGET
    // (`cameraTargetRef`), not its live/spring-animated value (`cameraRef`).
    // A burst of wheel events arrives faster than the critically-damped
    // spring can visually catch up (~0.34s time constant) — basing each new
    // target on the live (still-lagging) scale meant a rapid flurry of
    // notches barely compounded past the FIRST one's effect, since each
    // subsequent notch's "current scale" was nearly identical to the one
    // before it (measured live: 10 real notches at 30-80ms spacing only
    // reached zoomRatio ~1.05-1.2, nowhere near the capability/element
    // bands). Basing it on the TARGET instead lets intent compound correctly
    // regardless of how fast the events arrive; the spring still smoothly
    // interpolates the VISIBLE camera toward wherever that target ends up. In
    // the steady state (no animation in flight) `cameraTargetRef` already
    // equals `cameraRef`, so a single isolated wheel tick is unaffected.
    const target = cameraTargetRef.current;
    const beforeX = (sx - width / 2) / target.tscale + target.tx;
    const beforeY = (sy - height / 2) / target.tscale + target.ty;
    // Normalize deltaMode first — a line/page-mode wheel reports a tiny raw
    // deltaY that the old `exp(-deltaY*0.0016)` turned into ~0% zoom (the
    // owner's "휠 확대 안 됨" bug). See `interaction/wheel.ts`.
    const pixelDeltaY = normalizeWheelDeltaY(e.deltaY, e.deltaMode, height);
    // C1 owner feedback ("줌 인/아웃 느림") — sensitivity upped 0.0016 → 0.0020,
    // see `interaction/wheel.ts#WHEEL_ZOOM_SENSITIVITY`'s JSDoc.
    const factor = computeWheelZoomFactor(pixelDeltaY);
    // C1 A1 — wheel/pinch zoom-in must reach the ratio-based effective max
    // (`topology-camera-math.ts#computeEffectiveCameraScaleMax`), not the
    // absolute `cameraScaleMax` token — same fix as the spring clamp in
    // `topology-physics-step.ts`.
    const overviewEntryScale = overviewScaleRef.current * tokens.overviewEntryRatio;
    const effectiveScaleMax = computeEffectiveCameraScaleMax(overviewEntryScale, tokens.cameraMaxZoomRatio, tokens.cameraScaleMax);
    const effectiveScaleMin = computeEffectiveCameraScaleMin(overviewEntryScale, tokens.cameraMinZoomRatio, tokens.cameraScaleMin);
    const newScale = Math.min(effectiveScaleMax, Math.max(effectiveScaleMin, target.tscale * factor));
    const afterX = beforeX - (sx - width / 2) / newScale;
    const afterY = beforeY - (sy - height / 2) / newScale;

    cameraTargetRef.current = { tx: afterX, ty: afterY, tscale: newScale };
    if (userDrivenCameraRef) userDrivenCameraRef.current = true;
    dampingRef.current = tokens.cameraDampingDefault;
    // R4 관성 활강 중단 — 휠 줌이 시작되면 진행 중이던 flick 감속의 잔여 x/y
    // 속도를 흘리지 않도록 0 으로 잡는다(줌은 타깃 구동이므로 스케일 축은 무관).
    if (cameraRef.current.x.velocity !== 0 || cameraRef.current.y.velocity !== 0) {
      cameraRef.current = {
        ...cameraRef.current,
        x: { ...cameraRef.current.x, velocity: 0 },
        y: { ...cameraRef.current.y, velocity: 0 },
      };
    }
    // Dive-zoom fix — a live wheel gesture uses the crisp interactive spring
    // for the scale axis (and pan, since point-to-zoom moves both together)
    // until the NEXT programmatic camera move resets it back to transition.
    cameraAngularFreqRef.current = tokens.cameraSpringAngFreqInteractive;
    // WCAG 2.3.3 — 휠 줌도 사용자 개시라 위 핀치와 같은 이유로 스냅하지 않는다.
    // 감속 사용자가 잃는 것은 앱이 **데려가는** 이동뿐이다(ego 다이브·fit·정렬,
    // `topology-physics-step.ts#userDrivenCamera`).
  };

  // W2-B — right-click reuses the SAME tier-aware hit test as pointerdown
  // (`hitVisibleNode`), so the menu only opens over nodes actually hittable
  // at the current altitude/focus (never a semantic-zoom-hidden one). The
  // browser's own context menu is prevented ONLY on that hit path — an
  // off-node right-click (empty canvas) falls through untouched, so users can
  // still reach the OS/browser menu there.
  const handleContextMenu = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const tokens = readTopologyV2TokensOrNull();
    const world = worldRef.current;
    if (!tokens || !world || !onContextMenuNode) return;
    const rect = currentRect(e.currentTarget);
    const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const hitNodeId = hitVisibleNode(world, cameraRef.current, tokens, point.x, point.y);
    if (!hitNodeId) return;
    e.preventDefault();
    onContextMenuNode(hitNodeId, { x: e.clientX, y: e.clientY });
  };

  return { handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel, handleWheel, handleContextMenu };
}
