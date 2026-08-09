import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * **작대기(`—`) 래칫 — 사용자에게 보이는 글에서 더 늘지 못하게 막는다.**
 *
 * ## 왜 (2026-08-09 소유자 지적)
 *
 * > *"내 폴더 전체를 한눈에 — 모든 숫자는 문서에서 자동 계산됩니다 … 이거는 ai
 * > 패턴이거든? 이런거 있으면 다 변경해줘 작대기 안쓰도록"*
 *
 * 맞다. 「짧은 앞말 — 긴 설명」은 모델이 기본으로 쓰는 문장 모양이고, 사람이 쓴
 * 한국어 UI 문구는 대개 마침표로 끊는다.
 *
 * ## 왜 지금 다 안 고쳤나 — 전수를 세어 보고 내린 판단
 *
 * 실측: 문자열 3,206개 중 **501개**(ko 234 · en 267, 15.6%)가 작대기를 쓴다.
 * 모양별로 갈리고 **자리마다 답이 다르다**:
 *
 * | 모양 | 수 | 무엇으로 바꾸나 |
 * |---|---|---|
 * | 짧은 앞말 — 설명 (라벨꼴) | 282 | 마침표 · 줄바꿈 · 두 필드로 분리 |
 * | 문장 중간 1개 | 205 | 대개 마침표로 끊기 |
 * | 삽입구(2개 이상) | 11 | 문장을 다시 써야 한다 |
 * | **빈 값 표시 기호** | 2 | **건드리지 않는다** — 글이 아니라 기호다 |
 *
 * 487개를 기계로 일괄 치환하면 글이 망가진다 — 이 저장소는 문구를 사람이 판단해서
 * 쓰는 것으로 다루고, 그래서 문서 게이트도 「사람이 쓴 문장을 못박지 않는다」를
 * 규율로 갖는다. 그래서 **화면 단위로 나눠 고치고, 그동안 늘지만 못하게** 막는다.
 *
 * ⚠️ **줄었으면 상한도 같이 내린다.** 안 내리면 고친 만큼이 다시 여유가 된다.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..");

/** 2026-08-09 실측. 줄이는 것은 자유, 늘리려면 문장을 다시 써라. */
const BASELINE = { ko: 232, en: 265 } as const;

/**
 * **글이 아니라 기호인 자리** — 값이 없다는 뜻의 대시 하나. 여기 있는 것은
 * 문장이 아니므로 이 래칫이 세지 않는다.
 */
function isPlaceholderGlyph(value: string): boolean {
  return value.trim() === "—";
}

function countEmDash(locale: "ko" | "en"): { strings: number; withDash: number } {
  const raw = JSON.parse(
    readFileSync(join(REPO_ROOT, "messages", `${locale}.json`), "utf8"),
  ) as unknown;
  let strings = 0;
  let withDash = 0;
  const walk = (node: unknown) => {
    if (typeof node === "string") {
      strings += 1;
      if (node.includes("—") && !isPlaceholderGlyph(node)) withDash += 1;
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node && typeof node === "object") {
      for (const value of Object.values(node)) walk(value);
    }
  };
  walk(raw);
  return { strings, withDash };
}

describe("작대기 래칫 — 사용자 문구", () => {
  for (const locale of ["ko", "en"] as const) {
    it(`${locale}: 작대기를 쓰는 문구가 늘지 않는다`, () => {
      const { strings, withDash } = countEmDash(locale);
      // 공회전 차단 — 파일을 못 읽고 「0건」으로 통과하는 것이 가장 나쁜 실패다.
      expect(strings, `${locale} 문구를 하나도 못 읽었다 — 이 래칫이 헛돈다`).toBeGreaterThan(
        2_000,
      );
      expect(
        withDash,
        `${locale} 작대기 문구가 ${BASELINE[locale]} → ${withDash} 로 늘었다.\n` +
          "「짧은 앞말 — 긴 설명」은 모델의 기본 문장 모양이다. 마침표로 끊거나 두 줄로 나눠라.\n" +
          "값이 없다는 뜻의 «—» 하나만 있는 문자열은 기호라서 안 센다.",
      ).toBeLessThanOrEqual(BASELINE[locale]);
      expect(
        withDash,
        `${locale} 작대기 문구가 ${BASELINE[locale]} → ${withDash} 로 줄었다. ` +
          `BASELINE.${locale} 도 ${withDash} 로 내려라 — 안 내리면 고친 만큼이 다시 여유가 된다.`,
      ).toBe(BASELINE[locale]);
    });
  }
});
