# Topology Layout Web Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all topology force computation (initial settle + live spring-mass simulation) off the main thread into a Web Worker, so the Tauri WKWebView main thread/compositor stays free and large vaults stay smooth during drag / auto-arrange / mount.

**Architecture:** A dedicated module Web Worker owns a `d3-force` simulation over plain serializable node/link arrays (no graphology inside the worker). The worker streams back position arrays (transferable `Float32Array`) on every tick; the main thread applies them via graphology's batch `updateEachNodeAttributes` (single event → Sigma auto-refresh). A new `WorkerLayoutController` implements the **existing `PhysicsController` interface** (`pin/drag/release/tune/reheat/stop`) so every call site in `SigmaTopology.tsx` is unchanged. A main-thread fallback (`startPhysics`) is kept for environments without `Worker`.

**Tech Stack:** TypeScript, Next.js 16 (`output: 'export'`, Turbopack), d3-force, graphology, Sigma.js, Tauri 2 (WKWebView), Vitest.

**Why (evidence):** Measured 2026-05-28 — Sigma WebGL render is NOT the bottleneck (2000 nodes / 3130 edges @ 4× CPU throttle = 120fps, refresh 25.6ms). The only per-frame/per-op main-thread cost that scales is force computation: `settleLayout` (synchronous `forceAtlas2.assign` in a `useMemo`, `SigmaTopology.tsx:561`) and the live `d3-force` sim (`physics.ts`). `physics.ts:121-124` already documents that large vaults peg the main thread. WKWebView has less main-thread/compositor headroom than Chrome → "Chrome OK, desktop janky on drag/auto-arrange."

**Key constraints discovered:**
- `next.config.ts`: `output: 'export'`, no custom webpack/turbopack config. Worker must bundle via `new Worker(new URL('./x.worker.ts', import.meta.url), { type: 'module' })`.
- `tauri.conf.json` CSP: `"script-src": "'self'"`, **no `worker-src`**. A same-origin worker chunk should pass, but if the bundler emits a blob shim it will be blocked → must add `"worker-src": "'self' blob:"`. **This is what Task 1 de-risks.**
- d3-force uses `d3-timer`, which falls back to `setTimeout(~17ms)` inside a worker (no `requestAnimationFrame` in workers) → ~60Hz sim. This is fine and intended.

---

## File Structure

- `src/widgets/topology-map-sigma/lib/layout-engine.ts` — **new**. Pure, worker-agnostic d3-force engine. Owns sim nodes/links, exposes `init/pin/drag/release/tune/reheat/tickToArrays/stop`. No DOM, no graphology, no `self`. Unit-testable in Vitest.
- `src/widgets/topology-map-sigma/lib/layout-protocol.ts` — **new**. Shared message type definitions (`MainToWorker`, `WorkerToMain`).
- `src/widgets/topology-map-sigma/lib/layout.worker.ts` — **new**. Thin worker entry: `onmessage` → drives `layout-engine`, posts position arrays.
- `src/widgets/topology-map-sigma/lib/worker-layout-controller.ts` — **new**. Main-thread `WorkerLayoutController` implementing `PhysicsController`. Owns the `Worker`, serializes the graphology graph in, applies positions out.
- `src/widgets/topology-map-sigma/lib/physics.ts` — **keep** as the main-thread fallback (unchanged behavior).
- `src/widgets/topology-map-sigma/ui/SigmaTopology.tsx` — **modify** `:545-591` (settle) and `:756-761` (controller creation) only.
- `src-tauri/tauri.conf.json` — **modify** CSP (`:26-34`) to add `worker-src`.
- `docs/ontology/` — **modify** (new capability + element node, via MCP).

---

## Task 1: De-risk — module worker survives static export + Tauri CSP (GATE)

**This task gates the rest. Do not proceed to Task 2 until the worker round-trips through `pnpm build` and a served static export.**

