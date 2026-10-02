import { describe, expect, it } from "vitest";
import { hexGutter, type HexTile } from "../model/hex-board";
import { SQRT3 } from "../model/hex-grid";
import { RELIEF_PITCH_REST } from "./relief-projection";
import { pickReliefTile } from "./relief-pick";

const R = 40;
const RI = R - hexGutter(R);
const cam = { R, ox: 500, oy: 300 };
const tile = (id: string, x: number, y: number) => ({ id, x, y }) as HexTile;

function sceneOf(tiles: HexTile[]) {
  const order = [...tiles].sort((a, b) => a.y - b.y || a.x - b.x);
  return { order, orderY: Float64Array.from(order, (t) => t.y) };
}

function insideHex(px: number, py: number, cx: number, cy: number): boolean {
  const dx = Math.abs(px - cx);
  const dy = Math.abs(py - cy);
  return dy <= (RI * SQRT3) / 2 && dx <= RI - dy / SQRT3;
}

describe("pickReliefTile", () => {
  const back = tile("back", 0, 0);
  const front = tile("front", 0, SQRT3);
  const scene = sceneOf([front, back]);
  const heights = new Map([
    ["back", 1.1 * R],
    ["front", R],
  ]);
  const heightOf = (t: HexTile) => heights.get(t.id) ?? 0;
  const pose = { pitch: RELIEF_PITCH_REST, pivotY: 300 };

  it("gives an overlap to the prism painted later", () => {
    expect(pickReliefTile(500, 310, scene, cam, pose, heightOf, 1.1 * R)).toBe("front");
  });

  it("picks the prism whose wall is under the point", () => {
    expect(pickReliefTile(500, 285, scene, cam, pose, heightOf, 1.1 * R)).toBe("back");
  });

  it("misses beside the silhouettes", () => {
    expect(pickReliefTile(500 + RI + 2, 290, scene, cam, pose, heightOf, 1.1 * R)).toBeNull();
  });

  it("equals hexagon containment at pitch 0", () => {
    const flat = { pitch: 0, pivotY: 300 };
    const tiles = [tile("a", 0, 0), tile("b", 1.5, SQRT3 / 2), tile("c", 0, SQRT3), tile("d", -1.5, SQRT3 / 2)];
    const grid = sceneOf(tiles);
    for (let px = 420; px <= 580; px += 3.7) {
      for (let py = 250; py <= 400; py += 3.1) {
        const expected = tiles.find((t) => insideHex(px, py, cam.ox + t.x * R, cam.oy + t.y * R))?.id ?? null;
        expect(pickReliefTile(px, py, grid, cam, flat, () => 30, 30)).toBe(expected);
      }
    }
  });
});
