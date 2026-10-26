import { beforeEach, describe, expect, it } from "vitest";
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
    it("covers the surviving folder and Library guidance", () => {
      expect(FIRST_RUN_SEEN_ENTRIES).toEqual([
        ["vault-open-guide:auto:v1", "1"],
        ["atlas.library.guide-seen", "on"],
      ]);
    });
  });

  describe("resolveGuideOverride", () => {
    it("accepts only known values", () => {
      expect(resolveGuideOverride("?guides=off")).toBe("off");
      expect(resolveGuideOverride("?guides=reset")).toBe("reset");
    });

    // A typo must not quietly disable the guidance.
    it("returns null for unknown or missing values", () => {
      expect(resolveGuideOverride("?guides=nope")).toBeNull();
      expect(resolveGuideOverride("?guides=")).toBeNull();
      expect(resolveGuideOverride("?other=off")).toBeNull();
      expect(resolveGuideOverride("")).toBeNull();
    });
  });

  describe("applyGuideOverride", () => {
    it("marks every key seen for off", () => {
      expect(applyGuideOverride("?guides=off")).toBe("off");
      for (const [key, value] of FIRST_RUN_SEEN_ENTRIES) {
        expect(window.localStorage.getItem(key)).toBe(value);
      }
    });

    // Without a way back on, an auditor could never see the guidance again.
    it("clears the keys for reset", () => {
      applyFirstRunSeen();
      expect(applyGuideOverride("?guides=reset")).toBe("reset");
      for (const [key] of FIRST_RUN_SEEN_ENTRIES) {
        expect(window.localStorage.getItem(key)).toBeNull();
      }
    });

    it("changes nothing without the parameter", () => {
      expect(applyGuideOverride("?p=domain%3Apayment")).toBeNull();
      expect(window.localStorage.length).toBe(0);
    });

    it("is idempotent under StrictMode double render", () => {
      applyGuideOverride("?guides=off");
      const first = { ...window.localStorage };
      applyGuideOverride("?guides=off");
      expect({ ...window.localStorage }).toEqual(first);
    });
  });

  it("clearFirstRunSeen keeps unrelated keys", () => {
    window.localStorage.setItem("demo:docs-vault:source", "local");
    applyFirstRunSeen();
    clearFirstRunSeen();
    expect(window.localStorage.getItem("demo:docs-vault:source")).toBe("local");
  });
});
