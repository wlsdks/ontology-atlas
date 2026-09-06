import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * **The settle's clock has one silent failure mode, and this is its gate.**
 *
 * `readCanvasTravelMs` parses `--topology-motion-camera-duration` at runtime rather than
 * transcribing 420 into TypeScript, because a transcribed motion value drifts — that is
 * the 2026-07-28 finding `src/shared/motion/tokens.ts` was written after. The cost of
 * parsing is a new failure: if the token is renamed, or moved under a `.topology-*`
 * selector so it no longer resolves from a Library canvas, the read returns 0, the settle
 * silently stops happening, and every other test stays green (design-motion, 2026-09-06).
 *
 * So this asserts the two halves of that contract from disk: the token exists at `:root`
 * with a positive millisecond value, and the widget still reads it by that name.
 */

const read = (rel: string): string => readFileSync(join(process.cwd(), rel), "utf8");

describe("the library graph's canvas-travel clock", () => {
  it("resolves from `:root`, so a canvas outside the map inherits it", () => {
    const css = read("app/globals.css");
    const match = /--topology-motion-camera-duration:\s*([\d.]+)ms/.exec(css);
    expect(match, "the token the library graph's settle reads is gone from app/globals.css").not.toBeNull();
    expect(Number(match?.[1])).toBeGreaterThan(0);
    // Declared under a selector this canvas is not inside would resolve to nothing on it.
    const declaration = css.slice(0, match?.index ?? 0);
    const lastSelector = declaration.lastIndexOf(":root");
    const lastScoped = Math.max(
      declaration.lastIndexOf(".topology"),
      declaration.lastIndexOf("[data-topology"),
    );
    expect(lastSelector).toBeGreaterThan(lastScoped);
  });

  it("is still the name the widget parses, and is still parsed rather than copied", () => {
    const widget = read("src/widgets/library-graph/ui/LibraryGraph.tsx");
    expect(widget).toContain("--topology-motion-camera-duration");
    // A literal duration in the widget would be the drift this arrangement exists to avoid.
    expect(/=\s*420\b/.test(widget)).toBe(false);
  });

  it("keeps the easing on the shared mirror instead of four fresh literals", () => {
    const layout = read("src/widgets/library-graph/model/library-graph-layout.ts");
    expect(layout).toContain("MOTION_EASE");
    expect(/const x1 = 0\.25/.test(layout)).toBe(false);
  });
});
