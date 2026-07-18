/**
 * Wheel-delta normalization — the fix for the owner-reported "휠 확대 안 됨"
 * (wheel does not zoom) bug.
 *
 * ROOT CAUSE (P3 live diagnosis, chrome-devtools): the prototype and the P2
 * port both applied `Math.exp(-e.deltaY * 0.0016)` to the *raw* `deltaY`. But
 * `WheelEvent.deltaY` is only expressed in pixels when `deltaMode === 0`
 * (`DOM_DELTA_PIXEL`). Many mice — and some trackpads/OS combos — instead
 * report `deltaMode === 1` (`DOM_DELTA_LINE`) with a tiny `deltaY` (≈3 per
 * notch), or `deltaMode === 2` (`DOM_DELTA_PAGE`). At `0.0016` sensitivity a
 * line-mode notch of 3 yields `exp(-0.0048) ≈ 0.995` — a ~0.5% scale change
 * per notch, i.e. visually no zoom at all. Verified live: a synthetic
 * `deltaMode:1, deltaY:3` × 5 barely moved the camera, while `deltaMode:0,
 * deltaY:120` zoomed normally.
 *
 * Normalizing every wheel event to pixel-equivalent units before the zoom
 * math makes the gesture behave the same across pointing devices. There is no
 * assigned `--topology-v2-*` token for the line-height constant (same "input
 * normalization has no design token" precedent as
 * `topology-pointer-handlers.ts`'s `RIPPLE_PER_NEIGHBOR_DELAY_MS`); it is a
 * device-input fact, not a visual value.
 */

/** Conventional line height (px) used to convert `DOM_DELTA_LINE` deltas — the de-facto browser default (Firefox/Chromium fall back near this). */
export const WHEEL_LINE_HEIGHT_PX = 16;

/**
 * Converts a `WheelEvent`'s `deltaY` to pixel-equivalent units regardless of
 * its `deltaMode`, so downstream zoom math sees a consistent magnitude:
 * - `deltaMode === 0` (pixel): unchanged.
 * - `deltaMode === 1` (line): scaled by `WHEEL_LINE_HEIGHT_PX`.
 * - `deltaMode === 2` (page): scaled by the viewport height.
 */
export function normalizeWheelDeltaY(deltaY: number, deltaMode: number, viewportHeight: number): number {
  if (deltaMode === 1) return deltaY * WHEEL_LINE_HEIGHT_PX;
  if (deltaMode === 2) return deltaY * viewportHeight;
  return deltaY;
}

/**
 * Exponential zoom-factor sensitivity per pixel of (normalized) wheel delta —
 * `factor = exp(-pixelDeltaY * sensitivity)`.
 *
 * FIX (owner feedback — "줌 인/아웃이 느리게 느껴짐", zoom in/out feels
 * slow/sluggish): upped from `0.0016` (~1.21x per a standard 120px notch) to
 * `0.0020` (~1.27x per notch) — sits between d3-zoom's own convention
 * (~1.18x/notch) and Leaflet 2.0's, per the design round's spec. No
 * `--topology-v2-*` token (same "device-input tuning has no design token"
 * precedent as `WHEEL_LINE_HEIGHT_PX` above).
 */
export const WHEEL_ZOOM_SENSITIVITY = 0.002;

/**
 * Converts a normalized pixel-equivalent wheel delta into a multiplicative
 * zoom factor. Negative `pixelDeltaY` (scroll up / zoom in) yields a factor >
 * 1; positive (scroll down / zoom out) yields a factor < 1.
 */
export function computeWheelZoomFactor(pixelDeltaY: number, sensitivity: number = WHEEL_ZOOM_SENSITIVITY): number {
  return Math.exp(-pixelDeltaY * sensitivity);
}
