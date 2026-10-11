import { afterEach, describe, expect, it, vi } from "vitest";

import {
  armMapLayoutMorph,
  copyCanvasAtCssSize,
  disarmMapLayoutMorph,
  isMapLayoutMorphArmed,
  mapLayoutPublishCount,
  publishMapLayoutSnapshot,
  takeMapLayoutMorph,
  type MapLayoutSnapshot,
} from "./map-layout-morph-store";

const snapshot = (ground = "#101014"): MapLayoutSnapshot => ({ marks: [], bitmap: null, ground });

afterEach(() => {
  disarmMapLayoutMorph();
  vi.restoreAllMocks();
});

describe("map layout morph store", () => {
  it("keeps nothing a renderer publishes while no view was picked", () => {
    const before = mapLayoutPublishCount();
    publishMapLayoutSnapshot(snapshot());
    expect(mapLayoutPublishCount()).toBe(before);
    expect(takeMapLayoutMorph()).toBeNull();
  });

  it("hands the armed snapshot to one taker and then disarms", () => {
    armMapLayoutMorph();
    publishMapLayoutSnapshot(snapshot("#1a1a1f"));
    expect(takeMapLayoutMorph()).toMatchObject({ ground: "#1a1a1f" });
    expect(isMapLayoutMorphArmed()).toBe(false);
    expect(takeMapLayoutMorph()).toBeNull();
  });

  it("keeps the last snapshot published during one pick", () => {
    armMapLayoutMorph();
    publishMapLayoutSnapshot(snapshot("#111111"));
    publishMapLayoutSnapshot(snapshot("#222222"));
    expect(takeMapLayoutMorph()).toMatchObject({ ground: "#222222" });
  });

  it("disarms on the next frame when the pick changed nothing", () => {
    let frame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    armMapLayoutMorph();
    expect(isMapLayoutMorphArmed()).toBe(true);
    frame!(performance.now());
    expect(isMapLayoutMorphArmed()).toBe(false);
  });

  it("copies nothing from a canvas without a backing store", () => {
    const empty = document.createElement("canvas");
    empty.width = 0;
    expect(copyCanvasAtCssSize(empty)).toBeNull();
    expect(copyCanvasAtCssSize(null)).toBeNull();
  });
});
