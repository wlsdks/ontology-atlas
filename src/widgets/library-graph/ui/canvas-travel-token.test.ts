import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * **The canvas's clocks have one silent failure mode, and this is its gate.**
 *
 * The engine parses its durations from CSS at runtime rather than transcribing them into
 * TypeScript, because a transcribed motion value drifts — that is the 2026-07-28 finding
 * `src/shared/motion/tokens.ts` was written after. The cost of parsing is a new failure:
 * if a token is renamed, or moved under a selector this canvas is not inside, the read
 * quietly falls back and every other test stays green (design-motion, 2026-09-06).
 *
 * ⚠️ **The clocks changed on 2026-09-07.** The one-shot settle read
 * `--topology-motion-camera-duration` (420ms) because it was a camera travel. The live
 * simulation has no such travel: its arrival is the physics converging, and the only
 * durations left are the hover dim (`--motion-fast`) and a node entering or leaving
 * (`--motion-base`) — both ordinary ramp steps, which is why the canvas-only 420 is gone
 * rather than renamed.
 *
 * So this asserts the same two halves of the contract, against the tokens actually read:
 * they exist at `:root` with positive millisecond values, and the engine still reads them
 * by those names, with the gated JS mirror as the only fallback.
 */

const read = (rel: string): string => readFileSync(join(process.cwd(), rel), "utf8");

describe("the library graph's clocks", () => {
  it("resolves both from `:root`, so this canvas inherits them", () => {
    const css = read("app/globals.css");
    for (const token of ["--motion-fast", "--motion-base"]) {
      const match = new RegExp(`${token}:\\s*([\\d.]+)ms`).exec(css);
      expect(match, `${token} is gone from app/globals.css`).not.toBeNull();
      expect(Number(match?.[1])).toBeGreaterThan(0);
      // Declared under a selector this canvas is not inside would resolve to nothing on it.
      const declaration = css.slice(0, match?.index ?? 0);
      const lastSelector = declaration.lastIndexOf(":root");
      const lastScoped = Math.max(
        declaration.lastIndexOf(".topology"),
        declaration.lastIndexOf("[data-topology"),
      );
      expect(lastSelector).toBeGreaterThan(lastScoped);
    }
  });

  it("still reads them by name, and falls back only to the gated JS mirror", () => {
    const engine = read("src/widgets/library-graph/ui/use-library-graph-engine.ts");
    expect(engine).toContain('"--motion-fast"');
    expect(engine).toContain('"--motion-base"');
    // A literal duration in the engine would be the drift this arrangement exists to avoid.
    expect(/readMs\([^)]*,\s*\d/.test(engine)).toBe(false);
    expect(engine).toContain("MOTION.fast.duration");
    expect(engine).toContain("MOTION.base.duration");
  });

  it("no longer claims a camera travel it does not make", () => {
    const widget = read("src/widgets/library-graph/ui/LibraryGraph.tsx");
    const engine = read("src/widgets/library-graph/ui/use-library-graph-engine.ts");
    for (const source of [widget, engine]) {
      // Only the prose above may mention the retired token; nothing may parse it.
      expect(/getPropertyValue\([^)]*topology-motion-camera-duration/.test(source)).toBe(false);
    }
  });

  it("keeps the easing on the shared mirror instead of four fresh literals", () => {
    const layout = read("src/widgets/library-graph/model/library-graph-layout.ts");
    expect(layout).toContain("MOTION_EASE");
    expect(/const x1 = 0\.25/.test(layout)).toBe(false);
  });
});
