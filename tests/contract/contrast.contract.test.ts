import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  composite,
  contrastRatio,
  isLargeText,
  judgeAdjacentMarks,
  judgeText,
  parseColor,
  relativeLuminance,
} from "../../scripts/lib/contrast.mjs";

/**
 * **Probes** for the contrast instrument.
 *
 * `/gate-probe`: a gate that only ever passes is indistinguishable from no gate.
 * Contrast especially so — **any two colours produce a number**, so a wrong
 * calculation still looks plausible. Every fixture here is therefore a value
 * **verifiable from outside**: the extremes WCAG states explicitly, and the
 * arithmetic answers for alpha compositing.
 */

const SRC_DIR = join(process.cwd(), "scripts/lib");

/**
 * `judgeText` returns `null` when it cannot read a colour. Passing that through with
 * `!` means **this whole file passes vacuously on the day parsing silently breaks**,
 * because the comparisons become undefined rather than judgements. So it is cut off
 * once here.
 */
const judged = (input: Parameters<typeof judgeText>[0]) => {
  const r = judgeText(input);
  expect(r, `색을 못 읽었다: ${input.fg} on ${input.bg}`).not.toBeNull();
  return r!;
};

describe("색 파싱", () => {
  it.each([
    ["#fff", [255, 255, 255, 1]],
    ["#000000", [0, 0, 0, 1]],
    ["rgb(94, 106, 210)", [94, 106, 210, 1]],
    ["rgba(255, 255, 255, 0.5)", [255, 255, 255, 0.5]],
    ["transparent", [0, 0, 0, 0]],
  ])("`%s`", (input, expected) => {
    expect(parseColor(input)).toEqual(expected);
  });

  it("모르는 형식은 null 이다 — 0 으로 때우면 검정으로 오판한다", () => {
    // Folding a parse failure into black (luminance 0) makes contrast look **better** than it is.
    expect(parseColor("color(display-p3 1 0 0)")).toBeNull();
    expect(parseColor("")).toBeNull();
  });
});

describe("WCAG 규격값", () => {
  it("흰↔검은 21:1 이다 — 이 상한이 안 나오면 휘도 식이 틀렸다", () => {
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 5);
  });

  it("같은 색끼리는 1:1 이다", () => {
    expect(contrastRatio([94, 106, 210], [94, 106, 210])).toBeCloseTo(1, 5);
  });

  it("순서가 결과를 바꾸지 않는다 — 비율은 밝은 쪽이 분자다", () => {
    const a = [94, 106, 210];
    const b = [8, 9, 10];
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
  });

  it("상대 휘도가 규격 극단값과 맞는다", () => {
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 10);
    expect(relativeLuminance([0, 0, 0])).toBeCloseTo(0, 10);
    // Below the linearisation breakpoint, small values take the division path — using the exponent path there diverges.
    expect(relativeLuminance([1, 1, 1])).toBeCloseTo(1 / 255 / 12.92, 10);
  });
});

describe("알파 합성 — 이게 빠지면 계기가 낙관한다", () => {
  it("50% 흰색을 검정 위에 올리면 회색 127.5 다", () => {
    expect(composite([255, 255, 255, 0.5], [0, 0, 0, 1])).toEqual([127.5, 127.5, 127.5, 1]);
  });

  it("불투명 전경은 배경을 무시한다", () => {
    expect(composite([94, 106, 210, 1], [255, 255, 255, 1])).toEqual([94, 106, 210, 1]);
  });

  it("반투명 텍스트는 합성 전보다 대비가 **낮게** 나온다 — 그게 실제 화면이다", () => {
    const bg = "rgb(8, 9, 10)"; // --color-canvas
    const solid = judged({ fg: "rgb(255,255,255)", bg, fontSizePx: 14, fontWeight: 400 });
    const faded = judged({ fg: "rgba(255,255,255,0.45)", bg, fontSizePx: 14, fontWeight: 400 });
    expect(solid.ratio).toBeGreaterThan(faded.ratio);
    // And the drop is large enough to flip the verdict — omitting compositing turns it into a pass.
    expect(solid.passes).toBe(true);
    expect(faded.passes).toBe(false);
  });
});

