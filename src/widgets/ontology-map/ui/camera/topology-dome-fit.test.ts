import { describe, expect, it } from "vitest";

import { computeDomeFitCameraTarget, worldToScreen } from "./topology-camera-math";

describe("computeDomeFitCameraTarget", () => {
  it("keeps a large dome inside the free canvas below the flat map's minimum zoom", () => {
    const bounds = { minX: -12_000, maxX: 8_000, minY: -5_000, maxY: 7_000 };
    const width = 1040;
    const height = 720;
    const insets = { left: 324, right: 64, top: 64, bottom: 48 };
    const radius = 12;
    const target = computeDomeFitCameraTarget(bounds, width, height, insets, radius, {
      cameraScaleMin: 0.24,
      cameraScaleMax: 2.6,
      domeFitFill: 0.98,
    });
    const camera = {
      x: { value: target.tx, velocity: 0 },
      y: { value: target.ty, velocity: 0 },
      scale: { value: target.tscale, velocity: 0 },
    };
    const topLeft = worldToScreen(camera, width, height, bounds.minX, bounds.minY);
    const bottomRight = worldToScreen(camera, width, height, bounds.maxX, bounds.maxY);

    expect(topLeft.x - radius).toBeGreaterThanOrEqual(insets.left);
    expect(topLeft.y - radius).toBeGreaterThanOrEqual(insets.top);
    expect(bottomRight.x + radius).toBeLessThanOrEqual(width - insets.right);
    expect(bottomRight.y + radius).toBeLessThanOrEqual(height - insets.bottom);
    expect(target.tscale).toBeLessThan(0.24);
  });
});
