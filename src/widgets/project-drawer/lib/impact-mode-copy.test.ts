import { describe, expect, it } from "vitest";
import koMessages from "../../../../messages/ko.json";
import enMessages from "../../../../messages/en.json";
import { IMPACT_MODE_COPY_KEYS } from "./impact-mode-copy";

/**
 * design-council B6 rank16 regression guard — the 4 impact-mode pills trigger
 * different graph operations, so their help text has to differ too. Previously the
 * three modes other than none (upstream/downstream/network) all shared one line
 * ("연결만 보기" — show connections only), leaving the user no way to tell which
 * operation was running. This test blocks that regression from returning.
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

  it("upstream/downstream 도움말이 필요한 대상/필요로 하는 대상 어휘와 일치한다 (ko)", () => {
    const drawer = koMessages.vaultWidgets.projectDrawer;
    expect(drawer.impactHelpUpstream).toContain("필요한 대상");
    expect(drawer.impactHelpDownstream).toContain("필요로 하는 대상");
  });
});
