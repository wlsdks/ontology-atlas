import { createLayoutEngine } from './layout-engine';
import type { MainToWorker } from './layout-protocol';

const engine = createLayoutEngine();
let loop: ReturnType<typeof setInterval> | null = null;

const post = (msg: unknown, transfer?: Transferable[]) =>
  (self as unknown as Worker).postMessage(msg, transfer ?? []);

function startLoop() {
  if (loop) return;
  // Workers have no requestAnimationFrame; a ~60Hz interval drives ticks and
  // stops itself once the simulation settles (engine.isActive() === false).
  loop = setInterval(() => {
    const { x, y } = engine.tickToArrays();
    const active = engine.isActive();
    post({ type: 'positions', x, y, active }, [x.buffer, y.buffer]);
    if (!active && loop) {
      clearInterval(loop);
      loop = null;
    }
  }, 16);
}

self.onmessage = (e: MessageEvent<MainToWorker>) => {
  const m = e.data;
  switch (m.type) {
    case 'init':
      engine.init({
        nodes: m.nodes,
        links: m.links,
        autoStart: m.autoStart,
        initialAlpha: m.initialAlpha,
      });
      post({ type: 'ids', ids: engine.ids() });
      // Mirror physics.ts: only self-settle when autoStart (small graphs).
      // Large graphs keep their pre-computed (FA2) positions and stay idle
      // until a drag/tune/reheat wakes the loop — no mount-time disturbance.
      if (m.autoStart) startLoop();
      break;
    case 'pin':
      engine.pin(m.id, m.x, m.y);
      startLoop();
      break;
    case 'drag':
      engine.drag(m.id, m.x, m.y);
      break;
    case 'release':
      engine.release(m.id);
      break;
    case 'tune':
      engine.tune(m);
      startLoop();
      break;
    case 'reheat':
      engine.reheat();
      startLoop();
      break;
    case 'stop':
      engine.stop();
      if (loop) {
        clearInterval(loop);
        loop = null;
      }
      break;
  }
};
export {};
