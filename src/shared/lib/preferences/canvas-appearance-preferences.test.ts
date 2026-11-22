import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CANVAS_BACKGROUNDS,
  DEFAULT_CANVAS_BACKGROUND,
  DEFAULT_GLYPH_SET,
  GLYPH_SETS,
  readCanvasBackground,
  readGlyphSet,
  resolveCanvasBackground,
  useCanvasBackground,
  useGlyphSet,
  writeCanvasBackground,
  writeGlyphSet,
} from "./canvas-appearance-preferences";

describe("canvas appearance preferences", () => {
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
