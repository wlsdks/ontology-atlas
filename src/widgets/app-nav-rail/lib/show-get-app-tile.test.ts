import { describe, expect, it } from "vitest";
import { shouldShowGetAppTile } from "./show-get-app-tile";

describe("앱 받기 타일 — 웹에서만, 마운트 뒤에만", () => {
  it("웹에서 마운트되면 보인다", () => {
    expect(shouldShowGetAppTile({ mounted: true, isDesktopApp: false })).toBe(true);
  });

  // 설치한 사람에게 "앱 받기" 를 권하는 것은 그 자체로 오정보다.
  it("설치된 앱에서는 안 보인다", () => {
    expect(shouldShowGetAppTile({ mounted: true, isDesktopApp: true })).toBe(false);
  });

  /**
   * 프리렌더 HTML 은 창이 없어 늘 "웹" 으로 판정된다. 그 HTML 을 앱이 싣고
   * 하이드레이션에서 타일을 걷으면 **앱 사용자에게 한 프레임 깜빡임**이
   * 된다 — 잘못된 상태를 보여줬다 고치는 것보다 한 프레임 늦게 나타나는
   * 편이 낫다.
   */
  it("마운트 전에는 어느 쪽도 그리지 않는다", () => {
    expect(shouldShowGetAppTile({ mounted: false, isDesktopApp: false })).toBe(false);
    expect(shouldShowGetAppTile({ mounted: false, isDesktopApp: true })).toBe(false);
  });
});
