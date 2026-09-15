import { describe, expect, it } from "vitest";
import {
  GALAXY_ARM_COUNT,
  GALAXY_VERTICAL_FLATTEN,
  computeGalaxyLayout,
  galaxySpiralPoint,
  isGalaxyEdgeVisible,
} from "./galaxy-layout";

const NODES = [
  { id: "project:atlas", kind: "project" as const, parentId: null },
  { id: "domain:ai", kind: "domain" as const, parentId: "project:atlas" },
  { id: "domain:map", kind: "domain" as const, parentId: "project:atlas" },
  { id: "domain:vault", kind: "domain" as const, parentId: "project:atlas" },
  { id: "capability:agents", kind: "capability" as const, parentId: "domain:ai" },
  { id: "element:mcp", kind: "element" as const, parentId: "capability:agents" },
  { id: "element:canvas", kind: "element" as const, parentId: "domain:map" },
] as const;

const RINGS = { domain: 250, capability: 145, element: 90 };

describe("Galaxy layout", () => {
  it("shares a deterministic three-arm spiral with the procedural sky", () => {
    expect(GALAXY_ARM_COUNT).toBe(3);
    expect(galaxySpiralPoint(0, 0, 800)).toEqual({ x: 0, y: -0 });
    const point = galaxySpiralPoint(1, 1, 800);
    expect(Math.hypot(point.x, point.y / GALAXY_VERTICAL_FLATTEN)).toBeCloseTo(800, 8);
    expect(galaxySpiralPoint(1, 1, 800)).toEqual(point);
  });

  it("keeps real ids, places the project at the core, and derives domain clouds from containment", () => {
    const layout = computeGalaxyLayout(NODES, RINGS);
    expect([...layout.points.keys()].sort()).toEqual(NODES.map((node) => node.id).sort());
    expect(layout.points.get("project:atlas")).toEqual({ id: "project:atlas", x: 0, y: 0 });
    expect(layout.domainByNodeId.get("capability:agents")).toBe("domain:ai");
    expect(layout.domainByNodeId.get("element:mcp")).toBe("domain:ai");
    expect(layout.domainByNodeId.get("element:canvas")).toBe("domain:map");
    expect(computeGalaxyLayout([...NODES].reverse(), RINGS)).toEqual(layout);
  });

  it("does not place every domain on one ring", () => {
    const layout = computeGalaxyLayout(NODES, RINGS);
    const distances = NODES.filter((node) => node.kind === "domain").map((node) => {
      const point = layout.points.get(node.id)!;
      return Math.hypot(point.x, point.y / GALAXY_VERTICAL_FLATTEN);
    });
    expect(new Set(distances.map((value) => value.toFixed(3))).size).toBe(distances.length);
  });
});

describe("Galaxy relation attention", () => {
  const edge = { sourceId: "domain:ai", targetId: "capability:agents" };
  const rest = {
    focusedNodeId: null,
    hoveredNodeId: null,
    selected: false,
    path: false,
    walked: false,
  };

  it("hides the default wiring field and reveals only real requested neighbourhoods", () => {
    expect(isGalaxyEdgeVisible(edge, rest)).toBe(false);
    expect(isGalaxyEdgeVisible(edge, { ...rest, hoveredNodeId: "domain:ai" })).toBe(true);
    expect(isGalaxyEdgeVisible(edge, { ...rest, focusedNodeId: "capability:agents" })).toBe(true);
    expect(isGalaxyEdgeVisible(edge, { ...rest, selected: true })).toBe(true);
    expect(isGalaxyEdgeVisible(edge, { ...rest, path: true })).toBe(true);
    expect(isGalaxyEdgeVisible(edge, { ...rest, walked: true })).toBe(true);
    expect(isGalaxyEdgeVisible(edge, { ...rest, hoveredNodeId: "domain:vault" })).toBe(false);
  });
});
