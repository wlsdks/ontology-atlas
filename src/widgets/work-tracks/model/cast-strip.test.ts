import { describe, expect, it } from 'vitest';
import { TINT_GAIN, tintPixels } from './cast-strip';

describe('tintPixels', () => {
  it('lays the ink on the saturated indigo only, scaled by its lightness, as the board filter does', () => {
    // Moru's flipper indigo, his stone body and his outline ink.
    const data = new Uint8ClampedArray([0x6d, 0x73, 0xd2, 255, 0xd6, 0xd3, 0xc9, 255, 0x17, 0x19, 0x2d, 255]);
    tintPixels(data, [200, 100, 50]);
    const L = 0.3 * 0x6d / 255 + 0.5 * 0x73 / 255 + 0.2 * 0xd2 / 255;
    expect([...data.slice(0, 4)]).toEqual([200, 100, 50, 255].map((value, k) => (k === 3 ? 255 : Math.round(Math.min(1, TINT_GAIN * L * value / 255) * 255))));
    expect([...data.slice(4)]).toEqual([0xd6, 0xd3, 0xc9, 255, 0x17, 0x19, 0x2d, 255]);
  });
});
