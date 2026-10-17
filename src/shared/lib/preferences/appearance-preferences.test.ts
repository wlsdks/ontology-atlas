import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CANVAS_BACKGROUNDS,
  DEFAULT_CANVAS_BACKGROUND,
  DEFAULT_FOOTPRINT,
  FOOTPRINT_RANGES,
  resolveCanvasBackground,
  resolveFootprint,
  resolveStoredMapArrangement,
  DEFAULT_GLYPH_SET,
  DEFAULT_MAP_SPEED,
  GLYPH_SETS,
  MAP_SPEEDS,
  readCanvasBackground,
  readGlyphSet,
  readHexRelief,
  resolveMapSpeed,
  useCanvasBackground,
  useFlatMapView,
  useGlyphSet,
  useHexRelief,
  useMapDragSpeed,
  useMapZoomSpeed,
  writeCanvasBackground,
  writeGlyphSet,
  writeHexRelief,
  writeMapDragSpeed,
  writeMapZoomSpeed,
  writeMapView,
} from "./appearance-preferences";

describe("appearance-preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("defaults to dot / geometric when nothing is stored", () => {
    expect(readCanvasBackground()).toBe(DEFAULT_CANVAS_BACKGROUND);
    expect(readGlyphSet()).toBe(DEFAULT_GLYPH_SET);
  });

  it("round-trips every declared background and glyph-set value", () => {
    for (const bg of CANVAS_BACKGROUNDS) {
      writeCanvasBackground(bg);
      expect(readCanvasBackground()).toBe(bg);
    }
    for (const set of GLYPH_SETS) {
      writeGlyphSet(set);
      expect(readGlyphSet()).toBe(set);
    }
  });

  it("falls back to default when a corrupt value is stored", () => {
    window.localStorage.setItem("ontology-atlas:canvas-background:v1", "aurora");
    window.localStorage.setItem("ontology-atlas:glyph-set:v1", "neon");
    expect(readCanvasBackground()).toBe("dot");
    expect(readGlyphSet()).toBe("geometric");
  });

  it("useCanvasBackground re-renders live when the preference is written", () => {
    const { result } = renderHook(() => useCanvasBackground());
    expect(result.current).toBe("dot");
    act(() => writeCanvasBackground("web"));
    expect(result.current).toBe("web");
    act(() => writeCanvasBackground("depth"));
    expect(result.current).toBe("depth");
  });

  it("useGlyphSet re-renders live when the preference is written (gateway switch proof)", () => {
    const { result } = renderHook(() => useGlyphSet());
    expect(result.current).toBe("geometric");
    act(() => writeGlyphSet("line"));
    expect(result.current).toBe("line");
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

  it("preserves the remembered dome arrangement when switching to a flat surface", () => {
    writeMapView("coupling");
    writeMapView("flat");
    expect(window.localStorage.getItem("atlas.appearance.map-arrangement")).toBe("coupling");
    expect(window.localStorage.getItem("atlas.appearance.view3d")).toBe("off");
  });

  it("never reads a retired Territories pick, and the next pick removes it", () => {
    window.localStorage.setItem("atlas.appearance.territories", "on");
    expect(renderHook(() => useFlatMapView()).result.current).toBe(true);
    writeMapView("hex");
    expect(window.localStorage.getItem("atlas.appearance.territories")).toBeNull();
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

/**
 * Removed background values map to a successor; silently falling back to the default would make the
 * user's own choice disappear. The table is the contract.
 */
describe("inheriting a retired canvas background value", () => {
  it.each([
    ["constellation", "web"],
    ["contour", "dot"],
    ["flow", "web"],
    ["gravity", "web"],
  ] as const)("%s → %s", (retired, heir) => {
    expect(resolveCanvasBackground(retired)).toBe(heir);
  });

  it("unknown values and null become the default", () => {
    expect(resolveCanvasBackground("aurora")).toBe("dot");
    expect(resolveCanvasBackground(null)).toBe("dot");
  });

  it("a live value passes through as is", () => {
    for (const v of CANVAS_BACKGROUNDS) expect(resolveCanvasBackground(v)).toBe(v);
  });
});

/**
 * Footprint settings. A hand-edited localStorage entry or an old-version value
 * leaking `NaN` into the renderer makes the footprints **vanish entirely with no
 * error at all**. This is where that silent failure is blocked.
 */
describe("footprint setting normalization", () => {
  it("out-of-range numbers are clamped", () => {
    const out = resolveFootprint({ size: 999, opacity: -3, gap: 900 });
    expect(out.size).toBe(FOOTPRINT_RANGES.size.max);
    expect(out.opacity).toBe(FOOTPRINT_RANGES.opacity.min);
    expect(out.gap).toBe(FOOTPRINT_RANGES.gap.max);
  });

  it("NaN, strings and missing values are replaced by the default", () => {
    const out = resolveFootprint({ size: Number.NaN, gap: "8", tone: "chartreuse" });
    expect(out.size).toBe(DEFAULT_FOOTPRINT.size);
    expect(out.gap).toBe(DEFAULT_FOOTPRINT.gap);
    expect(out.tone).toBe(DEFAULT_FOOTPRINT.tone);
  });

  it("a non-object becomes the default as a whole", () => {
    expect(resolveFootprint(null)).toEqual(DEFAULT_FOOTPRINT);
    expect(resolveFootprint("[]")).toEqual(DEFAULT_FOOTPRINT);
  });

  /**
   * Saved settings with keys that are no longer read still load: they resolve to a valid preference
   * rather than throwing or falling back wholesale to the defaults.
   */
  it("the rest come back alive even when the six retired values remain", () => {
    const out = resolveFootprint({
      size: 17,
      gap: 4,
      opacity: 0.95,
      tone: "indigo",
      filled: false,
      strokeWidth: 1.2,
      bloom: 3,
      onEdges: true,
      edgeDensity: "sparse",
      placement: "both",
    });
    expect(out).toEqual({ size: 17, gap: 4, opacity: 0.95, tone: "indigo" });
  });
});

describe("map arrangement — the retired Cone", () => {
  /**
   * A stored Cone value opens the containment view (Strata), never a value the picker cannot show as
   * chosen.
   */
  it("a stored Cone opens Strata, and today's two values pass through", () => {
    expect(resolveStoredMapArrangement("ownership")).toBe("strata");
    expect(resolveStoredMapArrangement("cone")).toBe("strata");
    expect(resolveStoredMapArrangement("strata")).toBe("strata");
    expect(resolveStoredMapArrangement("coupling")).toBe("coupling");
    expect(resolveStoredMapArrangement(null)).toBe("strata");
    expect(resolveStoredMapArrangement("toString")).toBe("strata");
  });
});

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
