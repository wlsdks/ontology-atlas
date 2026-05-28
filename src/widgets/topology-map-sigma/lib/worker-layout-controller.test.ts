import { describe, it, expect, vi } from 'vitest';
import Graph from 'graphology';
import { createWorkerLayoutController } from './worker-layout-controller';
import type { WorkerToMain } from './layout-protocol';
import type { SigmaNodeAttrs, SigmaEdgeAttrs } from './graph-build';

class FakeWorker {
  onmessage: ((e: MessageEvent<WorkerToMain>) => void) | null = null;
  posted: unknown[] = [];
  postMessage(m: unknown) {
    this.posted.push(m);
  }
  terminate = vi.fn();
  emit(msg: WorkerToMain) {
    this.onmessage?.({ data: msg } as MessageEvent<WorkerToMain>);
  }
}

function makeGraph(): Graph<SigmaNodeAttrs, SigmaEdgeAttrs> {
  const g = new Graph();
  g.addNode('a', { x: 0, y: 0, size: 4 });
  g.addNode('b', { x: 1, y: 1, size: 4 });
  g.addEdge('a', 'b', {});
  // Test fixture only sets the attrs the controller reads; cast satisfies the
  // strict SigmaNodeAttrs/SigmaEdgeAttrs shape the production signature expects.
  return g as unknown as Graph<SigmaNodeAttrs, SigmaEdgeAttrs>;
}

describe('WorkerLayoutController', () => {
  it('sends init with serialized nodes/links on construction', () => {
    const fake = new FakeWorker();
    createWorkerLayoutController(makeGraph(), fake as unknown as Worker, {
      autoStart: true,
      initialAlpha: 0.6,
    });
    const init = fake.posted[0] as { type: string; nodes: unknown[]; links: unknown[] };
    expect(init.type).toBe('init');
    expect(init.nodes).toHaveLength(2);
    expect(init.links).toHaveLength(1);
  });

  it('applies positions message to graph node attributes by index order', () => {
    const g = makeGraph();
    const fake = new FakeWorker();
    createWorkerLayoutController(g, fake as unknown as Worker, {
      autoStart: true,
      initialAlpha: 0.6,
    });
    fake.emit({ type: 'ids', ids: ['a', 'b'] });
    fake.emit({
      type: 'positions',
      x: Float32Array.from([100, 200]),
      y: Float32Array.from([300, 400]),
      active: true,
    });
    expect(g.getNodeAttribute('a', 'x')).toBe(100);
    expect(g.getNodeAttribute('b', 'y')).toBe(400);
  });

  it('forwards pin/drag/release/reheat/tune as worker messages', () => {
    const fake = new FakeWorker();
    const c = createWorkerLayoutController(makeGraph(), fake as unknown as Worker, {
      autoStart: false,
      initialAlpha: 0.3,
    });
    c.pin('a', 5, 6);
    c.drag('a', 7, 8);
    c.release('a');
    c.reheat();
    c.tune({ repel: -400 });
    const types = fake.posted.map((m) => (m as { type: string }).type);
    expect(types).toEqual(['init', 'pin', 'drag', 'release', 'reheat', 'tune']);
  });

  it('terminates the worker on stop', () => {
    const fake = new FakeWorker();
    const c = createWorkerLayoutController(makeGraph(), fake as unknown as Worker, {
      autoStart: false,
      initialAlpha: 0.3,
    });
    c.stop();
    expect(fake.terminate).toHaveBeenCalledOnce();
  });
});
