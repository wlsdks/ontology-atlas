import { describe, expect, it } from "vitest";
import { mapVaultIssueCodeToPlainMessage } from "./vault-issue-plain-message";

describe("mapVaultIssueCodeToPlainMessage", () => {
  it("returns the dict's plain-language message for a known code", () => {
    const message = mapVaultIssueCodeToPlainMessage("missing-expected-field", {
      "missing-expected-field": "A required field is empty.",
    });
    expect(message).toBe("A required field is empty.");
  });

  it("falls back to the raw code for a code the dict has never heard of, instead of dropping it silently", () => {
    const message = mapVaultIssueCodeToPlainMessage("some-future-code", {
      "missing-kind": "No kind yet.",
    });
    expect(message).toBe("some-future-code");
  });

  it("falls back to the raw code when a known code has no dict entry", () => {
    const message = mapVaultIssueCodeToPlainMessage("empty-kind", {});
    expect(message).toBe("empty-kind");
  });
});
