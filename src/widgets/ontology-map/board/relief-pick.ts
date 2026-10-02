import { hexGutter, type HexTile } from "../model/hex-board";
import { SQRT3 } from "../model/hex-grid";
import { lowerBound, type BoardScene } from "./board-scene";
import { groundInverseY, type ReliefView } from "./relief-projection";

interface Cam {
  R: number;
  ox: number;
  oy: number;
}

export function pickReliefTile(
  px: number,
  py: number,
  scene: Pick<BoardScene, "order" | "orderY">,
  cam: Cam,
  pose: ReliefView,
  heightOf: (tile: HexTile) => number,
  maxHeight: number,
): string | null {
  const c = Math.cos(pose.pitch);
  const s = Math.sin(pose.pitch);
  const RI = cam.R - hexGutter(cam.R);
  const apo = (RI * SQRT3 * c) / 2;
  const lo = lowerBound(scene.orderY, groundInverseY(py - apo - 1, pose, cam));
  const hi = lowerBound(scene.orderY, groundInverseY(py + apo + maxHeight * s + 1, pose, cam) + 1e-9);
  for (let i = hi - 1; i >= lo; i -= 1) {
    const t = scene.order[i]!;
    const yb = pose.pivotY + (cam.oy + t.y * cam.R - pose.pivotY) * c;
    const yt = yb - heightOf(t) * s;
    let half: number;
    if (py < yt - apo || py > yb + apo) continue;
    if (py < yt) half = RI - (yt - py) / (c * SQRT3);
    else if (py > yb) half = RI - (py - yb) / (c * SQRT3);
    else half = RI;
    if (Math.abs(px - (cam.ox + t.x * cam.R)) <= half) return t.id;
  }
  return null;
}
