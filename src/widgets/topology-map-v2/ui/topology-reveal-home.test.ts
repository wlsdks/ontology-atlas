import { describe, expect, it } from "vitest";

import type { TopologyV2Tokens } from "../tokens/read-topology-v2-tokens";
import type { TopologyWorld, WorldNode } from "./topology-world";
import { prepareRevealHome } from "./topology-reveal-home";

const tokens = {
  radiusProject: 20,
  radiusDomain: 14,
  radiusCapability: 8,
  radiusElement: 5,
  edgeBowContains: 70,
  edgeBowDepends: 92,
  edgeBlendContains: 0.46,
} as unknown as TopologyV2Tokens;

function node(id: string, kind: WorldNode["kind"], x: number, y: number): WorldNode {
  return {
    id,
    kind,
    label: id,
    x,
    y,
    homeX: x,
    homeY: y,
    parentId: null,
    isHub: false,
    fresh: false,
    stale: false,
    count: 0,
    magnitudeScale: 1,
  };
}

function worldFixture(): TopologyWorld {
  const project = node("project", "project", 10, 20);
  const domain = node("domain", "domain", 100, 200);
  return {
    nodes: [project, domain],
    nodeById: new Map([[project.id, project], [domain.id, domain]]),
    edges: [],
    neighborMap: new Map(),
    childrenByParent: new Map(),
    clusterMetaByParent: new Map(),
    edgeIndexByNode: new Map(),
    brightStarIds: new Set(),
    bounds: { minX: -4, minY: 6, maxX: 114, maxY: 214 },
    spineBounds: { minX: -4, minY: 6, maxX: 114, maxY: 214 },
  };
}

describe("prepareRevealHome", () => {
  it("re-homes a cloned runtime world and seeds springs without mutating its input", () => {
    const input = worldFixture();
    const result = prepareRevealHome(input, tokens, { x: 10, y: 20 });

    expect(result.world).not.toBe(input);
    expect(result.world.nodeById).not.toBe(input.nodeById);
    expect(input.nodeById.get("domain")).toMatchObject({ x: 100, y: 200 });
    expect(result.world.nodeById.get("domain")).toMatchObject({ x: 10, y: 20, homeX: 100, homeY: 200 });
    expect(result.springs.get("domain")).toEqual({
      x: { value: 10, velocity: 0 },
      y: { value: 20, velocity: 0 },
    });
  });
});
