import { describe, expect, it } from "vitest";
import {
  isStagePanGesture,
  STAGE_PAN_CLICK_CANCEL_PX,
} from "../lib/stage-interaction";

describe("SigmaTopology stage interaction policy", () => {
  it("treats deliberate blank-stage clicks as pane clicks", () => {
    expect(isStagePanGesture({ x: 120, y: 80 }, { x: 123, y: 84 })).toBe(false);
    expect(isStagePanGesture(null, { x: 123, y: 84 })).toBe(false);
  });

  it("treats small map movement as pan so selection popovers do not collapse accidentally", () => {
    expect(STAGE_PAN_CLICK_CANCEL_PX).toBeGreaterThanOrEqual(12);
    expect(
      isStagePanGesture(
        { x: 120, y: 80 },
        { x: 120 + STAGE_PAN_CLICK_CANCEL_PX + 1, y: 80 },
      ),
    ).toBe(true);
  });
});