describe("문턱 판정", () => {
  it("본문은 4.5:1, 큰 글자는 3:1 을 요구한다", () => {
    const bg = "rgb(8, 9, 10)";
    const fg = "rgb(110, 110, 110)"; // A grey that falls between 4.5 and 3
    const body = judged({ fg, bg, fontSizePx: 14, fontWeight: 400 });
    const large = judged({ fg, bg, fontSizePx: 30, fontWeight: 400 });
    expect(body.required).toBe(4.5);
    expect(large.required).toBe(3);
    expect(body.ratio).toBe(large.ratio); // Same colour…
    expect(body.passes).toBe(false); // …but the verdict differs
    expect(large.passes).toBe(true);
  });

  it("큰 글자 정의가 WCAG 경계와 같다 — 18.66px+bold 또는 24px", () => {
    expect(isLargeText(24, 400)).toBe(true);
    expect(isLargeText(23, 400)).toBe(false);
    expect(isLargeText(18.66, 700)).toBe(true);
    expect(isLargeText(18.66, 400)).toBe(false); // Not without bold
    expect(isLargeText(18, 700)).toBe(false);
  });
});

describe("인접 마크 — hue 로만 갈리는 설계를 잡는다", () => {
  /** A readable colour **never falls through to unmeasured** — that is itself the contract. */
  const measured = (input: { a: string; b: string; over: string }) => {
    const r = judgeAdjacentMarks(input);
    if (!r) throw new Error(`읽을 수 있는 색인데 미측정으로 돌아왔다: ${JSON.stringify(input)}`);
    return r;
  };

  it("2026-07-26 의 그 쌍을 다시 재면 3:1 에 한참 못 미친다", () => {
    // Amber and eucalyptus differ clearly in hue but were nearly identical in
    // luminance. That hue axis is the one red-green colour blindness separates worst,
    // so the premise that colour carries identity was wrong.
    const r = measured({ a: "#d4b478", b: "#7fa88c", over: "rgb(8,9,10)" });
    expect(r.passes).toBe(false);
    expect(r.needsNonColorChannel).toBe(true);
    expect(r.ratio).toBeLessThan(2); // Completely different colours to the eye
  });

  it("휘도로 갈린 쌍은 통과한다 — 아무거나 반려하지 않는다", () => {
    expect(measured({ a: "#ffffff", b: "#3a3a3a", over: "rgb(8,9,10)" }).passes).toBe(true);
  });

  /**
   * An unreadable colour is **unmeasured, not a pass** — the same contract as its
   * sibling `judgeText` (code review 2026-08-07).
   *
   * Without the guard, `composite(null, …)` threw a `TypeError`. Inside a manual
   * instrument a person saw it, but once this entered the CI ratchet on 2026-08-06 it
   * became **a path that crashes the gate**. The real inputs `parseColor` cannot read
   * are Chromium's serialisations of wide colour spaces and `color-mix()`:
   * `color(srgb …)` and `oklch(…)`.
   */
  it("못 읽는 색은 던지지 않고 null 로 돌아온다", () => {
    for (const bad of ["oklch(0.7 0.1 250)", "color(srgb 0.2 0.3 0.4)", "wat"]) {
      expect(judgeAdjacentMarks({ a: bad, b: "#ffffff", over: "rgb(8,9,10)" })).toBeNull();
      expect(judgeAdjacentMarks({ a: "#ffffff", b: bad, over: "rgb(8,9,10)" })).toBeNull();
    }
  });
});

describe("계기가 스스로를 설명한다", () => {
  const SOURCE = readFileSync(join(SRC_DIR, "contrast.mjs"), "utf8");

  it("알파 합성이 계산에서 빠지지 않는다", () => {
    /*
     * What stops the next person "simplifying" compositing away is **the code**, not
     * a sentence about it. `composite` must be exported, and the ratio computation
     * must actually call it — measuring a pre-composite colour reports better than
     * reality, which is the defect this module exists to prevent.
     */
    expect(SOURCE).toMatch(/export function composite\b/);
    const callsInRatio = [...SOURCE.matchAll(/composite\s*\(/g)].length;
    expect(callsInRatio, "합성 함수가 정의만 되고 쓰이지 않는다").toBeGreaterThan(1);
  });

  it("근거를 WCAG 조항으로 댄다 — 취향이 아니라 규격이다", () => {
    expect(SOURCE).toContain("1.4.3");
    expect(SOURCE).toContain("1.4.11");
  });
});
