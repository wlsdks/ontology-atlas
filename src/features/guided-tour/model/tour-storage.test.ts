import { describe, expect, it } from "vitest";
import { readGuidedTourStatus, writeGuidedTourStatus } from "./tour-storage";

describe("tour-storage", () => {
  it("readGuidedTourStatus returns null when unset, echoes written status", () => {
    const key = "guided-tour:test";
    window.localStorage.removeItem(key);
    expect(readGuidedTourStatus(key)).toBeNull();
    writeGuidedTourStatus("done", key);
    expect(readGuidedTourStatus(key)).toBe("done");
    writeGuidedTourStatus("skipped", key);
    expect(readGuidedTourStatus(key)).toBe("skipped");
  });

  it("readGuidedTourStatus ignores foreign values", () => {
    const key = "guided-tour:test-foreign";
    window.localStorage.setItem(key, "banana");
    expect(readGuidedTourStatus(key)).toBeNull();
  });
});
