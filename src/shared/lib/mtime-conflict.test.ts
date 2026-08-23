import { describe, expect, it } from "vitest";
import { hasUnaccountedMtimeChange } from "./mtime-conflict";

describe("hasUnaccountedMtimeChange", () => {
  it("is false when baseline or current is missing", () => {
    expect(
      hasUnaccountedMtimeChange({
        baseline: null,
        current: 100,
        selfEditAtMs: null,
        baselineCapturedAtMs: 0,
      }),
    ).toBe(false);
    expect(
      hasUnaccountedMtimeChange({
        baseline: 100,
        current: undefined,
        selfEditAtMs: null,
        baselineCapturedAtMs: 0,
      }),
    ).toBe(false);
  });

  it("is false when baseline equals current (no real change)", () => {
    expect(
      hasUnaccountedMtimeChange({
        baseline: 100,
        current: 100,
        selfEditAtMs: null,
        baselineCapturedAtMs: 0,
      }),
    ).toBe(false);
    expect(
      hasUnaccountedMtimeChange({
        baseline: "2026-07-24T00:00:00.000Z",
        current: "2026-07-24T00:00:00.000Z",
        selfEditAtMs: null,
        baselineCapturedAtMs: 0,
      }),
    ).toBe(false);
  });

  it("is true when values differ and there is no self-edit record", () => {
    expect(
      hasUnaccountedMtimeChange({
        baseline: 100,
        current: 200,
        selfEditAtMs: null,
        baselineCapturedAtMs: 0,
      }),
    ).toBe(true);
  });

  it("is false when the change is accounted for by a self-edit at/after baseline capture", () => {
    expect(
      hasUnaccountedMtimeChange({
        baseline: 100,
        current: 200,
        selfEditAtMs: 150,
        baselineCapturedAtMs: 120,
      }),
    ).toBe(false);
  });

  it("is true when the self-edit predates the baseline capture (a later, unexplained change happened)", () => {
    expect(
      hasUnaccountedMtimeChange({
        baseline: 100,
        current: 200,
        selfEditAtMs: 50,
        baselineCapturedAtMs: 120,
      }),
    ).toBe(true);
  });

  it("uses a snapshotted self-edit record as a version when one is available", () => {
    expect(
      hasUnaccountedMtimeChange({
        baseline: 100,
        current: 200,
        selfEditAtMs: 150,
        baselineSelfEditAtMs: 150,
      }),
    ).toBe(true);
    expect(
      hasUnaccountedMtimeChange({
        baseline: 100,
        current: 200,
        selfEditAtMs: 250,
        baselineSelfEditAtMs: 150,
      }),
    ).toBe(false);
  });

  it("works with ISO freshness strings as well as numeric mtimes", () => {
    expect(
      hasUnaccountedMtimeChange({
        baseline: "2026-07-24T00:00:00.000Z",
        current: "2026-07-24T01:00:00.000Z",
        selfEditAtMs: null,
        baselineCapturedAtMs: 0,
      }),
    ).toBe(true);
  });
});
