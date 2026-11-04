import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  GATEWAY_SCREEN_FILES,
  GATEWAY_SCREEN_LOCALES,
  GATEWAY_SCREEN_PIXELS,
  gatewayScreenSrc,
} from '@/views/download/model/gateway-screens';

/**
 * A Korean capture that is a copy of the English one must fail: captures of one screen in two
 * languages are never byte-identical. Size is read from the PNG IHDR chunk.
 */

const DIR = join(process.cwd(), 'public', 'gateway');

function pngSize(buffer: Buffer): { width: number; height: number } {
  expect(buffer.subarray(1, 4).toString('latin1'), 'not a PNG signature').toBe('PNG');
  expect(buffer.subarray(12, 16).toString('latin1'), 'IHDR is not the first chunk').toBe('IHDR');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const read = (file: string, locale: string) =>
  readFileSync(join(process.cwd(), 'public', gatewayScreenSrc(file as never, locale)));

describe('gateway screen captures — one set per locale', () => {
  it('there are registered screens — it does not pass empty-handed', () => {
    expect(GATEWAY_SCREEN_FILES.length).toBe(8);
    expect([...GATEWAY_SCREEN_LOCALES].sort()).toEqual(['en', 'ko']);
  });

  for (const file of GATEWAY_SCREEN_FILES) {
    for (const locale of GATEWAY_SCREEN_LOCALES) {
      it(`${file}.${locale}.png — exists, is over 10KB, and has the capture size`, () => {
        const buffer = read(file, locale);
        expect(buffer.length, `${file}.${locale}.png is too small`).toBeGreaterThan(10_000);
        expect(pngSize(buffer)).toEqual(GATEWAY_SCREEN_PIXELS);
      });
    }

    it(`${file}: the two locales are not the same file`, () => {
      expect(
        read(file, 'ko').equals(read(file, 'en')),
        `${file}.ko.png and ${file}.en.png are the same file — a Korean visitor sees the English screen`,
      ).toBe(false);
    });
  }

  it('no old capture without a locale and no unregistered capture remains', () => {
    const expected = new Set(
      GATEWAY_SCREEN_FILES.flatMap((file) =>
        GATEWAY_SCREEN_LOCALES.map((locale) => `${file}.${locale}.png`),
      ),
    );
    const strays = readdirSync(DIR).filter((name) => !expected.has(name));
    expect(strays, 'a capture nobody reads only adds to the shipped size').toEqual([]);
  });

  it('a locale without a capture set reads the English captures', () => {
    expect(gatewayScreenSrc('git', 'ja')).toBe('/gateway/git.en.png');
    expect(gatewayScreenSrc('git', 'ko')).toBe('/gateway/git.ko.png');
  });
});
