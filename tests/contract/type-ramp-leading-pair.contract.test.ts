import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Blocks the failure mode created once size steps started carrying a companion line
 * height: **an element that conditionally swaps only the font size, breaking the
 * pair.**
 *
 * **The shape of the defect.** `text-<step>` now also loads that step's line height.
 * But layering a conditional arbitrary size on the same element (`text-[Npx]`,
 * `text-[length:…]`, clamp) **changes only the size while the original step's line
 * height stays** — an arbitrary size has no companion. A ratio nobody ever chose is
 * produced, and only at that breakpoint. Measured 2026-07-27: the /git headline at
 * wide widths carried 23px text with the title step's 24px line height (1.04), the
 * largest deviation in this repository.
 *
 * Two prescriptions: ① make the conditional size a ramp utility too (then the pair
 * follows), or ② attach an explicit `leading-*` so the line height is set directly for
 * both sizes. ② is a real, legitimate choice (a single-line cohesive hero), so it is
 * not counted as a violation.
 *
 * **Why a contract test and not ESLint.** `no-restricted-syntax` matches a selector
 * against **one AST node**. This verdict needs **all** of an element's classes, and a
 * className splits across several literals as `cn()` arguments, which no single
 * selector can hold. Lint catches only the **subset** that routes a ramp token through
 * an arbitrary length (`arbitrarySizeSelectors` in `eslint.config.mjs`); the general
 * form is caught here. (`.claude/rules/design.md`: the layer lint cannot see belongs
 * to a contract test.)
 */

const ROOTS = ["src", "app"] as const;

/** Ramp size steps — these classes carry the companion line height. */
const RAMP_STEP =
  /(?:^|[\s"'`{(])(?:[a-z0-9-]+:)*text-(?:caption|label|body-lg|body|title|display|hero)(?![\w-])/;

/**
 * Size overrides with **no** companion — Tailwind attaches no line height to an
 * arbitrary size. The default scale (`text-sm` and friends) brings its own line
 * height, so it is excluded.
 */
const SIZE_OVERRIDE_WITHOUT_PAIR =
  /(?:^|[\s"'`{(])(?:[a-z0-9-]+:)*text-\[(?:length:|clamp|[0-9])/;

/** An explicit line height covers both sizes, so no pair can break. */
const EXPLICIT_LEADING = /(?:^|[\s"'`{(])(?:[a-z0-9-]+:)*leading-[\w[.\]]/;

function collectSourceFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, out);
      continue;
    }
    if (!/\.tsx$/.test(full)) continue;
    if (full.includes(".test.") || full.includes(".spec.")) continue;
    out.push(full);
  }
}

/**
 * Extracts the whole string region a `className` carries. Classes split across
 * several `cn(...)` arguments must be seen as one blob for the verdict to hold, so a
 * brace expression is read to its end by counting pairs.
 */
export function extractClassNameRegions(source: string): string[] {
  const out: string[] = [];
  const re = /className=(["'{])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const open = m[1];
    const start = m.index + m[0].length;
    if (open !== "{") {
      const end = source.indexOf(open, start);
      if (end === -1) continue;
      out.push(source.slice(start, end));
      continue;
    }
    let depth = 1;
    let i = start;
    for (; i < source.length && depth > 0; i += 1) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}") depth -= 1;
    }
    out.push(source.slice(start, i - 1));
  }
  return out;
}

/** Decides whether one element's class region breaks the pair. */
export function isMismatchedPair(region: string): boolean {
  if (!RAMP_STEP.test(region)) return false;
  if (!SIZE_OVERRIDE_WITHOUT_PAIR.test(region)) return false;
  return !EXPLICIT_LEADING.test(region);
}

function scan(): string[] {
  const files: string[] = [];
  for (const root of ROOTS) collectSourceFiles(join(process.cwd(), root), files);

  const bad: string[] = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const path = relative(process.cwd(), file);
    for (const region of extractClassNameRegions(source)) {
      if (!isMismatchedPair(region)) continue;
      const line = source.split("\n").findIndex((l) => l.includes(region.split("\n")[0].trim()));
      bad.push(`  ${path}:${line + 1} — ${region.replace(/\s+/g, " ").slice(0, 120)}`);
    }
  }
  return bad;
}

describe("타입 램프 × 행간 짝 — 조건부 크기 어긋남 차단", () => {
  it("램프 클래스와 arbitrary 크기가 한 원소에 공존하면 명시 행간이 있다", () => {
    const bad = scan();
    expect(
      bad,
      `Only the font size is swapped conditionally, so the line-height pair breaks. An arbitrary size\n` +
        `has no companion line-height, so the original step's line-height stays at that breakpoint\n` +
        `(a ratio nobody chose).\n` +
        `Either (1) write the conditional size as a ramp utility too, or (2) add an explicit leading and\n` +
        `set the line-height yourself for both sizes.\n${bad.join("\n")}`,
    ).toEqual([]);
  });

  it("스캔이 실제로 램프를 읽는다 — 0건이 '안 봄'이 아니어야 한다", () => {
    const files: string[] = [];
    for (const root of ROOTS) collectSourceFiles(join(process.cwd(), root), files);
    const regions = files.flatMap((f) => extractClassNameRegions(readFileSync(f, "utf8")));
    expect(regions.length).toBeGreaterThan(500);
    expect(regions.filter((r) => RAMP_STEP.test(r)).length).toBeGreaterThan(300);
  });

  it("판정이 실제로 잡는다 (프로브)", () => {
    // ① The defect: a ramp step + a conditional arbitrary size + no line height.
    expect(isMismatchedPair('"text-title font-semibold sm:text-[length:var(--text-display)]"')).toBe(
      true,
    );
    expect(isMismatchedPair('"text-hero md:text-[34px]"')).toBe(true);
    // ② An explicit line height covers both sizes, so this is not a violation.
    expect(isMismatchedPair('"text-hero leading-tight md:text-[34px]"')).toBe(false);
    // ③ When the conditional size is also a ramp step, the pair follows.
    expect(isMismatchedPair('"text-title font-semibold sm:text-display"')).toBe(false);
    // ④ Arbitrary colours and shadows are not sizes — no false positives.
    expect(isMismatchedPair('"text-body text-[color:var(--color-text-primary)]"')).toBe(false);
    // ⑤ Split across cn() arguments, it is still one element.
    expect(isMismatchedPair('cn("text-title", wide && "sm:text-[23px]")')).toBe(true);
  });
});
