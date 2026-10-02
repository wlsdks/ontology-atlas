import { describe, expect, it } from "vitest";

import {
  GALAXY_DIM_FLOOR,
  GALAXY_FILAMENT_FLOOR,
  GALAXY_TEMPERATURE_ORDER,
  bodyPresence,
  filamentPresence,
  galaxyAppearance,
  galaxyMeteorPhase,
  galaxyNebulaMotion,
  galaxySelectionInk,
  galaxyTemperatureKey,
  galaxyTwinkle,
  starLuminance,
  starMagnitude,
} from "./galaxy";

/**
 * The galaxy is a view the person picks: nothing the flat map tells is lost in the sky, and
 * the sky claims no fact the data lacks.
 */
describe("starMagnitude — the fact the map already ranked by, made continuous", () => {
  it("orders by the same magnitude the bright-star ranking uses", () => {
    // Degree dominates `size + fullDegree * 18`, which makes a hub a hub.
    const hub = starMagnitude(4, 20, 400);
    const leaf = starMagnitude(4, 0, 400);
    expect(hub).toBeGreaterThan(leaf);
    expect(starMagnitude(4, 20, 400)).toBeGreaterThan(starMagnitude(4, 10, 400));
  });

  it("compresses the top and lifts the bottom, the way brightness is actually seen", () => {
    // Stevens' law: linear luminance would crush every low-degree node into one dark, so half
    // the magnitude must read as clearly more than half as bright.
    const half = starMagnitude(0, 10, 360);
    expect(half).toBeGreaterThan(0.65);
    expect(half).toBeLessThan(0.75);
  });

  it("stays inside 0–1 for a node bigger than the ceiling it was normalised against", () => {
    expect(starMagnitude(9999, 9999, 10)).toBe(1);
    expect(starMagnitude(0, 0, 0)).toBe(0);
  });
});

describe("starLuminance — a faint star is still a star", () => {
  it("never lets a node with no connections go dark", () => {
    // A node at zero would be one the picture denies exists.
    expect(starLuminance(0)).toBe(GALAXY_DIM_FLOOR);
    expect(GALAXY_DIM_FLOOR).toBeGreaterThan(0.1);
  });

  it("still gives a hub a clear margin over a leaf", () => {
    // The range above the floor carries the fact, so it stays wide enough to read.
    expect(starLuminance(1) / starLuminance(0)).toBeGreaterThan(2.25);
  });
});

describe("galaxySelectionInk", () => {
  it("keeps the emitter hex contract while easing from temperature to indigo", () => {
    expect(galaxySelectionInk("#f2e6d2", "#8890e0", 0)).toBe("#f2e6d2");
    expect(galaxySelectionInk("#f2e6d2", "#8890e0", 0.5)).toBe("#bdbbd9");
    expect(galaxySelectionInk("#f2e6d2", "#8890e0", 1)).toBe("#8890e0");
  });
});

describe("galaxyAppearance", () => {
  it("answers with the core first and settles every layer inside one ramp", () => {
    expect(galaxyAppearance(0)).toEqual({ core: 0, field: 0, corona: 0, filament: 0 });
    const early = galaxyAppearance(0.1);
    expect(early.core).toBeGreaterThan(early.field);
    expect(early.field).toBeGreaterThan(early.corona);
    expect(early.filament).toBe(0);
    expect(galaxyAppearance(1)).toEqual({ core: 1, field: 1, corona: 1, filament: 1 });
  });

  it("is monotonic and therefore reverses without a discontinuity", () => {
    const samples = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1].map(galaxyAppearance);
    for (const key of ["core", "field", "corona", "filament"] as const) {
      for (let index = 1; index < samples.length; index += 1) {
        expect(samples[index][key]).toBeGreaterThanOrEqual(samples[index - 1][key]);
      }
    }
  });
});

