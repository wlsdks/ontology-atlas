import { describe, expect, it } from "vitest";
import { domainFlowWidth, drawDomainFlow } from "./domain-flows";

const params = { base: 0.5, slope: 0.35, max: 2.4 };

function fakeContext() {
  const fills: string[] = [];
  const ctx = {
    fillStyle: "",
    beginPath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    closePath() {},
    fill() {
      fills.push(String(ctx.fillStyle));
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills };
}

describe("domainFlowWidth", () => {
  it("follows base + slope·log2(1 + count) under the cap", () => {
    expect(domainFlowWidth(0, params)).toBeCloseTo(0.5, 6);
    expect(domainFlowWidth(1, params)).toBeCloseTo(0.85, 6);
    expect(domainFlowWidth(3, params)).toBeCloseTo(1.2, 6);
    expect(domainFlowWidth(100, params)).toBe(2.4);
  });

  it("grows monotonically and never passes the cap", () => {
    let last = -Infinity;
    for (let count = 0; count <= 4096; count += 1) {
      const w = domainFlowWidth(count, params);
      expect(w).toBeGreaterThanOrEqual(last);
      expect(w).toBeLessThanOrEqual(2.4);
      last = w;
    }
  });
});

describe("drawDomainFlow", () => {
  const p1 = { x: 0, y: 0 };
  const pc = { x: 50, y: 20 };
  const p2 = { x: 100, y: 0 };

  it("draws one head at the depended-on end for a one-way flow", () => {
    const { ctx, fills } = fakeContext();
    drawDomainFlow(ctx, p1, pc, p2, 2, false, "body", "head");
    expect(fills).toEqual(["body", "head"]);
  });

  it("draws heads at both ends for a two-way flow", () => {
    const { ctx, fills } = fakeContext();
    drawDomainFlow(ctx, p1, pc, p2, 2, true, "body", "head");
    expect(fills).toEqual(["body", "head", "head"]);
  });
});
