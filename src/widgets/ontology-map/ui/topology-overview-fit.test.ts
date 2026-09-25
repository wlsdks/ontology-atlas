import { describe, expect, it } from "vitest";

import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import { overviewBoundsFor, overviewForPositionTargets } from "./topology-overview-fit";
import { computeSpineBounds, type TopologyWorld, type WorldNode } from "./topology-world";

const tokens = {
  radiusProject: 20,
  radiusDomain: 14,
  radiusCapability: 8,
  radiusElement: 5,
} as unknown as OntologyMapTokens;

function node(partial: Partial<WorldNode> & Pick<WorldNode, "id" | "kind" | "x" | "y">): WorldNode {
  return {
    label: partial.id,
    parentId: null,
    isHub: false,
    fresh: false,
    stale: false,
    count: 0,
    magnitudeScale: 1,
    starMagnitude: 0,
    homeX: partial.x,
    homeY: partial.y,
    ...partial,
  };
}

/**
 * Every overview frame is built on the spine it draws (2026-09-25): the fit button, the
 * `0` key, the entry snap, the deselect return and the return from Galaxy must agree,
 * and none of them may frame a hub the density gate folded behind a crowded parent.
 */
describe("overview frames — a folded hub", () => {
  const p = node({ id: "p", kind: "project", x: 0, y: 0 });
  const left = node({ id: "dl", kind: "domain", x: -250, y: 0, parentId: "p" });
  const right = node({ id: "dr", kind: "domain", x: 250, y: 0, parentId: "p" });
  const caps = Array.from({ length: 13 }, (_, i) =>
    node({ id: `c${i}`, kind: "capability", x: -395, y: -60 + i * 10, parentId: "dl", isHub: i === 0 }),
  );
  const nodes = [p, left, right, ...caps];
  const world = {
    nodes,
    nodeById: new Map(nodes.map((n) => [n.id, n] as const)),
    childrenByParent: new Map([["p", ["dl", "dr"]], ["dl", caps.map((c) => c.id)]]),
    spineBounds: computeSpineBounds(nodes, tokens),
    bounds: { minX: -403, minY: -68, maxX: 264, maxY: 68 },
  } as unknown as TopologyWorld;
  const home = new Map(nodes.map((n) => [n.id, { x: n.homeX, y: n.homeY }] as const));

  it("fits the drawn cross, not the folded hub, on the way back from Galaxy", () => {
    const { bounds } = overviewForPositionTargets("spine", world, tokens, home, new Set());
    expect(bounds).toEqual({ minX: -264, minY: -20, maxX: 264, maxY: 20 });
  });

  it("agrees with the fit button's bounds", () => {
    const { bounds } = overviewForPositionTargets("spine", world, tokens, home, new Set());
    expect(overviewBoundsFor("spine", world, tokens, new Set(), null)).toEqual(bounds);
  });

  it("frames the hub once its parent is expanded", () => {
    const { bounds } = overviewForPositionTargets("spine", world, tokens, home, new Set(["dl"]));
    expect(bounds.minX).toBe(-403);
    expect(overviewBoundsFor("spine", world, tokens, new Set(["dl"]), null).minX).toBe(-403);
  });

  it("keeps every node in the full fit", () => {
    const { bounds } = overviewForPositionTargets("full", world, tokens, home, new Set());
    expect(bounds.minX).toBe(-403);
  });
});
