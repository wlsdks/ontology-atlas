import { describe, expect, it } from "vitest";
import type { FlowMarksInput } from "../flow-marks";
import type { DialLink } from "../links";
import { createBranchRouter } from "./routes";

const a = { p: { x: 300, y: 300 }, r: 12 };
const b = { p: { x: 80, y: 300 }, r: 12 };
function fixture() {
  const cluster = { domainId: "d", branchPair: 0, branchSide: -1, chip: a.p };
  return {
    model: { capabilityById: new Map([["c", { domainId: "d" }]]), flows: [] },
    scene: { clusterByDomain: new Map([["d", cluster]]), positions: new Map([["d", a.p], ["c", b.p]]) },
    tokens: { flowTrimStartPx: 4, flowTrimEndPx: 5, flowSplitPx: 2, ledgerGapPx: 24 },
    freeRect: { minX: 0, maxX: 1000, minY: 0, maxY: 800 },
    endBox: (id: string) => id === "d" ? { minX: 240, maxX: 360, minY: 270, maxY: 330 } : null,
  } as unknown as FlowMarksInput;
}
const link = { key: "d\0c", u: "d", v: "c", uv: 3, vu: 2, total: 5, attended: true, relatesOnly: false } as DialLink;

describe("readable branch routes", () => {
  it("connects a same-domain capability through its facing card edge without a returning loop", () => {
    const route = createBranchRouter(fixture(), () => ({ x: 700, y: -600 }));
    const curves = route(link, a, b);
    expect(curves.map(c => [c.from, c.to, c.count])).toEqual([["d", "c", 3], ["c", "d", 2]]);
    const forward = curves[0]!;
    expect(forward.p0.x).toBeLessThanOrEqual(240);
    for (const curve of curves) {
      expect(Math.max(...curve.line.map(p => p.x))).toBeLessThanOrEqual(240);
      expect(Math.min(...curve.line.map(p => p.y))).toBeGreaterThan(260);
      expect(Math.max(...curve.line.map(p => p.y))).toBeLessThan(340);
    }
  });

  it("uses a gentle local route when a distant legacy control point is unnecessary", () => {
    const input = fixture();
    input.endBox = () => null;
    const end = { p: { x: 700, y: 300 }, r: 12 };
    const route = createBranchRouter(input, () => ({ x: 500, y: -900 }));
    const curves = route({ ...link, vu: 0 }, a, end);
    expect(curves).toHaveLength(1);
    expect(Math.min(...curves[0]!.line.map(p => p.y))).toBeGreaterThan(260);
    expect(curves[0]!.line.every(p => p.x >= 300 && p.x <= 700)).toBe(true);
  });
});
