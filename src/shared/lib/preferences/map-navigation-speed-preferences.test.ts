import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_MAP_SPEED,
  MAP_SPEEDS,
  resolveMapSpeed,
  useMapDragSpeed,
  useMapZoomSpeed,
  writeMapDragSpeed,
  writeMapZoomSpeed,
} from "./map-navigation-speed-preferences";

describe("map drag and zoom speed", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("reads each of the five steps back and anything else as 1x", () => {
    for (const speed of MAP_SPEEDS) expect(resolveMapSpeed(String(speed))).toBe(speed);
    for (const stored of [null, "", "  ", "3", "1.2", "fast", "NaN", "Infinity"]) {
      expect(resolveMapSpeed(stored)).toBe(DEFAULT_MAP_SPEED);
    }
  });

  it("keeps drag and zoom apart and delivers a change to a mounted reader at once", () => {
    const { result } = renderHook(() => ({ drag: useMapDragSpeed(), zoom: useMapZoomSpeed() }));
    expect(result.current).toEqual({ drag: 1, zoom: 1 });
    act(() => writeMapDragSpeed(2));
    expect(result.current).toEqual({ drag: 2, zoom: 1 });
    act(() => writeMapZoomSpeed(0.5));
    expect(result.current).toEqual({ drag: 2, zoom: 0.5 });
  });
});
