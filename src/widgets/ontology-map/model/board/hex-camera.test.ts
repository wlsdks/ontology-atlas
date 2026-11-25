import { describe, expect, it } from "vitest";
import type { TreeInputEdge, TreeInputNode } from "../containment-tree";
import { hexRestCamera, type MapChrome } from "../../morph/hex-marks";
import { computeHexBoard, HEX_MAX_RADIUS, HEX_MIN_RADIUS, type HexBoardLayout } from "./hex-board";
import { clampHexCamera, focusShift, regionFitCamera, restCameraAboveFooter, routeFrameOf, sameHexCamera } from "./hex-camera";

function board(): HexBoardLayout {
  const nodes: TreeInputNode[] = [
    { id: "project:p", label: "Project", kind: "project" },
    { id: "domain:d0", label: "Billing", kind: "domain" },
    { id: "domain:d1", label: "Search", kind: "domain" },
    ...[0, 1, 2, 3, 4, 5].map((i) => ({ id: `capability:c${i}`, label: `c${i}`, kind: "capability" as const })),
  ];
  const edges: TreeInputEdge[] = [
    { source: "project:p", target: "domain:d0", kind: "contains", relationType: "contains" },
    { source: "project:p", target: "domain:d1", kind: "contains", relationType: "contains" },
    ...[0, 1, 2].map((i) => ({ source: "domain:d0", target: `capability:c${i}`, kind: "contains" as const, relationType: "contains" })),
    ...[3, 4, 5].map((i) => ({ source: "domain:d1", target: `capability:c${i}`, kind: "contains" as const, relationType: "contains" })),
  ];
  return computeHexBoard(nodes, edges);
}

const layout = board();
const room = { x: 0, y: 0, width: 900, height: 600 };
const FLAT = { pitch: 0, pivotY: 300 };
const noLift = () => 0;

describe("clampHexCamera", () => {
  it("holds the cell size inside the radius limits", () => {
    const wide = clampHexCamera({ R: 500, ox: 0, oy: 0 }, layout.bounds, 900, 600);
    const tiny = clampHexCamera({ R: 0.1, ox: 0, oy: 0 }, layout.bounds, 900, 600);
    expect(wide.R).toBe(HEX_MAX_RADIUS);
    expect(tiny.R).toBe(HEX_MIN_RADIUS);
  });

  it("keeps part of the board on screen however far it is dragged", () => {
    const far = clampHexCamera({ R: 20, ox: 1e6, oy: -1e6 }, layout.bounds, 900, 600);
    expect(far.ox + layout.bounds.minX * 20).toBeLessThanOrEqual(900 - 160 + 1e-6);
    expect(far.oy + layout.bounds.maxY * 20).toBeGreaterThanOrEqual(160 - 1e-6);
  });

  it("leaves a camera that is already inside the limits as it is", () => {
    const cam = hexRestCamera(layout, room);
    expect(clampHexCamera(cam, layout.bounds, 900, 600)).toEqual(cam);
  });
});

describe("restCameraAboveFooter", () => {
  it("rests in the room as predicted when there is no footer or it is clear", () => {
    const predicted = hexRestCamera(layout, room);
    expect(restCameraAboveFooter(layout, room, null, 0)).toEqual(predicted);
    expect(restCameraAboveFooter(layout, room, 10_000, 0)).toEqual(predicted);
  });

  it("rests in a shorter room when the footer would cover the lowest tiles", () => {
    const predicted = hexRestCamera(layout, room);
    const lowestY = predicted.oy + layout.bounds.maxY * predicted.R;
    const rest = restCameraAboveFooter(layout, room, lowestY - 20, 0);
    expect(rest.oy).toBeLessThan(predicted.oy);
    expect(rest.oy + layout.bounds.maxY * rest.R).toBeLessThanOrEqual(lowestY - 20 - 8 + 1e-6);
  });
});

