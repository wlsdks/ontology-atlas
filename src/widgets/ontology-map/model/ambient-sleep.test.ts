import { describe, expect, it } from "vitest";
import {
  AMBIENT_SLEEP_DELAY_MS,
  AMBIENT_SLEEP_RAMP_MS,
  ambientSleepFactor,
  createAmbientClock,
  isAmbientAsleep,
  stepAmbientClock,
} from "./ambient-sleep";

describe("ambientSleepFactor", () => {
  const D = AMBIENT_SLEEP_DELAY_MS;
  const R = AMBIENT_SLEEP_RAMP_MS;

  // The awake span must not differ by one pixel: sleep removes idle cost only.
  it("holds exactly 1 from the input until the delay ends", () => {
    expect(ambientSleepFactor(0, 0)).toBe(1);
    expect(ambientSleepFactor(D / 2, 0)).toBe(1);
    expect(ambientSleepFactor(D, 0)).toBe(1);
  });

  it("decreases monotonically from 1 to 0 across the ramp after the delay", () => {
    const quarter = ambientSleepFactor(D + R * 0.25, 0);
    const half = ambientSleepFactor(D + R * 0.5, 0);
    const threeQuarter = ambientSleepFactor(D + R * 0.75, 0);
    expect(quarter).toBeCloseTo(0.75, 5);
    expect(half).toBeCloseTo(0.5, 5);
    expect(threeQuarter).toBeCloseTo(0.25, 5);
    expect(quarter).toBeGreaterThan(half);
    expect(half).toBeGreaterThan(threeQuarter);
  });

  it("is 0 once the ramp ends and stays 0 after", () => {
    expect(ambientSleepFactor(D + R, 0)).toBe(0);
    expect(ambientSleepFactor(D + R * 10, 0)).toBe(0);
    expect(ambientSleepFactor(D + 3_600_000, 0)).toBe(0);
  });

  it("returns to 1 at once when input arrives", () => {
    const deepSleep = D + R * 5;
    expect(ambientSleepFactor(deepSleep, 0)).toBe(0);
    expect(ambientSleepFactor(deepSleep, deepSleep)).toBe(1);
  });

  it("treats a negative elapsed time (clock going back, just reset) as awake", () => {
    expect(ambientSleepFactor(0, 1000)).toBe(1);
  });

  it("falls back to awake on a NaN elapsed time instead of freezing", () => {
    expect(ambientSleepFactor(Number.NaN, 0)).toBe(1);
    expect(ambientSleepFactor(0, Number.NaN)).toBe(1);
  });

  it("drops straight to 0 after the delay when rampMs is 0", () => {
    expect(ambientSleepFactor(D + 1, 0, D, 0)).toBe(0);
    expect(ambientSleepFactor(D, 0, D, 0)).toBe(1);
  });
});

describe("isAmbientAsleep", () => {
  // Closing the condition mid-ramp would freeze the comets at partial speed.
  it("counts as not yet asleep while the ramp runs (factor above 0)", () => {
    expect(isAmbientAsleep(1)).toBe(false);
    expect(isAmbientAsleep(0.5)).toBe(false);
    expect(isAmbientAsleep(0.001)).toBe(false);
  });

  it("counts as asleep only at factor 0", () => {
    expect(isAmbientAsleep(0)).toBe(true);
  });
});

describe("ambient sleep contract, end to end", () => {
  it("sleeps after 30 s without input and wakes on one click", () => {
    let lastInput = 1_000;
    const at = (ms: number) => ambientSleepFactor(ms, lastInput);

    expect(at(1_000)).toBe(1);
    expect(at(20_000)).toBe(1);
    expect(at(31_000)).toBe(1);
    expect(at(32_000)).toBeCloseTo(0.5, 5);
    expect(isAmbientAsleep(at(32_000))).toBe(false);
    expect(at(33_000)).toBe(0);
    expect(isAmbientAsleep(at(33_000))).toBe(true);

    lastInput = 40_000;
    expect(at(40_000)).toBe(1);
    expect(isAmbientAsleep(at(40_000))).toBe(false);
  });
});

describe("stepAmbientClock", () => {
  const D = AMBIENT_SLEEP_DELAY_MS;
  const R = AMBIENT_SLEEP_RAMP_MS;
  const run = (clock: ReturnType<typeof createAmbientClock>, entry: number, lastInput: number, from: number, to: number) => {
    for (let now = from + 16; now <= to; now += 16) {
      stepAmbientClock(clock, entry, now, 16, ambientSleepFactor(now, lastInput));
    }
    return clock.lostMs;
  };

  it("loses no time while input is recent, so an awake sky is the same sky as before", () => {
    const clock = createAmbientClock();
    stepAmbientClock(clock, 0, 0, 16, 1);
    expect(run(clock, 0, 0, 0, D)).toBe(0);
  });

  it("slows across the ramp and stands still once asleep", () => {
    const clock = createAmbientClock();
    stepAmbientClock(clock, 0, 0, 16, 1);
    run(clock, 0, 0, 0, D);
    const afterRamp = run(clock, 0, 0, D, D + R);
    expect(afterRamp).toBeGreaterThan(R * 0.4);
    expect(afterRamp).toBeLessThan(R * 0.6);
    const later = run(clock, 0, 0, D + R, D + R + 4800);
    expect(D + R + 4800 - later).toBeCloseTo(D + R - afterRamp, 6);
  });

  it("resumes from where it stopped on input, advancing one frame rather than the whole sleep", () => {
    const clock = createAmbientClock();
    stepAmbientClock(clock, 0, 0, 16, 1);
    run(clock, 0, 0, 0, D + R + 16);
    const restedAt = D + R + 16 - clock.lostMs;
    const woken = D + R + 60_000;
    const lost = stepAmbientClock(clock, 0, woken, 50, ambientSleepFactor(woken, woken));
    expect(woken - lost).toBeCloseTo(restedAt + 50, 6);
  });

  it("starts over on a new entry", () => {
    const clock = createAmbientClock();
    stepAmbientClock(clock, 0, 0, 16, 1);
    run(clock, 0, 0, 0, D + R + 1000);
    expect(stepAmbientClock(clock, 9000, 9250, 16, 1)).toBe(0);
  });
});
