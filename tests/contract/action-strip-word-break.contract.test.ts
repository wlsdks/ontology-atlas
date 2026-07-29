import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **좁은 다열 스트립의 한국어 라벨은 단어 가운데서 끊기지 않는다.**
 *
 * ## 왜 이 게이트가 생겼나 (2026-07-29 설치 앱 실측)
 *
 * 노드 상세 패널의 액션 스트립은 웹에서 **다섯 칸**이라 라벨이 한 줄에
 * 들어갔다. 설치 앱에서는 LLM 다리가 있어 「말로 시키기」가 붙어 **여섯 칸**이
 * 되고, 칸이 좁아지자 라벨 셋이 음절에서 잘렸다:
 *
 *   「AI 요약 복 / 사」 · 「말로 시키 / 기」 · 「이것만 보 / 기」
 *
 * 브라우저 기본 줄바꿈은 CJK 를 음절 단위로 끊는다. 그래서 **폭만 좁아지면
 * 어느 라벨이든** 이렇게 된다 — 문구를 짧게 고치는 것은 다음 라벨에서 다시
 * 터지는 대증요법이다.
 *
 * ## 왜 웹 검증으로는 안 잡히나
 *
 * 다섯 칸에서는 재현되지 않는다. **데스크톱 능력이 칸을 하나 더 만들면서**
 * 스트립이 좁아진 것이라, `surfaces.md` 의 "데스크톱 능력은 설치 앱 실측만
 * 인정" 이 실제로 필요했던 사례다.
 *
 * ## 왜 렌더 테스트가 아니라 클래스 검사인가
 *
 * jsdom 은 줄바꿈을 하지 않는다 — 실제 wrap 은 브라우저에서만 일어나므로
 * 단위 테스트로는 원리적으로 못 잰다. 잴 수 있는 것은 **규격이 자리에 있는가**
 * 이고, 그게 이 저장소가 "룰 없는 규격은 지켜지지 않는다" 로 반복해 온
 * 자리다.
 */

const FILE = "src/widgets/topology-map-v2/ui/TopologyV2DetailPanel.tsx";

describe("노드 상세 액션 스트립 — CJK 라벨 줄바꿈", () => {
  const source = readFileSync(FILE, "utf8");

  it("probe: 액션 타일 클래스가 실재한다", () => {
    expect(source).toContain("const ACTION_TILE_CLASS");
  });

  it("액션 타일이 `keep-all` 을 싣는다", () => {
    const line = source
      .split("\n")
      .find((l) => l.includes("flex flex-1 flex-col items-center justify-start"));
    expect(line, "액션 타일 클래스 문자열을 못 찾았다 — 셀렉터가 낡았다").toBeDefined();
    expect(
      line!.includes("[word-break:keep-all]"),
      `여섯 칸으로 좁아지면 한국어 라벨이 음절에서 잘린다 —\n` +
        `「AI 요약 복 / 사」 처럼. 웹(다섯 칸)에서는 재현되지 않으므로\n` +
        `이 규격이 빠지면 설치 앱에서만 조용히 깨진다.`,
    ).toBe(true);
  });
});
