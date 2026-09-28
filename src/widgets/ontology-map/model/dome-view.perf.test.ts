import { describe, expect, it } from "vitest";

import { buildDomeModel, type DomeInputNode } from "./dome-view";

function vault(size: number): { nodes: DomeInputNode[]; edges: { sourceId: string; targetId: string }[] } {
  const domainCount = Math.max(1, Math.round(Math.sqrt(size) / 3));
  const capabilityCount = Math.round(size * 0.15);
  const nodes: DomeInputNode[] = [{ id: "p", kind: "project", x: 0, y: 0, parentId: null }];
  for (let d = 0; d < domainCount; d += 1) nodes.push({ id: `d${d}`, kind: "domain", x: d, y: 0, parentId: "p" });
  for (let c = 0; c < capabilityCount; c += 1) {
    nodes.push({ id: `c${c}`, kind: "capability", x: c, y: 1, parentId: `d${c % domainCount}` });
  }
  for (let e = 0; nodes.length < size; e += 1) {
    nodes.push({ id: `e${e}`, kind: "element", x: e, y: 2, parentId: `c${(e * 7919) % capabilityCount}` });
  }
  const edges = nodes.flatMap((node, i) => [
    ...(node.parentId === null ? [] : [{ sourceId: node.parentId, targetId: node.id }]),
    ...(node.kind === "element" && i % 25 === 0 ? [{ sourceId: node.id, targetId: `c${(i * 31) % capabilityCount}` }] : []),
  ]);
  return { nodes, edges };
}

function layoutMs(graph: ReturnType<typeof vault>): number {
  const started = performance.now();
  const model = buildDomeModel(graph.nodes, { arrangement: "coupling", edges: graph.edges });
  const elapsed = performance.now() - started;
  expect(model.coords.size).toBe(graph.nodes.length);
  return elapsed;
}

describe("the Neural cloud's layout cost", () => {
  it("stays well below quadratic: four times the concepts cost two to ten times as long, where every pair costs sixteen", () => {
    const small = vault(2000);
    const large = vault(8000);
    let smallMs = layoutMs(small);
    for (let run = 0; run < 3; run += 1) smallMs = Math.min(smallMs, layoutMs(small));
    const largeMs = layoutMs(large);
    const ratio = largeMs / smallMs;
    console.log(`[coupling-cloud] 2,000 concepts ${smallMs.toFixed(0)} ms, 8,000 concepts ${largeMs.toFixed(0)} ms, ratio ${ratio.toFixed(2)}`);
    expect(ratio).toBeGreaterThan(2);
    expect(ratio).toBeLessThan(10);
  });
});
