import { describe, expect, it } from "vitest";

import { josa } from "./ko-josa";

describe("josa — 받침이 있는 이름", () => {
  it.each([
    ["주문", "object", "을"],
    ["주문", "subject", "이"],
    ["주문", "topic", "은"],
    ["주문", "with", "과"],
  ] as const)("%s + %s → %s", (word, kind, expected) => {
    expect(josa(word, kind)).toBe(expected);
  });
});

describe("josa — 받침이 없는 이름", () => {
  it.each([
    ["결제 취소", "object", "를"],
    ["결제 취소", "subject", "가"],
    ["결제 취소", "topic", "는"],
    ["결제 취소", "with", "와"],
    ["결제 취소", "direction", "로"],
  ] as const)("%s + %s → %s", (word, kind, expected) => {
    expect(josa(word, kind)).toBe(expected);
  });
});

/**
 * The directional particle pair follows a different rule from the other four:
 * a rieul final consonant takes the no-final-consonant form. That exception is
 * why this pair is kept separate.
 */
describe("josa — ㄹ 받침 예외", () => {
  it("서울 + direction → 로", () => {
    expect(josa("서울", "direction")).toBe("로");
  });
  it("서울 + object 는 예외가 아니다 → 을", () => {
    expect(josa("서울", "object")).toBe("을");
  });
});

describe("josa — 숫자로 끝나는 이름은 읽는 소리를 따른다", () => {
  it.each([
    ["v1", "을"],
    ["v2", "를"],
    ["단계 3", "을"],
    ["단계 5", "를"],
    ["r6", "을"],
    ["항목 9", "를"],
    ["레벨 0", "을"],
  ] as const)("%s → %s", (word, expected) => {
    expect(josa(word, "object")).toBe(expected);
  });

  it("1 은 ㄹ 받침이라 direction 예외를 받는다", () => {
    expect(josa("v1", "direction")).toBe("로");
    expect(josa("v3", "direction")).toBe("으로");
  });
});

/**
 * **When it cannot be known, print both.** There is no settled reading for the
 * final consonant of a name ending in Latin letters, so picking one is wrong half
 * the time. This fallback is what makes the module honest rather than merely
 * tidy-looking.
 */
describe("josa — 판별 불가는 병기로 남는다", () => {
  it.each([
    ["order-create", "을(를)"],
    ["MCP", "을(를)"],
    ["", "을(를)"],
    ["※", "을(를)"],
  ] as const)("%s → %s", (word, expected) => {
    expect(josa(word, "object")).toBe(expected);
  });

  it("병기는 조사 쌍마다 자기 짝을 쓴다", () => {
    expect(josa("MCP", "subject")).toBe("이(가)");
    expect(josa("MCP", "topic")).toBe("은(는)");
    expect(josa("MCP", "direction")).toBe("으로(로)");
  });

  it("앞뒤 공백은 판별에 끼어들지 않는다", () => {
    expect(josa("  결제 취소  ", "object")).toBe("를");
  });
});
