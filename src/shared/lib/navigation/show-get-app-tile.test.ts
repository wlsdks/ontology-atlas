import { describe, expect, it } from "vitest";
import { shouldShowGetAppTile } from "./show-get-app-tile";

describe("앱 받기 타일 — 웹에서만, 마운트 뒤에만", () => {
  it("웹에서 마운트되면 보인다", () => {
    expect(shouldShowGetAppTile({ mounted: true, isDesktopApp: false })).toBe(true);
  });

  // Offering "get the app" to someone who installed it is misinformation in itself.
  it("설치된 앱에서는 안 보인다", () => {
    expect(shouldShowGetAppTile({ mounted: true, isDesktopApp: true })).toBe(false);
  });

  /**
   * Prerendered HTML has no window, so it always decides "web". If the app loads
   * that HTML and hydration then removes the tile, **app users see a one-frame
   * flicker** — appearing one frame late is better than showing a wrong state and
   * correcting it.
   */
  it("마운트 전에는 어느 쪽도 그리지 않는다", () => {
    expect(shouldShowGetAppTile({ mounted: false, isDesktopApp: false })).toBe(false);
    expect(shouldShowGetAppTile({ mounted: false, isDesktopApp: true })).toBe(false);
  });
});
