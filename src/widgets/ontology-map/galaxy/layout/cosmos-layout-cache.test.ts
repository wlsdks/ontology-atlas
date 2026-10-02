import { describe, expect, it } from "vitest";
import { cosmosLayoutFor, cosmosLayoutRuns } from "./cosmos-layout-cache";

const nodes = [
  { id: "p", label: "P", kind: "project" as const },
  { id: "d", label: "D", kind: "domain" as const },
  { id: "c", label: "C", kind: "capability" as const },
  { id: "e", label: "E", kind: "element" as const },
];
const edges = [
  { source: "p", target: "d", kind: "contains" as const, relationType: "contains" },
  { source: "d", target: "c", kind: "contains" as const, relationType: "contains" },
  { source: "c", target: "e", kind: "contains" as const, relationType: "contains" },
];

describe("cosmos layout cache", () => {
  it("computes once for the same arrays and an equal record", () => {
    const before = cosmosLayoutRuns();
    const first = cosmosLayoutFor(nodes, edges, null, false);
    expect(cosmosLayoutFor(nodes, edges, null, false)).toBe(first);
    expect(cosmosLayoutRuns()).toBe(before + 1);
    const record = first.placement;
    const pinned = cosmosLayoutFor(nodes, edges, record, false);
    expect(cosmosLayoutFor(nodes, edges, structuredClone(record), false)).toBe(pinned);
    expect(cosmosLayoutRuns()).toBe(before + 2);
  });

  it("computes again when the arrays, the record or freshness change", () => {
    const before = cosmosLayoutRuns();
    cosmosLayoutFor(nodes, edges, null, false);
    cosmosLayoutFor(nodes, edges, null, true);
    cosmosLayoutFor([...nodes], edges, null, true);
    cosmosLayoutFor([...nodes], edges, { version: 1, centres: { d: [400, 0] } }, true);
    expect(cosmosLayoutRuns()).toBe(before + 4);
  });
});
