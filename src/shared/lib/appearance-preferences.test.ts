import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CANVAS_BACKGROUNDS,
  DEFAULT_CANVAS_BACKGROUND,
  DEFAULT_FOOTPRINT,
  FOOTPRINT_RANGES,
  resolveCanvasBackground,
  resolveFootprint,
  DEFAULT_GLYPH_SET,
  GLYPH_SETS,
  readCanvasBackground,
  readGlyphSet,
  useCanvasBackground,
  useGlyphSet,
  writeCanvasBackground,
  writeGlyphSet,
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
    expect(DEFAULT_CANVAS_BACKGROUND).toBe("dot");
    expect(DEFAULT_GLYPH_SET).toBe("geometric");
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
 * Retired background values. Dropping them silently to the default makes **the
 * user's own choice disappear without a sound**, so each value is locked to its
 * successor. Delete this table and the next person takes the cheaper route of
 * "old values just become the default" — the table is the contract.
 */
describe("폐기된 캔버스 배경 값의 계승", () => {
  it.each([
    ["constellation", "web"],
    ["contour", "dot"],
    // 2026-07-29 — this user chose motion, so carry them to the surviving animated background.
    ["flow", "web"],
    ["gravity", "web"],
  ] as const)("%s → %s", (retired, heir) => {
    expect(resolveCanvasBackground(retired)).toBe(heir);
  });

  it("모르는 값과 null 은 기본값으로", () => {
    expect(resolveCanvasBackground("aurora")).toBe("dot");
    expect(resolveCanvasBackground(null)).toBe("dot");
  });

  it("살아 있는 값은 그대로 통과한다", () => {
    for (const v of CANVAS_BACKGROUNDS) expect(resolveCanvasBackground(v)).toBe(v);
  });
});

/**
 * Footprint settings. A hand-edited localStorage entry or an old-version value
 * leaking `NaN` into the renderer makes the footprints **vanish entirely with no
 * error at all**. This is where that silent failure is blocked.
 */
describe("발자국 설정 정규화", () => {
  it("범위 밖 숫자는 잘라 넣는다", () => {
    const out = resolveFootprint({ size: 999, opacity: -3, bloom: 40 });
    expect(out.size).toBe(FOOTPRINT_RANGES.size.max);
    expect(out.opacity).toBe(FOOTPRINT_RANGES.opacity.min);
    expect(out.bloom).toBe(FOOTPRINT_RANGES.bloom.max);
  });

  it("NaN·문자열·누락은 기본값으로 대체한다", () => {
    const out = resolveFootprint({ size: Number.NaN, strokeWidth: "1.5", filled: "yes" });
    expect(out.size).toBe(DEFAULT_FOOTPRINT.size);
    expect(out.strokeWidth).toBe(DEFAULT_FOOTPRINT.strokeWidth);
    expect(out.filled).toBe(DEFAULT_FOOTPRINT.filled);
  });

  it("객체가 아니면 통째로 기본값", () => {
    expect(resolveFootprint(null)).toEqual(DEFAULT_FOOTPRINT);
    expect(resolveFootprint("[]")).toEqual(DEFAULT_FOOTPRINT);
  });

  it("놓는 자리는 두 값만 받는다", () => {
    expect(resolveFootprint({ placement: "both" }).placement).toBe("both");
    expect(resolveFootprint({ placement: "left" }).placement).toBe(DEFAULT_FOOTPRINT.placement);
  });
});
