import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  readHexRelief,
  useFlatMapView,
  useHexRelief,
  useMapView,
  writeHexRelief,
  writeMapView,
} from "./map-view-preferences";

describe("map view preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("persists an explicit flat choice, then only rewrites changed map flags", () => {
    writeMapView("flat");
    expect(window.localStorage.getItem("atlas.appearance.view3d")).toBe("off");
    const write = vi.spyOn(Storage.prototype, "setItem");
    try {
      writeMapView("hex");
      expect(write.mock.calls).toEqual([["atlas.appearance.hex-board", "on"]]);
      writeMapView("hex");
      expect(write).toHaveBeenCalledTimes(1);
    } finally {
      write.mockRestore();
    }
  });

  it.each([
    ["ownership", "3d"],
    ["strata", "3d"],
    ["coupling", "neural"],
  ] as const)("a stored 3D flag with the %s arrangement opens %s", (arrangement, view) => {
    window.localStorage.setItem("atlas.appearance.view3d", "on");
    window.localStorage.setItem("atlas.appearance.map-arrangement", arrangement);
    expect(renderHook(() => useMapView()).result.current).toBe(view);
  });

  it.each(["flat", "hex", "3d"] as const)("picking a view other than Neural removes the arrangement key (%s)", (view) => {
    window.localStorage.setItem("atlas.appearance.map-arrangement", "coupling");
    writeMapView(view);
    expect(window.localStorage.getItem("atlas.appearance.map-arrangement")).toBeNull();
    expect(window.localStorage.getItem("atlas.appearance.view3d")).toBe(view === "3d" ? "on" : "off");
  });

  it("picking Neural stores the 3D flag with the coupling arrangement, and reads back as Neural", () => {
    writeMapView("neural");
    expect(window.localStorage.getItem("atlas.appearance.view3d")).toBe("on");
    expect(window.localStorage.getItem("atlas.appearance.map-arrangement")).toBe("coupling");
    expect(renderHook(() => useMapView()).result.current).toBe("neural");
  });

  it("never reads a retired Territories pick, and the next pick removes it", () => {
    window.localStorage.setItem("atlas.appearance.territories", "on");
    expect(renderHook(() => useFlatMapView()).result.current).toBe(true);
    writeMapView("hex");
    expect(window.localStorage.getItem("atlas.appearance.territories")).toBeNull();
  });

  it.each(["structure", "galaxy"])("never reads a retired Domain structure or Galaxy pick, and the next pick removes it (%s)", (key) => {
    window.localStorage.setItem(`atlas.appearance.${key}`, "on");
    expect(renderHook(() => useFlatMapView()).result.current).toBe(true);
    writeMapView("hex");
    expect(window.localStorage.getItem(`atlas.appearance.${key}`)).toBeNull();
  });

  it("still attempts the map writes when storage reads are unavailable", () => {
    const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Read blocked"); });
    try {
      writeMapView("hex");
    } finally {
      read.mockRestore();
    }
    expect(window.localStorage.getItem("atlas.appearance.hex-board")).toBe("on");
    expect(window.localStorage.getItem("atlas.appearance.view3d")).toBe("off");
  });
});

describe("hex board relief", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("is off by default, stored as on/off, and delivered to a mounted reader", () => {
    expect(readHexRelief()).toBe(false);
    const { result } = renderHook(() => useHexRelief());
    expect(result.current).toBe(false);
    act(() => writeHexRelief(true));
    expect(result.current).toBe(true);
    expect(window.localStorage.getItem("atlas.appearance.hex-relief")).toBe("on");
    act(() => writeHexRelief(false));
    expect(readHexRelief()).toBe(false);
  });
});
