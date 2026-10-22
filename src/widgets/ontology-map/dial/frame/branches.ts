import { FAN_CAPACITY, FAN_DOMAIN_LIMIT } from "../layout/cluster-fan";
import type { Circle } from "../label-marks";
import type { DialScene, Point } from "../types";

export interface BranchMark {
  source: string;
  target: string;
  a: Point;
  c: Point;
  b: Point;
  ink: number;
}

/** Ownership has no arrow or pick target: dependency picking stays with the flow layer. */
export function clusterBranches(
  scene: DialScene,
  chips: ReadonlyMap<string, Circle>,
  discs: ReadonlyMap<string, Circle>,
  elements: ReadonlyMap<string, Circle>,
  inkOf: (domainId: string) => number,
): BranchMark[] {
  const marks: BranchMark[] = [];
  if (scene.clusters.length > FAN_DOMAIN_LIMIT) return marks;
  const add = (source: string, target: string, a: Circle | undefined, b: Circle | undefined, angle: number, ink: number) => {
    if (!a || !b) return;
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    if (distance <= a.r + b.r + 4) return;
    const c = { x: a.x + Math.cos(angle) * distance * 0.5, y: a.y + Math.sin(angle) * distance * 0.5 };
    const trim = (p: Circle, toward: Point): Point => {
      const length = Math.hypot(toward.x - p.x, toward.y - p.y) || 1;
      const share = Math.min(0.45, (p.r + 2) / length);
      return { x: p.x + (toward.x - p.x) * share, y: p.y + (toward.y - p.y) * share };
    };
    marks.push({ source, target, a: trim(a, c), c, b: trim(b, c), ink });
  };
  for (const cluster of scene.clusters) {
    if (cluster.items.length > FAN_CAPACITY) continue;
    const chip = chips.get(cluster.domainId);
    if (!chip) continue;
    const ink = inkOf(cluster.domainId);
    for (const item of cluster.items) {
      const disc = discs.get(item.id);
      if (!item.direct) add(cluster.domainId, item.id, chip, disc, cluster.angle, ink);
      for (const element of item.elementIds) {
        add(item.direct ? cluster.domainId : item.id, element, item.direct ? chip : disc, elements.get(element), cluster.angle, ink);
      }
    }
  }
  return marks;
}
