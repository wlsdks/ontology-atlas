import type Graph from 'graphology';
import type { PhysicsController } from './physics';
import type { SigmaNodeAttrs, SigmaEdgeAttrs } from './graph-build';
import type { MainToWorker, WorkerToMain } from './layout-protocol';

/**
 * Main-thread controller that drives the layout worker while exposing the
 * EXACT `PhysicsController` interface (pin/drag/release/tune/reheat/stop) so
 * every call site in SigmaTopology is unchanged. Force computation happens in
 * the worker; here we only serialize the graph in and apply positions out via
 * graphology's batch `updateEachNodeAttributes` (one event → Sigma auto-refresh,
 * same path as physics.ts onTick).
 */
export function createWorkerLayoutController(
  graph: Graph<SigmaNodeAttrs, SigmaEdgeAttrs>,
  worker: Worker,
  options: { autoStart: boolean; initialAlpha: number },
): PhysicsController {
  let indexById = new Map<string, number>();
  const send = (m: MainToWorker) => worker.postMessage(m);

  const nodes = graph.mapNodes((id, a) => ({ id, x: a.x ?? 0, y: a.y ?? 0, size: a.size ?? 4 }));
  const links: { source: string; target: string }[] = [];
  graph.forEachEdge((_e, _a, s, t) => {
    if (s !== t) links.push({ source: s, target: t });
  });

  worker.onmessage = (e: MessageEvent<WorkerToMain>) => {
    const m = e.data;
    if (m.type === 'ids') {
      // O(1) id→index lookup so the per-frame positions apply stays O(N), not
      // O(N²) — critical at large vault scale (the apply runs on the main thread).
      indexById = new Map(m.ids.map((id, i) => [id, i]));
      return;
    }
    if (m.type === 'positions') {
      const { x, y } = m;
      // Same batch path as physics.ts onTick: one 'eachNodeAttributesUpdated'.
      graph.updateEachNodeAttributes((id, attrs) => {
        const i = indexById.get(id);
        if (i !== undefined) {
          attrs.x = x[i];
          attrs.y = y[i];
        }
        return attrs;
      });
    }
  };

  send({ type: 'init', nodes, links, autoStart: options.autoStart, initialAlpha: options.initialAlpha });

  return {
    pin: (id, x, y) => send({ type: 'pin', id, x, y }),
    drag: (id, x, y) => send({ type: 'drag', id, x, y }),
    release: (id) => send({ type: 'release', id }),
    pinGroup: (positions) => {
      positions.forEach((pos, id) => send({ type: 'pin', id, x: pos.x, y: pos.y }));
    },
    dragGroup: (positions) => {
      positions.forEach((pos, id) => send({ type: 'drag', id, x: pos.x, y: pos.y }));
    },
    releaseGroup: (ids) => {
      for (const id of ids) send({ type: 'release', id });
    },
    tune: (opts) => send({ type: 'tune', ...opts }),
    reheat: () => send({ type: 'reheat' }),
    stop: () => {
      send({ type: 'stop' });
      worker.terminate();
    },
  };
}
