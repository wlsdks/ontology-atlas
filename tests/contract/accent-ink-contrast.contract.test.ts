import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { composite, contrastRatio, parseColor } from "../../scripts/lib/contrast.mjs";
import { controlClass } from "../../src/shared/ui/control-class";

/**
 * Blank out comments before scanning, preserving line numbers so reported
 * locations stay right.
 *
 * **Why (measured 2026-08-22).** This gate looks for class-like literals in the
 * source. A comment is not a class literal — nothing in a comment ever renders —
 * but the scan read the raw file, so prose could trip it. Translating the
 * repository's comments to English made that live: `text-width` written inside a
 * sentence in `DomainCapacityBar.tsx` was reported as an undefined `text-*` ramp
 * step, and token names mentioned in prose were counted as ink/fill pairings.
 *
 * Korean prose rarely contains hyphenated Latin compounds, which is why the hole
 * stayed closed for as long as the comments were Korean.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}


/**
 * The **licence contract** for the two indigo ink steps (System seat verdict
 * 2026-08-03, follow-up to PR #886).
 *
 * **What it locks.** This app has two solutions for indigo ink:
 *
 * | Tone | Token | Licence |
 * |---|---|---|
 * | `accent` | `--color-indigo-accent`(#7170ff) | **darkest backgrounds only** (canvas/panel/elevated) |
 * | `accentOnTint` | `--color-indigo-text-soft` | anywhere — including tint fills and hover fills |
 *
 * The verdict is **measured composite contrast**, not a name: this file reads the
 * real token values from `app/globals.css` and computes WCAG 2.2 §1.4.3
 * (AA 4.5:1). If a token value moves, the test recomputes the truth of that moment
 * — no constants are copied, so there is nothing to drift.
 *
 * **Why lint alone is not enough.** The eslint pairing selectors
 * (`accentTintPairingSelectors`) see only **literals within the same call or
 * element**. A className routed through a file constant such as `INDIGO_CHIP` does
 * not fit in one AST selector — this source scan (which resolves constants) covers
 * that layer. (.claude/rules/design.md: layers lint cannot see belong to contract
 * tests.)
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/** Reads a token value from `app/globals.css`, first definition wins. */
type Rgba = readonly number[];

function cssToken(css: string, name: string): Rgba {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`globals.css 에 ${name} 이 없다`);
  const v = m[1].trim();
  if (v.startsWith("var(")) return cssToken(css, v.slice(4, -1).trim());
  const parsed = parseColor(v);
  if (!parsed) throw new Error(`${name} 값(${v})을 색으로 못 읽는다`);
  return parsed as Rgba;
}

const css = read("app/globals.css");

/** The app's three base backgrounds — the floor under every control host. */
const BASES = {
  canvas: cssToken(css, "--color-canvas"),
  panel: cssToken(css, "--color-panel"),
  elevated: cssToken(css, "--color-elevated"),
};

/**
 * The tints the 29 migrated places actually stood on. Putting accent on a new tint
 * not listed here requires widening this list and proving it under the licence
 * below.
 */
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

