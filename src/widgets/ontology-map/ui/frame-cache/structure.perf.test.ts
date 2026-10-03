import { expect, it } from "vitest";
import { collectDomeAncestry, collectDomeSubtree } from "../../model/dome-ancestry";
import { domeFamily } from "./structure";
import type { WorldNode } from "../topology-world";

it("avoids repeating large selected-subtree walks in steady frames", () => {
  const ids = Array.from({ length: 3000 }, (_, i) => `element:${i}`);
  const world = {
    nodeById: new Map(ids.map(id => [id, { id, parentId: "root" } as WorldNode])),
    childrenByParent: new Map([["root", ids]]),
    neighborMap: new Map<string, ReadonlySet<string>>(),
    edges: [],
  };
  const nodes = new Set<string>(), edges = new Set<string>();
  const uncached = () => {
    collectDomeAncestry("root", id => world.nodeById.get(id)?.parentId, nodes, edges);
    collectDomeSubtree("root", id => world.childrenByParent.get(id), nodes, edges);
  };
  const cached = () => domeFamily(world, "root", true);
  uncached(); cached();
  const median = (run: () => unknown) => {
    const samples = [];
    for (let round = 0; round < 5; round++) {
      const start = performance.now();
      for (let frame = 0; frame < 100; frame++) run();
      samples.push(performance.now() - start);
    }
    return samples.sort((a, b) => a - b)[2];
  };
  const before = median(uncached), after = median(cached);
  console.log(JSON.stringify({ nodes: ids.length, frames: 100, uncachedMs: before, cachedMs: after }));
  expect(cached().nodes.size).toBe(ids.length);
  expect(cached().nodes).toEqual(nodes);
  // Relative same-process comparison; keep ample headroom for the measured reuse win.
  expect(after).toBeLessThan(before / 10);
});
