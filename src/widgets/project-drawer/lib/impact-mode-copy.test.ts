import { describe, expect, it } from "vitest";
import koMessages from "../../../../messages/ko.json";
import enMessages from "../../../../messages/en.json";
import { IMPACT_MODE_COPY_KEYS } from "./impact-mode-copy";

/**
 * design-council B6 rank16 회귀 가드 — 4개 임팩트 모드 필이 서로 다른
 * 그래프 연산을 트리거하므로 도움말도 서로 달라야 한다. 이전엔 none 을
 * 제외한 세 모드(upstream/downstream/network)가 전부 같은 한 줄
 * ("연결만 보기")을 공유해 사용자가 무슨 연산이 실행되는지 구분할 길이
 * 없었다 — 이 테스트는 그 회귀를 다시 막는다.
 */
describe("IMPACT_MODE_COPY_KEYS (rank16)", () => {
  it("모드 4개 모두 등록돼 있다", () => {
    expect(IMPACT_MODE_COPY_KEYS.map((item) => item.mode)).toEqual([
      "none",
      "upstream",
      "downstream",
      "network",
    ]);
  });

  it("모드마다 라벨/도움말 키가 서로 다르다 (중복 = 정직성 결함 재발)", () => {
    const helpKeys = IMPACT_MODE_COPY_KEYS.map((item) => item.helpKey);
    expect(new Set(helpKeys).size).toBe(helpKeys.length);
  });

  it.each([koMessages, enMessages])(
    "ko/en 메시지 카탈로그에 모든 label/help 키가 실존한다",
    (messages) => {
      const drawer = messages.vaultWidgets.projectDrawer as Record<
        string,
        string
      >;
      for (const item of IMPACT_MODE_COPY_KEYS) {
        expect(typeof drawer[item.labelKey]).toBe("string");
        expect(drawer[item.labelKey].length).toBeGreaterThan(0);
        expect(typeof drawer[item.helpKey]).toBe("string");
        expect(drawer[item.helpKey].length).toBeGreaterThan(0);
      }
    },
  );

  it("upstream/downstream 도움말이 rank13 방향 어휘('기대는 곳'/'기대받는 곳')와 일치한다 (ko)", () => {
    const drawer = koMessages.vaultWidgets.projectDrawer;
    expect(drawer.impactHelpUpstream).toContain("기대는 곳");
    expect(drawer.impactHelpDownstream).toContain("기대받는 곳");
  });
});
