import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { LG_BREAKPOINT_PX } from "@/shared/lib/use-viewport-below";

import {
  STUDIO_AGENT_DOCK_MAX_WIDTH_PX,
  STUDIO_AGENT_DOCK_MIN_VIEWPORT_PX,
} from "./studio-agent-dock";

describe("studio agent dock width contract", () => {
  it("reserves the stage's own minimum before the dock takes any", () => {
    expect(STUDIO_AGENT_DOCK_MIN_VIEWPORT_PX).toBe(
      LG_BREAKPOINT_PX + STUDIO_AGENT_DOCK_MAX_WIDTH_PX,
    );
  });

  /**
   * **이 테스트가 이 파일의 존재 이유다.** 임계는 도크의 실제 폭에서 유도된
   * 값이라, CSS 쪽 `--agent-panel-width` 의 상한이 바뀌면 여기 상수도 같이
   * 바뀌어야 한다. 안 그러면 무대가 자기 최소 폭 아래로 눌리는데 폭 강등은
   * 발화하지 않는다 — 가드를 통과한 채 가드가 막으려던 상태에 들어간다.
   *
   * lint 는 이걸 못 잡는다: 두 값이 다른 파일(하나는 CSS, 하나는 TS)에 있어
   * 한 파일의 AST 셀렉터로는 판정에 필요한 값이 모이지 않는다.
   */
  it("matches the clamp ceiling declared in globals.css", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const match = css.match(/--agent-panel-width:\s*clamp\([^)]*?,\s*(\d+)px\s*\)/);
    expect(match, "--agent-panel-width clamp not found in app/globals.css").not.toBeNull();
    expect(Number(match![1])).toBe(STUDIO_AGENT_DOCK_MAX_WIDTH_PX);
  });
});
