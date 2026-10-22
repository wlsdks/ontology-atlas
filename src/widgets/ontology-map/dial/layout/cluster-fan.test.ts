import { describe, expect, it } from "vitest";
import { clusterFanPoint, FAN_CAPACITY } from "./cluster-fan";

describe("outward cluster fan", () => {
  it("keeps every capability outward, separated by a pitch, and stable as siblings arrive", () => {
    for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.72]) {
      const points = Array.from({ length: FAN_CAPACITY }, (_, k) => clusterFanPoint(k, angle, 34));
      for (let i = 0; i < points.length; i++) {
        const p = points[i]!;
        expect(p.x * Math.cos(angle) + p.y * Math.sin(angle)).toBeGreaterThan(0);
        for (const q of points.slice(0, i)) expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThanOrEqual(34 - 1e-8);
        expect(clusterFanPoint(i, angle, 34)).toEqual(p);
      }
    }
  });
});
