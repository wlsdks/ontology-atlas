// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { packGroupsAroundCentre, type PackBox } from "./library-graph-packing";

/** Footprints of mixed sizes from a fixed seed, so the spiral meets circles of every level. */
function boxes(count: number, seed: number): PackBox[] {
  let state = seed;
  const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
  return Array.from({ length: count }, () => ({ width: 4 + next() * next() * 400, height: 4 + next() * 160 }));
}

// Math.sin/cos differ in the last bits between macOS and Linux V8, so slots are compared at 0.001 px.
const roundedToMilliPx = (_key: string, value: unknown) =>
  typeof value === "number" ? Math.round(value * 1000) / 1000 : value;

describe("packGroupsAroundCentre", () => {
  // Digests of the slots the step-by-step spiral gave, so a faster walk must land every slot in the same place.
  it.each([
    ["past the tangent search", 60, 3, 12, "e94c0bfcd38be7a5"],
    ["a large folder's groups", 2_000, 11, 56, "799f0ccd30823434"],
    ["equal footprints", 900, 0, 0, "7db275161d3e3053"],
  ])("packs %s into the reference slots", (_name, count, seed, gutter, digest) => {
    const input = seed === 0 ? Array.from({ length: count }, () => ({ width: 20, height: 20 })) : boxes(count, seed);
    const slots = packGroupsAroundCentre(input, gutter);
    const found = createHash("sha256").update(JSON.stringify(slots, roundedToMilliPx)).digest("hex").slice(0, 16);
    expect(found).toBe(digest);
  });
});
