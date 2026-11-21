import { describe, expect, it } from 'vitest';

import { mix, parseColor, rgba } from './film-colors';

describe('film colours', () => {
  it('reads a six-digit hex and an rgb or rgba function, and falls back to opaque black', () => {
    expect(parseColor('#ff8000')).toEqual([255, 128, 0, 1]);
    expect(parseColor('rgb(10, 20, 30)')).toEqual([10, 20, 30, 1]);
    expect(parseColor('rgba(10 20 30 / 0.5)')).toEqual([10, 20, 30, 0.5]);
    expect(parseColor('not a colour')).toEqual([0, 0, 0, 1]);
  });

  it('asks a canvas to resolve a colour name when one is given', () => {
    const probe = { fillStyle: '' } as unknown as CanvasRenderingContext2D;
    Object.defineProperty(probe, 'fillStyle', {
      get: () => '#0000ff',
      set: () => undefined,
    });
    expect(parseColor('blue', probe)).toEqual([0, 0, 255, 1]);
  });

  it('mixes toward the second colour as the share falls, and returns the first untouched at 1', () => {
    expect(mix('#ffffff', '#000000', 1)).toBe('#ffffff');
    expect(mix('#ffffff', '#000000', 0)).toBe('rgb(0, 0, 0)');
    expect(mix('#ffffff', '#000000', 0.5)).toBe('rgb(128, 128, 128)');
    expect(mix('#ffffff', '#000000', 2)).toBe('#ffffff');
  });

  it('quantises a mix, so close shares reuse one string', () => {
    expect(mix('#ffffff', '#000000', 0.5)).toBe(mix('#ffffff', '#000000', 0.5 + 1 / 400));
    expect(mix('#ffffff', '#000000', 0.7 / 48)).toBe(mix('#ffffff', '#000000', 1 / 48));
  });

  it('writes an alpha clamped to 0..1 and rounded to thousandths', () => {
    expect(rgba('#ff8000', 0.12345)).toBe('rgba(255, 128, 0, 0.123)');
    expect(rgba('#ff8000', 3)).toBe('rgba(255, 128, 0, 1)');
    expect(rgba('#ff8000', -1)).toBe('rgba(255, 128, 0, 0)');
  });
});