**Files:**
- Create: `src/widgets/topology-map-sigma/lib/layout.worker.ts`
- Modify: `src/widgets/topology-map-sigma/ui/SigmaTopology.tsx` (temporary probe, removed at end of task)
- Modify: `src-tauri/tauri.conf.json:26-34`

- [ ] **Step 1: Create a trivial echo worker**

```ts
// src/widgets/topology-map-sigma/lib/layout.worker.ts
// Phase-0 echo. Replaced by the real engine in Task 3.
self.onmessage = (e: MessageEvent) => {
  const { ping } = e.data ?? {};
  (self as unknown as Worker).postMessage({ pong: ping, at: Date.now() });
};
export {};
```

- [ ] **Step 2: Add a temporary probe in SigmaTopology mount effect**

In `SigmaTopology.tsx`, inside the existing Sigma-init `useEffect` (just after `physicsRef.current = physics;` at `:761`), add:

```ts
// TEMP probe (Task 1 de-risk) — REMOVE before commit of Task 1.
try {
  const w = new Worker(new URL('../lib/layout.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e) => { console.info('[worker-derisk] pong', e.data); w.terminate(); };
  w.postMessage({ ping: 'derisk' });
} catch (err) {
  console.error('[worker-derisk] failed', err);
}
```

- [ ] **Step 3: Verify in dev (Turbopack)**

Run: dev server is already up (`pnpm dev`). Navigate to `http://localhost:3000/ko/topology`.
Expected: browser console shows `[worker-derisk] pong { pong: 'derisk', at: ... }`. No CSP / bundling error.

- [ ] **Step 4: Verify the static export emits the worker chunk**

Run: `pnpm build`
Expected: build succeeds. Then:
Run: `grep -rl "pong" out/_next/static/ | head` (or `find out -name '*.js' | xargs grep -l "layout.worker" 2>/dev/null`)
Expected: a worker chunk is present in `out/_next/static/`.

- [ ] **Step 5: Verify the served static export runs the worker (proxy for WKWebView origin)**

Run: `npx serve out -l 4500` in the background, then load `http://localhost:4500/ko/topology/` in the browser.
Expected: same `[worker-derisk] pong` console line. This proves the worker loads from a static, same-origin context (no dev server) — the closest reproducible proxy for the Tauri `frontendDist` load.

- [ ] **Step 6: Proactively widen the Tauri CSP for workers**

Modify `src-tauri/tauri.conf.json` security.csp — add a `worker-src` key:

```json
        "script-src": "'self'",
        "worker-src": "'self' blob:",
        "style-src": "'unsafe-inline' 'self'"
```

(`blob:` covers the case where Turbopack wraps the worker in a blob shim; `'self'` covers the direct-chunk case.)

- [ ] **Step 7: Remove the temporary probe**

Delete the Step-2 probe block from `SigmaTopology.tsx`. Keep `layout.worker.ts` (it becomes the real worker in Task 3).

- [ ] **Step 8: Commit**

```bash
git add src/widgets/topology-map-sigma/lib/layout.worker.ts src-tauri/tauri.conf.json
git commit -m "chore: de-risk topology layout web worker bundling + Tauri CSP worker-src"
```

> **Manual checkpoint (cannot be automated here):** Launch `pnpm desktop:dev` once and confirm topology loads with no CSP error in the macOS app. If the worker is blocked, the console will show a CSP violation naming `worker-src`/`script-src`; adjust the CSP accordingly before continuing. Report the result before Task 2.

---

## Task 2: Pure d3-force layout engine (worker-agnostic, TDD)

