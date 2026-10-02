import { galaxyMatrix, liveBandRadius, worldToScreen } from "./cosmos-camera";
import type { CosmosCamera, CosmosRoom, GalaxyPose } from "./cosmos-types";
import { galaxyKey } from "./draw/cosmos-bitmap-cache";
import type { CosmosGalaxy, CosmosLayout } from "./layout/cosmos-layout";

const HIT_CELL = 12;
const HIT_REACH_PX = 10;

export class CosmosHitIndex {
  private grids = new Map<string, Map<number, number[]>>();

  retain(galaxies: ReadonlySet<string>): void {
    for (const key of [...this.grids.keys()]) if (!galaxies.has(key)) this.grids.delete(key);
  }

  hit(layout: CosmosLayout, poses: readonly GalaxyPose[], camera: CosmosCamera, room: CosmosRoom, dpr: number, sx: number, sy: number): { id: string | null; galaxy: number } {
    const live = liveBandRadius(dpr);
    let bestGalaxy = -1;
    let bestStar: string | null = null;
    let bestD = Infinity;
    layout.galaxies.forEach((g, index) => {
      const pose = poses[index]!;
      const m = galaxyMatrix(g, pose, camera, room);
      const det = m.a * m.d - m.b * m.c;
      if (Math.abs(det) < 1e-12) return;
      const X = sx - m.e;
      const Y = sy - m.f;
      const u = (m.d * X - m.c * Y) / det / pose.condense;
      const v = (-m.b * X + m.a * Y) / det / pose.condense;
      if (u * u + v * v > (g.radius * 1.08) ** 2) return;
      if (g.radius * camera.scale <= live) {
        bestGalaxy = index;
        return;
      }
      const grid = this.gridFor(g);
      const reach = Math.ceil(HIT_REACH_PX / (camera.scale * g.tilt * HIT_CELL)) + 1;
      const cx = Math.floor(u / HIT_CELL);
      const cy = Math.floor(v / HIT_CELL);
      for (let ox = -reach; ox <= reach; ox += 1) {
        for (let oy = -reach; oy <= reach; oy += 1) {
          for (const i of grid.get((cx + ox) * 92821 + (cy + oy)) ?? []) {
            const su = g.starU[i]! * pose.condense;
            const sv = g.starV[i]! * pose.condense;
            const d = Math.hypot(m.a * su + m.c * sv + m.e - sx, m.b * su + m.d * sv + m.f - sy);
            if (d < HIT_REACH_PX && d < bestD) {
              bestD = d;
              bestStar = g.starIds[i]!;
            }
          }
        }
      }
      if (!bestStar) bestGalaxy = index;
    });
    if (bestStar) return { id: bestStar, galaxy: -1 };
    if (bestGalaxy >= 0) return { id: null, galaxy: bestGalaxy };
    const core = layout.core;
    for (let i = 0; i < core.starIds.length; i += 1) {
      const p = worldToScreen(camera, room, core.starX[i]!, core.starY[i]!);
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d < (i === 0 && core.id ? 18 : 7) && d < bestD) {
        bestD = d;
        bestStar = core.starIds[i]!;
      }
    }
    return { id: bestStar, galaxy: -1 };
  }

  private gridFor(g: CosmosGalaxy): Map<number, number[]> {
    const key = galaxyKey(g);
    const hit = this.grids.get(key);
    if (hit) return hit;
    const grid = new Map<number, number[]>();
    for (let i = 0; i < g.starIds.length; i += 1) {
      const cell = Math.floor(g.starU[i]! / HIT_CELL) * 92821 + Math.floor(g.starV[i]! / HIT_CELL);
      const list = grid.get(cell);
      if (list) list.push(i);
      else grid.set(cell, [i]);
    }
    this.grids.set(key, grid);
    return grid;
  }
}
