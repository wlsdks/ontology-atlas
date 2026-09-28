/**
 * One shared rAF loop for the gateway's canvas layers, sleeping under the map's ambient-sleep
 * contract (`ambient-sleep.ts`, imported, never copied), or the gateway burns frames forever.
 * rAF never stops: idle is re-decided every frame, so no missed wake can freeze the screen.
 * Reduced motion never registers a client (`tests/contract/gateway-fx-reduced-motion.contract.test.ts`),
 * and `tests/e2e/gateway-idle-sleep.spec.ts` measures the idle floor.
 */
import {
  ambientSleepFactor,
  isAmbientAsleep,
} from '@/widgets/ontology-map';

interface GatewayFrameTick {
  t: number;
  /** Capped at 64 so a tab returning from the background does not phase-jump the clock. */
  dtMs: number;
  /** Ambient sleep factor in (0,1] multiplying motion speed; asleep frames never reach a client. */
  factor: number;
}

export type GatewayFrameClient = (tick: GatewayFrameTick) => void;

/** Passive, so listening never blocks scrolling. */
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
  if (isAmbientAsleep(factor)) return;
  const tick: GatewayFrameTick = { t, dtMs, factor };
  for (const client of clients) {
    try {
      client(tick);
    } catch (error) {
      /* Unregistered, or a client throwing after clearing its canvas leaves a blank stage forever. */
      clients.delete(client);
      console.error('[gateway-frame-loop] client removed after throwing', error);
    }
  }
}

function start(): void {
  running = true;
  lastInputMs = performance.now(); // Arrival counts as input.
  lastT = performance.now();
  for (const type of INPUT_EVENTS) {
    addEventListener(type, onInput, { passive: true });
  }
  // Capture: the scroll host is the app shell's body slot, not window.
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

/** The first registration starts the loop and listeners; the last cancellation removes them all. */
export function registerGatewayFrameClient(client: GatewayFrameClient): () => void {
  clients.add(client);
  if (!running) start();
  return () => {
    clients.delete(client);
    if (clients.size === 0 && running) stop();
  };
}