**Files:**
- Create: `src/widgets/topology-map-sigma/lib/layout-engine.ts`
- Test: `src/widgets/topology-map-sigma/lib/layout-engine.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/widgets/topology-map-sigma/lib/layout-engine.test.ts
import { describe, it, expect } from 'vitest';
import { createLayoutEngine } from './layout-engine';

describe('layout-engine', () => {
  it('returns stable index-ordered positions after init', () => {
    const engine = createLayoutEngine();
    engine.init({
      nodes: [
        { id: 'a', x: 0, y: 0, size: 4 },
        { id: 'b', x: 10, y: 0, size: 4 },
      ],
      links: [{ source: 'a', target: 'b' }],
      autoStart: false,
      initialAlpha: 0.3,
    });
    const out = engine.tickToArrays();
    expect(out.x).toBeInstanceOf(Float32Array);
    expect(out.x.length).toBe(2);
    expect(out.y.length).toBe(2);
    expect(Number.isFinite(out.x[0])).toBe(true);
  });

  it('pins a node to fx/fy so its position is held', () => {
    const engine = createLayoutEngine();
    engine.init({
      nodes: [{ id: 'a', x: 0, y: 0, size: 4 }, { id: 'b', x: 50, y: 50, size: 4 }],
      links: [{ source: 'a', target: 'b' }],
      autoStart: true,
      initialAlpha: 0.8,
    });
    engine.pin('a', 123, 456);
    for (let i = 0; i < 30; i++) engine.tickToArrays();
    const out = engine.tickToArrays();
    expect(out.x[0]).toBeCloseTo(123, 3);
    expect(out.y[0]).toBeCloseTo(456, 3);
  });

  it('release clears the pin', () => {
    const engine = createLayoutEngine();
    engine.init({ nodes: [{ id: 'a', x: 0, y: 0, size: 4 }], links: [], autoStart: false, initialAlpha: 0.3 });
    engine.pin('a', 5, 5);
    engine.release('a');
    // no throw, index map intact
    expect(engine.tickToArrays().x.length).toBe(1);
  });

  it('reheat does not throw and keeps node count', () => {
    const engine = createLayoutEngine();
    engine.init({ nodes: [{ id: 'a', x: 0, y: 0, size: 4 }, { id: 'b', x: 9, y: 9, size: 4 }], links: [], autoStart: false, initialAlpha: 0.2 });
    engine.reheat();
    expect(engine.tickToArrays().x.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/widgets/topology-map-sigma/lib/layout-engine.test.ts`
Expected: FAIL — `createLayoutEngine` not found.

- [ ] **Step 3: Implement the engine**

