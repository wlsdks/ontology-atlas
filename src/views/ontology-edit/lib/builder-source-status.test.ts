import { describe, expect, it } from "vitest";
import { getBuilderSourceStatus } from "./builder-source-status";

describe("getBuilderSourceStatus", () => {
  it("treats a live vault as writable even if stale restore flags are present", () => {
    expect(
      getBuilderSourceStatus({
        writable: true,
        restoringVault: true,
        vaultUnavailable: true,
      }),
    ).toEqual({
      status: "writable",
      accent: "indigo",
      showSourceAction: false,
    });
  });

  it("keeps desktop restore separate from readonly sample mode", () => {
    expect(
      getBuilderSourceStatus({
        writable: false,
        restoringVault: true,
        vaultUnavailable: false,
      }),
    ).toEqual({
      status: "restoring",
      accent: "neutral",
      showSourceAction: false,
    });
  });

  it("names permission or stale-path failures as unavailable, not sample readonly", () => {
    expect(
      getBuilderSourceStatus({
        writable: false,
        restoringVault: false,
        vaultUnavailable: true,
      }),
    ).toEqual({
      status: "unavailable",
      accent: "amber",
      showSourceAction: true,
    });
  });

  it("uses readonly only when no local vault state is active", () => {
    expect(
      getBuilderSourceStatus({
        writable: false,
        restoringVault: false,
        vaultUnavailable: false,
      }),
    ).toEqual({
      status: "readonly",
      accent: "amber",
      showSourceAction: true,
    });
  });
});
