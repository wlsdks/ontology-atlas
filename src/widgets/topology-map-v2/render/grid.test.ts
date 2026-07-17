import { describe, it } from "vitest";

/**
 * `render/grid.ts` is background/pattern/vignette Canvas 2D painting with no
 * extractable pure-geometry invariant (the pattern tile itself needs a real
 * `HTMLCanvasElement` 2D context to build, which jsdom does not implement
 * meaningfully). Left as `test.todo` — P5's production-build screenshot gate
 * (`docs/TOPOLOGY-V2-DESIGN.md` §4 P5) is the actual verification for this
 * file's visual correctness, not a unit test.
 */
describe("render/grid", () => {
  it.todo(
    "buildGridPattern produces a 120px tile (24px minor x5) matching the prototype's buildGrid() — needs a real canvas 2D context, not jsdom",
  );
  it.todo(
    "vignette stays a transparent-center gradient (regression guard for the prototype's own noted opaque-vignette bug) — needs pixel-level readback, deferred to P5",
  );
});
