import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `window.__atlasMap` is the only way automation can tell the map apart from outside. If it vanishes
 * the harness falls back to cursor sweeping, and if its `e2e` gate goes it attaches for every user.
 */
const INSTRUMENTATION = join(
  process.cwd(),
  "src/widgets/ontology-map/ui/loop/use-topology-map-instrumentation.ts",
);

const source = readFileSync(INSTRUMENTATION, "utf8");
const loop = readFileSync(join(process.cwd(), "src/widgets/ontology-map/ui/loop/use-topology-loop.ts"), "utf8");

describe("map inspection hook (window.__atlasMap)", () => {
  it("the production loop installs the inspection hook", () => {
    expect(loop).toMatch(/import\s*\{\s*useTopologyMapInstrumentation\s*\}\s*from\s*["']\.\/use-topology-map-instrumentation["']/);
    expect(loop).toMatch(/\buseTopologyMapInstrumentation\(\{/);
  });

  it("attaches only when the `e2e` query is present, never as a permanent exposure", () => {
    expect(source).toContain("__atlasMap");
    // The gate must have this shape. Delete the condition and the diagnostic window becomes product surface.
    expect(source).toMatch(/URLSearchParams\(window\.location\.search\)\.has\("e2e"\)/);
  });

  it("removes the accessor, so nothing is left on the global after unmount", () => {
    expect(source).toMatch(/delete\s+\(window as unknown as \{\s*__atlasMap\?: typeof hook;?\s*\}\)\.__atlasMap/);
  });

  /**
   * This list is the reach of what can be distinguished from outside. Each missing
   * entry is a blind spot for automated checking, and in that blind spot a person has
   * to look at the screen instead.
   */
  const REQUIRED_ACCESSORS = [
    "nodes:", // What is where, and what can be dragged
    "edges:", // Where the lines run — the only input for whether the map reads *as a graph*
    "interaction:", // Whether the current drag is a node or the background
    "backing:", // Is the resolution cap actually applied
    "camera:", // Where the map is looking
    "selection:", // What is selected
    "chips:", // Does a chip's claim match reality
  ] as const;

  it.each(REQUIRED_ACCESSORS)("`%s` accessor exists", (accessor) => {
    expect(source).toMatch(new RegExp(`\\b${accessor}\\s*\\(\\)\\s*=>`));
  });

  it("edges expose their control points, since measuring the chord would count crossings that are not on screen", () => {
    expect(source).toMatch(/controlX:\s*toScreenX\(/);
    expect(source).toMatch(/controlY:\s*toScreenY\(/);
  });

  it("nodes expose their screen radius, since overlap cannot be counted without a radius", () => {
    // Must be **the same expression** as the drawing side: radiusForKind ×
    // magnitudeScale × camera zoom, ending there.
    expect(source).toMatch(
      /radius:\s*tokens\s*\n?\s*\?\s*radiusForKind\(n\.kind, tokens\) \*\s*\n?\s*n\.magnitudeScale \*\s*\n?\s*camera\.scale\.value\s*\n?\s*:\s*0/,
    );
  });

  it("exposes `draggable`, which differs from a hover hit saying whether it can be grabbed", () => {
    // A pointer cursor still fails to grab a node that is absent from the simulation; it becomes a pan.
    // Without this field the harness cannot see the difference.
    expect(source).toMatch(/draggable:\s*sim\?\.hasNode/);
  });

  it("the chip reports the claim and the actual side by side", () => {
    // With `claimedCount` but no `shownChildren`, the mismatch of "says +24 and draws
    // 1" is invisible from outside — a defect that actually occurred.
    expect(source).toMatch(/\bclaimedCount:\s*chip\.count/);
    expect(source).toMatch(/\bshownChildren:\s*shown/);
  });
});
