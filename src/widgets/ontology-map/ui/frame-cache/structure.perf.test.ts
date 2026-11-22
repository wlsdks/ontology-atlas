import { expect, it } from "vitest";
import { collectDomeAncestry, collectDomeSubtree } from "../../model/dome-view/dome-ancestry";
import { domeFamily } from "./structure";
import type { WorldNode } from "../world/topology-world";

/** A map whose `get` calls are counted in `lookups`, the steps of a subtree or ancestry walk. */
const lookups = { count: 0 };
class CountedMap<K, V> extends Map<K, V> {
  override get(key: K): V | undefined {
    lookups.count += 1;
    return super.get(key);
  }
}

it("walks a large selected subtree once, not once per steady frame", () => {
  const ids = Array.from({ length: 3000 }, (_, i) => `element:${i}`);
  const world = {
    nodeById: new CountedMap(ids.map(id => [id, { id, parentId: "root" } as WorldNode])),
    childrenByParent: new CountedMap([["root", ids]]),
    neighborMap: new Map<string, ReadonlySet<string>>(),
    edges: [],
  };
  const nodes = new Set<string>(), edges = new Set<string>();
  collectDomeAncestry("root", id => world.nodeById.get(id)?.parentId, nodes, edges);
  collectDomeSubtree("root", id => world.childrenByParent.get(id), nodes, edges);

  lookups.count = 0;
  for (let frame = 0; frame < 100; frame++) domeFamily(world, "root", true);
  const steady = lookups.count;

  expect(domeFamily(world, "root", true).nodes).toEqual(nodes);
  expect(nodes.size).toBe(ids.length);
  // Measured 2026-11-23: one walk is 3,002 lookups, so 100 frames that each walked would be 300,200.
  expect(steady).toBeLessThanOrEqual(2 * ids.length);
});
