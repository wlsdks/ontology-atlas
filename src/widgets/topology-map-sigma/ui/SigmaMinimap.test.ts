import { describe, expect, it } from 'vitest';
import { MIN_READABLE_VIEWPORT_W, resolveMinimapViewportFrame } from './SigmaMinimap';

describe('resolveMinimapViewportFrame', () => {
  it('uses a visual floor wide enough to read as a viewport, not a hairline', () => {
    expect(MIN_READABLE_VIEWPORT_W).toBeGreaterThanOrEqual(36);
  });

  it('leaves an already readable viewport frame unchanged', () => {
    const frame = resolveMinimapViewportFrame({
      rawLeft: 40,
      rawRight: 88,
      rawTop: 24,
      rawBottom: 62,
      width: 220,
      height: 154,
      minReadableWidth: 24,
      minReadableHeight: 20,
    });

    expect(frame).toMatchObject({
      x: 40,
      y: 24,
      width: 48,
      height: 38,
      visible: true,
      state: 'readable',
    });
  });

  it('keeps an edge-clipped viewport frame readable instead of rendering a thin line', () => {
    const frame = resolveMinimapViewportFrame({
      rawLeft: 212,
      rawRight: 360,
      rawTop: 20,
      rawBottom: 150,
      width: 220,
      height: 154,
      minReadableWidth: 24,
      minReadableHeight: 20,
    });

    expect(frame.visible).toBe(true);
    expect(frame.state).toBe('readable');
    expect(frame.width).toBeGreaterThanOrEqual(24);
    expect(frame.height).toBeGreaterThanOrEqual(20);
    expect(frame.x + frame.width).toBeLessThanOrEqual(220);
  });

  it('hides a viewport frame that is completely outside the minimap', () => {
    const frame = resolveMinimapViewportFrame({
      rawLeft: 240,
      rawRight: 360,
      rawTop: 20,
      rawBottom: 150,
      width: 220,
      height: 154,
      minReadableWidth: 24,
      minReadableHeight: 20,
    });

    expect(frame).toMatchObject({
      visible: false,
      state: 'hidden',
    });
  });
});
