import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  adoptSessionTrailScope,
  clearSessionTrail,
  useSessionTrailSteps,
  visitSessionTrail,
} from "./session-trail-store";

// Module state outlives each test, so every test opens its own folder scope.
describe("session trail store", () => {
  it("keeps the walk when the map unmounts and mounts again", () => {
    adoptSessionTrailScope("folder-remount");
    const first = renderHook(() => useSessionTrailSteps("folder-remount"));
    act(() => {
      visitSessionTrail("folder-remount", "A");
      visitSessionTrail("folder-remount", "B");
      visitSessionTrail("folder-remount", "C");
    });
    expect(first.result.current).toEqual(["A", "B", "C"]);
    first.unmount();

    const second = renderHook(() => useSessionTrailSteps("folder-remount"));
    expect(second.result.current).toEqual(["A", "B", "C"]);
  });

  it("starts an empty trail when another folder opens, and does not bring the old walk back", () => {
    adoptSessionTrailScope("folder-first");
    visitSessionTrail("folder-first", "A");
    visitSessionTrail("folder-first", "B");

    expect(adoptSessionTrailScope("folder-second")).toBe("switched");
    expect(renderHook(() => useSessionTrailSteps("folder-second")).result.current).toEqual([]);
    adoptSessionTrailScope("folder-first");
    expect(renderHook(() => useSessionTrailSteps("folder-first")).result.current).toEqual([]);
  });

  it("shows nothing before the folder is known or for a folder it does not hold", () => {
    adoptSessionTrailScope("folder-held");
    visitSessionTrail("folder-held", "A");
    expect(renderHook(() => useSessionTrailSteps(null)).result.current).toEqual([]);
    expect(renderHook(() => useSessionTrailSteps("folder-other")).result.current).toEqual([]);
  });

  it("keeps revisits as steps, ignores an immediate repeat and clears to empty", () => {
    adoptSessionTrailScope("folder-steps");
    const { result } = renderHook(() => useSessionTrailSteps("folder-steps"));
    act(() => {
      for (const id of ["A", "A", "B", "A"]) visitSessionTrail("folder-steps", id);
    });
    expect(result.current).toEqual(["A", "B", "A"]);
    act(() => clearSessionTrail("folder-steps"));
    expect(result.current).toEqual([]);
  });
});
