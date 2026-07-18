import { describe, expect, it } from "vitest";

import { isTopologyMapV2Enabled } from "./feature-flags";

// P6 기본값 전환 (2026-07-18): v2 가 기본, legacy 는 탈출구.
describe("isTopologyMapV2Enabled", () => {
  it("defaults to TRUE when neither source is set (P6 default-on flip)", () => {
    expect(
      isTopologyMapV2Enabled({ search: "", getLocalStorageItem: () => null }),
    ).toBe(true);
  });

  it("stays on via the query param ?mapEngine=v2 (explicit force-on)", () => {
    expect(
      isTopologyMapV2Enabled({
        search: "?mapEngine=v2",
        getLocalStorageItem: () => null,
      }),
    ).toBe(true);
  });

  it("turns OFF via the escape hatch ?mapEngine=legacy", () => {
    expect(
      isTopologyMapV2Enabled({
        search: "?mapEngine=legacy&foo=bar",
        getLocalStorageItem: () => null,
      }),
    ).toBe(false);
  });

  it("query force-on beats a stored 'false' opt-out", () => {
    expect(
      isTopologyMapV2Enabled({
        search: "?mapEngine=v2",
        getLocalStorageItem: () => "false",
      }),
    ).toBe(true);
  });

  it("turns OFF via localStorage atlas:feature:topology-map-v2 = 'false'", () => {
    expect(
      isTopologyMapV2Enabled({
        search: "",
        getLocalStorageItem: (key) =>
          key === "atlas:feature:topology-map-v2" ? "false" : null,
      }),
    ).toBe(false);
  });

  it("treats legacy 'true' opt-ins and any non-'false' value as on (no stale-key surprise)", () => {
    expect(isTopologyMapV2Enabled({ search: "", getLocalStorageItem: () => "true" })).toBe(true);
    expect(isTopologyMapV2Enabled({ search: "", getLocalStorageItem: () => "1" })).toBe(true);
  });

  it("falls back to localStorage opt-out when query has no mapEngine key at all", () => {
    expect(
      isTopologyMapV2Enabled({
        search: "?other=1",
        getLocalStorageItem: () => "false",
      }),
    ).toBe(false);
  });

  it("ignores unrelated mapEngine values and stays on the default", () => {
    expect(
      isTopologyMapV2Enabled({
        search: "?mapEngine=weird",
        getLocalStorageItem: () => null,
      }),
    ).toBe(true);
  });

  it("does not throw when getLocalStorageItem is omitted and window is absent (SSR-safe default)", () => {
    // no source at all — exercises the real window/localStorage code path.
    expect(() => isTopologyMapV2Enabled()).not.toThrow();
  });
});
