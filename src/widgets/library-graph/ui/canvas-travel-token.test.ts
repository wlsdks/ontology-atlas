import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { readGlobalCss } from '../../../../scripts/lib/global-css.mjs';

/**
 * The engine parses its clocks from CSS so they cannot drift from src/shared/motion/tokens.ts,
 * but a renamed or rescoped token would fall back silently. This gates both halves: the
 * tokens exist at `:root` with positive ms values, and the engine reads them by name with
 * only the gated mirror as fallback. The retired `--topology-motion-camera-duration` stays unread.
 */

const read = (rel: string): string => readFileSync(join(process.cwd(), rel), "utf8");

describe("the library graph's clocks", () => {
  it("resolves both from `:root`, so this canvas inherits them", () => {
    const css = readGlobalCss();
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
      // Prose may mention the retired token; nothing may parse it.
      expect(/getPropertyValue\([^)]*topology-motion-camera-duration/.test(source)).toBe(false);
    }
  });

  it("keeps the easing on the shared mirror instead of four fresh literals", () => {
    const layout = read("src/widgets/library-graph/model/library-graph-layout.ts");
    expect(layout).toContain("MOTION_EASE");
    expect(/const x1 = 0\.25/.test(layout)).toBe(false);
  });
});
