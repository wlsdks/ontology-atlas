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

  it("기본값은 켬 — 처음 오는 사람에게 안내는 유일한 설명이다", () => {
    expect(DEFAULT_GUIDE_AUTO_START).toBe(true);
    expect(readGuideAutoStart()).toBe(true);
  });

  it("끄면 저장되고, 켜면 되돌아온다", () => {
    writeGuideAutoStart(false);
    expect(readGuideAutoStart()).toBe(false);
    writeGuideAutoStart(true);
    expect(readGuideAutoStart()).toBe(true);
  });

  /**
   * `"0"` 만 끔이다. 저장값이 깨졌거나 옛 형식이면 **켬으로 살아난다** —
   * 반대로 두면 값 하나가 망가진 사용자에게서 설명이 통째로 사라지고, 그건
   * 조용한 실패다.
   */
  it("모르는 값·빈 값은 켬으로 산다", () => {
    for (const raw of [null, "", "yes", "true", "1", "nope"]) {
      expect(resolveGuideAutoStart(raw)).toBe(true);
    }
    expect(resolveGuideAutoStart("0")).toBe(false);
  });
});
