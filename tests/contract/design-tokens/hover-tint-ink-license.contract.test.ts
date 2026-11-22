import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { composite, contrastRatio, parseColor } from "../../../scripts/lib/design/contrast.mjs";
import { stripComments } from "../../../scripts/lib/design/strip-comments.mjs";
import { readGlobalCss } from '../../../scripts/lib/design/global-css.mjs';

/**
 * Ink on alpha tint surfaces, including hover, must meet contrast; token values are read from
 * `app/globals.css`. Red only when it fails on all four opaque host surfaces.
 */

const ROOT = process.cwd();
const css = readGlobalCss();

type Rgba = readonly number[];

function cssToken(name: string): Rgba | null {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
  if (!m) return null;
  const v = m[1].trim();
  if (v.startsWith("var(")) return cssToken(v.slice(4, -1).trim());
  return (parseColor(v) as Rgba) ?? null;
}

/** The app's four opaque host surfaces — an alpha surface sits on one of them. */
const HOSTS = ["--color-canvas", "--color-panel", "--color-elevated", "--map-panel-surface"]
  .map((n) => [n, cssToken(n)] as const)
  .filter((e): e is readonly [string, Rgba] => e[1] !== null);

/** The body-text threshold. This app's control type is 9.5–14px, so the large-text relaxation never applies. */
const AA = 4.5;

const ratio = (ink: Rgba, bg: Rgba) => contrastRatio(composite(ink, bg), bg);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, out);
      continue;
    }
    if (/\.tsx$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(p);
  }
  return out;
}

/**
 * Scans by className literal — an opening-tag parser has already swallowed dozens
 * of elements as one "tag" in this repository (see `brand-fill-ink-license`'s
 * preamble). Artefacts are discarded using the property that a className literal
 * cannot contain JSX.
 */
const JSX_INSIDE = /<[A-Za-z/]/;
const literals = (src: string): string[] =>
  [...src.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)]
    .map((m) => m[1] ?? m[2] ?? m[3] ?? "")
    .filter((s) => !JSX_INSIDE.test(s));

/**
 * The tone to ink table is read from `control-class.ts`, and whole `controlClass` call blocks
 * are scanned because tone is a separate property from the className literal.
 */
function toneInkMap(): Map<string, string> {
  const src = readFileSync(path.join(ROOT, "src/shared/ui/control-class.ts"), "utf8");
  const out = new Map<string, string>();
  for (const m of src.matchAll(/^\s{6}([a-zA-Z]+): 'text-\[color:var\((--[a-z0-9-]+)\)\]'/gm)) {
    out.set(m[1], m[2]);
  }
  return out;
}

