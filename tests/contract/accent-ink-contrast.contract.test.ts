import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { composite, contrastRatio, parseColor } from "../../scripts/lib/contrast.mjs";
import { controlClass } from "../../src/shared/ui/control-class";

/**
 * 인디고 잉크 2단의 **라이선스 계약** (2026-08-03 체계석 판정, PR #886 후속).
 *
 * ## 무엇을 잠그나
 *
 * 이 앱에는 인디고 잉크의 해가 둘이다:
 *
 * | 톤 | 토큰 | 라이선스 |
 * |---|---|---|
 * | `accent` | `--color-indigo-accent`(#7170ff) | **맨 어두운 바탕만** (canvas/panel/elevated) |
 * | `accentOnTint` | `--color-indigo-text-soft` | 어디서나 — 틴트 채움·호버 채움 포함 |
 *
 * 판정은 이름이 아니라 **합성 대비 실측**이다: 여기서 `app/globals.css` 의
 * 실제 토큰 값을 읽어 WCAG 2.2 §1.4.3(AA 4.5:1)을 계산한다. 토큰 값이
 * 움직이면 이 시험이 그 순간의 진실을 다시 계산한다 — 상수 복제가 아니라서
 * 드리프트가 없다.
 *
 * ## 왜 lint 만으로 안 되나
 *
 * eslint 페어링 셀렉터(`accentTintPairingSelectors`)는 **같은 호출/원소 안의
 * 리터럴**만 본다. `INDIGO_CHIP` 같은 파일 상수로 우회된 className 은 AST
 * 셀렉터 하나에 안 담긴다 — 그 층을 여기 소스 스캔(상수 해석 포함)이 맡는다.
 * (`design.md` "lint 가 못 보는 층은 계약 테스트가 맡는다".)
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/** `app/globals.css` 첫 정의 우선으로 토큰 값을 꺼낸다. */
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

/** 앱의 맨 바탕 3단 — 모든 컨트롤 호스트의 바닥. */
const BASES = {
  canvas: cssToken(css, "--color-canvas"),
  panel: cssToken(css, "--color-panel"),
  elevated: cssToken(css, "--color-elevated"),
};

/**
 * 이관 전수(29곳)가 실제로 딛고 있던 틴트들. 여기 없는 새 틴트 위에 accent 를
 * 올리려면 이 목록을 넓히고 아래 라이선스로 증명해야 한다.
 */
const TINTS = {
  "indigo-a08": cssToken(css, "--color-indigo-a08"),
  "indigo-a10": cssToken(css, "--color-indigo-a10"),
  "indigo-a14": cssToken(css, "--color-indigo-a14"),
  "indigo-a16": cssToken(css, "--color-indigo-a16"),
  "indigo-a24": cssToken(css, "--color-indigo-a24"),
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
     * 대비만으로는 이 매핑을 못 잠근다: soft 는 맨 바탕도 통과하므로
     * `accent` 잉크를 soft 로 바꿔치기해도 아래 라이선스는 초록이다.
     * 하지만 그 순간 앱 전역 99줄의 손글씨 `--color-indigo-accent` 텍스트와
     * 램프가 두 방언이 된다 — 그 정합이 이 매핑의 존재 이유다.
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
     * `/gate-probe`: 빈 집합 위에서 공회전하는 검출기를 금지한다. 이 단언이
     * 빨개지는 날은 토큰이 수렴해 accent 가 어디서나 통과하게 된 날이고,
     * 그날 이 두 톤은 하나로 접을 수 있다 — scope 축의 「두 램프가 실제로
     * 다르다」 게이트와 같은 문법이다.
     */
    expect(
      ratioOn(accent, composite(TINTS["indigo-a24"], BASES.canvas)),
      "accent 가 a24/canvas 에서도 AA 를 통과한다 — 톤 분리를 접을 수 있는지 재평가하라",
    ).toBeLessThan(4.5);
    expect(ratioOn(accent, composite(TINTS["indigo-line-a13"], BASES.elevated))).toBeLessThan(4.5);
  });
});

/**
 * 소스 스캔 — `tone accent` 가 틴트 채움과 **한 컨트롤에서** 짝지어지지 않는다.
 *
 * 창 휴리스틱: tone 표기 앞뒤 12줄에서 틴트 배경 리터럴과, className 에 얹힌
 * 파일 상수(`const NAME = '…'`)를 해석해 본다. 오늘 잔류 accent 3곳은 전부
 * 맨 바탕 위 `link` 라 창 안에 틴트가 없다 — 새로 생기면 여기가 빨개지고,
 * 처방은 금지가 아니라 `accentOnTint` 다.
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

  it("위반 0 — 틴트를 지는 주 행동 잉크는 accentOnTint 다", () => {
    const offenders: string[] = [];
    for (const file of walk(join(process.cwd(), "src"))) {
      const src = readFileSync(file, "utf8");
      if (!TONE_RE.test(src)) continue;
      const lines = src.split("\n");
      // 같은 파일의 문자열 상수(예: INDIGO_CHIP)를 값으로 해석한다.
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
