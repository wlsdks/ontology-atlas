import { expect, it } from "vitest";
import type { LibraryGraphNode } from "../model/build-library-graph";
import { LibraryLabelMarkIndex } from "./library-label-mark-index";

it("keeps every matching mark across negative cells, boundaries and broad queries", () => {
  const nodes = Array.from({ length: 1000 }, (_, i) => ({ id: String(i) }) as LibraryGraphNode);
  const positions = new Map(nodes.map((node, i) => [node.id, { x: (i % 40 - 20) * 64, y: (Math.floor(i / 40) - 12) * 64 }]));
  const index = new LibraryLabelMarkIndex(nodes, positions);
  for (const size of [0, 1, 63, 64, 100, 10000]) {
    for (let left = -1300; left <= 1300; left += 127) {
      const top = left / 2;
      const accepts = (node: LibraryGraphNode) => {
        const point = positions.get(node.id)!;
        return point.x >= left && point.x <= left + size && point.y >= top && point.y <= top + size;
      };
      expect(index.some(left, top, left + size, top + size, accepts))
        .toBe(nodes.some(accepts));
    }
  }
});

it("checks unindexed marks and handles coordinates beyond safe integer cells", () => {
  const nodes = [{ id: "huge" }, { id: "missing" }] as LibraryGraphNode[];
  const index = new LibraryLabelMarkIndex(nodes, new Map([["huge", { x: 1e20, y: 1e20 }]]));
  expect(index.some(1e20, 1e20, 1e20, 1e20, node => node.id === "huge")).toBe(true);
  expect(index.some(0, 0, 10, 10, node => node.id === "missing")).toBe(true);
  expect(index.some(-10, -10, 10, 10, node => node.id === "huge")).toBe(false);
});
