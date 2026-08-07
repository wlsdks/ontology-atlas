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
 * 대비 계기의 **프로브**.
 *
 * `/gate-probe`: 항상 통과하기만 하는 게이트는 게이트가 없는 것과 구별되지 않는다.
 * 대비는 특히 그렇다 — 어떤 두 색을 넣어도 **숫자는 나오기 때문**에, 계산이 틀려도
 * 결과가 그럴듯해 보인다. 그래서 여기 fixture 는 전부 **바깥에서 검증 가능한 값**
 * (WCAG 규격이 명시하는 극단값, 알파 합성의 산술적 정답)이다.
 */

const SRC_DIR = join(process.cwd(), "scripts/lib");

/**
 * `judgeText` 는 색을 못 읽으면 `null` 이다. 그걸 `!` 로 넘기면 **파싱이 조용히
 * 깨진 날 이 파일 전체가 공허하게 통과한다** — 판정이 아니라 undefined 비교가
 * 되기 때문이다. 그래서 여기서 한 번 끊는다.
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
    // 파싱 실패를 검정(휘도 0)으로 접으면 대비가 실제보다 **좋게** 나온다.
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
    // 선형화 분기점 아래(작은 값)는 나눗셈 경로를 탄다 — 지수 경로를 잘못 쓰면 어긋난다.
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
    // 그리고 이 낙차가 판정을 뒤집을 만큼 크다 — 합성을 빼먹으면 통과가 된다.
    expect(solid.passes).toBe(true);
    expect(faded.passes).toBe(false);
  });
});

describe("문턱 판정", () => {
  it("본문은 4.5:1, 큰 글자는 3:1 을 요구한다", () => {
    const bg = "rgb(8, 9, 10)";
    const fg = "rgb(110, 110, 110)"; // 4.5 와 3 사이에 떨어지는 회색
    const body = judged({ fg, bg, fontSizePx: 14, fontWeight: 400 });
    const large = judged({ fg, bg, fontSizePx: 30, fontWeight: 400 });
    expect(body.required).toBe(4.5);
    expect(large.required).toBe(3);
    expect(body.ratio).toBe(large.ratio); // 같은 색인데
    expect(body.passes).toBe(false); // 판정이 갈린다
    expect(large.passes).toBe(true);
  });

  it("큰 글자 정의가 WCAG 경계와 같다 — 18.66px+bold 또는 24px", () => {
    expect(isLargeText(24, 400)).toBe(true);
    expect(isLargeText(23, 400)).toBe(false);
    expect(isLargeText(18.66, 700)).toBe(true);
    expect(isLargeText(18.66, 400)).toBe(false); // bold 가 아니면 안 된다
    expect(isLargeText(18, 700)).toBe(false);
  });
});

describe("인접 마크 — hue 로만 갈리는 설계를 잡는다", () => {
  /** 읽을 수 있는 색은 **미측정으로 떨어지지 않는다** — 그 자체가 계약이다. */
  const measured = (input: { a: string; b: string; over: string }) => {
    const r = judgeAdjacentMarks(input);
    if (!r) throw new Error(`읽을 수 있는 색인데 미측정으로 돌아왔다: ${JSON.stringify(input)}`);
    return r;
  };

  it("2026-07-26 의 그 쌍을 다시 재면 3:1 에 한참 못 미친다", () => {
    // 앰버와 유칼립투스는 hue 로는 뚜렷이 다른데 휘도로는 거의 같았다. 그 hue 축이
    // 적록 색약이 가장 못 가르는 축이라, 「색이 정체를 나른다」는 전제가 틀렸었다.
    const r = measured({ a: "#d4b478", b: "#7fa88c", over: "rgb(8,9,10)" });
    expect(r.passes).toBe(false);
    expect(r.needsNonColorChannel).toBe(true);
    expect(r.ratio).toBeLessThan(2); // 눈으로는 «완전히 다른 색» 인데
  });

  it("휘도로 갈린 쌍은 통과한다 — 아무거나 반려하지 않는다", () => {
    expect(measured({ a: "#ffffff", b: "#3a3a3a", over: "rgb(8,9,10)" }).passes).toBe(true);
  });

  /**
   * 못 읽은 색은 **통과가 아니라 미측정**이다 — 형제 `judgeText` 와 같은 계약
   * (2026-08-07 코드 리뷰).
   *
   * 종전에는 가드가 없어 `composite(null, …)` 이 `TypeError` 를 던졌다. 수동
   * 계기 안에서는 사람이 봤지만 2026-08-06 에 CI 래칫으로 들어가면서 **게이트가
   * 크래시하는 경로**가 됐다. `parseColor` 가 못 읽는 실제 입력은 크로미움이
   * 넓은 색 공간·`color-mix()` 를 직렬화한 `color(srgb …)` · `oklch(…)` 다.
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

  it("왜 알파 합성이 들어 있는지 적어 둔다", () => {
    // 다음 사람이 «간단하게» 합성을 걷어내는 것을 막는 것은 코드가 아니라 이 문장이다.
    expect(SOURCE).toMatch(/합성/);
    expect(SOURCE).toMatch(/실제보다 좋게/);
  });

  it("근거를 WCAG 조항으로 댄다 — 취향이 아니라 규격이다", () => {
    expect(SOURCE).toContain("1.4.3");
    expect(SOURCE).toContain("1.4.11");
  });
});
