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
    // Derived from the destinations, so a new guide cannot be omitted silently.
    it("covers every destination guide", () => {
      const keys = new Set(FIRST_RUN_SEEN_ENTRIES.map(([key]) => key));
      for (const id of Object.keys(DESTINATION_TOURS)) {
        expect(keys).toContain(destinationTourStatusKey(id));
      }
      expect(keys).toContain("guided-tour:v1");
      expect(keys).toContain("vault-open-guide:auto:v1");
      expect(keys).toContain("atlas.library.guide-seen");
      // The destinations plus the map, the folder sheet and the Library home guide.
      expect(keys.size).toBe(Object.keys(DESTINATION_TOURS).length + 3);
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
