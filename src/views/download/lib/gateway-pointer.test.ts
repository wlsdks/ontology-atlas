import { describe, expect, it } from 'vitest';

import { nearestStars } from './gateway-pointer';

describe('nearestStars', () => {
  it('returns the stars within the radius, nearest first, at most the asked number', () => {
    const stars = [
      { x: 0.5, y: 0.5 },
      { x: 0.1, y: 0.1 },
      { x: 0.52, y: 0.5 },
      { x: 0.55, y: 0.5 },
    ];
    // A 1000×1000 window: the stars sit 0, 20 and 50px from the point, and one far away.
    const near = nearestStars(stars, 500, 500, 1000, 1000, 60, 2);
    expect(near.map((entry) => entry.star)).toEqual([stars[0], stars[2]]);
    expect(nearestStars(stars, 500, 500, 1000, 1000, 10, 5)).toHaveLength(1);
  });
});
