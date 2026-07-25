import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 라벨 끝에 붙은 장식 화살표를 막는 게이트.
 *
 * 소유자 판정(2026-07-26), `지도에서 열기 →` 를 보고:
 *
 * > *"나는 이런 글 옆에 화살표 있는거 싫어하거든? AI느낌이라?"*
 *
 * 라벨 뒤의 화살표는 정보를 하나도 더하지 않는다 — 어디로 가는지는 라벨이
 * 이미 말했고, 누를 수 있다는 건 컨트롤 생김새가 이미 말한다. 남는 신호는
 * "생성된 랜딩 페이지" 의 결이고, 워크벤치처럼 같은 라벨이 열두 번 나오는
 * 화면에서는 소음도 열두 번 반복된다.
 *
 * **화살표 자체를 금지하는 게 아니다.** 문장 가운데의 화살표는 대개 데이터다:
 * `{source} → {target}`(경로), `오래된 → 최근`(순서), `설정 → Developer`(메뉴
 * 경로), `목차 클릭 → 해당 위치로`(인과). 그래서 이 게이트는 **문자열 끝**만
 * 본다. 판별법: 화살표를 지우고 라벨을 소리 내어 읽어라. 잃은 게 없으면 장식이었다.
 *
 * 전문: `docs/DESIGN-SYSTEM.md` "Arrows carry information or they don't ship".
 */

/** 라벨 끝의 장식 화살표. 문장 중간은 대상이 아니다. */
const TRAILING_ARROW = /[→↗➜⟶»]\s*$/;

const LOCALES = ["ko", "en"] as const;

interface Offence {
  locale: string;
  path: string;
  value: string;
}

function collectStrings(node: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof node === "string") {
    out.push([path, node]);
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      collectStrings(value, path ? `${path}.${key}` : key, out);
    }
  }
}

describe("라벨 장식 — 화살표는 정보를 나를 때만", () => {
  it("i18n 문자열 끝에 장식 화살표가 없다", () => {
    const offences: Offence[] = [];
    let scanned = 0;

    for (const locale of LOCALES) {
      const raw = readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8");
      const strings: Array<[string, string]> = [];
      collectStrings(JSON.parse(raw), "", strings);
      scanned += strings.length;

      for (const [path, value] of strings) {
        if (TRAILING_ARROW.test(value)) offences.push({ locale, path, value });
      }
    }

    // 게이트가 스스로 살아있음을 증명한다 — 파싱이 깨져 0건을 읽으면 "위반
    // 없음" 이 아니라 이 단언이 먼저 터진다. (2026-07 에 같은 종류의 게이트가
    // 외부 프로세스 실패로 조용히 전부 통과시킨 사고가 있었다.)
    expect(scanned).toBeGreaterThan(1000);

    const report = offences
      .map((o) => `  ${o.locale}: ${o.path} = ${JSON.stringify(o.value)}`)
      .join("\n");
    expect(
      offences,
      offences.length === 0
        ? ""
        : `라벨 끝의 장식 화살표는 정보를 더하지 않는다. 지우고 라벨만 남겨라.\n` +
            `문장 가운데의 화살표(경로·순서·인과)는 데이터라 허용된다.\n${report}`,
    ).toEqual([]);
  });

  it("게이트가 실제로 위반을 잡는다", () => {
    // 이 정규식이 무력화되면 위 테스트는 영원히 통과한다. 판정 자체를 고정한다.
    expect(TRAILING_ARROW.test("지도에서 열기 →")).toBe(true);
    expect(TRAILING_ARROW.test("Open →")).toBe(true);
    expect(TRAILING_ARROW.test("열기 ↗")).toBe(true);
    // 문장 가운데는 데이터 — 잡으면 안 된다.
    expect(TRAILING_ARROW.test("{source} → {target}")).toBe(false);
    expect(TRAILING_ARROW.test("오래된 → 최근 순")).toBe(false);
    expect(TRAILING_ARROW.test("설정 → Developer 에서 등록")).toBe(false);
  });
});
