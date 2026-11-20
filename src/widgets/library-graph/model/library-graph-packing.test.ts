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

describe("packGroupsAroundCentre", () => {
  // Digests of the slots the step-by-step spiral gave, so a faster walk must land every slot on the same bits.
  it.each([
    ["past the tangent search", 60, 3, 12, "b943b9fca0b6050b"],
    ["a large folder's groups", 2_000, 11, 56, "ae4809f1f9281f19"],
    ["equal footprints", 900, 0, 0, "3c530a5dfdf60eab"],
  ])("packs %s into the reference slots", (_name, count, seed, gutter, digest) => {
    const input = seed === 0 ? Array.from({ length: count }, () => ({ width: 20, height: 20 })) : boxes(count, seed);
    const slots = packGroupsAroundCentre(input, gutter);
    const found = createHash("sha256").update(JSON.stringify(slots)).digest("hex").slice(0, 16);
    console.log(`[packing] ${_name}: ${found}`);
    expect(found).toBe(digest);
  });
});
