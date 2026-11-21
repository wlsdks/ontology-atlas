import { describe, expect, it } from "vitest";

import type { OntologyMapTokens } from "../../../tokens/read-map-tokens";
import { computeDomeFocusCameraTarget } from "./focus-fit";

describe("computeDomeFocusCameraTarget", () => {
  const tokens = { focusBboxMargin: 1, cameraMaxZoomRatio: 4, cameraScaleMax: 10, focusMaxZoomRatio: 2, cameraFocusPanMargin: 50 } as unknown as OntologyMapTokens;
  const ego = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

  it("fits the ego bounds, capped by the focus zoom-in ceiling, and centres them", () => {
    expect(computeDomeFocusCameraTarget(ego, tokens, 1000, 800, 1, null)).toEqual({ tx: 50, ty: 50, tscale: 2 });
  });

  it("never zooms out past the dome fit scale it is given as a floor", () => {
    const wide = { minX: 0, minY: 0, maxX: 2000, maxY: 2000 };
    expect(computeDomeFocusCameraTarget(wide, tokens, 1000, 800, 1, 0.8).tscale).toBe(0.8);
  });

  it("pulls a centre that falls outside the focus pan leash back to its edge", () => {
    expect(computeDomeFocusCameraTarget(ego, tokens, 1000, 800, 1, null, { x: -100, y: 200 })).toEqual({ tx: -50, ty: 150, tscale: 2 });
  });
});
