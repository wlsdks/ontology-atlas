import { describe, expect, it, vi } from "vitest";
import type { DialWorld } from "../../../dial/types";
import type { TopologyWorld } from "../../world/topology-world";
import { branchSelectionMargin } from "./selection-margin";
vi.mock("../../../dial/tokens", () => ({ readDialTokens: () => ({ nameMaxPx: 180, ledgerGapPx: 20, discGlyphPx: 12, chipMinPx: 6, labelScale: 1 }) }));
vi.mock("../../../dial/fit", () => ({ createMeasureText: () => (text: string) => text.length * 8 }));
const nodes = [{ id: "d", x: 0, label: "Domain" }, { id: "c", x: 300, label: "Selected capability" }];
const world = { nodeById: new Map(nodes.map(n => [n.id, n])) } as unknown as TopologyWorld;
function dial(side: number) {
  const cluster = { domainId: "d", branchSide: side, items: [{ id: "c", direct: false }] };
  return { model: { domainOf: new Map([["c", "d"]]) }, scene: { branches: true, branchPreviewRows: 6, clusters: [cluster], clusterByDomain: new Map([["d", cluster]]) } } as unknown as DialWorld;
}
describe("branch selection clearance", () => {
  it("reserves the natural name width plus breathing room before collision clamping", () => {
    const margin = branchSelectionMargin(world, dial(1), "c", 1, 500);
    expect(typeof margin).toBe("object");
    expect((margin as { right: number }).right).toBeGreaterThan(200);
    expect((margin as { left: number; right: number }).left + (margin as { right: number }).right).toBeLessThan(500);
  });
  it("includes the whole branch when space allows and protects left-facing labels too", () => {
    const margin = branchSelectionMargin(world, dial(1), "c", 1, 1200) as { left: number; right: number };
    expect(margin.left).toBeGreaterThan(400);
    const left = branchSelectionMargin(world, dial(-1), "c", 1, 500) as { left: number; right: number };
    expect(left.left).toBeGreaterThan(200);
    expect(left.right).toBeLessThan(left.left);
  });
});

it("keeps the selected label clear when both panels leave only a narrow span", () => {
  const margin = branchSelectionMargin(world, dial(1), "c", 1, 280) as { left: number; right: number };
  expect(margin.left + margin.right).toBeLessThan(280);
  expect(margin.right).toBeGreaterThanOrEqual("Selected capability".length * 8 + 30 + 24);
});