describe("sameHexCamera", () => {
  it("finds no new rest when the footer moves without reaching the lowest tiles, and one when it lifts them", () => {
    const predicted = hexRestCamera(layout, room);
    const lowestY = predicted.oy + layout.bounds.maxY * predicted.R;
    const before = restCameraAboveFooter(layout, room, lowestY + 40, 0);
    expect(sameHexCamera(before, restCameraAboveFooter(layout, room, lowestY + 44, 0))).toBe(true);
    expect(sameHexCamera(before, restCameraAboveFooter(layout, room, lowestY - 20, 0))).toBe(false);
  });

  it("tells a camera the reader zoomed or panned from the rest", () => {
    const rest = hexRestCamera(layout, room);
    expect(sameHexCamera(rest, { ...rest, R: rest.R * 1.5 })).toBe(false);
    expect(sameHexCamera(rest, { ...rest, ox: rest.ox + 4 })).toBe(false);
  });
});

describe("routeFrameOf", () => {
  const chrome: MapChrome = { free: { x: 100, y: 50, width: 600, height: 400 }, blocks: [] };
  const cam = { R: 20, ox: 0, oy: 0 };

  it("has no frame without chrome", () => {
    expect(routeFrameOf(null, cam, FLAT)).toBeNull();
  });

  it("keeps routes ROUTE_CLEAR inside the free map, in unit space", () => {
    const frame = routeFrameOf(chrome, cam, FLAT)!;
    expect(frame.x0).toBeCloseTo((100 + 10) / 20);
    expect(frame.x1).toBeCloseTo((700 - 10) / 20);
  });

  it("drops chrome that lies outside the free map and keeps what overlaps it", () => {
    const frame = routeFrameOf(
      { ...chrome, blocks: [{ x: 120, y: 60, width: 50, height: 50 }, { x: 2000, y: 2000, width: 50, height: 50 }] },
      cam,
      FLAT,
    )!;
    expect(frame.blocks).toHaveLength(1);
  });

  it("gives the same key for the same room and another when the chrome moves", () => {
    const a = routeFrameOf(chrome, cam, FLAT)!;
    const same = routeFrameOf({ ...chrome }, cam, FLAT)!;
    const moved = routeFrameOf({ ...chrome, free: { ...chrome.free, width: 500 } }, cam, FLAT)!;
    expect(same.key).toBe(a.key);
    expect(moved.key).not.toBe(a.key);
  });
});

describe("regionFitCamera", () => {
  it("centres the region's cells in the free map and stays within the radius limit", () => {
    const region = layout.regions[0]!;
    const free = { x: 100, y: 40, width: 800, height: 500 };
    const cam = regionFitCamera(region.cells, free, 290, 0);
    expect(cam.R).toBeLessThanOrEqual(HEX_MAX_RADIUS);
    const xs = region.cells.map(([q]) => 1.5 * q);
    const centreX = cam.ox + ((Math.min(...xs) + Math.max(...xs)) / 2) * cam.R;
    expect(centreX).toBeCloseTo(free.x + free.width / 2);
  });
});

describe("focusShift", () => {
  const cam = hexRestCamera(layout, room);
  const free = { x: 0, y: 0, width: 900, height: 600 };
  const selected = layout.capabilities[0]!;

  it("is null when the selection is not on the board", () => {
    expect(focusShift(layout, cam, free, FLAT, "capability:gone", [], noLift)).toBeNull();
  });

  it("needs no move for a focus already inside the free map", () => {
    expect(focusShift(layout, cam, free, FLAT, selected.id, [], noLift)).toEqual({ dx: 0, dy: 0 });
  });

  it("moves the camera right when the selected tile sits off the left edge", () => {
    const left = { ...cam, ox: cam.ox - 5000 };
    const shift = focusShift(layout, left, free, FLAT, selected.id, [], noLift)!;
    expect(shift.dx).toBeGreaterThan(0);
  });

  it("moves the camera up when the focus sits below the free map", () => {
    const low = { ...cam, oy: cam.oy + 5000 };
    const shift = focusShift(layout, low, free, FLAT, selected.id, [], noLift)!;
    expect(shift.dy).toBeLessThan(0);
  });
});
