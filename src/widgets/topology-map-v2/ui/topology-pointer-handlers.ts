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

import type { PointerEvent as ReactPointerEvent } from "react";

import { clampPointToPanBounds, computePanBounds, type CameraAxes, type CameraTarget } from "../engine/camera";
import { projectFlickLanding, sampleReleaseVelocity } from "../engine/momentum";
import { scheduleRipple } from "../model/focus-state";
import type { ForceSimulation } from "../model/force-layout";
import { computeZoomRatio, DEFAULT_TIER_REVEAL, isSpineOnlyZoom, nodeTierAlpha } from "../model/tier-visibility";
import { computeDragTugSets, type DragTugSets } from "../interaction/drag-tug";
import { computeGrabOffsetWorld, computePinWorld, type WorldOffset } from "../interaction/node-drag";
import {
  INITIAL_POINTER_MACHINE_STATE,
  transitionPointerState,
  type PointerMachineState,
} from "../interaction/pointer-state-machine";
import { normalizeWheelDeltaY } from "../interaction/wheel";
import { computeEffectiveCameraScaleMax, computeEffectiveCameraScaleMin, hitTestWorld, screenToWorld } from "./topology-camera-math";
import { readTopologyV2TokensOrNull } from "./topology-read-tokens";
import type { TopologyWorld } from "./topology-world";

/** Frames of sim warmth to top up while a node is actively pin-dragged (kept warm so neighbors keep reflowing). */
export const NODE_DRAG_HEAT_FRAMES = 20;
/** A settle burst after a node is released so the graph (and the dropped node) relaxes around the drop, Obsidian-style. */
export const NODE_RELEASE_HEAT_FRAMES = 90;
/** Minimum tier alpha for a node to be grabbable/hoverable — hidden (semantic-zoom-gated) nodes must not be hit. */
const HITTABLE_MIN_TIER_ALPHA = 0.5;

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
  worldRef: Ref<TopologyWorld | null>;
  cameraRef: Ref<CameraAxes>;
  cameraTargetRef: Ref<CameraTarget>;
  dampingRef: Ref<number>;
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
  focusedSlugRef: Ref<string | null>;
  hoveredNodeIdRef: Ref<string | null>;
  rippleStartRef: Ref<Map<string, number>>;
  reducedMotionRef: Ref<boolean>;
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
  onSelect?: (slug: string) => void;
  onPaneClick?: () => void;
}

export interface TopologyPointerHandlers {
  handlePointerDown: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  handlePointerMove: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  handlePointerUp: () => void;
  handlePointerCancel: () => void;
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
}

