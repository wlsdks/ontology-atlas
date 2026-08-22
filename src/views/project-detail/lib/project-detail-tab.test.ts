import { describe, expect, it } from "vitest";

import {
  compositionTabCount,
  DEFAULT_PROJECT_DETAIL_TAB,
  parseProjectDetailTab,
  PROJECT_DETAIL_TABS,
  serializeProjectDetailTab,
} from "./project-detail-tab";

describe("parseProjectDetailTab", () => {
  it("알려진 탭을 그대로 해석한다", () => {
    for (const tab of PROJECT_DETAIL_TABS) {
      expect(parseProjectDetailTab(tab)).toBe(tab);
    }
  });

  it("없음·빈값·모르는 값은 기본 탭으로 떨어진다 — 화면을 막지 않는다", () => {
    // A share link gets edited in other people's hands. A typo must not become an error screen.
    for (const raw of [null, undefined, "", "activity", "Overview", "../x"]) {
      expect(parseProjectDetailTab(raw)).toBe(DEFAULT_PROJECT_DETAIL_TAB);
    }
  });
});

describe("serializeProjectDetailTab", () => {
  it("기본 탭은 URL 에 쓰지 않는다 — 공유 링크가 짧아야 붙여넣기 쉽다", () => {
    expect(serializeProjectDetailTab(DEFAULT_PROJECT_DETAIL_TAB)).toBeNull();
  });

  it("기본이 아닌 탭은 값을 남긴다", () => {
    expect(serializeProjectDetailTab("composition")).toBe("composition");
  });

  it("직렬화 → 파싱이 왕복한다 (핸드오프 패킷이 탭을 잃지 않게)", () => {
    for (const tab of PROJECT_DETAIL_TABS) {
      expect(parseProjectDetailTab(serializeProjectDetailTab(tab))).toBe(tab);
    }
  });
});

describe("compositionTabCount", () => {
  it("도메인이 있으면 카운트를 준다", () => {
    expect(compositionTabCount(3)).toBe(3);
  });

  it("0 은 배지를 그리지 않는다 — '없음' 을 강조하는 꼴이 된다", () => {
    expect(compositionTabCount(0)).toBeUndefined();
  });
});