```ts
// src/widgets/topology-map-sigma/lib/layout-engine.ts
import {
  forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation,
  type Simulation, type SimulationLinkDatum, type SimulationNodeDatum,
} from 'd3-force';

export interface LayoutNodeInput { id: string; x: number; y: number; size: number; }
export interface LayoutLinkInput { source: string; target: string; }
export interface LayoutInit {
  nodes: LayoutNodeInput[];
  links: LayoutLinkInput[];
  autoStart: boolean;
  initialAlpha: number;
}

interface SimNode extends SimulationNodeDatum { id: string; collide: number; }
interface SimLink extends SimulationLinkDatum<SimNode> { source: string | SimNode; target: string | SimNode; }

export interface LayoutEngine {
  init(opts: LayoutInit): void;
  /** Advance one tick and return current positions in stable init-node order. */
  tickToArrays(): { x: Float32Array; y: Float32Array };
  /** Stable node id order matching tickToArrays indices. */
  ids(): string[];
  pin(id: string, x: number, y: number): void;
  drag(id: string, x: number, y: number): void;
  release(id: string): void;
  tune(opts: { repel?: number; linkDistance?: number; collideMultiplier?: number }): void;
  reheat(): void;
  /** True while alpha is above alphaMin (sim still doing meaningful work). */
  isActive(): boolean;
  stop(): void;
}

export function createLayoutEngine(): LayoutEngine {
  let sim: Simulation<SimNode, SimLink> | null = null;
  let nodes: SimNode[] = [];
  let byId = new Map<string, SimNode>();
  let order: string[] = [];

  return {
    init({ nodes: nIn, links, autoStart, initialAlpha }) {
      nodes = nIn.map((n) => ({ id: n.id, x: n.x, y: n.y, collide: (n.size ?? 4) + 4 }));
      byId = new Map(nodes.map((n) => [n.id, n]));
      order = nodes.map((n) => n.id);
      const simLinks: SimLink[] = links
        .filter((l) => l.source !== l.target)
        .map((l) => ({ source: l.source, target: l.target }));
      sim = forceSimulation(nodes)
        .velocityDecay(0.4).alphaDecay(0.035).alphaMin(0.002)
        .force('link', forceLink<SimNode, SimLink>(simLinks).id((d) => d.id).distance(70).strength(0.45))
        .force('charge', forceManyBody<SimNode>().strength(-320).distanceMax(700))
        .force('collide', forceCollide<SimNode>().radius((d) => d.collide).strength(1).iterations(1))
        .force('center', forceCenter(0, 0).strength(0.03));
      // We drive ticks manually (no internal timer) so the worker controls cadence.
      sim.stop();
      sim.alpha(initialAlpha).alphaTarget(0);
      if (!autoStart) sim.alpha(Math.min(initialAlpha, 0.35));
    },
    tickToArrays() {
      if (sim) sim.tick();
      const x = new Float32Array(order.length);
      const y = new Float32Array(order.length);
      for (let i = 0; i < order.length; i++) {
        const n = byId.get(order[i])!;
        x[i] = n.x ?? 0;
        y[i] = n.y ?? 0;
      }
      return { x, y };
    },
    ids() { return order.slice(); },
    pin(id, x, y) { const n = byId.get(id); if (!n || !sim) return; n.fx = x; n.fy = y; sim.alpha(Math.max(sim.alpha(), 0.35)); },
    drag(id, x, y) { const n = byId.get(id); if (!n) return; n.fx = x; n.fy = y; },
    release(id) { const n = byId.get(id); if (!n) return; n.fx = null; n.fy = null; },
    tune({ repel, linkDistance, collideMultiplier }) {
      if (!sim) return;
      if (repel !== undefined) (sim.force('charge') as ReturnType<typeof forceManyBody<SimNode>>)?.strength(repel);
      if (linkDistance !== undefined) (sim.force('link') as ReturnType<typeof forceLink<SimNode, SimLink>>)?.distance(linkDistance);
      if (collideMultiplier !== undefined) (sim.force('collide') as ReturnType<typeof forceCollide<SimNode>>)?.radius((d) => d.collide * collideMultiplier);
      sim.alpha(Math.max(sim.alpha(), 0.25));
    },
    reheat() { if (sim) sim.alpha(1).alphaTarget(0); },
    isActive() { return !!sim && sim.alpha() > sim.alphaMin(); },
    stop() { if (sim) sim.stop(); },
  };
}
```

> Note: meteor "별똥별" reheat (the staggered outlier tween in `physics.ts:176-280`) is intentionally NOT ported in this task — it is an aesthetic main-thread rAF tween. Plain `reheat()` (alpha=1 restart) preserves the functional behavior. Meteor is listed as a follow-up in Task 7 notes.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:run src/widgets/topology-map-sigma/lib/layout-engine.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/widgets/topology-map-sigma/lib/layout-engine.ts src/widgets/topology-map-sigma/lib/layout-engine.test.ts
git commit -m "feat: pure d3-force layout engine (worker-agnostic)"
```

---

## Task 3: Worker entry + shared protocol

**Files:**
- Create: `src/widgets/topology-map-sigma/lib/layout-protocol.ts`
- Modify: `src/widgets/topology-map-sigma/lib/layout.worker.ts` (replace the Task-1 echo)

- [ ] **Step 1: Define the protocol**

```ts
// src/widgets/topology-map-sigma/lib/layout-protocol.ts
import type { LayoutNodeInput, LayoutLinkInput } from './layout-engine';

export type MainToWorker =
  | { type: 'init'; nodes: LayoutNodeInput[]; links: LayoutLinkInput[]; autoStart: boolean; initialAlpha: number }
  | { type: 'pin'; id: string; x: number; y: number }
  | { type: 'drag'; id: string; x: number; y: number }
  | { type: 'release'; id: string }
  | { type: 'tune'; repel?: number; linkDistance?: number; collideMultiplier?: number }
  | { type: 'reheat' }
  | { type: 'stop' };

