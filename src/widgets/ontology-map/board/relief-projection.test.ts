import { describe, expect, it } from "vitest";
import { TIER_ASSEMBLE_TOTAL_MS, TIER_RISE_MS } from "../morph/tier-assembly";
import {
  groundInverseY,
  projectReliefPoint,
  reliefHeightPx,
  reliefRiseAt,
  reliefRiseDelayMs,
  reliefRisePitchAt,
  RELIEF_PITCH_REST,
} from "./relief-projection";

describe("reliefHeightPx", () => {
  it("gives 0.12 R with no dependents and 1.10 R to the most depended-on", () => {
    expect(reliefHeightPx(0, 40, 50)).toBeCloseTo(6, 9);
    expect(reliefHeightPx(40, 40, 50)).toBeCloseTo(55, 9);
  });

  it("rises monotonically and logarithmically", () => {
    let last = -Infinity;
    for (let d = 0; d <= 15; d += 1) {
      const h = reliefHeightPx(d, 15, 50);
      expect(h).toBeGreaterThan(last);
      last = h;
    }
    expect(reliefHeightPx(3, 15, 50)).toBeCloseTo(50 * (0.12 + 0.98 * 0.5), 9);
  });

  it("caps above the maximum and keeps a board with no dependencies at the floor", () => {
    expect(reliefHeightPx(400, 40, 10)).toBeCloseTo(11, 9);
    expect(reliefHeightPx(0, 0, 10)).toBeCloseTo(1.2, 9);
  });
});

describe("projectReliefPoint", () => {
  it("is the identity at pitch 0 for every height", () => {
    const view = { pitch: 0, pivotY: 400 };
    for (const [x, y, h] of [[12.25, 3.5, 0], [700, 950.75, 60], [-40, -8, 5]] as const) {
      const p = projectReliefPoint(x, y, h, view);
      expect(p.x).toBe(x);
      expect(Math.abs(p.y - y)).toBeLessThan(1e-9);
    }
  });

  it("keeps x, shortens toward the pivot and lifts by the height", () => {
    const view = { pitch: RELIEF_PITCH_REST, pivotY: 400 };
    const below = projectReliefPoint(300, 600, 0, view);
    expect(below.x).toBe(300);
    expect(below.y).toBeCloseTo(400 + 200 * Math.cos(RELIEF_PITCH_REST), 9);
    expect(below.y - projectReliefPoint(300, 600, 30, view).y).toBeCloseTo(30 * Math.sin(RELIEF_PITCH_REST), 9);
  });

  it("inverts a ground row back to unit space", () => {
    const pose = { pitch: RELIEF_PITCH_REST, pivotY: 380 };
    const cam = { R: 40, oy: 120 };
    for (const uy of [-3, 0, 2.5, 9]) {
      const py = projectReliefPoint(0, cam.oy + uy * cam.R, 0, pose).y;
      expect(groundInverseY(py, pose, cam)).toBeCloseTo(uy, 9);
    }
  });
});

describe("the first relief's clock", () => {
  it("raises the project, then domains, then capabilities ring by ring, landed by the total", () => {
    const project = reliefRiseDelayMs("project", 0, 2, 9);
    const domain = reliefRiseDelayMs("domain", 5, 2, 9);
    const inner = reliefRiseDelayMs("capability", 2, 2, 9);
    const outer = reliefRiseDelayMs("capability", 9, 2, 9);
    expect(project).toBeLessThan(domain);
    expect(domain).toBeLessThan(inner);
    expect(inner).toBeLessThan(outer);
    expect(outer + TIER_RISE_MS).toBe(TIER_ASSEMBLE_TOTAL_MS);
    expect(reliefRiseAt(outer, outer)).toBe(0);
    expect(reliefRiseAt(outer + TIER_RISE_MS, outer)).toBe(1);
    expect(reliefRisePitchAt(TIER_ASSEMBLE_TOTAL_MS, 0, RELIEF_PITCH_REST)).toBe(RELIEF_PITCH_REST);
  });
});
