import { describe, expect, it } from 'vitest';
import { resolveFocusLabelPlacement } from './SigmaFocusLabel';

describe('resolveFocusLabelPlacement', () => {
  it('places labels to the left when a right-side node would overflow', () => {
    const placement = resolveFocusLabelPlacement({
      x: 960,
      y: 120,
      nodeSize: 16,
      viewportWidth: 1024,
      viewportHeight: 768,
    });

    expect(placement.side).toBe('left');
    expect(placement.left).toBeLessThan(960);
    expect(placement.left + 176 + 16).toBeLessThanOrEqual(1024);
  });

  it('keeps labels inside the viewport near the top edge', () => {
    const placement = resolveFocusLabelPlacement({
      x: 80,
      y: 4,
      nodeSize: 10,
      viewportWidth: 1024,
      viewportHeight: 768,
    });

    expect(placement.side).toBe('right');
    expect(placement.top).toBe(16);
  });

  it('keeps labels inside the viewport near the bottom edge', () => {
    const placement = resolveFocusLabelPlacement({
      x: 80,
      y: 760,
      nodeSize: 10,
      viewportWidth: 1024,
      viewportHeight: 768,
    });

    expect(placement.top + 28 + 16).toBeLessThanOrEqual(768);
  });
});
