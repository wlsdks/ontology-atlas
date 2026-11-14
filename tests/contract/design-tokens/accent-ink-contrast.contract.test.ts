import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { composite, contrastRatio, parseColor } from "../../../scripts/lib/design/contrast.mjs";
import { controlClass } from "../../../src/shared/ui/control-class";
import { readGlobalCss } from '../../../scripts/lib/design/global-css.mjs';

/**
 * Locks the licence of the accent inks with composite contrast (WCAG 2.2 1.4.3, AA 4.5:1) from
 * the real tokens in `app/globals.css`. The grounds are read from source: every alpha fill that
 * shares a class literal with an accent ink, or sits within reach of an accent tone.
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

const ratioOn = (ink: Rgba, bg: Rgba) => contrastRatio(composite(ink, bg), bg);

const INKS: Record<string, Rgba> = {
  "--color-indigo-accent": cssToken(css, "--color-indigo-accent"),
  "--color-indigo-text-soft": cssToken(css, "--color-indigo-text-soft"),
};

const INK_CLASS = /text-\[color:var\((--color-indigo-accent|--color-indigo-text-soft)\)\]/g;
const ALPHA_FILL = /bg-\[color:var\((--color-[a-z-]+-a\d+)\)\]/g;
const ACCENT_TONE = /tone(?::\s*|=)(?:\{[^}\n]*)?["']accent["']/;
const TONE_REACH_LINES = 12;

type Pair = { where: string; ink: string; fill: string };

/** One pass per file: O(lines × reach). A fill pairs with an ink in the same line or tone window. */
function pairsIn(file: string, source: string): Pair[] {
  const lines = source.split("\n");
  const found: Pair[] = [];
  lines.forEach((line, i) => {
    const inks = new Set<string>([...line.matchAll(INK_CLASS)].map((m) => m[1]));
    let reach = line;
    if (ACCENT_TONE.test(line)) {
      inks.add("--color-indigo-accent");
      reach = lines.slice(Math.max(0, i - TONE_REACH_LINES), i + TONE_REACH_LINES + 1).join("\n");
    }
    if (inks.size === 0) return;
    for (const fill of new Set([...reach.matchAll(ALPHA_FILL)].map((m) => m[1]))) {
      for (const ink of inks) found.push({ where: `${file}:${i + 1}`, ink, fill });
    }
  });
  return found;
}

function belowAa(pairs: Pair[]): string[] {
  const short: string[] = [];
  for (const { where, ink, fill } of pairs) {
    for (const [name, base] of Object.entries(BASES)) {
      const r = ratioOn(INKS[ink], composite(cssToken(css, fill), base));
      if (r < 4.5) short.push(`${where} ${ink} on ${fill}/${name} is ${r.toFixed(2)}:1`);
    }
  }
  return short;
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) out.push(full);
  }
  return out;
}

const ROOT = process.cwd();
const PAIRS = [...sourceFiles(join(ROOT, "src")), ...sourceFiles(join(ROOT, "app"))].flatMap((file) =>
  pairsIn(relative(ROOT, file), readFileSync(file, "utf8")),
);

describe("accent ink licence — contrast judges, not the value", () => {
  it("the accent tone is the accent token", () => {
    expect(controlClass({ tone: "accent" })).toContain("text-[color:var(--color-indigo-accent)]");
  });

  it("each accent ink is AA (4.5:1) on every bare base", () => {
    for (const [ink, value] of Object.entries(INKS)) {
      for (const [name, base] of Object.entries(BASES)) {
        expect(ratioOn(value, base), `${ink} on ${name}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("reads class-literal and tone pairs from the source it judges", () => {
    expect(PAIRS.filter((p) => p.ink === "--color-indigo-text-soft").length).toBeGreaterThan(0);
    expect(PAIRS.filter((p) => p.ink === "--color-indigo-accent").length).toBeGreaterThan(0);
  });

  it("every alpha fill under an accent ink keeps it AA on every base", () => {
    expect(belowAa(PAIRS)).toEqual([]);
  });

  it("refuses a planted fill that is too bright and accepts a quiet one, in each notation", () => {
    const planted = [
      'const a = "bg-[color:var(--color-indigo-a50)] text-[color:var(--color-indigo-accent)]";',
      'const b = "bg-[color:var(--color-indigo-a16)] text-[color:var(--color-indigo-accent)]";',
      '<Chip tone="accent" className="bg-[color:var(--color-indigo-a50)]" />',
      "controlClass({ tone: on ? 'accent' : 'default', className: 'hover:bg-[color:var(--color-indigo-a12)]' })",
    ];
    const flagged = planted.map((line) => belowAa(pairsIn("planted.tsx", line)).length > 0);
    expect(flagged).toEqual([true, false, true, false]);
  });
});
