import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { readGlobalCss } from '../../../scripts/lib/design/global-css.mjs';

/**
 * Blank out comments before scanning, preserving line numbers: a hyphenated compound in prose such as
 * `text-width` would otherwise be reported as an undefined ramp step.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}


/**
 * Checks that `text-<step>` / `leading-<step>` point at tokens defined in `app/globals.css`. Tailwind
 * emits no class for an undefined step, so the element inherits the root 16px. The token list lives in
 * another file, which a lint selector cannot reference without a copy that drifts.
 */

/** Comment lines. A defect history must be able to cite an old step name. */
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*|\{\/\*)/;

/**
 * Tailwind v4's default scale — with no `--text-*: initial` reset in `@theme` it
 * **coexists** with the ramp. Being off the ramp is debt handled separately by the
 * `type-ramp-coverage` ratchet; this test asks only whether the step is defined.
 */
const TAILWIND_FONT_SIZE = new Set([
  "xs",
  "sm",
  "base",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "4xl",
  "5xl",
  "6xl",
  "7xl",
  "8xl",
  "9xl",
]);

const TAILWIND_LINE_HEIGHT = new Set(["none", "tight", "snug", "normal", "relaxed", "loose"]);

/** Non-size `text-*` utilities — alignment, wrapping, overflow, and default colour keywords. */
const TEXT_NON_SIZE = new Set([
  "left",
  "center",
  "right",
  "justify",
  "start",
  "end",
  "wrap",
  "nowrap",
  "balance",
  "pretty",
  "ellipsis",
  "clip",
  "transparent",
  "current",
  "inherit",
  "black",
  "white",
]);

const ROOTS = ["src", "app"] as const;

function collectSourceFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(full)) continue;
    if (full.includes(".test.") || full.includes(".spec.")) continue;
    out.push(full);
  }
}

/** Reads the `--text-*` / `--leading-*` declarations in `app/globals.css` as step names. */
export function readRampSteps(css: string): { text: Set<string>; leading: Set<string> } {
  const text = new Set<string>();
  const leading = new Set<string>();
  for (const m of css.matchAll(/--(text|leading)-([a-z0-9-]+)\s*:/g)) {
    (m[1] === "text" ? text : leading).add(m[2]);
  }
  return { text, leading };
}

/**
 * Extracts ramp step references from one source line.
 *
 * Excluded: ① comment lines (citing defect history) ② **arbitrary properties**
 * inside brackets such as `[text-shadow:…]` (preceded by `[`) ③ raw CSS strings such
 * as `text-align: left` (followed by `:`) ④ fragments of a token name such as
 * `--color-text-primary` (preceded by `-`).
 */
export function extractRampRefs(line: string): Array<{ kind: "text" | "leading"; step: string }> {
  if (COMMENT_LINE.test(line)) return [];
  const out: Array<{ kind: "text" | "leading"; step: string }> = [];
  const re = /(^|[^-\w[./])(text|leading)-([a-z0-9][a-z0-9.-]*)/g;
  for (const m of line.matchAll(re)) {
    const step = m[3].replace(/-$/, "");
    const after = line[(m.index ?? 0) + m[0].length];
    if (after === ":") continue;
    out.push({ kind: m[2] as "text" | "leading", step });
  }
  return out;
}

function isDefined(
  ref: { kind: "text" | "leading"; step: string },
  ramp: { text: Set<string>; leading: Set<string> },
): boolean {
  if (ref.kind === "text") {
    return (
      ramp.text.has(ref.step) || TAILWIND_FONT_SIZE.has(ref.step) || TEXT_NON_SIZE.has(ref.step)
    );
  }
  // Numeric steps such as `leading-4` are Tailwind's spacing-based line heights.
  if (/^\d+(\.\d+)?$/.test(ref.step)) return true;
  return ramp.leading.has(ref.step) || TAILWIND_LINE_HEIGHT.has(ref.step);
}

function scan(): string[] {
  const ramp = readRampSteps(readGlobalCss());
  const files: string[] = [];
  for (const root of ROOTS) collectSourceFiles(join(process.cwd(), root), files);

  const bad: string[] = [];
  for (const file of files) {
    const path = relative(process.cwd(), file);
    const lines = stripComments(readFileSync(file, "utf8")).split("\n");
    lines.forEach((line, i) => {
      for (const ref of extractRampRefs(line)) {
        if (isDefined(ref, ramp)) continue;
        bad.push(`  ${path}:${i + 1} — ${ref.kind}-${ref.step}`);
      }
    });
  }
  return bad;
}

describe("타입/행간 램프 — 존재하지 않는 스텝 차단", () => {
  it("모든 text-*/leading-* 스텝이 정의된 토큰을 가리킨다", () => {
    const bad = scan();
    expect(
      bad,
      `An undefined ramp step. Tailwind does not generate this class at all, so\n` +
        `the site renders with the inherited 16px root (a ramp-not-applied defect).\n` +
        `Converge on one of the --text-* / --leading-* steps in app/globals.css, or if a\n` +
        `new step is really needed, do (1) the globals.css ramp, (2) the docs/DESIGN-SYSTEM.md entry\n` +
        `and (3) the TYPE_RAMP_STEPS/LEADING_RAMP_STEPS registration in src/shared/lib/cn.ts\n` +
        `together in the same PR.\n${bad.join("\n")}`,
    ).toEqual([]);
  });

  it("램프를 실제로 읽는다 — 스캔이 비면 통과가 아니라 결함이다", () => {
    const ramp = readRampSteps(readGlobalCss());
    // The floor is a 7-step ramp plus 9 line-height steps. If ramp parsing breaks, the test above passes forever.
    expect(ramp.text.size).toBeGreaterThanOrEqual(7);
    expect(ramp.leading.size).toBeGreaterThanOrEqual(9);
    expect(ramp.text.has("display")).toBe(true);
    expect(ramp.text.has("large")).toBe(false);
  });

  it("판정이 실제로 잡는다 (프로브)", () => {
    const ramp = readRampSteps(readGlobalCss());
    const check = (line: string) =>
      extractRampRefs(line).filter((r) => !isDefined(r, ramp)).length;

    // ① The real defect shape — two unregistered steps.
    expect(check('className="text-large font-semibold leading-oversized"')).toBe(2);
    // ② Healthy shapes — ramp steps, Tailwind's default scale, numeric line heights, arbitrary values.
    expect(
      check(
        'className="text-display leading-display-tight text-sm leading-4 leading-relaxed text-[13px] leading-[1.4]"',
      ),
    ).toBe(0);
    // ③ Must not be flagged — token name fragments, arbitrary properties, raw CSS, alignment/wrapping.
    expect(
      check(
        'className="text-[color:var(--color-text-primary)] [text-shadow:var(--x)] text-center text-nowrap"',
      ),
    ).toBe(0);
    expect(check("[data-x] a { text-align: left; text-decoration: underline; }")).toBe(0);
    expect(check('key: "atlas.appearance.text-size"')).toBe(0);
    expect(check('import { readTextSize } from "@/shared/lib/preferences/text-size";')).toBe(0);
    expect(check('className="sm:text-large"')).toBe(1);
    // ④ Comments may cite defect history — nothing renders, so they are out of scope.
    expect(check("        // 예전엔 text-callout 이었다 (미등록 스텝 → 루트 16px)")).toBe(0);
  });
});
