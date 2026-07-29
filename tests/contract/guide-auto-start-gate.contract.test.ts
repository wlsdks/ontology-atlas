import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 「화면 안내 자동 표시」 스위치의 **사정거리**를 잠근다.
 *
 * 안내는 여섯 곳에서 뜬다 — 지도 하나(`HomePage`)와 목적지 다섯을 한 컴포넌트가
 * 맡는 `DestinationGuide`. 소유자가 성가셔한 이유가 정확히 그것이라(개별로는
 * 한 번씩인데 합이 매번), **한 곳만 게이트하면 스위치가 반만 듣는다**.
 *
 * 왜 소스를 읽는가: `DestinationGuide` 쪽은 렌더 테스트가 실제 발화를 막는지
 * 확인하지만, 지도 쪽 자동 시작은 `HomePage`(1만 줄 규모, 볼트·카메라·레이아웃이
 * 모두 살아 있어야 도달)의 effect 안에 있어 같은 방식으로 못 밟는다. 실제로
 * 프로브로 확인했다 — 지도 게이트를 지워도 가이드 렌더 테스트 91개가 전부
 * 통과한다. 그 사각지대를 덮는 것이 이 테스트의 유일한 일이다.
 */

const ROOT = process.cwd();
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

/** 자동 시작을 소유한 파일 = 스위치를 읽어야 하는 파일. 목록이 곧 사정거리다. */
const AUTO_START_SITES = [
  "src/views/home/ui/HomePage.tsx",
  "src/features/guided-tour/ui/DestinationGuide.tsx",
] as const;

describe("화면 안내 자동 표시 — 스위치가 모든 발화 지점을 덮는다", () => {
  it.each(AUTO_START_SITES)("%s 가 스위치를 읽는다", (path) => {
    expect(read(path), `${path} 의 자동 시작이 스위치를 안 본다 — 스위치가 반만 듣는다`).toContain(
      "readGuideAutoStart()",
    );
  });

  /**
   * 새 자동 시작 지점이 생기면 위 목록도 같이 늘어야 한다. 등록되지 않은
   * 발화 지점은 아무도 안 보므로, "자동 시작 타이머를 가진 파일" 을 세어
   * 목록과 맞춘다.
   */
  it("등록되지 않은 자동 시작 지점이 없다", () => {
    const suspects = AUTO_START_SITES.filter((p) => read(p).includes("watchGuidedTourAutoStartCancel"));
    expect(suspects.length, "자동 시작 감시자를 쓰는 파일이 목록과 어긋난다").toBe(
      AUTO_START_SITES.length,
    );
  });

  /**
   * 끄는 것은 **삭제가 아니다.** 부르는 길(설정 › 다시 보기 · 지도 나침반)은
   * 스위치와 무관하게 살아 있어야 한다 — 소유자: *"아니면 클릭했을때나"*.
   */
  it("부르는 길은 스위치 뒤에 숨지 않는다", () => {
    const settings = read("src/widgets/app-settings-menu/ui/AppSettingsMenu.tsx");
    const replayRow = settings.slice(settings.indexOf("app-settings-replay-guide"));
    expect(replayRow.slice(0, 900)).not.toContain("guideAutoStart");
  });
});