/** Builds the five pointer/wheel handlers, closing over the hook's refs (cheap — plain closures, no hook rules to satisfy). */
export function createTopologyPointerHandlers(refs: PointerHandlerRefs): TopologyPointerHandlers {
  const {
    worldRef,
    cameraRef,
    cameraTargetRef,
    dampingRef,
    viewportRef,
    pointerMachineRef,
    dragHistoryRef,
    camStartAtDownRef,
    canvasRectRef,
    focusedSlugRef,
    hoveredNodeIdRef,
    rippleStartRef,
    reducedMotionRef,
    simRef,
    heatRef,
    nodeDragRef,
    dragAffectedSetRef,
    dragStartPosRef,
    overviewScaleRef,
    onSelect,
    onPaneClick,
  } = refs;

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
    return hitTestWorld(
      world,
      camera,
      viewportRef.current.width,
      viewportRef.current.height,
      tokens,
      px,
      py,
      (node) => {
        if (nodeTierAlpha(node.kind, node.isHub, zoomRatio, DEFAULT_TIER_REVEAL) >= HITTABLE_MIN_TIER_ALPHA) return true;
        return focusedNodeId !== null && (node.id === focusedNodeId || neighborsOfFocused?.has(node.id) === true);
      },
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

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const tokens = readTopologyV2TokensOrNull();
    const world = worldRef.current;
    if (!tokens || !world) return;
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
          heatRef.current = NODE_DRAG_HEAT_FRAMES;
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
      const drag = nodeDragRef.current;
      if (drag && sim) {
        const pw = screenToWorld(cameraRef.current, width, height, point.x, point.y);
        const pin = computePinWorld(pw.x, pw.y, drag.offset);
        sim.movePin(pin.x, pin.y);
        heatRef.current = NODE_DRAG_HEAT_FRAMES;
        return;
      }

      const anchor = next.downPoint ?? point;
      const worldDX = (point.x - anchor.x) / cameraRef.current.scale.value;
      const worldDY = (point.y - anchor.y) / cameraRef.current.scale.value;
      const nextX = camStartAtDownRef.current.x - worldDX;
      const nextY = camStartAtDownRef.current.y - worldDY;
      // 1:1 tracking, no lag — drag follows the pointer directly, the spring
      // only takes back over once the flick is released (`engine/momentum.ts`).
      cameraRef.current = { ...cameraRef.current, x: { value: nextX, velocity: 0 }, y: { value: nextY, velocity: 0 } };
      cameraTargetRef.current = { ...cameraTargetRef.current, tx: nextX, ty: nextY };
      dragHistoryRef.current.push({ x: point.x, y: point.y, t: performance.now() });
      // Keep ~10 samples (~160ms at 60fps) so the release-velocity window
      // (`--topology-v2-camera-release-velocity-window-ms`) is always covered,
      // even on lower-frame-rate devices. The sampler filters by timestamp, so
      // extra old samples are harmless.
      if (dragHistoryRef.current.length > 10) dragHistoryRef.current.shift();
      return;
    }

    if (next.phase !== "idle" || focusedSlugRef.current) return; // pressed-not-dragging, or focus owns emphasis
    const hitNodeId = hitVisibleNode(world, cameraRef.current, tokens, point.x, point.y);
    if (hitNodeId === hoveredNodeIdRef.current) return;
    hoveredNodeIdRef.current = hitNodeId;
    if (hitNodeId) {
      const neighborIds = [...(world.neighborMap.get(hitNodeId) ?? [])];
      const schedule = scheduleRipple(hitNodeId, performance.now(), neighborIds, tokens.rippleStaggerMs, RIPPLE_PER_NEIGHBOR_DELAY_MS);
      for (const entry of schedule) rippleStartRef.current.set(entry.nodeId, entry.startAtMs);
    }
  };

  const handlePointerUp = () => {
    const tokens = readTopologyV2TokensOrNull();
    if (!tokens) return;
    const wasDragging = pointerMachineRef.current.phase === "dragging";
    const { next, commitClick } = transitionPointerState(pointerMachineRef.current, { type: "pointerup" }, tokens.hysteresisPx);
    pointerMachineRef.current = next;

    // Node pin-drag release: unpin and give the graph a settle burst so it
    // (and the dropped node) relaxes around the drop, Obsidian-style. No
    // camera flick, no click commit (the state machine already suppressed the
    // click for a drag).
    if (nodeDragRef.current !== null) {
      simRef.current?.clearPin();
      nodeDragRef.current = null;
      heatRef.current = Math.max(heatRef.current, NODE_RELEASE_HEAT_FRAMES);
      // C1 B1: stop tracking Δ (drag ended) — `dragAffectedSetRef` stays set
      // through the settle burst above (B2), cleared once heat reaches 0
      // (`use-topology-loop.ts`'s rAF loop).
      dragStartPosRef.current = null;
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
        const boundsSource = isSpineOnlyZoom(zoomRatio, DEFAULT_TIER_REVEAL) ? world.spineBounds : world.bounds;
        clampedLanding = clampPointToPanBounds(px.landingTarget, py.landingTarget, computePanBounds(boundsSource));
      }
      cameraTargetRef.current = { tx: clampedLanding.x, ty: clampedLanding.y, tscale: cameraTargetRef.current.tscale };
      cameraRef.current = {
        ...cameraRef.current,
        x: { value: cameraRef.current.x.value, velocity: px.worldVelocity },
        y: { value: cameraRef.current.y.value, velocity: py.worldVelocity },
      };
      dampingRef.current = tokens.cameraDampingFlick;
      return;
    }

    if (!commitClick) return;
    if (commitClick.nodeId === null) {
      if (focusedSlugRef.current) onPaneClick?.();
    } else if (commitClick.nodeId === focusedSlugRef.current) {
      onPaneClick?.();
    } else {
      onSelect?.(commitClick.nodeId);
    }
  };

  const handlePointerCancel = () => {
    // Abort any in-flight node pin-drag cleanly (release the pin, let it settle).
    if (nodeDragRef.current !== null) {
      simRef.current?.clearPin();
      nodeDragRef.current = null;
      heatRef.current = Math.max(heatRef.current, NODE_RELEASE_HEAT_FRAMES);
      dragStartPosRef.current = null;
    }
    const tokens = readTopologyV2TokensOrNull();
    if (!tokens) {
      pointerMachineRef.current = INITIAL_POINTER_MACHINE_STATE;
      return;
    }
    const { next } = transitionPointerState(pointerMachineRef.current, { type: "pointercancel" }, tokens.hysteresisPx);
    pointerMachineRef.current = next;
  };

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const tokens = readTopologyV2TokensOrNull();
    if (!tokens) return;
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
    const factor = Math.exp(-pixelDeltaY * 0.0016);
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
    dampingRef.current = tokens.cameraDampingDefault;
    if (reducedMotionRef.current) {
      cameraRef.current = { x: { value: afterX, velocity: 0 }, y: { value: afterY, velocity: 0 }, scale: { value: newScale, velocity: 0 } };
    }
  };

  return { handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel, handleWheel };
}
