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
  let ids: string[] = [];
  const send = (m: MainToWorker) => worker.postMessage(m);

  const nodes = graph.mapNodes((id, a) => ({ id, x: a.x ?? 0, y: a.y ?? 0, size: a.size ?? 4 }));
  const links: { source: string; target: string }[] = [];
  graph.forEachEdge((_e, _a, s, t) => {
    if (s !== t) links.push({ source: s, target: t });
  });

  worker.onmessage = (e: MessageEvent<WorkerToMain>) => {
    const m = e.data;
    if (m.type === 'ids') {
      ids = m.ids;
      return;
    }
    if (m.type === 'positions') {
      const { x, y } = m;
      // Same batch path as physics.ts onTick: one 'eachNodeAttributesUpdated'.
      graph.updateEachNodeAttributes((id, attrs) => {
        const i = ids.indexOf(id);
        if (i >= 0) {
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
    tune: (opts) => send({ type: 'tune', ...opts }),
    reheat: () => send({ type: 'reheat' }),
    stop: () => {
      send({ type: 'stop' });
      worker.terminate();
    },
  };
}