export type WorkerToMain =
  | { type: 'ids'; ids: string[] }
  | { type: 'positions'; x: Float32Array; y: Float32Array; active: boolean };
```

- [ ] **Step 2: Replace the echo worker with the real entry**

```ts
// src/widgets/topology-map-sigma/lib/layout.worker.ts
import { createLayoutEngine } from './layout-engine';
import type { MainToWorker } from './layout-protocol';

const engine = createLayoutEngine();
let rafLoop: ReturnType<typeof setInterval> | null = null;
const post = (msg: unknown, transfer?: Transferable[]) =>
  (self as unknown as Worker).postMessage(msg, transfer ?? []);

function startLoop() {
  if (rafLoop) return;
  // d3-timer would also work; explicit interval keeps cadence predictable in-worker.
  rafLoop = setInterval(() => {
    const { x, y } = engine.tickToArrays();
    const active = engine.isActive();
    post({ type: 'positions', x, y, active }, [x.buffer, y.buffer]);
    if (!active) { if (rafLoop) { clearInterval(rafLoop); rafLoop = null; } }
  }, 16);
}

self.onmessage = (e: MessageEvent<MainToWorker>) => {
  const m = e.data;
  switch (m.type) {
    case 'init':
      engine.init({ nodes: m.nodes, links: m.links, autoStart: m.autoStart, initialAlpha: m.initialAlpha });
      post({ type: 'ids', ids: engine.ids() });
      startLoop();
      break;
    case 'pin': engine.pin(m.id, m.x, m.y); startLoop(); break;
    case 'drag': engine.drag(m.id, m.x, m.y); break;
    case 'release': engine.release(m.id); break;
    case 'tune': engine.tune(m); startLoop(); break;
    case 'reheat': engine.reheat(); startLoop(); break;
    case 'stop': engine.stop(); if (rafLoop) { clearInterval(rafLoop); rafLoop = null; } break;
  }
};
export {};
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/widgets/topology-map-sigma/lib/layout-protocol.ts src/widgets/topology-map-sigma/lib/layout.worker.ts
git commit -m "feat: topology layout worker entry + message protocol"
```

---

## Task 4: WorkerLayoutController (main thread, PhysicsController interface, TDD)

The controller MUST implement the existing `PhysicsController` interface from `physics.ts:37-57` (`pin/drag/release/tune/reheat/stop`) so `SigmaTopology.tsx` call sites are unchanged. It owns the `Worker`, serializes the graphology graph in, and applies returned positions via the SAME batch update the current `onTick` uses.

**Files:**
- Create: `src/widgets/topology-map-sigma/lib/worker-layout-controller.ts`
- Test: `src/widgets/topology-map-sigma/lib/worker-layout-controller.test.ts`

- [ ] **Step 1: Write the failing test (with a fake worker + real graphology)**

```ts
// src/widgets/topology-map-sigma/lib/worker-layout-controller.test.ts
import { describe, it, expect, vi } from 'vitest';
import Graph from 'graphology';
import { createWorkerLayoutController } from './worker-layout-controller';
import type { WorkerToMain } from './layout-protocol';

class FakeWorker {
  onmessage: ((e: MessageEvent<WorkerToMain>) => void) | null = null;
  posted: unknown[] = [];
  postMessage(m: unknown) { this.posted.push(m); }
  terminate = vi.fn();
  emit(msg: WorkerToMain) { this.onmessage?.({ data: msg } as MessageEvent<WorkerToMain>); }
}

function makeGraph() {
  const g = new Graph();
  g.addNode('a', { x: 0, y: 0, size: 4 });
  g.addNode('b', { x: 1, y: 1, size: 4 });
  g.addEdge('a', 'b', {});
  return g;
}

