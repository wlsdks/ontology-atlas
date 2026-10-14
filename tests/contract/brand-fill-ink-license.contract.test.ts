import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { composite, contrastRatio, parseColor } from "../../scripts/lib/contrast.mjs";
import { readGlobalCss } from '../../scripts/lib/global-css.mjs';

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
  if (!m) throw new Error(`globals.css 에 ${name} 이 없다`);
  const v = m[1].trim();
  if (v.startsWith("var(")) return cssToken(v.slice(4, -1).trim());
  const parsed = parseColor(v);
  if (!parsed) throw new Error(`${name} 값(${v})을 색으로 못 읽는다`);
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

describe("브랜드 면 위 잉크 — 라이선스는 값이 아니라 대비가 낸다", () => {
  it("탐지기가 공회전하지 않는다 — 면 토큰이 실재하고 불투명하다", () => {
    const names = Object.keys(SOLID_FILLS);
    expect(names.length, "볼 면이 하나도 없다").toBeGreaterThan(0);
    for (const [name, fill] of Object.entries(SOLID_FILLS)) {
      expect(fill[3], `${name} 이 불투명하지 않다 — 그러면 틴트 계약의 관할이다`).toBe(1);
    }
  });

  it("지정된 잉크가 라이선스를 만족한다 — text-on-accent 는 모든 브랜드 면에서 AA", () => {
    const onAccent = cssToken("--color-text-on-accent");
    for (const [name, fill] of Object.entries(SOLID_FILLS)) {
      const r = ratioOn(onAccent, fill);
      expect(r, `text-on-accent 가 ${name} 위에서 ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
    }
  });

  it("분리의 근거가 아직 실재한다 — text-primary 는 브랜드 면에서 실제로 AA 를 깬다", () => {
    /*
     * Detector liveness: if `text-primary` ever passes AA on a brand fill, the two inks have
     * converged and this contract can be retired.
     */
    const primary = cssToken("--color-text-primary");
    const r = ratioOn(primary, SOLID_FILLS["indigo-brand"]);
    expect(
      r,
      `text-primary 가 브랜드 면에서 ${r.toFixed(2)}:1 — AA 를 통과한다면 이 계약의 존재 이유를 재평가하라`,
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
describe("브랜드 면 × 잉크 페어링 — 소스 전수", () => {
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

  it("탐지기가 실제로 브랜드 면을 보고 있다 — 전집합이 비어 있지 않다", () => {
    const { fillsSeen } = scan();
    expect(fillsSeen, "브랜드 면을 하나도 못 찾았다 — 정규식이 램프와 어긋났다").toBeGreaterThan(10);
  });

  it("위반 0 — 브랜드 면을 진 잉크는 AA 를 넘는다", () => {
    const { offenders } = scan();
    expect(
      offenders,
      "Text on a solid indigo fill falls short of AA (4.5:1).\n" +
        "The fix is `--color-text-on-accent` (#ffffff, 4.70:1), the token this repository's button\n" +
        "primitive and value layer already use.\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("사각이 커지지 않는다 — 잉크 없는 브랜드 면 리터럴의 상한", () => {
    /*
     * Blind spot: a fill and its ink split across different literals. The count of ink-less brand fill
     * literals bounds it; open the place before raising the ceiling.
     */
    const { inklessFills } = scan();
    expect(inklessFills, "잉크 없는 브랜드 면 리터럴이 늘었다 — 각 자리가 정말 글자 없는 면인지 확인하라").toBeLessThanOrEqual(16);
  });

  it("사각이 줄었으면 상한도 내린다 — 여유를 무료로 두지 않는다", () => {
    /*
     * Lower the ceiling when the blind spot shrinks, so slack cannot become a free pass for the next
     * genuine pair.
     */
    const { inklessFills } = scan();
    expect(
      inklessFills,
      "잉크 없는 브랜드 면 리터럴이 줄었다 — 위 상한 15 도 같이 내려라.",
    ).toBeGreaterThanOrEqual(15);
  });

  it("탐지기가 심은 위반을 잡고 정상 짝은 놓아준다", () => {
    const bad = `rounded-full bg-[color:var(--color-indigo-brand)] text-[color:var(--color-text-primary)]`;
    const good = `rounded-full bg-[color:var(--color-indigo-brand)] text-[color:var(--color-text-on-accent)]`;
    const inkless = `h-1 w-1 rounded-full bg-[color:var(--color-indigo-brand)]`;
    const tint = `bg-[color:var(--color-indigo-a16)] text-[color:var(--color-text-primary)]`;
    const hover = `bg-[color:var(--color-indigo-brand-hover)] text-[color:var(--color-text-tertiary)]`;

    expect(unlicensedInks(bad), "심은 위반을 못 잡는다").toHaveLength(1);
    expect(unlicensedInks(good), "고친 짝을 위반으로 센다").toEqual([]);
    expect(unlicensedInks(inkless), "글자 없는 면은 이 계약 밖이다").toEqual([]);
    expect(unlicensedInks(tint), "틴트는 accent-ink-contrast 의 관할이다").toEqual([]);
    expect(
      unlicensedInks(hover),
      "호버 면도 같은 라이선스를 진다 — 대비는 상태를 가리지 않는다",
    ).toHaveLength(1);
  });

  it("리터럴 단위가 상수로 뺀 className 도 본다 — 태그 파서가 원리적으로 못 보던 층", () => {
    const src = readFileSync(join(ROOT, "src/shared/ui/controls/button.tsx"), "utf8");
    const withFill = literals(src).filter((l) => FILL_RE.test(l));
    expect(withFill.length, "상수 className 의 브랜드 면을 못 찾았다").toBeGreaterThan(0);
    expect(withFill.some((l) => /text-on-accent/.test(l)), "그 상수의 잉크를 못 읽는다").toBe(true);
  });
});
