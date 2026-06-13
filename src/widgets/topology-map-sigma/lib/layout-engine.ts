import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';

export interface LayoutNodeInput {
  id: string;
  x: number;
  y: number;
  size: number;
}
export interface LayoutLinkInput {
  source: string;
  target: string;
}
export interface LayoutInit {
  nodes: LayoutNodeInput[];
  links: LayoutLinkInput[];
  autoStart: boolean;
  initialAlpha: number;
}

interface SimNode extends SimulationNodeDatum {
  id: string;
  collide: number;
}
interface SimLink extends SimulationLinkDatum<SimNode> {
  source: string | SimNode;
  target: string | SimNode;
}

const DRAG_WAKE_ALPHA = 0.18;
const RELEASE_WAKE_ALPHA = 0.12;

/**
 * Pure, worker-agnostic d3-force engine. No DOM, no graphology, no `self`.
 * The caller drives ticks explicitly (`tickToArrays`) so the worker controls
 * cadence — d3's internal timer is never started (`sim.stop()` after build).
 */
export interface LayoutEngine {
  init(opts: LayoutInit): void;
  /** Advance one tick and return current positions in stable init-node order. */
  tickToArrays(): { x: Float32Array; y: Float32Array };
  /** Stable node id order matching tickToArrays indices. */
  ids(): string[];
  pin(id: string, x: number, y: number): void;
  drag(id: string, x: number, y: number): void;
  release(id: string): void;
  pinGroup(positions: ReadonlyArray<{ id: string; x: number; y: number }>): void;
  dragGroup(positions: ReadonlyArray<{ id: string; x: number; y: number }>): void;
  releaseGroup(ids: Iterable<string>): void;
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
        .velocityDecay(0.4)
        .alphaDecay(0.035)
        .alphaMin(0.002)
        .force(
          'link',
          forceLink<SimNode, SimLink>(simLinks)
            .id((d) => d.id)
            .distance(70)
            .strength(0.45),
        )
        .force('charge', forceManyBody<SimNode>().strength(-320).distanceMax(700))
        .force(
          'collide',
          forceCollide<SimNode>()
            .radius((d) => d.collide)
            .strength(1)
            .iterations(1),
        )
        .force('center', forceCenter(0, 0).strength(0.03));
      // We drive ticks manually (no internal timer) so the worker controls cadence.
      sim.stop();
      sim.alpha(autoStart ? initialAlpha : Math.min(initialAlpha, 0.35)).alphaTarget(0);
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
    ids() {
      return order.slice();
    },
    pin(id, x, y) {
      const n = byId.get(id);
      if (!n || !sim) return;
      n.fx = x;
      n.fy = y;
      sim.alpha(Math.max(sim.alpha(), 0.35));
    },
    drag(id, x, y) {
      const n = byId.get(id);
      if (!n || !sim) return;
      n.fx = x;
      n.fy = y;
      sim.alpha(Math.max(sim.alpha(), DRAG_WAKE_ALPHA));
    },
    release(id) {
      const n = byId.get(id);
      if (!n || !sim) return;
      n.fx = null;
      n.fy = null;
      sim.alpha(Math.max(sim.alpha(), RELEASE_WAKE_ALPHA));
    },
    pinGroup(positions) {
      if (!sim) return;
      let changed = false;
      for (const { id, x, y } of positions) {
        const n = byId.get(id);
        if (!n) continue;
        n.fx = x;
        n.fy = y;
        changed = true;
      }
      if (changed) sim.alpha(Math.max(sim.alpha(), 0.35));
    },
    dragGroup(positions) {
      if (!sim) return;
      let changed = false;
      for (const { id, x, y } of positions) {
        const n = byId.get(id);
        if (!n) continue;
        n.fx = x;
        n.fy = y;
        changed = true;
      }
      if (changed) sim.alpha(Math.max(sim.alpha(), DRAG_WAKE_ALPHA));
    },
    releaseGroup(ids) {
      if (!sim) return;
      let changed = false;
      for (const id of ids) {
        const n = byId.get(id);
        if (!n) continue;
        n.fx = null;
        n.fy = null;
        changed = true;
      }
      if (changed) sim.alpha(Math.max(sim.alpha(), RELEASE_WAKE_ALPHA));
    },
    tune({ repel, linkDistance, collideMultiplier }) {
      if (!sim) return;
      if (repel !== undefined) {
        (sim.force('charge') as ReturnType<typeof forceManyBody<SimNode>>)?.strength(repel);
      }
      if (linkDistance !== undefined) {
        (sim.force('link') as ReturnType<typeof forceLink<SimNode, SimLink>>)?.distance(
          linkDistance,
        );
      }
      if (collideMultiplier !== undefined) {
        (sim.force('collide') as ReturnType<typeof forceCollide<SimNode>>)?.radius(
          (d) => d.collide * collideMultiplier,
        );
      }
      sim.alpha(Math.max(sim.alpha(), 0.25));
    },
    reheat() {
      if (sim) sim.alpha(1).alphaTarget(0);
    },
    isActive() {
      return !!sim && sim.alpha() > sim.alphaMin();
    },
    stop() {
      if (sim) sim.stop();
    },
  };
}
