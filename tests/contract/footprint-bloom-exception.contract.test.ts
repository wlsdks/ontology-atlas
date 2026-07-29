import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_FOOTPRINT,
  FOOTPRINT_RANGES,
  resolveFootprint,
} from "@/shared/lib/appearance-preferences";

/**
 * 발자국 「번짐」 — 헌장 예외 1건의 사정거리를 잠근다.
 *
 * ## 왜 lint 만으로는 부족한가
 *
 * `eslint.config.mjs` 의 shadowBlur 셀렉터는 **어느 파일이 글로우를 쓰는가**만
 * 본다. 그 룰을 통과한 채로도 예외는 두 방향으로 샐 수 있다:
 *
 * 1. **기본값이 0 이 아니게 되는 것** — 그러면 아무도 켜지 않았는데 앱이 글로우와
 *    함께 출시된다. "opt-in 이라 헌장 준수"라는 논거 전체가 기본값 0 위에 서 있다.
 * 2. **상한이 올라가는 것** — 6px 는 "자국 가장자리가 번진다"이고, 12px 는 자국
 *    본체보다 헤일로가 커져 금지된 그 글로우가 된다.
 *
 * 둘 다 **값 하나를 고치면 되는 일**이라 리뷰에서 가장 잘 미끄러진다. 그래서
 * 값으로 잠근다.
 *
 * ## 왜 헌장 문서까지 읽는가
 *
 * 예외는 코드와 문서 **양쪽에** 등재돼야 한다. 코드에만 있으면 다음 감사자가
 * "금지인데 왜 있지"로 읽고 지우고, 문서에만 있으면 지켜지지 않는다(이 저장소가
 * 반복해 배운 것). 그래서 이 테스트는 문서에 예외가 살아 있는지도 확인한다.
 */

const repoRoot = join(import.meta.dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(repoRoot, rel), "utf8");

const hexRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** WCAG 상대 휘도 → 대비비. 비-텍스트 기준선은 3:1 (WCAG 1.4.11). */
function contrastRatio(a: readonly number[], b: readonly number[]): number {
  const lum = (rgb: readonly number[]): number => {
    const f = (v: number): number => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("발자국 번짐 — 헌장 예외의 사정거리", () => {
  it("기본값은 0 이다 — 아무도 켜지 않으면 글로우는 존재하지 않는다", () => {
    expect(DEFAULT_FOOTPRINT.bloom).toBe(0);
  });

  it("상한은 6px 다 — 자국 본체보다 헤일로가 커지는 값은 못 고른다", () => {
    expect(FOOTPRINT_RANGES.bloom.max).toBe(6);
    expect(FOOTPRINT_RANGES.bloom.min).toBe(0);
  });

  it("저장값이 상한을 넘겨도 잘려 들어온다 — localStorage 로 우회할 수 없다", () => {
    expect(resolveFootprint({ bloom: 999 }).bloom).toBe(6);
    expect(resolveFootprint({ bloom: -5 }).bloom).toBe(0);
  });

  /**
   * 글로우를 쓰는 파일은 **하나뿐**이다. 늘어나면 그건 예외가 아니라 관례가 된
   * 것이고, 그 순간 헌장이 거짓말이 된다.
   */
  it("shadowBlur 소비처는 발자국 렌더러 하나뿐이다", () => {
    const eslintConfig = read("eslint.config.mjs");
    expect(eslintConfig).toContain('MemberExpression[property.name="shadowBlur"]');
    expect(eslintConfig).toContain("src/shared/lib/footprint-glyph.ts");
  });

  it("헌장 두 문서에 예외가 등재돼 있다 — 코드에만 있으면 다음 사람이 지운다", () => {
    expect(read(".claude/rules/forbidden.md")).toMatch(/발자국 트레일 번짐/);
    expect(read(".claude/rules/design.md")).toMatch(/발자국 트레일/);
  });

  /**
   * 사용자가 고를 수 있는 **어떤 조합에서도** 발자국이 읽혀야 한다.
   *
   * 실측으로 잡힌 결함(2026-07-29): 인디고 톤이 `--color-indigo-accent`(#7170ff)
   * 였을 때 최저 진하기(0.5)에서 캔버스 대비 **2.08:1** 이었다 — 3:1 미달.
   * 「인디고 + 은은하게」는 고를 수 있는 조합이므로, 그건 취향이 아니라 **고를
   * 수 있는 결함**이다. 안 보이게 만들 자유는 설정이 아니다.
   *
   * 값 하나만 고치면 다시 깨지는 종류라 값으로 잠근다. WCAG 1.4.11 비-텍스트
   * 대비 3:1 기준.
   */
  it("두 톤 모두 최저 진하기에서 3:1 을 넘는다", () => {
    const css = read("app/globals.css");
    const bg = hexRgb(/--topology-v2-canvas-bg-near:\s*(#[0-9a-fA-F]{6})/.exec(css)![1]);
    const tones = {
      amber: /--color-footprint-trail:\s*(#[0-9a-fA-F]{6})/.exec(css)![1],
      indigo: /--color-footprint-trail-indigo:\s*(#[0-9a-fA-F]{6})/.exec(css)![1],
    };
    for (const [name, hexValue] of Object.entries(tones)) {
      const over = hexRgb(hexValue).map((c, i) => c * FOOTPRINT_RANGES.opacity.min + bg[i] * (1 - FOOTPRINT_RANGES.opacity.min));
      const contrast = contrastRatio(over as [number, number, number], bg);
      expect(contrast, `${name} 톤이 최저 진하기에서 ${contrast.toFixed(2)}:1 — 안 보이는 발자국을 고를 수 있다`).toBeGreaterThanOrEqual(3);
    }
  });

  /**
   * 발자국 노랑은 허브 앰버와 **같은 비트를 쓰지 않는다**. 같으면 "여기가
   * 중심"과 "여기 걸었다"가 한 색이 되어, 색이 나르던 구분이 사라진다.
   */
  it("발자국 노랑은 허브 앰버와 다른 값이다", () => {
    const css = read("app/globals.css");
    const hub = /--topology-v2-amber-hub:\s*(#[0-9a-fA-F]{6})/.exec(css)?.[1]?.toLowerCase();
    const trail = /--color-footprint-trail:\s*(#[0-9a-fA-F]{6})/.exec(css)?.[1]?.toLowerCase();
    expect(hub).toBeDefined();
    expect(trail).toBeDefined();
    expect(trail).not.toBe(hub);
  });
});
