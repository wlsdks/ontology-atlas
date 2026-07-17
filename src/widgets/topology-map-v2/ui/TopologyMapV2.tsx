"use client";

import { useEffect, useRef } from "react";

import {
  getTopologyV2Tokens,
  TopologyV2TokenError,
} from "../tokens/read-topology-v2-tokens";

/**
 * `TopologyMapV2` — the single canvas-2D render engine that replaces
 * `TopologyMapCanvas` (DOM/CSS) + `SigmaTopology` (WebGL) behind the
 * `topology-map-v2` feature flag (`docs/TOPOLOGY-V2-DESIGN.md` §1.2 "하나의
 * 렌더 엔진으로 통합"). Phase 0's adapter contract (§4.2) is this component's
 * props — HomePage/ProjectDetailPage swap their existing
 * `TopologyMapCanvas`/`SigmaTopology` call sites for this one, unchanged
 * upstream state management (selected slug, path query, etc).
 *
 * THIS FILE IS SCAFFOLD ONLY (P2, `docs/TOPOLOGY-V2-DESIGN.md` §4). The
 * mount/resize/rAF-loop/pointer-wiring shell is fully implemented; the
 * physics (`engine/camera.ts`), layout (`model/layout.ts`), and all drawing
 * (`render/*.ts`) are still `throw`-ing stubs (see those files' JSDoc), so
 * every frame currently just paints a token-colored placeholder + "v2
 * scaffold" text — never the real graph. Each TODO hook below is the exact
 * slot the lead wires real logic into for P3+.
 */

export interface TopologyV2Node {
  id: string;
  label: string;
  kind: "project" | "domain" | "capability" | "element";
  size: number;
  x: number;
  y: number;
  isHub: boolean;
  ownerKey: string | null;
  recentlyUpdated: boolean;
  fullDegree: number;
}

export interface TopologyV2Edge {
  source: string;
  target: string;
  relationType: string;
  relationQuality: "strong" | "weak" | null;
  evidenceCount: number;
  kind: "contains" | "depends";
}

export interface TopologyV2Focus {
  selectedSlug: string | null;
  depthLimit: number | null;
  searchQuery: string;
  activeCategory: string | null;
  hubsOnly: boolean;
}

export interface TopologyV2Overlays {
  recentPulse: boolean;
  ownerTint: boolean;
  backrefHighlight: boolean;
}

export interface TopologyV2Forces {
  repel: number;
  linkDistance: number;
  collideMultiplier: number;
}

/**
 * Adapter contract (`docs/TOPOLOGY-V2-PHASE0.md` §4.2, confirmed unchanged
 * by `docs/TOPOLOGY-V2-DESIGN.md` §5.3 — v2 only replaces rendering, not
 * the upstream state/callback contract).
 */
export interface TopologyMapV2Props {
  nodes: readonly TopologyV2Node[];
  edges: readonly TopologyV2Edge[];
  focus: TopologyV2Focus;
  overlays: TopologyV2Overlays;
  changedSlugs?: ReadonlySet<string>;
  livePhysics: boolean;
  forces?: TopologyV2Forces;
  /** Increment to re-run fit-to-bounds (HomePage "지도 맞추기"). */
  fitViewToken: number;
  /** Increment to force a full relayout. */
  relayoutToken: number;
  onSelect?: (slug: string) => void;
  onOpen?: (slug: string) => void;
  onPaneClick?: () => void;
  onVisibleCountChange?: (visible: number) => void;
  onGraphStatsChange?: (stats: { nodes: number; relations: number }) => void;
  /** Embed mode (project detail neighbor map) — reduced physics/chrome. */
  minimal?: boolean;
}

/**
 * Resizes the canvas's backing store to match its CSS box × devicePixelRatio
 * (mechanical — implemented fully, no TODO). Returns the CSS-pixel viewport
 * size for the caller's layout/camera math.
 */
function resizeCanvasToElement(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
): { viewportWidth: number; viewportHeight: number; devicePixelRatio: number } {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const backingWidth = Math.max(1, Math.round(cssWidth * dpr));
  const backingHeight = Math.max(1, Math.round(cssHeight * dpr));
  if (canvas.width !== backingWidth) canvas.width = backingWidth;
  if (canvas.height !== backingHeight) canvas.height = backingHeight;
  return { viewportWidth: cssWidth, viewportHeight: cssHeight, devicePixelRatio: dpr };
}

/**
 * Placeholder frame paint — token-colored background + "v2 scaffold" text.
 * Replaced in P3 by the real composition:
 * `render/grid.draw` → `render/starfield.drawStarDust` → hull (TODO, no
 * owner file yet) → `render/traces.draw` (contains, then depends) → pulses
 * → `render/node-shapes.draw` (all nodes) → `render/starfield.drawDiffractionSpike`
 * (bright-star nodes only) → `render/labels.draw` (all nodes) — this exact
 * order matches the prototype's `render()` (§13).
 */
