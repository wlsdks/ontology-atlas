/**
 * The gateway's frame loop — one shared rAF driver plus ambient sleep for the
 * gateway's canvas layers (`GatewayFx`, `hero-object-engine`).
 *
 * ## Why it exists
 *
 * Measured 2026-08-19: the gateway (`/ko/`, `/ko/download/`) burned 55–68 ms per
 * second forever, even 40 s after the last input — the exact opposite of the map
 * screen, which reaches zero busy frames 32 s after input stops. Two causes:
 *
 * 1. **Three rAF loops were running** (900 callbacks in a 5 s window = 60 Hz × 3).
 *    The FX layer and the hero object each owned one, and the evidence section's
 *    map engine added a third. Several loops running independently is an accident,
 *    not a design, so the gateway's own two were merged into this one. The map
 *    engine's loop stays where it is — it is owned by that widget and already has
 *    its own sleep, so it only spins noop frames.
 * 2. **Neither gateway loop could sleep.** The map sleeps under the
 *    `ambient-sleep.ts` contract ("alive in your hand, asleep when you put it
 *    down"); the FX layer and the dome rotation lived outside it. This is the
 *    gateway's instance of the failure `idle-gate.ts` warns about: a condition
 *    applied to one side only.
 *
 * ## The contract — same as the map's
 *
 * Every time constant, ramp, and decision is **imported** from
 * `ambient-sleep.ts`; no copy is made here. Until `AMBIENT_SLEEP_DELAY_MS` (30 s)
 * after the last input the factor is 1 — **not one pixel differs from before**.
 * Over the next `AMBIENT_SLEEP_RAMP_MS` (2 s) it ramps 1 → 0, so motion decelerates
 * to a stop rather than cutting, because a step cut reads as breakage. At 0 the
 * client calls are skipped entirely.
 *
 * rAF itself never stops, matching the conservative design in `idle-gate.ts`. The
 * idle decision is re-evaluated every frame, so any input (move, click, wheel,
 * scroll, key, touch) restores the factor to 1 **on the next frame**. There is no
 * wake wiring, and therefore no failure mode where a missed wake freezes the
 * screen. A noop frame costs microseconds — the same order as the map's measured
 * 1.7 ms/s at idle.
 *
 * reduced-motion never reaches here: under it, both consumers skip registering the
 * loop and draw a single static frame instead (gateway FX exception clause (b),
 * `tests/contract/gateway-fx-exception.contract.test.ts`).
 *
 * Gate: `tests/e2e/gateway-idle-sleep.spec.ts` measures whether the per-second
 * synchronous time in rAF callbacks actually reaches the floor after input stops.
 */
import {
  ambientSleepFactor,
  isAmbientAsleep,
} from '@/widgets/topology-map-v2/model/ambient-sleep';

interface GatewayFrameTick {
  /** rAF timestamp (ms) — baseline for paint throttling (30fps layer). */
  t: number;
  /**
   * Interval since the previous tick (ms, cap 64) — ensures the cumulative clock
   * does not phase-jump when a tab returns from background (rAF pauses in hidden tabs).
   */
  dtMs: number;
  /**
   * Ambient sleep coefficient (0,1] — multiplies motion «speed». Frames with 0
   * do not reach the client (there is nothing to draw in that frame — since the clock
   * stopped, it is identical to the last drawn frame).
   */
  factor: number;
}

export type GatewayFrameClient = (tick: GatewayFrameTick) => void;

/** Input treated as "touched" regardless of type — all are passive so they do not block scrolling. */
const INPUT_EVENTS = [
  'pointermove',
  'pointerdown',
  'wheel',
  'keydown',
  'touchstart',
] as const;

const clients = new Set<GatewayFrameClient>();
let running = false;
let rafId = 0;
let lastInputMs = 0;
let lastT = 0;

function onInput(): void {
  lastInputMs = performance.now();
}

function frame(t: number): void {
  if (!running) return;
  rafId = requestAnimationFrame(frame);
  const dtMs = Math.min(Math.max(t - lastT, 0), 64);
  lastT = t;
  const factor = ambientSleepFactor(performance.now(), lastInputMs);
  if (isAmbientAsleep(factor)) return; // Sleep — skip paint front (noop frame)
  const tick: GatewayFrameTick = { t, dtMs, factor };
  for (const client of clients) client(tick);
}

function start(): void {
  running = true;
  lastInputMs = performance.now(); // Arrival itself is "just touched".
  lastT = performance.now();
  for (const type of INPUT_EVENTS) {
    addEventListener(type, onInput, { passive: true });
  }
  // The scroll host for this page is not window but the app shell's body slot
  // (`GatewayFx` actual measurement) — capture grabs any scroll host.
  addEventListener('scroll', onInput, { capture: true, passive: true });
  rafId = requestAnimationFrame(frame);
}

function stop(): void {
  running = false;
  cancelAnimationFrame(rafId);
  for (const type of INPUT_EVENTS) {
    removeEventListener(type, onInput);
  }
  removeEventListener('scroll', onInput, { capture: true });
}

/**
 * Register frame client — cancel via the returned function. The first registration
 * sets up the loop and input listeners; the final cancellation cleans everything up (leaving
 * nothing behind when leaving the gateway).
 */
export function registerGatewayFrameClient(client: GatewayFrameClient): () => void {
  clients.add(client);
  if (!running) start();
  return () => {
    clients.delete(client);
    if (clients.size === 0 && running) stop();
  };
}

