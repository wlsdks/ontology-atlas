import { afterEach, describe, expect, it, vi } from "vitest";

import { drawGalaxyNebula } from "./galaxy-atmosphere";

function fakeContext() {
  return {
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "",
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("drawGalaxyNebula", () => {
  it("builds three palette textures once and reuses exactly three blits per frame", () => {
    const textureContexts = [fakeContext(), fakeContext(), fakeContext()];
    let created = 0;
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      expect(tagName).toBe("canvas");
      const ctx = textureContexts[created];
      created += 1;
      return {
        width: 0,
        height: 0,
        getContext: () => ctx,
      } as unknown as HTMLCanvasElement;
    });
    const output = fakeContext();
    const state = {
      centerX: 300,
      centerY: 220,
      radius: 180,
      alpha: 0.8,
      warmInk: "#f1d4a2",
      coolInk: "#cbd5ef",
      accentInk: "#858ddd",
      elapsedMs: 2400,
      reducedMotion: false,
    };

    drawGalaxyNebula(output as unknown as CanvasRenderingContext2D, state);
    drawGalaxyNebula(output as unknown as CanvasRenderingContext2D, { ...state, elapsedMs: 4900 });

    expect(created).toBe(3);
    expect(output.drawImage).toHaveBeenCalledTimes(6);
  });

  it("keeps every cached layer anchored when reduced motion is active", () => {
    const textureContexts = [fakeContext(), fakeContext(), fakeContext()];
    let created = 0;
    vi.spyOn(document, "createElement").mockImplementation(() => ({
      width: 0,
      height: 0,
      getContext: () => textureContexts[created++],
    }) as unknown as HTMLCanvasElement);
    const output = fakeContext();

    drawGalaxyNebula(output as unknown as CanvasRenderingContext2D, {
      centerX: 300,
      centerY: 220,
      radius: 180,
      alpha: 0.8,
      warmInk: "#eed3a1",
      coolInk: "#cad4ee",
      accentInk: "#848cdb",
      elapsedMs: 73_000,
      reducedMotion: true,
    });

    expect(output.rotate).toHaveBeenCalledTimes(3);
    expect(output.rotate).toHaveBeenNthCalledWith(1, 0);
    expect(output.rotate).toHaveBeenNthCalledWith(2, 0);
    expect(output.rotate).toHaveBeenNthCalledWith(3, 0);
  });
});