describe('WorkerLayoutController', () => {
  it('sends init with serialized nodes/links on construction', () => {
    const fake = new FakeWorker();
    createWorkerLayoutController(makeGraph(), fake as unknown as Worker, { autoStart: true, initialAlpha: 0.6 });
    const init = fake.posted[0] as { type: string; nodes: unknown[]; links: unknown[] };
    expect(init.type).toBe('init');
    expect(init.nodes).toHaveLength(2);
    expect(init.links).toHaveLength(1);
  });

  it('applies positions message to graph node attributes by index order', () => {
    const g = makeGraph();
    const fake = new FakeWorker();
    createWorkerLayoutController(g, fake as unknown as Worker, { autoStart: true, initialAlpha: 0.6 });
    fake.emit({ type: 'ids', ids: ['a', 'b'] });
    fake.emit({ type: 'positions', x: Float32Array.from([100, 200]), y: Float32Array.from([300, 400]), active: true });
    expect(g.getNodeAttribute('a', 'x')).toBe(100);
    expect(g.getNodeAttribute('b', 'y')).toBe(400);
  });

  it('forwards pin/drag/release/reheat/tune as worker messages', () => {
    const fake = new FakeWorker();
    const c = createWorkerLayoutController(makeGraph(), fake as unknown as Worker, { autoStart: false, initialAlpha: 0.3 });
    c.pin('a', 5, 6); c.drag('a', 7, 8); c.release('a'); c.reheat(); c.tune({ repel: -400 });
    const types = fake.posted.map((m) => (m as { type: string }).type);
    expect(types).toEqual(['init', 'pin', 'drag', 'release', 'reheat', 'tune']);
  });

  it('terminates the worker on stop', () => {
    const fake = new FakeWorker();
    const c = createWorkerLayoutController(makeGraph(), fake as unknown as Worker, { autoStart: false, initialAlpha: 0.3 });
    c.stop();
    expect(fake.terminate).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/widgets/topology-map-sigma/lib/worker-layout-controller.test.ts`
Expected: FAIL — `createWorkerLayoutController` not found.

- [ ] **Step 3: Implement the controller**

```ts
// src/widgets/topology-map-sigma/lib/worker-layout-controller.ts
import type Graph from 'graphology';
import type { PhysicsController } from './physics';
import type { SigmaNodeAttrs, SigmaEdgeAttrs } from './graph-build';
import type { MainToWorker, WorkerToMain } from './layout-protocol';

export function createWorkerLayoutController(
  graph: Graph<SigmaNodeAttrs, SigmaEdgeAttrs>,
  worker: Worker,
  options: { autoStart: boolean; initialAlpha: number },
): PhysicsController {
  let ids: string[] = [];
  const send = (m: MainToWorker) => worker.postMessage(m);

  const nodes = graph.mapNodes((id, a) => ({ id, x: a.x ?? 0, y: a.y ?? 0, size: a.size ?? 4 }));
  const links: { source: string; target: string }[] = [];
  graph.forEachEdge((_e, _a, s, t) => { if (s !== t) links.push({ source: s, target: t }); });

  worker.onmessage = (e: MessageEvent<WorkerToMain>) => {
    const m = e.data;
    if (m.type === 'ids') { ids = m.ids; return; }
    if (m.type === 'positions') {
      const { x, y } = m;
      // Same batch path as physics.ts onTick: one 'eachNodeAttributesUpdated' event.
      graph.updateEachNodeAttributes((id, attrs) => {
        const i = ids.indexOf(id);
        if (i >= 0) { attrs.x = x[i]; attrs.y = y[i]; }
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
    stop: () => { send({ type: 'stop' }); worker.terminate(); },
  };
}
```

> Note: `ids.indexOf(id)` is O(N) per node → O(N²) per positions message. For the first correctness pass this is acceptable; Task 6 replaces it with a precomputed `Map<string, number>` if the perf check shows it matters. (Keep the test green when optimizing.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:run src/widgets/topology-map-sigma/lib/worker-layout-controller.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/widgets/topology-map-sigma/lib/worker-layout-controller.ts src/widgets/topology-map-sigma/lib/worker-layout-controller.test.ts
git commit -m "feat: WorkerLayoutController mirroring PhysicsController over the layout worker"
```

---

## Task 5: Integrate into SigmaTopology (worker with main-thread fallback) + move settle off main thread

**Files:**
- Modify: `src/widgets/topology-map-sigma/ui/SigmaTopology.tsx:545-591` (settle) and `:756-761` (controller creation)

- [ ] **Step 1: Stop blocking the main thread with synchronous settle**

In the `graph = useMemo(...)` block (`:545-591`), remove the synchronous `settleLayout(g, iterations)` call at `:560-561`. Replace with a cheap deterministic initial scatter so nodes have finite start coords before the worker streams real positions:

```ts
    // Initial coords are a cheap deterministic scatter; the layout worker
    // streams real positions in (see worker-layout-controller). Heavy settle
    // is no longer synchronous on the main thread.
    let i = 0;
    g.forEachNode((id) => {
      const a = g.getNodeAttributes(id);
      if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) {
        const angle = (i * 2.399963); // golden-angle scatter
        const r = 30 + i * 1.5;
        g.setNodeAttribute(id, 'x', Math.cos(angle) * r);
        g.setNodeAttribute(id, 'y', Math.sin(angle) * r);
      }
      i++;
    });
```

Keep the localStorage position-restore block (`:565-580`) exactly as-is (runs after scatter). Remove the now-unused `getInitialSettleIterations` import/usage IF nothing else references it (grep first; if `minimal` path still wants it, keep a small synchronous settle ONLY when `graph.order <= 120`).

- [ ] **Step 2: Swap controller creation to worker-with-fallback**

Replace `:756-761`:

```ts
    const autoStartPhysics = minimal || graph.order <= 120;
    let physics: PhysicsController;
    const canUseWorker = typeof Worker !== 'undefined';
    if (canUseWorker) {
      const worker = new Worker(new URL('../lib/layout.worker.ts', import.meta.url), { type: 'module' });
      physics = createWorkerLayoutController(graph, worker, {
        autoStart: autoStartPhysics,
        initialAlpha: autoStartPhysics ? 0.65 : 0.45,
      });
    } else {
      physics = startPhysics(graph, undefined, {
        autoStart: autoStartPhysics,
        initialAlpha: autoStartPhysics ? 0.65 : 0.25,
      });
    }
    physicsRef.current = physics;
```

Add imports at top of file:

```ts
import { createWorkerLayoutController } from '../lib/worker-layout-controller';
```

(`startPhysics` import stays for the fallback.)

- [ ] **Step 3: Verify teardown terminates the worker**

Confirm the Sigma-init `useEffect` cleanup already calls `physicsRef.current?.stop()` (search for `.stop()` in the effect's return). If present, the worker is terminated via the controller's `stop()`. If absent, add `physicsRef.current?.stop();` to the cleanup return.

- [ ] **Step 4: Typecheck + lint + unit tests**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test:run src/widgets/topology-map-sigma`
Expected: 0 type errors, 0 lint errors, all topology widget tests pass.

- [ ] **Step 5: Manual smoke in dev**

Navigate to `http://localhost:3000/ko/topology`. Expected: graph appears, nodes settle into a layout (streamed from worker), drag wakes neighbors, "자동 정렬" re-settles. Console clean.

- [ ] **Step 6: Commit**

```bash
git add src/widgets/topology-map-sigma/ui/SigmaTopology.tsx
git commit -m "feat: drive topology layout via web worker with main-thread fallback"
```

---

## Task 6: Perf verification at scale + full check gate

**Files:** none (verification only; small optimization in `worker-layout-controller.ts` if needed)

- [ ] **Step 1: Re-run the scale probe used during diagnosis**

With `pnpm dev` running and the topology page open, run (via the Chrome DevTools MCP `evaluate_script`, or paste in the browser console) the fiber-injection probe that adds synthetic nodes to 2000 and measures FPS during continuous zoom AND during a worker-driven reheat. Compare against the 2026-05-28 baseline (render: 120fps @ 2000 nodes). Record: drag-FPS and auto-arrange-FPS at 2000 nodes under 4× CPU throttle.
Expected: drag / auto-arrange stay ≥ 55fps at 2000 nodes @ 4× (main thread no longer runs the sim).

- [ ] **Step 2: If positions-apply shows up hot, replace `indexOf` with a Map**

In `worker-layout-controller.ts`, build `const indexById = new Map<string, number>()` when the `ids` message arrives, and use it in `updateEachNodeAttributes`. Re-run `worker-layout-controller.test.ts` — must stay green.

- [ ] **Step 3: Full verification gate**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test:run && pnpm build`
Expected: all pass; static export builds (worker chunk emitted).

- [ ] **Step 4: Commit (only if Step 2 changed code)**

```bash
git add src/widgets/topology-map-sigma/lib/worker-layout-controller.ts
git commit -m "perf: O(1) position apply in worker layout controller"
```

---

## Task 7: Ontology vault sync + docs

**Files:**
- Modify: `docs/ontology/` (via MCP `add_concept` / `add_relation`)
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1: Mirror the new capability/element in the vault**

Per AGENTS.md "Working with the ontology while you code": this introduced a new element (the layout worker) realizing a capability (off-main-thread topology layout). Use the MCP tools:
- `add_concept` — element `topology-layout-worker` (kind: element, domain: the topology/visualization domain — confirm slug via `list_concepts`), title "Topology Layout Web Worker", body noting it moves d3-force off the main thread for WKWebView smoothness.
- `add_relation` — connect it to the existing topology capability/element (find via `find_neighbors` on the current Sigma topology node) with an appropriate type (e.g. `realizes` / `depends_on`).
- Run `validate_vault({})` and surface any blocking errors.

- [ ] **Step 2: Changelog**

Add a dated entry to `docs/CHANGELOG.md` describing: topology force layout moved to a Web Worker (main-thread/WKWebView jank fix), Tauri CSP `worker-src` added, `.codegraph/` gitignored (dev-server FATAL fix).

- [ ] **Step 3: Commit**

```bash
git add docs/ontology docs/CHANGELOG.md
git commit -m "docs: sync ontology vault + changelog for topology layout worker"
```

---

## Follow-ups (out of scope for this plan — note, don't implement)

- **Meteor reheat tween** (`physics.ts:176-280`): port the staggered outlier "별똥별" animation into the worker (or a thin main-thread tween reading worker positions) to restore the exact auto-arrange aesthetic. Plain `reheat()` is functionally complete without it.
- **Initial settle quality**: if the d3-force scatter+stream looks worse than the old forceAtlas2 settle, run a short forceAtlas2 pass inside the worker before switching to live d3-force.
- **`/ontology` ego-graph & insights** use their own layout paths (`use-vault-graph-flow.ts` dagre/FA2, `DocsVaultFolderTopology.tsx` FA2) — evaluate the same worker treatment if they show jank at scale.
- **Desktop instrumentation**: stand up a way to capture FPS inside the Tauri WKWebView (Safari Web Inspector) to confirm the fix on the real target, not just throttled Chrome.

---

## Self-Review

- **Spec coverage:** Approach = full Web Worker for force computation (user-approved). Covered: settle off main thread (Task 5.1), live sim in worker (Tasks 2-4), integration with fallback (Task 5), CSP/bundling de-risk (Task 1), perf proof (Task 6), ontology sync (Task 7). ✓
- **Placeholders:** none — all new modules have full code; integration steps cite exact file:line ranges; commands have expected output. ✓
- **Type consistency:** `PhysicsController` (from `physics.ts:37-57`) reused verbatim; `LayoutNodeInput`/`LayoutLinkInput`/`MainToWorker`/`WorkerToMain` defined in Tasks 2-3 and consumed consistently in Task 4; `createWorkerLayoutController(graph, worker, {autoStart, initialAlpha})` signature matches between test, impl, and the Task 5 call site. ✓
