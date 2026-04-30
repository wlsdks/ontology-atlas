declare module "d3-force-reuse" {
  import type { Force, SimulationNodeDatum } from "d3-force";

  export interface ManyBodyReuseForce<NodeDatum extends SimulationNodeDatum>
    extends Force<NodeDatum, undefined> {
    strength(): number | ((node: NodeDatum, i: number, nodes: NodeDatum[]) => number);
    strength(
      strength: number | ((node: NodeDatum, i: number, nodes: NodeDatum[]) => number),
    ): this;
    distanceMin(): number;
    distanceMin(distance: number): this;
    distanceMax(): number;
    distanceMax(distance: number): this;
    theta(): number;
    theta(theta: number): this;
  }

  /**
   * Barnes-Hut many-body force where the quadtree is rebuilt only every
   * N ticks (default: 13) instead of every tick. Drop-in replacement for
   * d3-force's `forceManyBody`.
   */
  export function forceManyBodyReuse<
    NodeDatum extends SimulationNodeDatum = SimulationNodeDatum,
  >(): ManyBodyReuseForce<NodeDatum>;
}
