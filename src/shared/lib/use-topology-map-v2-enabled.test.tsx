import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useTopologyMapV2Enabled } from "./use-topology-map-v2-enabled";

describe("useTopologyMapV2Enabled", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("is false by default (no query param, no localStorage)", () => {
    const { result } = renderHook(() => useTopologyMapV2Enabled());
    expect(result.current).toBe(false);
  });

  it("is true once localStorage['atlas:feature:topology-map-v2'] is 'true'", () => {
    window.localStorage.setItem("atlas:feature:topology-map-v2", "true");

    const { result } = renderHook(() => useTopologyMapV2Enabled());

    expect(result.current).toBe(true);
  });
});
