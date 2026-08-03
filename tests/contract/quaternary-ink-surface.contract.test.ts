import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { composite, contrastRatio, parseColor } from "../../scripts/lib/contrast.mjs";

/**
 * quaternary 잉크의 **표면 라이선스 계약** (2026-08-04 체계석 판정).
 *
 * ## 무엇을 잠그나
 *
 * 2026-08-03 상향(#787c84 → #82828a)은 「네 정지 표면」(canvas · panel ·
 * panel+overlay-1 · elevated)을 라이선스로 재고 전부 통과시켰다. 그런데
 * 오버레이가 **한 겹 더** 쌓이는 표면은 그 네 바탕에 없었고, 신설된 열린 표면
 * 계기(`tests/e2e/a11y-open-surfaces.spec.ts`)가 그 사각지대를 첫 실행에서
 * 숫자로 확인했다 — 글로벌 검색의 kbd(panel+overlay-2, 4.38) · 선택 행 칩
 * (overlay-1∘indigo-a14∘panel, 4.14) · 선택 행 스팬(indigo-a14∘panel, 4.39).
 *
 * 판정: **잉크를 또 올리지 않는다.** 오버레이 합성은 원리적으로 겹수 상한이
 * 없어서 한 잉크 값으로 전 깊이를 이길 수 없고, 올릴수록 tertiary 와의 위계
 * 간격(panel 위 스텝비 1.17, 저장소 수용 최소 1.06)을 판다. 대신 라이선스에
 * **경계를 명문화**한다:
 *
 * > **quaternary 의 라이선스는 정지한 무채 바탕까지다** — 맨 3단(canvas /
 * > panel / elevated)과 canvas·panel 위 overlay-1 한 겹. **그보다 올라선
 * > 바탕**(overlay-2 이상, elevated+overlay, 인디고·앰버 틴트 합성) **위의
 * > 글자는 tertiary 부터다.** (AtlasGitPanel 2026-08-02 「누를 수 있는 행
 * > 위의 글자는 tertiary 부터」의 일반화 — 행이 눌려서가 아니라 바탕이
 * > 올라서서 생기는 규칙이었다.)
 *
 * ## 왜 lint 가 아니라 계약 + 런타임 계기인가
 *
 * 정적 스캔은 그 잉크가 **어느 바탕 위에 그려지는지 모른다** — 같은
 * `text-quaternary` 가 panel 위(5.00 통과)와 overlay-2 위(4.36 미달)에 산다.
 * 같은-태그 페어링 휴리스틱도 여기서는 못 쓴다: 이 층의 지배적 관용구가
 * `active ? '틴트 배경 + 밝은 잉크' : 'quaternary 잉크'` 같은 **분기**라,
 * 두 리터럴이 한 태그에 있어도 런타임에 공존하지 않는 오탐이 18쌍 중
 * 다수였다(2026-08-04 전수). 그래서 층을 셋으로 가른다:
 *
 * 1. **값 층(여기)** — globals.css 실값으로 라이선스 경계 자체를 계산한다.
 *    토큰이 움직이면 이 시험이 그 순간의 진실을 다시 계산한다.
 * 2. **자리 층(여기)** — 이번에 실측으로 잡힌 자리(글로벌 검색)가 다시
 *    quaternary 로 돌아가지 않는다는 소스 단언.
 * 3. **화면 층(`a11y-open-surfaces.spec.ts`)** — 열린 표면을 실제로 열고
 *    axe 로 재는 래칫. 이번 라운드에 color-contrast 기준선이 5 → 0 이 됐다.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

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
const stack = (...layers: Rgba[]) =>
  layers.reduce((bg, fg) => composite(fg as never, bg as never) as unknown as Rgba);
const ratioOn = (ink: Rgba, bg: Rgba) =>
  contrastRatio(composite(ink as never, bg as never), bg as never);

const canvas = cssToken(css, "--color-canvas");
const panel = cssToken(css, "--color-panel");
const elevated = cssToken(css, "--color-elevated");
const o1 = cssToken(css, "--color-overlay-1");
const o2 = cssToken(css, "--color-overlay-2");
const a14 = cssToken(css, "--color-indigo-a14");

const quaternary = cssToken(css, "--color-text-quaternary");
const tertiary = cssToken(css, "--color-text-tertiary");

describe("quaternary 잉크 라이선스 — 정지한 무채 바탕까지", () => {
  it("라이선스 안: 맨 3단 + canvas/panel 위 overlay-1 에서 AA(4.5:1)", () => {
    const licensed: Record<string, Rgba> = {
      canvas,
      panel,
      elevated,
      "canvas+overlay-1": stack(canvas, o1),
      "panel+overlay-1": stack(panel, o1),
    };
    for (const [name, bg] of Object.entries(licensed)) {
      const r = ratioOn(quaternary, bg);
      expect(r, `quaternary 가 ${name} 위에서 ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("경계의 근거가 아직 실재한다 — 올라선 바탕에서는 실제로 AA 를 깬다", () => {
    /*
     * `/gate-probe`: 빈 집합 위에서 공회전하는 검출기를 금지한다. 이 단언이
     * 빨개지는 날은 quaternary 가 올라선 표면까지 통과하게 된 날이고, 그날
     * 이 라이선스 경계는 접을 수 있다 — accent/accentOnTint 의 「분리의
     * 근거」 단언과 같은 문법이다. (거꾸로 quaternary 를 그만큼 올리면
     * tertiary 와의 위계가 먼저 무너진다 — 그쪽은 아래 스텝비가 잡는다.)
     */
    expect(ratioOn(quaternary, stack(panel, o2))).toBeLessThan(4.5);
    expect(ratioOn(quaternary, stack(elevated, o1))).toBeLessThan(4.5);
    expect(ratioOn(quaternary, stack(panel, a14))).toBeLessThan(4.5);
  });

  it("처방이 성립한다 — tertiary 는 이번에 실측된 올라선 바탕 전부에서 AA", () => {
    /*
     * 「올라선 바탕 위의 글자는 tertiary 부터」가 처방이 되려면 tertiary 가
     * 실제로 그 바탕들을 넘어야 한다. 열린 표면 계기가 잡았던 세 합성이
     * 기준이다. tertiary 도 안 넘는 더 깊은 합성(elevated+overlay-3 등)이
     * 화면에 생기면 그 자리는 secondary 부터고, 그때 이 목록을 넓힌다.
     */
    const raised: Record<string, Rgba> = {
      "panel+overlay-2": stack(panel, o2),
      "indigo-a14∘panel": stack(panel, a14),
      "overlay-1∘indigo-a14∘panel": stack(panel, a14, o1),
      "elevated+overlay-1": stack(elevated, o1),
    };
    for (const [name, bg] of Object.entries(raised)) {
      const r = ratioOn(tertiary, bg);
      expect(r, `tertiary 가 ${name} 위에서 ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("위계 간격이 남아 있다 — panel 위 tertiary/quaternary 스텝비 ≥ 1.06", () => {
    /*
     * 2026-08-03 상향이 이미 1.29 → 1.17 로 좁혔다. 이 저장소가 수용한 같은
     * 단의 최소는 1.06(지도 패널 램프) — 그 아래로 내려가는 값 변경은 위계를
     * 판 것이므로, 다음에 누가 quaternary 를 「한 번 더」 올리려 할 때 여기가
     * 먼저 빨개진다.
     */
    const step = ratioOn(tertiary, panel) / ratioOn(quaternary, panel);
    expect(step).toBeGreaterThanOrEqual(1.06);
  });
});

describe("실측으로 잡힌 자리가 되돌아가지 않는다 — 글로벌 검색", () => {
  it("kbd·선택 행 자식들은 tertiary 다", () => {
    /*
     * 2026-08-04 열린 표면 첫 전수의 color-contrast 3건이 전부 이 파일이었다:
     * kbd(4.38) · 선택 행 kind 칩(4.14) · 선택 행 스팬(4.39). cmdk 의 선택은
     * 모든 행을 순회하므로 slug/status 스팬도 같은 규칙이다.
     */
    const src = read("src/widgets/global-search/ui/GlobalSearch.tsx");
    const kbd = /<kbd[^>]*className="[^"]*"/.exec(src)?.[0] ?? "";
    expect(kbd).toContain("--color-text-tertiary");
    expect(kbd).not.toContain("--color-text-quaternary");
    // 선택 행(aria-selected:bg-indigo-a14) 안에는 quaternary 자식이 없다.
    const items = src.split("aria-selected:bg-[color:var(--color-indigo-a14)]");
    expect(items.length, "선택 행 문법이 사라졌다 — 이 단언의 대상을 다시 찾아라").toBeGreaterThan(1);
    for (const chunk of items.slice(1)) {
      // 행 원소가 닫히는 지점까지만 본다(다음 Group 헤딩 전).
      const scope = chunk.split("</Command.Item>")[0] ?? chunk;
      expect(
        scope.includes("--color-text-quaternary"),
        "선택 행(indigo-a14 합성) 안에 quaternary 잉크가 되돌아왔다 — 4.39:1 로 AA 미달이다. tertiary 부터 쓴다.",
      ).toBe(false);
    }
  });
});
