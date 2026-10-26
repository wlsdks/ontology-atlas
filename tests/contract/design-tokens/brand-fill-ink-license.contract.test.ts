import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { composite, contrastRatio, parseColor } from "../../../scripts/lib/design/contrast.mjs";
import { readGlobalCss } from '../../../scripts/lib/design/global-css.mjs';

/**
 * Blank out comments before scanning, keeping line numbers, so prose cannot trip the
 * class-literal scan.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}


/**
 * Ink on a solid brand fill (`--color-indigo-brand`) must pass AA 4.5:1, computed from the token
 * values rather than an allowlist. Tint fills belong to `accent-ink-contrast`; text-free fills are
 * out of scope.
 */

const ROOT = process.cwd();
const css = readGlobalCss();

type Rgba = readonly number[];

/** First definition in `app/globals.css` wins; `var()` aliases are followed. */
function cssToken(name: string): Rgba {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`${name} is missing from globals.css`);
  const v = m[1].trim();
  if (v.startsWith("var(")) return cssToken(v.slice(4, -1).trim());
  const parsed = parseColor(v);
  if (!parsed) throw new Error(`cannot read the value of ${name} (${v}) as a colour`);
  return parsed as Rgba;
}

/**
 * The 100%-opaque brand fills — ink placed on these is what this contract judges.
 * Alpha tints do not belong here (see "what it does not look at" above).
 */
const SOLID_FILLS = {
  "indigo-brand": cssToken("--color-indigo-brand"),
  "indigo-brand-hover": cssToken("--color-indigo-brand-hover"),
} as const;

const AA = 4.5;

const ratioOn = (ink: Rgba, bg: Rgba) => contrastRatio(composite(ink, bg), bg);