describe("인디고 잉크 라이선스 — 값이 아니라 대비가 판정한다", () => {
  const accent = cssToken(css, "--color-indigo-accent");
  const soft = cssToken(css, "--color-indigo-text-soft");

  it("톤 → 토큰 매핑이 서 있다 — accent 는 표식 인디고, accentOnTint 는 글자 인디고", () => {
    /*
     * Contrast alone cannot lock this mapping: soft also passes on the base
     * backgrounds, so swapping `accent` ink for soft keeps the licence below green.
     * But at that moment the ramp and the 99 hand-written `--color-indigo-accent`
     * text lines across the app become two dialects — keeping them consistent is why
     * this mapping exists.
     */
    expect(controlClass({ tone: "accent" })).toContain("text-[color:var(--color-indigo-accent)]");
    expect(controlClass({ tone: "accentOnTint" })).toContain(
      "text-[color:var(--color-indigo-text-soft)]",
    );
  });

  it("accent 의 라이선스: 맨 바탕 3단 전부에서 AA(4.5:1)", () => {
    for (const [name, base] of Object.entries(BASES)) {
      const r = ratioOn(accent, base);
      expect(r, `accent(#7170ff) 가 맨 ${name} 위에서 ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("accentOnTint 의 라이선스: 모든 바탕 × 모든 틴트 합성에서 AA(4.5:1) — 어디서나 안전한 잉크", () => {
    for (const [bn, base] of Object.entries(BASES)) {
      expect(ratioOn(soft, base), `soft 가 맨 ${bn} 위에서 미달`).toBeGreaterThanOrEqual(4.5);
      for (const [tn, tint] of Object.entries(TINTS)) {
        const bg = composite(tint, base);
        const r = ratioOn(soft, bg);
        expect(r, `soft 가 ${tn}/${bn} 합성 위에서 ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("분리의 근거가 아직 실재한다 — accent 는 틴트 위에서 실제로 AA 를 깬다", () => {
    /*
     * `/gate-probe`: no detector may idle on an empty set. The day this assertion
     * turns red is the day the tokens converged and accent passes everywhere, and on
     * that day the two tones can be folded into one — the same grammar as the scope
     * axis's "the two ramps really differ" gate.
     */
    expect(
      ratioOn(accent, composite(TINTS["indigo-a24"], BASES.canvas)),
      "accent 가 a24/canvas 에서도 AA 를 통과한다 — 톤 분리를 접을 수 있는지 재평가하라",
    ).toBeLessThan(4.5);
    expect(ratioOn(accent, composite(TINTS["indigo-line-a13"], BASES.elevated))).toBeLessThan(4.5);
  });
});

/**
 * Source scan — `tone accent` is never paired with a tint fill **in one control**.
 *
 * Window heuristic: within 12 lines either side of a tone declaration, it resolves
 * tint background literals and file constants (`const NAME = '…'`) applied to
 * className. The 3 remaining accent places today are all `link` on a base
 * background, so no tint falls inside the window — a new one turns this red, and
 * the prescription is `accentOnTint`, not a ban.
 */
describe("accent × 틴트 페어링 금지 — lint 가 못 보는 상수 우회까지", () => {
  const TINT_RE = /bg-\[color:var\(--color-(indigo|amber)/;
  const TONE_RE = /tone(?::\s*|=)["']accent["']/;

  const walk = (dir: string, acc: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, acc);
      else if (/\.tsx$/.test(name) && !/\.test\./.test(name)) acc.push(p);
    }
    return acc;
  };

  /**
   * **The hand-written layer — where this gate could not see (2026-08-04).**
   *
   * The scan above looks for **the value layer's `tone` declarations**. Places that
   * use no `tone` at all and instead write ink and tint **side by side by hand** were
   * entirely out of view:
   *
   * ```
   * className="… bg-[color:var(--color-indigo-a16)] text-[color:var(--color-indigo-accent)]"
   * ```
   *
   * The 2026-08-04 system audit measured one such place (the step-number badge in
   * agent connect) at **4.27:1**, and neither this file nor `a11y-ratchet` had ever
   * seen it — the former looked only at `tone`, the latter measured only the first
   * screen, and on top of that the badge is `aria-hidden`, so axe's `color-contrast`
   * skips it in principle. **Three automated checks had blind spots that overlapped
   * on one element.**
   *
   * **Why a ratchet and not 0.** Inventory before switching it on: **24 places**.
   * Changing ink changes pixels, and pixel decisions belong to the design gate, not a
   * value rule (.claude/rules/design.md). Also the verdict **depends on the host
   * background** — accent is 4.27 (fail) on `a16`/panel but 4.55 (pass) on
   * `a16`/canvas, and a static scan does not know which background a place is drawn
   * on. So this only locks the count against **growth**, and the real verdict is left
   * to the runtime instrument that opens the surfaces (`a11y-ratchet`).
   *
   * The audit's named place was repaid in that round (8.39:1), and the other places
   * were migrated exhaustively by the 2026-08-04 system ink round (open-surface
   * overlay contrast) — only the ink changed to `--color-indigo-text-soft`, with zero
   * change to dimensions or borders. After migration every place measures at least
   * 6.30:1 composite (the lowest being a32/elevated). Hence a baseline of 0: this
   * layer's licence is now the single rule "ink on a tint is soft", and a new
   * violation is red from the first one. The detector itself is kept honest by the
   * probe tests below.
   */
  const HAND_WRITTEN_INK = /text-\[color:var\(--color-indigo-accent\)\]/;
  const HAND_WRITTEN_TINT = /bg-\[color:var\(--color-(indigo|amber)[a-z-]*-a\d+\)\]/;
  const BASELINE_HAND_WRITTEN_ACCENT_ON_TINT = 0;

  /** Terminates an opening tag by **brace depth** — the `=>` in `onClick={() => …}` is not the end of the tag. */
  const openingTags = (src: string): string[] => {
    const tags: string[] = [];
    for (const m of src.matchAll(/<[A-Za-z][\w.]*/g)) {
      let depth = 0;
      let quote: string | null = null;
      let i = m.index! + m[0].length;
      let closed = false;
      for (; i < src.length; i += 1) {
        const c = src[i];
        if (quote) {
          if (c === quote && src[i - 1] !== "\\") quote = null;
          continue;
        }
        if (c === '"' || c === "'" || c === "`") quote = c;
        else if (c === "{") depth += 1;
        else if (c === "}") depth -= 1;
        else if (c === ">" && depth === 0) {
          closed = true;
          break;
        }
      }
      // Something that never closes is not a tag. Without this guard the slice runs to
      // end of file and every following element lands inside the "tag", counting 30
      // instead of 24 (measured).
      if (closed) tags.push(src.slice(m.index!, i));
    }
    return tags;
  };

  const handWritten = (): string[] => {
    const hits: string[] = [];
    for (const file of walk(join(process.cwd(), "src"))) {
      const src = stripComments(readFileSync(file, "utf8"));
      if (!HAND_WRITTEN_INK.test(src)) continue;
      for (const tag of openingTags(src)) {
        if (HAND_WRITTEN_INK.test(tag) && HAND_WRITTEN_TINT.test(tag)) {
          hits.push(`${file.replace(process.cwd(), ".")}`);
        }
      }
    }
    return hits;
  };

  it("손글씨 accent × 틴트가 늘지 않는다 — `tone` 을 안 쓰면 이 게이트가 못 보던 층", () => {
    const hits = handWritten();
    expect(
      hits.length,
      `잉크와 틴트를 손으로 나란히 쓴 자리가 ${BASELINE_HAND_WRITTEN_ACCENT_ON_TINT} → ${hits.length} 로 늘었다.\n` +
        `틴트를 지는 잉크는 --color-indigo-text-soft 다(같은 자리 4.27 → 8.39:1).\n` +
        hits.join("\n"),
    ).toBeLessThanOrEqual(BASELINE_HAND_WRITTEN_ACCENT_ON_TINT);
  });

  it("갚았으면 기준선도 내린다 — 여유를 무료로 두지 않는다", () => {
    expect(
      handWritten().length,
      "손글씨 accent×틴트가 줄었다 — BASELINE_HAND_WRITTEN_ACCENT_ON_TINT 도 같이 내려라.",
    ).toBeGreaterThanOrEqual(BASELINE_HAND_WRITTEN_ACCENT_ON_TINT);
  });

  it("탐지기가 공회전하지 않는다 — 합성 프로브를 실제로 잡고, 정상 짝은 놓아준다", () => {
    const offender = `<span className="rounded-full bg-[color:var(--color-indigo-a16)] text-[color:var(--color-indigo-accent)]">1</span>`;
    const fixed = `<span className="rounded-full bg-[color:var(--color-indigo-a16)] text-[color:var(--color-indigo-text-soft)]">1</span>`;
    const bare = `<span className="text-[color:var(--color-indigo-accent)]">1</span>`;
    const hit = (s: string) =>
      openingTags(s).some((t) => HAND_WRITTEN_INK.test(t) && HAND_WRITTEN_TINT.test(t));
    expect(hit(offender), "일부러 만든 위반을 못 잡는다 — 탐지기가 죽었다").toBe(true);
    expect(hit(fixed), "고친 짝을 위반으로 센다 — 그러면 고칠 이유가 사라진다").toBe(false);
    expect(hit(bare), "맨 바탕 위 accent 는 라이선스 안이다").toBe(false);
  });

  it("위반 0 — 틴트를 지는 주 행동 잉크는 accentOnTint 다", () => {
    const offenders: string[] = [];
    for (const file of walk(join(process.cwd(), "src"))) {
      const src = stripComments(readFileSync(file, "utf8"));
      if (!TONE_RE.test(src)) continue;
      const lines = src.split("\n");
      // Resolve string constants declared in the same file (e.g. INDIGO_CHIP).
      const consts = new Map<string, string>();
      for (const m of src.matchAll(/const\s+([A-Z0-9_]+)\s*=\s*\n?\s*["'`]([^"'`]+)["'`]/g)) {
        consts.set(m[1], m[2]);
      }
      lines.forEach((line, i) => {
        if (!TONE_RE.test(line)) return;
        const window = lines.slice(Math.max(0, i - 12), i + 13).join("\n");
        let resolved = window;
        for (const [name, value] of consts) {
          if (window.includes(name)) resolved += `\n${value}`;
        }
        if (TINT_RE.test(resolved)) {
          offenders.push(`${file.replace(process.cwd(), ".")}:${i + 1}`);
        }
      });
    }
    expect(
      offenders,
      `tone accent 가 인디고/앰버 틴트 채움과 같은 컨트롤에 있다 — accentOnTint 로:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
