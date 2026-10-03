/**
 * One shared rAF loop for the gateway's canvas layers, sleeping under the map's ambient-sleep
 * contract (`ambient-sleep.ts`, imported, never copied), or the gateway burns frames forever.
 * rAF never stops: idle is re-decided every frame, so no missed wake can freeze the screen.
 * Reduced motion never registers a client (`tests/contract/gateway-fx-reduced-motion.contract.test.ts`),
 * and `tests/e2e/gateway-idle-sleep.spec.ts` measures the idle floor. Every client is gated by
 * `registerGatedFrameClient`: it draws only while its section is in view in a visible tab.
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
function registerGatewayFrameClient(client: GatewayFrameClient): () => void {
  clients.add(client);
  if (!running) start();
  return () => {
    clients.delete(client);
    if (clients.size === 0 && running) stop();
  };
}


/** A drawing runs only while at least this share of its section is visible. */
const GATEWAY_VISIBLE_RATIO = 0.2;

/**
 * Registers `client` only while at least `GATEWAY_VISIBLE_RATIO` of `owner`'s section is visible
 * and the tab is visible; otherwise the client is unregistered and its canvas holds the last
 * frame. `onChange` hears each switch, so a caller can repaint or reset on return.
 */
export function registerGatedFrameClient(
  owner: Element,
  client: GatewayFrameClient,
  onChange?: (live: boolean) => void,
): () => void {
  const section = owner.closest('section') ?? owner;
  let inView = false;
  let unregister: (() => void) | null = null;
  const sync = (): void => {
    const live = inView && document.visibilityState === 'visible';
    if (live === (unregister !== null)) return;
    if (live) unregister = registerGatewayFrameClient(client);
    else {
      unregister?.();
      unregister = null;
    }
    onChange?.(live);
  };
  const io =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(
          (entries) => {
            const entry = entries[entries.length - 1];
            if (!entry) return;
            inView = entry.isIntersecting && entry.intersectionRatio >= GATEWAY_VISIBLE_RATIO;
            sync();
          },
          { threshold: [0, GATEWAY_VISIBLE_RATIO] },
        )
      : null;
  if (io) io.observe(section);
  else {
    inView = true;
    sync();
  }
  document.addEventListener('visibilitychange', sync);
  return () => {
    io?.disconnect();
    document.removeEventListener('visibilitychange', sync);
    unregister?.();
    unregister = null;
  };
}