describe("ink on brand fills — the licence comes from contrast, not from the value", () => {
  it("the detector does not idle — the fill tokens exist and are opaque", () => {
    const names = Object.keys(SOLID_FILLS);
    expect(names.length, "no fill to look at").toBeGreaterThan(0);
    for (const [name, fill] of Object.entries(SOLID_FILLS)) {
      expect(fill[3], `${name} is not opaque — then it belongs to the tint contract`).toBe(1);
    }
  });

  it("the designated ink satisfies the licence — text-on-accent is AA on every brand fill", () => {
    const onAccent = cssToken("--color-text-on-accent");
    for (const [name, fill] of Object.entries(SOLID_FILLS)) {
      const r = ratioOn(onAccent, fill);
      expect(r, `text-on-accent on ${name} is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
    }
  });

  it("the reason for the split still exists — text-primary really fails AA on the brand fill", () => {
    /*
     * Detector liveness: if `text-primary` ever passes AA on a brand fill, the two inks have
     * converged and this contract can be retired.
     */
    const primary = cssToken("--color-text-primary");
    const r = ratioOn(primary, SOLID_FILLS["indigo-brand"]);
    expect(
      r,
      `text-primary on the brand fill is ${r.toFixed(2)}:1 — if it passes AA, re-evaluate why this contract exists`,
    ).toBeLessThan(AA);
  });
});

/**
 * Source scan — is the ink on a **className literal** carrying a brand fill inside
 * the licence?
 *
 * **Why the literal and not the opening tag** (the trap hit while building this
 * gate). The first version terminated opening tags by brace depth like this
 * repository's other scanners. **That parser swallowed dozens of elements into one
 * tag**: `AtlasGitPanel` alone was reported as a "tag" carrying 40-odd inks, all
 * false positives. Two causes: a comparison in the code (`a < b`) reads as a tag
 * start and the parser runs to the end of the file; and that file's brand fills live
 * in **file constants, not JSX tags** (`const X = \`… bg-…-brand … text-on-accent
 * …\``), so a tag-based unit cannot catch them in principle.
 *
 * A className is ultimately a **string literal**, and a literal cannot swallow other
 * elements. So the unit of judgement drops to the literal — inline className,
 * arguments to `cn()`, and extracted constants all become the same unit.
 *
 * One cost: a pair whose fill and ink are split across **different literals**
 * (conditional className) is invisible. So the count of "literals with a fill but no
 * ink" is tracked below, and a rise in that number is read as this blind spot
 * growing.
 */
describe("brand fill × ink pairing — full source census", () => {
  const FILL_RE = /bg-\[color:var\(--color-indigo-brand(?:-hover)?\)\]/;
  const INK_RE = /text-\[color:var\(--color-([a-z0-9-]+)\)\]/g;

  const walk = (dir: string, acc: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === "node_modules" || name === ".next") continue;
        walk(p, acc);
      } else if (/\.tsx$|\.ts$/.test(name) && !/\.test\./.test(name)) acc.push(p);
    }
    return acc;
  };

  /**
   * String literals in all three quote styles.
   *
   * ⚠️ Backtick pairing in template literals goes out of alignment when another string
   * appears inside `${…}` — measured: a 5,198-character "literal" came out of
   * `AtlasGitPanel`, herding several elements' inks into one place (7 false positives).
   * That artifact is discarded using the property that a className literal **cannot
   * contain JSX**. Cutting by length is not an option because legitimate constants also
   * exceed 400 characters (line 193 of the same file).
   */
  const JSX_INSIDE = /<[A-Za-z/]/;
  const literals = (src: string): string[] =>
    [...src.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)]
      .map((m) => m[1] ?? m[2] ?? m[3] ?? "")
      .filter((s) => !JSX_INSIDE.test(s));

  /** Inks carried by this literal that fail the licence. Empty when there is no ink. */
  const unlicensedInks = (literal: string): string[] => {
    if (!FILL_RE.test(literal)) return [];
    const fill = /brand-hover/.test(literal)
      ? SOLID_FILLS["indigo-brand-hover"]
      : SOLID_FILLS["indigo-brand"];
    const bad: string[] = [];
    for (const m of literal.matchAll(INK_RE)) {
      let ink: Rgba;
      try {
        ink = cssToken(`--color-${m[1]}`);
      } catch {
        continue; // A name absent from globals.css belongs to a different gate
      }
      const r = ratioOn(ink, fill);
      if (r < AA) bad.push(`--color-${m[1]} (${r.toFixed(2)}:1)`);
    }
    return bad;
  };

  const scan = () => {
    const offenders: string[] = [];
    let fillsSeen = 0;
    let inklessFills = 0;
    for (const file of [join(ROOT, "src"), join(ROOT, "app")].flatMap((d) => walk(d))) {
      const src = stripComments(readFileSync(file, "utf8"));
      if (!FILL_RE.test(src)) continue;
      for (const literal of literals(src)) {
        if (!FILL_RE.test(literal)) continue;
        fillsSeen += 1;
        if (!INK_RE.test(literal)) inklessFills += 1;
        INK_RE.lastIndex = 0;
        const bad = unlicensedInks(literal);
        if (bad.length) offenders.push(`${file.replace(ROOT, ".")}: ${bad.join(" · ")}`);
      }
    }
    return { offenders, fillsSeen, inklessFills };
  };

  it("the detector really sees brand fills — the universe is not empty", () => {
    const { fillsSeen } = scan();
    expect(fillsSeen, "could not find a single brand fill — the regex drifted from the ramp").toBeGreaterThan(10);
  });

  it("zero violations — ink carried by a brand fill exceeds AA", () => {
    const { offenders } = scan();
    expect(
      offenders,
      "Text on a solid indigo fill falls short of AA (4.5:1).\n" +
        "The fix is `--color-text-on-accent` (#ffffff, 4.70:1), the token this repository's button\n" +
        "primitive and value layer already use.\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("the blind spot does not grow — ceiling on brand-fill literals without ink", () => {
    /*
     * Blind spot: a fill and its ink split across different literals. The count of ink-less brand fill
     * literals bounds it; open the place before raising the ceiling.
     */
    const { inklessFills } = scan();
    expect(inklessFills, "brand-fill literals without ink grew — check that each spot is really a fill with no text").toBeLessThanOrEqual(14);
  });

  it("when the blind spot shrinks the ceiling comes down too — slack is not left free", () => {
    /*
     * Lower the ceiling when the blind spot shrinks, so slack cannot become a free pass for the next
     * genuine pair.
     */
    const { inklessFills } = scan();
    expect(
      inklessFills,
      "brand-fill literals without ink shrank — lower the ceiling of 14 above too.",
    ).toBeGreaterThanOrEqual(14);
  });

  it("the detector catches the planted violation and lets the proper pair go", () => {
    const bad = `rounded-full bg-[color:var(--color-indigo-brand)] text-[color:var(--color-text-primary)]`;
    const good = `rounded-full bg-[color:var(--color-indigo-brand)] text-[color:var(--color-text-on-accent)]`;
    const inkless = `h-1 w-1 rounded-full bg-[color:var(--color-indigo-brand)]`;
    const tint = `bg-[color:var(--color-indigo-a16)] text-[color:var(--color-text-primary)]`;
    const hover = `bg-[color:var(--color-indigo-brand-hover)] text-[color:var(--color-text-tertiary)]`;

    expect(unlicensedInks(bad), "does not catch the planted violation").toHaveLength(1);
    expect(unlicensedInks(good), "counts the fixed pair as a violation").toEqual([]);
    expect(unlicensedInks(inkless), "a fill without text is outside this contract").toEqual([]);
    expect(unlicensedInks(tint), "tints belong to accent-ink-contrast").toEqual([]);
    expect(
      unlicensedInks(hover),
      "the hover fill carries the same licence — contrast does not care about state",
    ).toHaveLength(1);
  });

  it("also sees a className lifted into a constant at literal level — a layer the tag parser could never see", () => {
    const src = readFileSync(join(ROOT, "src/shared/ui/controls/button.tsx"), "utf8");
    const withFill = literals(src).filter((l) => FILL_RE.test(l));
    expect(withFill.length, "could not find the brand fill of the constant className").toBeGreaterThan(0);
    expect(withFill.some((l) => /text-on-accent/.test(l)), "cannot read the ink of that constant").toBe(true);
  });
});
