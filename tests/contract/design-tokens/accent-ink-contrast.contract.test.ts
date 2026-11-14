import { describe, expect, it } from "vitest";

import { composite, contrastRatio, parseColor } from "../../../scripts/lib/design/contrast.mjs";
import { controlClass } from "../../../src/shared/ui/control-class";
import { readGlobalCss } from '../../../scripts/lib/design/global-css.mjs';

/**
 * Locks the licence of the accent inks with composite contrast (WCAG 2.2 1.4.3, AA 4.5:1) from
 * the real tokens in `app/globals.css`: either ink may sit on any base and any tint listed here.
 */

/** Reads a token value from `app/globals.css`, first definition wins. */
type Rgba = readonly number[];

function cssToken(css: string, name: string): Rgba {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`${name} is missing from globals.css`);
  const v = m[1].trim();
  if (v.startsWith("var(")) return cssToken(css, v.slice(4, -1).trim());
  const parsed = parseColor(v);
  if (!parsed) throw new Error(`cannot read the value of ${name} (${v}) as a colour`);
  return parsed as Rgba;
}

const css = readGlobalCss();

/** The app's three base backgrounds — the floor under every control host. */
const BASES = {
  canvas: cssToken(css, "--color-canvas"),
  panel: cssToken(css, "--color-panel"),
  elevated: cssToken(css, "--color-elevated"),
};

/** The tints accent ink stands on. A new tint joins this list and passes the licence below. */
const TINTS = {
  "indigo-a06": cssToken(css, "--color-indigo-a06"),
  "indigo-a08": cssToken(css, "--color-indigo-a08"),
  "indigo-a10": cssToken(css, "--color-indigo-a10"),
  "indigo-a12": cssToken(css, "--color-indigo-a12"),
  "indigo-a14": cssToken(css, "--color-indigo-a14"),
  "indigo-a16": cssToken(css, "--color-indigo-a16"),
  "indigo-a18": cssToken(css, "--color-indigo-a18"),
  "indigo-a24": cssToken(css, "--color-indigo-a24"),
  "indigo-a26": cssToken(css, "--color-indigo-a26"),
  "indigo-a32": cssToken(css, "--color-indigo-a32"),
  "indigo-line-a13": cssToken(css, "--color-indigo-line-a13"),
  "amber-signal-a07": cssToken(css, "--color-amber-signal-a07"),
  "amber-signal-a16": cssToken(css, "--color-amber-signal-a16"),
  "danger-a10": cssToken(css, "--color-danger-a10"),
};

const ratioOn = (ink: Rgba, bg: Rgba) =>
  contrastRatio(composite(ink, bg), bg);

describe("accent ink licence — contrast judges, not the value", () => {
  const INKS = {
    accent: cssToken(css, "--color-indigo-accent"),
    soft: cssToken(css, "--color-indigo-text-soft"),
  };

  it("the accent tone is the accent token", () => {
    expect(controlClass({ tone: "accent" })).toContain("text-[color:var(--color-indigo-accent)]");
  });

  it("each accent ink is AA (4.5:1) on every base and every tint composite", () => {
    const short: string[] = [];
    for (const [ink, value] of Object.entries(INKS)) {
      for (const [bn, base] of Object.entries(BASES)) {
        const grounds: [string, Rgba][] = [
          [bn, base],
          ...Object.entries(TINTS).map(([tn, tint]): [string, Rgba] => [`${tn}/${bn}`, composite(tint, base)]),
        ];
        for (const [name, bg] of grounds) {
          const r = ratioOn(value, bg);
          if (r < 4.5) short.push(`${ink} on ${name} is ${r.toFixed(2)}:1`);
        }
      }
    }
    expect(short).toEqual([]);
  });

  it("refuses an ink that is too dim for a tint", () => {
    const dim = [94, 106, 210, 1] as const;
    expect(ratioOn(dim, composite(TINTS["indigo-a24"], BASES.elevated))).toBeLessThan(4.5);
  });
});