function paintPlaceholderFrame(
  ctx: CanvasRenderingContext2D,
  viewportWidth: number,
  viewportHeight: number,
  devicePixelRatio: number,
): void {
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.clearRect(0, 0, viewportWidth, viewportHeight);

  let backgroundColor = "#0a0a0d";
  let textColor = "#5e6ad2";
  try {
    const tokens = getTopologyV2Tokens();
    backgroundColor = tokens.canvasBgNear;
    textColor = tokens.indigo;
  } catch (err) {
    // Token drift guard threw (missing/renamed CSS custom property) — this
    // is exactly the failure mode read-topology-v2-tokens.ts is designed to
    // surface loudly. Placeholder still paints (with safe fallback colors)
    // so the scaffold doesn't crash the page; the console error is the
    // signal a developer needs to fix app/globals.css.
    if (err instanceof TopologyV2TokenError) {
      console.error("[topology-map-v2] token drift:", err.message);
    }
  }

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, viewportWidth, viewportHeight);

  ctx.fillStyle = textColor;
  ctx.font = "600 14px -apple-system, 'SF Pro Text', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("v2 scaffold", viewportWidth / 2, viewportHeight / 2);
}

export function TopologyMapV2(props: TopologyMapV2Props) {
  const { minimal } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef({ viewportWidth: 0, viewportHeight: 0, devicePixelRatio: 1 });

  // --- resize wiring (mechanical, fully implemented) ---------------------
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const applyResize = () => {
      const rect = container.getBoundingClientRect();
      viewportRef.current = resizeCanvasToElement(canvas, rect.width, rect.height);
      // TODO(lead): once model/layout.ts + engine/camera.ts are implemented,
      // a resize should also re-run fitBounds (reused from
      // topology-map-canvas/lib/camera.ts per docs/TOPOLOGY-V2-DESIGN.md §1.3)
      // so the camera's overview target tracks the new viewport size.
    };

    applyResize();

    if (typeof ResizeObserver === "undefined") {
      // jsdom / very old browsers — fall back to a window resize listener.
      window.addEventListener("resize", applyResize);
      return () => window.removeEventListener("resize", applyResize);
    }

    const observer = new ResizeObserver(applyResize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // --- single rAF loop (mechanical shell, fully implemented) --------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frameHandle = 0;
    let cancelled = false;

    const frame = () => {
      if (cancelled) return;
      const { viewportWidth, viewportHeight, devicePixelRatio } = viewportRef.current;

      // TODO(lead): this is where the real per-frame pipeline goes, in the
      // prototype's frame() order (§14):
      //   1. engine/camera.ts#stepCamera (spring/momentum integration)
      //   2. model/altitude.ts#computeFarT (from the just-stepped camera.scale)
      //   3. model/focus-state.ts#stepEmphasis (per node)
      //   4. render/* draw calls, in the order documented on paintPlaceholderFrame()
      // None of that is wired yet — engine/model/render are all throwing
      // stubs — so this loop only paints the static placeholder for now.
      paintPlaceholderFrame(ctx, viewportWidth, viewportHeight, devicePixelRatio);

      frameHandle = requestAnimationFrame(frame);
    };

    frameHandle = requestAnimationFrame(frame);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameHandle);
    };
  }, []);

  // --- pointer wiring (TODO hooks — handlers exist, bodies intentionally
  // empty until interaction/pointer-state-machine.ts + engine/hysteresis.ts
  // are implemented) ------------------------------------------------------
  const handlePointerDown = () => {
    // TODO(lead): hit-test against model/layout.ts coordinates, then call
    // interaction/pointer-state-machine.ts#transitionPointerState with a
    // "pointerdown" event.
  };
  const handlePointerMove = () => {
    // TODO(lead): feed a "pointermove" event through transitionPointerState;
    // while idle (not pressed/dragging), also drive hover via
    // model/focus-state.ts (suppressed while a focus is active).
  };
  const handlePointerUp = () => {
    // TODO(lead): feed a "pointerup" event through transitionPointerState;
    // a resulting commitClick maps to props.onSelect / props.onPaneClick.
  };
  const handlePointerCancel = () => {
    // TODO(lead): feed a "pointercancel" event through transitionPointerState.
  };
  const handleWheel = () => {
    // TODO(lead): zoom-at-cursor via engine/camera.ts, respecting
    // --topology-v2-camera-scale-min/-max.
  };

  return (
    <div
      ref={containerRef}
      data-testid="topology-map-v2"
      data-map-engine="v2"
      data-minimal={minimal ? "true" : "false"}
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      <canvas
        ref={canvasRef}
        data-testid="topology-map-v2-canvas"
        style={{ display: "block", width: "100%", height: "100%", touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onWheel={handleWheel}
      />
    </div>
  );
}