describe("Galaxy atmosphere", () => {
  it("gives each id a deterministic intermittent flare on its own 4–8 second clock", () => {
    const first = galaxyTwinkle("domain:delivery", 4123, false);
    expect(galaxyTwinkle("domain:delivery", 4123, false)).toEqual(first);
    expect(first.periodMs).toBeGreaterThanOrEqual(4000);
    expect(first.periodMs).toBeLessThanOrEqual(8000);
    expect(galaxyTwinkle("domain:another", 4123, false).periodMs).not.toBe(first.periodMs);
    let activeSamples = 0;
    let restingSamples = 0;
    for (let now = 0; now <= first.periodMs; now += 10) {
      const sample = galaxyTwinkle("domain:delivery", now, false);
      expect(sample.intensity).toBeGreaterThanOrEqual(0.9);
      expect(sample.intensity).toBeLessThanOrEqual(1.6);
      expect(sample.glint).toBeGreaterThanOrEqual(0);
      expect(sample.glint).toBeLessThanOrEqual(1);
      if (sample.glint > 0.001) activeSamples += 1;
      else restingSamples += 1;
    }
    expect(activeSamples * 10).toBeGreaterThanOrEqual(680);
    expect(activeSamples * 10).toBeLessThanOrEqual(1320);
    expect(restingSamples).toBeGreaterThan(activeSamples * 2);
  });

  it("drops a meteor that was in flight before a quiet cutoff and keeps the next one", () => {
    const inFlight = 2200;
    expect(galaxyMeteorPhase(inFlight, 0.25)).not.toBeNull();
    expect(galaxyMeteorPhase(inFlight, 0.25, 2000)).toBeNull();
    expect(galaxyMeteorPhase(inFlight, 0.25, 1700)?.progress).toBe(galaxyMeteorPhase(inFlight, 0.25)?.progress);
    let next = inFlight;
    while (galaxyMeteorPhase(next, 0.25) !== null) next += 10;
    while (galaxyMeteorPhase(next, 0.25) === null) next += 10;
    expect(galaxyMeteorPhase(next + 50, 0.25, 2000)).toEqual(galaxyMeteorPhase(next + 50, 0.25));
  });

  it("freezes twinkle and gives each meteor entry a stable varied path and gap", () => {
    expect(galaxyTwinkle("domain:delivery", 0, true)).toEqual(
      galaxyTwinkle("domain:delivery", 5000, true),
    );
    expect(galaxyMeteorPhase(1799, 0.25)).toBeNull();
    expect(galaxyMeteorPhase(1800, 0.25)?.progress).toBe(0);
    expect(galaxyMeteorPhase(2200, 0.25)).toEqual(galaxyMeteorPhase(2200, 0.25));
    expect(galaxyMeteorPhase(2200, 0.25)).not.toEqual(galaxyMeteorPhase(2200, 0.75));

    const collectStarts = (entrySeed: number) => {
      const starts: Array<{ at: number; phase: NonNullable<ReturnType<typeof galaxyMeteorPhase>> }> = [];
      let previousActive = false;
      for (let now = 1800; now <= 120_000; now += 100) {
        const sample = galaxyMeteorPhase(now, entrySeed);
        if (sample && !previousActive) starts.push({ at: now, phase: sample });
        previousActive = sample !== null;
      }
      return starts;
    };
    for (const entrySeed of [0.17, 0.7334]) {
      const starts = collectStarts(entrySeed);
      expect(starts.length).toBeGreaterThan(8);
      expect(new Set(starts.map(({ phase: sample }) => sample.direction))).toEqual(new Set([1, -1]));
      expect(Math.max(...starts.map(({ phase: sample }) => sample.startX)) -
        Math.min(...starts.map(({ phase: sample }) => sample.startX))).toBeGreaterThan(0.35);
      expect(Math.max(...starts.map(({ phase: sample }) => sample.startY)) -
        Math.min(...starts.map(({ phase: sample }) => sample.startY))).toBeGreaterThan(0.35);
      for (const { phase: sample } of starts) {
        expect(Math.abs(sample.deltaX)).toBeGreaterThanOrEqual(0.28);
        expect(Math.abs(sample.deltaX)).toBeLessThanOrEqual(0.62);
        expect(sample.startX + sample.deltaX).toBeGreaterThanOrEqual(0.03);
        expect(sample.startX + sample.deltaX).toBeLessThanOrEqual(0.97);
      }
      const gaps = starts.slice(1).map((entry, index) => entry.at - starts[index].at);
      expect(new Set(gaps).size).toBeGreaterThan(3);
    }
  });

  it("flows only diffuse wisps and freezes every atmosphere phase for reduced motion", () => {
    const start = galaxyNebulaMotion(0, false);
    const later = galaxyNebulaMotion(2500, false);
    expect(later).not.toEqual(start);
    for (let now = 0; now <= 74_000; now += 500) {
      const sample = galaxyNebulaMotion(now, false);
      expect(sample.luminance).toBeGreaterThanOrEqual(0.879);
      expect(sample.luminance).toBeLessThanOrEqual(1);
      // Atmosphere stays inside a shallow arc; this is never a rotating graph.
      expect(Math.abs(sample.innerRotation)).toBeLessThan(Math.PI / 12);
      expect(Math.abs(sample.outerRotation)).toBeLessThan(Math.PI / 12);
    }
    expect(galaxyNebulaMotion(0, true)).toEqual({
      luminance: 1,
      innerRotation: 0,
      outerRotation: 0,
    });
    expect(galaxyNebulaMotion(0, true)).toEqual(galaxyNebulaMotion(74_000, true));
  });
});

describe("galaxyTemperatureKey — kind keeps its channel after the silhouette melts", () => {
  it("gives every kind its own step", () => {
    const keys = GALAXY_TEMPERATURE_ORDER.map(galaxyTemperatureKey);
    expect(new Set(keys).size).toBe(GALAXY_TEMPERATURE_ORDER.length);
  });

  it("runs warm to cool down the containment ladder", () => {
    expect(GALAXY_TEMPERATURE_ORDER).toEqual(["project", "domain", "capability", "element"]);
  });

  it("falls back to the coolest step for an unknown kind rather than painting nothing", () => {
    expect(galaxyTemperatureKey("element")).toBe("galaxyElement");
  });
});

describe("bodyPresence / filamentPresence — what the sky replaces and what it keeps", () => {
  it("takes the body away and leaves the light", () => {
    expect(bodyPresence(0)).toBe(1);
    expect(bodyPresence(1)).toBe(0);
  });

  /** A node drawn as a solid shape and a bright star at once reads as a bug. */
  it("fades the body faster than the sky arrives, so the two never both dominate", () => {
    expect(bodyPresence(0.5)).toBeLessThan(0.5 - 0.2);
    for (let i = 0; i <= 20; i += 1) {
      const g = i / 20;
      expect(bodyPresence(g)).toBeLessThanOrEqual(1 - g + 1e-9);
    }
  });

  it("thins relations to filaments but never erases the structure", () => {
    expect(filamentPresence(0)).toBe(1);
    expect(filamentPresence(1)).toBeCloseTo(GALAXY_FILAMENT_FLOOR, 10);
    // Structure between stars is what Atlas shows; without it the galaxy is a scatter plot.
    expect(GALAXY_FILAMENT_FLOOR).toBeGreaterThan(0.2);
  });
});
