import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useTopologyMapV2Enabled } from "./use-topology-map-v2-enabled";

describe("useTopologyMapV2Enabled", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("is TRUE by default (P6 default-on flip — no query param, no localStorage)", () => {
    const { result } = renderHook(() => useTopologyMapV2Enabled());
    expect(result.current).toBe(true);
  });

  it("turns off via the localStorage escape hatch 'false'", () => {
    window.localStorage.setItem("atlas:feature:topology-map-v2", "false");

    const { result } = renderHook(() => useTopologyMapV2Enabled());

    expect(result.current).toBe(false);
  });

  it("stays on for legacy 'true' opt-ins", () => {
    window.localStorage.setItem("atlas:feature:topology-map-v2", "true");

    const { result } = renderHook(() => useTopologyMapV2Enabled());

    expect(result.current).toBe(true);
  });
});
