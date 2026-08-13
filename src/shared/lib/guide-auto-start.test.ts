import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_GUIDE_AUTO_START,
  readGuideAutoStart,
  resolveGuideAutoStart,
  writeGuideAutoStart,
} from "./guide-auto-start";

/**
 * 「화면 안내 자동 표시」 — 여섯 안내를 한 곳에서 끄는 스위치.
 *
 * 각 안내는 이미 화면당 한 번만 뜨는데, 안내가 여섯이라(지도 + 목적지 다섯)
 * 화면을 옮길 때마다 하나씩 떠서 **매번 나오는 것처럼** 느껴진다. 개별 키를
 * 고쳐서는 못 고치는 종류라 축을 하나 더 만든 것이고, 그래서 이 스위치의
 * 계약은 "**끄면 자동만 멎고 부르면 온다**" 이다.
 */
describe("guide auto-start switch", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("기본값은 끔 — 필요한 사람만 켠다 (2026-08-13 소유자 확정)", () => {
    expect(DEFAULT_GUIDE_AUTO_START).toBe(false);
    expect(readGuideAutoStart()).toBe(false);
  });

  it("켜면 저장되고, 끄면 되돌아온다", () => {
    writeGuideAutoStart(true);
    expect(readGuideAutoStart()).toBe(true);
    writeGuideAutoStart(false);
    expect(readGuideAutoStart()).toBe(false);
  });

  /**
   * 명시적 선택만 존중한다 — 기본을 끔으로 뒤집기 전에 직접 켜 둔 사람의
   * "1" 이 살아남아야 하고, 모르는 값·빈 값·깨진 값은 기본값(끔)이다.
   */
  it("켜 둔 저장값(\"1\")은 살아남고, 모르는 값은 끔이다", () => {
    expect(resolveGuideAutoStart("1")).toBe(true);
    expect(resolveGuideAutoStart("0")).toBe(false);
    for (const raw of [null, "", "yes", "true", "nope"]) {
      expect(resolveGuideAutoStart(raw)).toBe(false);
    }
  });
});
