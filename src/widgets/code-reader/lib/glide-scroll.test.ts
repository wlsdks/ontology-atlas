import { describe, expect, it } from "vitest";

import { MOTION } from "@/shared/motion";

import { glidePosition } from "./glide-scroll";

describe("glidePosition", () => {
  it("moves only forward and arrives on the --motion-slow clock without overshoot", () => {
    const slowMs = MOTION.slow.duration * 1000;
    const samples = Array.from({ length: 13 }, (_, step) => glidePosition(40, 400, (slowMs * step) / 10));
    expect(samples[0]).toBe(40);
    for (let i = 1; i < samples.length; i += 1) expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]!);
    expect(samples[10]).toBe(400);
    expect(samples[12]).toBe(400);
  });
});
