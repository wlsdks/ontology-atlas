import { beforeEach, describe, expect, it } from "vitest";

import {
  clampDockHeight,
  readDockHeight,
  writeDockHeight,
  DOCK_HEIGHT_MIN,
} from "./dock-height";

describe("clampDockHeight — 뷰포트 안에서만 커진다", () => {
  it("하한 아래로는 못 내려간다 — 헤더 띠가 되지 않게", () => {
    expect(clampDockHeight(10, 900)).toBe(DOCK_HEIGHT_MIN);
  });

  it("상한은 절대값이 아니라 뷰포트의 60%", () => {
    expect(clampDockHeight(9_999, 900)).toBe(540);
    expect(clampDockHeight(9_999, 1_400)).toBe(840);
  });

  it("범위 안 값은 그대로(정수로만)", () => {
    expect(clampDockHeight(300.4, 900)).toBe(300);
  });

  it("상한이 하한보다 작아지는 작은 창에서도 하한을 지킨다", () => {
    // 60% 가 120px 에 못 미치는 창 — 상한/하한이 뒤집혀도 NaN 이나 음수가 되면 안 된다.
    expect(clampDockHeight(200, 150)).toBe(DOCK_HEIGHT_MIN);
  });
});

describe("readDockHeight / writeDockHeight — 정한 적 없음과 정했음을 구분한다", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("정한 적 없으면 null — 토큰 기본값이 살아야 한다", () => {
    expect(readDockHeight()).toBeNull();
  });

  it("쓴 값을 그대로 읽는다", () => {
    writeDockHeight(340);
    expect(readDockHeight()).toBe(340);
  });

  it("null 을 쓰면 사용자의 선택이 지워진다 — 더블클릭 리셋", () => {
    writeDockHeight(340);
    writeDockHeight(null);
    expect(readDockHeight()).toBeNull();
  });

  it("손으로 고친 쓰레기 값·하한 미만은 정한 적 없음으로 환원된다", () => {
    window.localStorage.setItem("ontology-atlas:agent-terminal-dock-height:v1", "nope");
    expect(readDockHeight()).toBeNull();
    window.localStorage.setItem("ontology-atlas:agent-terminal-dock-height:v1", "12");
    expect(readDockHeight()).toBeNull();
  });
});
