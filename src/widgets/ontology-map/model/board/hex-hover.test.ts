import { describe, expect, it } from "vitest";
import type { TreeInputEdge, TreeInputNode } from "../containment-tree";
import { computeHexBoard, type HexBoardLayout } from "./hex-board";
import { pickFlatTile, placeHexTooltip } from "./hex-hover";

function board(): HexBoardLayout {
  const nodes: TreeInputNode[] = [
    { id: "project:p", label: "Project", kind: "project" },
    { id: "domain:d0", label: "Billing", kind: "domain" },
    ...[0, 1, 2, 3].map((i) => ({ id: `capability:c${i}`, label: `c${i}`, kind: "capability" as const })),
  ];
  const edges: TreeInputEdge[] = [
    { source: "project:p", target: "domain:d0", kind: "contains", relationType: "contains" },
    ...[0, 1, 2, 3].map((i) => ({ source: "domain:d0", target: `capability:c${i}`, kind: "contains" as const, relationType: "contains" })),
  ];
  return computeHexBoard(nodes, edges);
}

const layout = board();
const cam = { R: 30, ox: 400, oy: 300 };
const onScreen = (t: { x: number; y: number }) => ({ x: cam.ox + t.x * cam.R, y: cam.oy + t.y * cam.R });

describe("pickFlatTile", () => {
  it("finds the tile under its own centre, for every tile", () => {
    for (const tile of layout.tiles) {
      const p = onScreen(tile);
      expect(pickFlatTile(layout, cam, p.x, p.y)).toBe(tile.id);
    }
  });

  it("finds a tile from a point near its edge but not from the gap beyond it", () => {
    const tile = layout.capabilities[0]!;
    const p = onScreen(tile);
    expect(pickFlatTile(layout, cam, p.x + cam.R * 0.8, p.y)).toBe(tile.id);
    expect(pickFlatTile(layout, cam, -5000, -5000)).toBeNull();
  });
});

describe("placeHexTooltip", () => {
  const free = { x: 0, y: 0, width: 800, height: 600 };
  const W = 120;
  const H = 24;
  const x = 400;
  const y = 300;
  const R = 30;
  const overlaps = (s: { x: number; y: number }, b: { x: number; y: number; w: number; h: number }) =>
    b.x < s.x + W && s.x < b.x + b.w && b.y < s.y + H && s.y < b.y + b.h;

  it("stands beside the tile, on its right, when nothing is in the way", () => {
    const spot = placeHexTooltip(x, y, R, 1, W, H, free, []);
    expect(spot.x).toBe(x + R + 8);
  });

  it("covers no drawn name when a clear spot exists", () => {
    const names = [{ id: "n", x: x + R, y: y - 60, w: 200, h: 120 }];
    const spot = placeHexTooltip(x, y, R, 1, W, H, free, names);
    expect(overlaps(spot, names[0]!)).toBe(false);
  });

  it("stays inside the free map when the tile is at its edge", () => {
    const spot = placeHexTooltip(free.width - 10, y, R, 1, W, H, free, []);
    expect(spot.x + W).toBeLessThanOrEqual(free.width - 8);
  });

  it("never covers the hovered tile itself", () => {
    const crowded = Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, x: i * 20, y: 0, w: 20, h: 600 }));
    const spot = placeHexTooltip(x, y, R, 1, W, H, free, crowded);
    const apo = (R * Math.sqrt(3)) / 2;
    const overTile = spot.x < x + R && x - R < spot.x + W && spot.y < y + apo && y - apo < spot.y + H;
    expect(overTile).toBe(false);
  });
});
