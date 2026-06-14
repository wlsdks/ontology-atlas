import { describe, expect, it } from 'vitest';
import { resolveRelationLabelGeometry } from './relation-label-geometry';

const baseInput = {
  badgeWidth: 298.4,
  centerX: 471.85142517089844,
  containerWidth: 1512,
  hitTargetPadX: 8,
  minCompactWidth: 112,
  viewportInset: 16,
};

describe('resolveRelationLabelGeometry', () => {
  it('keeps the selected relation fact label expanded when the viewport has room', () => {
    const geometry = resolveRelationLabelGeometry(baseInput);

    expect(geometry.compact).toBe(false);
    expect(geometry.centeredAvailableWidth).toBeGreaterThan(geometry.desiredWidth);
    expect(geometry.desiredWidth).toBeCloseTo(314.4, 3);
    expect(geometry.hitTargetWidth).toBeCloseTo(314.4, 3);
    expect(geometry.left).toBeGreaterThanOrEqual(16);
    expect(geometry.right).toBeLessThanOrEqual(1512 - 16);
  });

  it('compacts around the same center when the desired label would exceed the viewport', () => {
    const geometry = resolveRelationLabelGeometry({
      ...baseInput,
      centerX: 92,
      containerWidth: 360,
    });

    expect(geometry.compact).toBe(true);
    expect(geometry.centeredAvailableWidth).toBe(152);
    expect(geometry.hitTargetWidth).toBe(152);
    expect(geometry.left).toBe(16);
    expect(geometry.right).toBe(168);
  });

  it('honors the compact floor when there is enough centered space for the minimum target', () => {
    const geometry = resolveRelationLabelGeometry({
      ...baseInput,
      badgeWidth: 360,
      centerX: 80,
      containerWidth: 420,
    });

    expect(geometry.compact).toBe(true);
    expect(geometry.hitTargetWidth).toBe(128);
    expect(geometry.hitTargetWidth).toBeGreaterThanOrEqual(112);
    expect(geometry.left).toBe(16);
  });

  it('stays inside the viewport even when the centered space is smaller than the compact floor', () => {
    const geometry = resolveRelationLabelGeometry({
      ...baseInput,
      centerX: 36,
      containerWidth: 220,
    });

    expect(geometry.compact).toBe(true);
    expect(geometry.hitTargetWidth).toBe(40);
    expect(geometry.left).toBe(16);
    expect(geometry.right).toBe(56);
  });
});
