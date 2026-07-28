import { beforeEach, describe, expect, it } from "vitest";
import { DESTINATION_TOURS } from "./tour-steps";
import { destinationTourStatusKey } from "./tour-storage";
import {
  FIRST_RUN_SEEN_ENTRIES,
  applyFirstRunSeen,
  applyGuideOverride,
  clearFirstRunSeen,
  resolveGuideOverride,
} from "./first-run-seen";

describe("first-run-seen", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe("FIRST_RUN_SEEN_ENTRIES", () => {
    // 이 목록이 목적지에서 파생되지 않으면, 안내를 새로 만든 사람이 목록을
    // 빠뜨려도 아무 검사도 실패하지 않는다 — 그 감사 세션에서만 조용히 안내가
    // 뜬다.
    it("모든 목적지 안내를 덮는다 (파생 계약)", () => {
      const keys = new Set(FIRST_RUN_SEEN_ENTRIES.map(([key]) => key));
      for (const id of Object.keys(DESTINATION_TOURS)) {
        expect(keys).toContain(destinationTourStatusKey(id));
      }
      expect(keys).toContain("guided-tour:v1");
      expect(keys).toContain("vault-open-guide:auto:v1");
      // 목적지 5 + 지도 1 + 폴더 시트 1.
      expect(keys.size).toBe(Object.keys(DESTINATION_TOURS).length + 2);
    });
  });

  describe("resolveGuideOverride", () => {
    it("아는 값만 통과시킨다", () => {
      expect(resolveGuideOverride("?guides=off")).toBe("off");
      expect(resolveGuideOverride("?guides=reset")).toBe("reset");
    });

    // 오타가 조용히 안내를 끄면, 안내가 안 뜨는 이유를 아무도 못 찾는다.
    it("모르는 값·없는 값은 null", () => {
      expect(resolveGuideOverride("?guides=nope")).toBeNull();
      expect(resolveGuideOverride("?guides=")).toBeNull();
      expect(resolveGuideOverride("?other=off")).toBeNull();
      expect(resolveGuideOverride("")).toBeNull();
    });
  });

  describe("applyGuideOverride", () => {
    it("off 는 모든 키를 봤음으로 표시한다", () => {
      expect(applyGuideOverride("?guides=off")).toBe("off");
      for (const [key, value] of FIRST_RUN_SEEN_ENTRIES) {
        expect(window.localStorage.getItem(key)).toBe(value);
      }
    });

    // 끄는 문만 있고 켜는 문이 없으면 감사자가 안내 자체를 다시는 못 본다.
    it("reset 은 되돌린다", () => {
      applyFirstRunSeen();
      expect(applyGuideOverride("?guides=reset")).toBe("reset");
      for (const [key] of FIRST_RUN_SEEN_ENTRIES) {
        expect(window.localStorage.getItem(key)).toBeNull();
      }
    });

    it("파라미터가 없으면 아무것도 건드리지 않는다", () => {
      expect(applyGuideOverride("?p=domain%3Apayment")).toBeNull();
      expect(window.localStorage.length).toBe(0);
    });

    it("멱등이다 (StrictMode 이중 렌더 안전)", () => {
      applyGuideOverride("?guides=off");
      const first = { ...window.localStorage };
      applyGuideOverride("?guides=off");
      expect({ ...window.localStorage }).toEqual(first);
    });
  });

  it("clearFirstRunSeen 은 무관한 키를 지우지 않는다", () => {
    window.localStorage.setItem("demo:docs-vault:source", "local");
    applyFirstRunSeen();
    clearFirstRunSeen();
    expect(window.localStorage.getItem("demo:docs-vault:source")).toBe("local");
  });
});
