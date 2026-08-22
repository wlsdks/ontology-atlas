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
    // If this list is not derived from the destinations, someone adding a new guide can
    // omit it and no check fails — the guidance simply appears in that audit session.
    it("모든 목적지 안내를 덮는다 (파생 계약)", () => {
      const keys = new Set(FIRST_RUN_SEEN_ENTRIES.map(([key]) => key));
      for (const id of Object.keys(DESTINATION_TOURS)) {
        expect(keys).toContain(destinationTourStatusKey(id));
      }
      expect(keys).toContain("guided-tour:v1");
      expect(keys).toContain("vault-open-guide:auto:v1");
      // 5 destinations + the map + the folder sheet.
      expect(keys.size).toBe(Object.keys(DESTINATION_TOURS).length + 2);
    });
  });

  describe("resolveGuideOverride", () => {
    it("아는 값만 통과시킨다", () => {
      expect(resolveGuideOverride("?guides=off")).toBe("off");
      expect(resolveGuideOverride("?guides=reset")).toBe("reset");
    });

    // If a typo quietly disabled the guidance, nobody could find out why it stopped appearing.
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

    // With only a door to turn it off and none to turn it back on, an auditor could never see the guidance again.
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
