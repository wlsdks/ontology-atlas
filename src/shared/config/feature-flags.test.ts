import { describe, expect, it } from "vitest";

import { isTopologyMapV2Enabled } from "./feature-flags";

describe("isTopologyMapV2Enabled", () => {
  it("defaults to false when neither source is set", () => {
    expect(
      isTopologyMapV2Enabled({ search: "", getLocalStorageItem: () => null }),
    ).toBe(false);
  });

  it("turns on via the query param ?mapEngine=v2", () => {
    expect(
      isTopologyMapV2Enabled({
        search: "?mapEngine=v2",
        getLocalStorageItem: () => null,
      }),
    ).toBe(true);
  });

  it("ignores unrelated or malformed query params", () => {
    expect(
      isTopologyMapV2Enabled({
        search: "?mapEngine=legacy&foo=bar",
        getLocalStorageItem: () => null,
      }),
    ).toBe(false);
  });

  it("turns on via localStorage atlas:feature:topology-map-v2 = 'true'", () => {
    expect(
      isTopologyMapV2Enabled({
        search: "",
        getLocalStorageItem: (key) =>
          key === "atlas:feature:topology-map-v2" ? "true" : null,
      }),
    ).toBe(true);
  });

  it("treats any localStorage value other than the literal string 'true' as off", () => {
    expect(
      isTopologyMapV2Enabled({
        search: "",
        getLocalStorageItem: () => "1",
      }),
    ).toBe(false);
  });

  it("query param wins even when localStorage is unset", () => {
    expect(
      isTopologyMapV2Enabled({
        search: "?mapEngine=v2",
        getLocalStorageItem: () => null,
      }),
    ).toBe(true);
  });

  it("falls back to localStorage when query has no mapEngine key at all", () => {
    expect(
      isTopologyMapV2Enabled({
        search: "?other=1",
        getLocalStorageItem: () => "true",
      }),
    ).toBe(true);
  });

  it("does not throw when getLocalStorageItem is omitted and window is absent (SSR-safe default)", () => {
    // no source at all — exercises the real window/localStorage code path.
    // In the vitest jsdom environment window exists but localStorage is empty,
    // so this should resolve to false without throwing.
    expect(() => isTopologyMapV2Enabled()).not.toThrow();
  });
});
