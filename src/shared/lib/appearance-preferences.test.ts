import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CANVAS_BACKGROUNDS,
  DEFAULT_CANVAS_BACKGROUND,
  DEFAULT_FOOTPRINT,
  FOOTPRINT_RANGES,
  resolveCanvasBackground,
  resolveFootprint,
  resolveStoredMapArrangement,
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
    const out = resolveFootprint({ size: 999, opacity: -3, gap: 900 });
    expect(out.size).toBe(FOOTPRINT_RANGES.size.max);
    expect(out.opacity).toBe(FOOTPRINT_RANGES.opacity.min);
    expect(out.gap).toBe(FOOTPRINT_RANGES.gap.max);
  });

  it("NaN·문자열·누락은 기본값으로 대체한다", () => {
    const out = resolveFootprint({ size: Number.NaN, gap: "8", tone: "chartreuse" });
    expect(out.size).toBe(DEFAULT_FOOTPRINT.size);
    expect(out.gap).toBe(DEFAULT_FOOTPRINT.gap);
    expect(out.tone).toBe(DEFAULT_FOOTPRINT.tone);
  });

  it("객체가 아니면 통째로 기본값", () => {
    expect(resolveFootprint(null)).toEqual(DEFAULT_FOOTPRINT);
    expect(resolveFootprint("[]")).toEqual(DEFAULT_FOOTPRINT);
  });

  /**
   * The retirement's actual promise to a person who had set those six values: their saved
   * settings still load. Six keys stopped being read on 2026-09-10 because the glyph they
   * shaped stopped being drawn, and a stored preference from before that day must resolve to a
   * valid preference rather than throwing or falling back wholesale to the defaults.
   */
  it("은퇴한 여섯 값이 남아 있어도 나머지는 살아서 돌아온다", () => {
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
   * The Cone left the picker on 2026-09-25. A reader who had it stored lands on the
   * containment view that replaced it, never on a value the picker cannot show as chosen.
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