/** Terminates `controlClass({ … })` by brace depth, so it is not cut at a `=>`. */
function callBlocks(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/controlClass\(\{/g)) {
    let depth = 0;
    let quote: string | null = null;
    let i = m.index! + "controlClass(".length;
    for (; i < src.length; i += 1) {
      const c = src[i];
      if (quote) {
        if (c === quote && src[i - 1] !== "\\") quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth += 1;
      else if (c === "}") {
        depth -= 1;
        if (!depth) {
          i += 1;
          break;
        }
      }
    }
    out.push(src.slice(m.index!, i));
  }
  return out;
}

/** Hover surfaces — alpha (non-opaque) only. Opaque surfaces belong to the brand-fill contract. */
const HOVER_FACE = /hover:bg-\[color:var\((--[a-z0-9-]+)\)\]/g;
/** The ink the same literal carries — a hover ink wins when present. */
const HOVER_INK = /hover:text-\[color:var\((--[a-z0-9-]+)\)\]/;
const REST_INK = /(?:^|[\s"'`])text-\[color:var\((--[a-z0-9-]+)\)\]/;

interface Offender {
  where: string;
  face: string;
  ink: string;
  best: number;
}

function scan() {
  const offenders: Offender[] = [];
  const seen = new Set<string>();
  const tones = toneInkMap();
  let facesSeen = 0;
  let judged = 0;

  const consider = (rel: string, unit: string, inkFallback?: string) => {
    HOVER_FACE.lastIndex = 0;
    for (const fm of unit.matchAll(HOVER_FACE)) {
      facesSeen += 1;
      const face = cssToken(fm[1]);
      if (!face || face[3] >= 1) continue;
      const inkName =
        (HOVER_INK.exec(unit) ?? REST_INK.exec(unit))?.[1] ?? inkFallback;
      if (!inkName) continue;
      const ink = cssToken(inkName);
      if (!ink) continue;
      const key = `${rel}|${fm[1]}|${inkName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      judged += 1;
      const ratios = HOSTS.map(([, host]) => ratio(ink, composite(face, host)));
      const best = Math.max(...ratios);
      const row = { where: rel, face: fm[1], ink: inkName, best };
      if (best < AA) offenders.push(row);
    }
  };

  for (const dir of ["src", "app"]) {
    for (const file of walk(path.join(ROOT, dir))) {
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      const src = stripComments(readFileSync(file, "utf8"));
      // ① Call blocks — covers places whose ink arrives through `tone:`.
      for (const block of callBlocks(src)) {
        const tone = /tone:\s*["']([a-zA-Z]+)["']/.exec(block)?.[1];
        consider(rel, block, tone ? tones.get(tone) : undefined);
      }
      // ② Literals — covers what is outside a call (hoisted constants, native elements).
      for (const literal of literals(src)) {
        consider(rel, literal);
      }
    }
  }
  return { offenders, facesSeen, judged };
}

describe("ink on hover tint faces — calculation judges", () => {
  const census = scan();

  it("the detector does not idle — hosts exist and hover faces are really found", () => {
    expect(HOSTS.length, "could not read the host surface tokens").toBeGreaterThanOrEqual(3);
    for (const [name, host] of HOSTS) {
      expect(host[3], `${name} is not opaque — the host premise breaks`).toBe(1);
    }
    expect(census.facesSeen, "could not find a single hover face — the regex drifted from the ramp").toBeGreaterThan(20);
    expect(census.judged, "no spot was judged with its ink paired").toBeGreaterThan(5);
  });

  it("the reason for the split still exists — a pair that really breaks AA is computable", () => {
    /*
     * `/gate-probe`: a detector idling on an empty set is forbidden. The day this
     * assertion turns red is the day the danger ramp has converged enough to pass on
     * any tint, and that is when this contract's threshold is re-evaluated.
     */
    const ink = cssToken("--color-danger-text")!;
    const face = cssToken("--color-danger-a32")!;
    const worst = Math.min(...HOSTS.map(([, h]) => ratio(ink, composite(face, h))));
    expect(
      worst,
      "danger-text on a danger-a32 face now exceeds AA — re-evaluate why this contract exists",
    ).toBeLessThan(AA);
  });

  it("zero violations — no hover pair fails on every host", () => {
    const lines = census.offenders.map(
      (o) => `${o.where}: hover ${o.face} × ${o.ink} — best ${o.best.toFixed(2)} (needs ${AA})`,
    );
    expect(
      lines,
      "Ink on a hover tint falls short of AA **on every host surface**.\n" +
        "The pairing is wrong, not the value: lower the fill one step (a lower alpha of the same colour family)\n" +
        "or raise the ink. Confirm the alpha token's role (border or fill) from its real uses.\n" +
        lines.join("\n"),
    ).toEqual([]);
  });

  it("the detector catches the planted violation and lets the proper pair go", () => {
    const judge = (literal: string) => {
      const out: string[] = [];
      HOVER_FACE.lastIndex = 0;
      for (const fm of literal.matchAll(HOVER_FACE)) {
        const face = cssToken(fm[1]);
        if (!face || face[3] >= 1) continue;
        const inkName = (HOVER_INK.exec(literal) ?? REST_INK.exec(literal))?.[1];
        if (!inkName) continue;
        const ink = cssToken(inkName)!;
        const best = Math.max(...HOSTS.map(([, h]) => ratio(ink, composite(face, h))));
        if (best < AA) out.push(fm[1]);
      }
      return out;
    };

    expect(
      judge("text-[color:var(--color-danger-text)] hover:bg-[color:var(--color-danger-a32)]"),
      "does not catch the planted violation (the very pair that was fixed)",
    ).toHaveLength(1);
    expect(
      judge("text-[color:var(--color-danger-text)] hover:bg-[color:var(--color-danger-a12)]"),
      "counts the fixed pair as a violation — then the reason to fix disappears",
    ).toEqual([]);
    expect(
      judge("hover:bg-[color:var(--color-overlay-1)]"),
      "a spot with unknown ink is not judged",
    ).toEqual([]);
    expect(
      judge("text-[color:var(--color-text-on-accent)] hover:bg-[color:var(--color-indigo-brand-hover)]"),
      "an opaque face belongs to brand-fill-ink-license",
    ).toEqual([]);
    expect(
      judge(
        "text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-danger-a32)] hover:text-[color:var(--color-text-primary)]",
      ),
      "if there is a hover ink it must beat the resting ink",
    ).toEqual([]);
  });
});
