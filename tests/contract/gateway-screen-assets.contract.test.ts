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
 * **The gateway's captured screens exist for every locale, at the capture size, and are two sets.**
 *
 * The screens stage (2026-09-24) reads `public/gateway/<file>.<locale>.png`. A missing file is a
 * broken image on the first impression; a file at another size is a picture the page scales
 * blurry or crops; and — the quiet one — a Korean file that is a copy of the English one leaves
 * every other check green while a Korean visitor is shown an English app. That last accident is
 * the one `demo-clip-assets.contract` records for the demo video, and it is guarded the same way:
 * two captures of the same screen in two languages are never byte-identical.
 *
 * Size is read from the PNG's IHDR chunk (fixed offsets), so no image library is needed.
 */

const DIR = join(process.cwd(), 'public', 'gateway');

function pngSize(buffer: Buffer): { width: number; height: number } {
  expect(buffer.subarray(1, 4).toString('latin1'), 'PNG 서명이 아니다').toBe('PNG');
  expect(buffer.subarray(12, 16).toString('latin1'), 'IHDR 이 첫 청크가 아니다').toBe('IHDR');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const read = (file: string, locale: string) =>
  readFileSync(join(process.cwd(), 'public', gatewayScreenSrc(file as never, locale)));

describe('관문 화면 캡처 — 로케일마다 한 벌', () => {
  it('등재된 화면이 있다 — 빈손으로 통과하지 않는다', () => {
    expect(GATEWAY_SCREEN_FILES.length).toBe(6);
    expect([...GATEWAY_SCREEN_LOCALES].sort()).toEqual(['en', 'ko']);
  });

  for (const file of GATEWAY_SCREEN_FILES) {
    for (const locale of GATEWAY_SCREEN_LOCALES) {
      it(`${file}.${locale}.png — 있고, 10KB 넘고, 캡처 크기다`, () => {
        const buffer = read(file, locale);
        expect(buffer.length, `${file}.${locale}.png 가 너무 작다`).toBeGreaterThan(10_000);
        expect(pngSize(buffer)).toEqual(GATEWAY_SCREEN_PIXELS);
      });
    }

    it(`${file}: 두 로케일이 같은 파일이 아니다`, () => {
      expect(
        read(file, 'ko').equals(read(file, 'en')),
        `${file}.ko.png 와 ${file}.en.png 이 같은 파일이다 — 한국어 방문자가 영어 화면을 본다`,
      ).toBe(false);
    });
  }

  it('로케일 없는 옛 캡처나 등재되지 않은 캡처가 남아 있지 않다', () => {
    const expected = new Set(
      GATEWAY_SCREEN_FILES.flatMap((file) =>
        GATEWAY_SCREEN_LOCALES.map((locale) => `${file}.${locale}.png`),
      ),
    );
    const strays = readdirSync(DIR).filter((name) => !expected.has(name));
    expect(strays, '아무도 읽지 않는 캡처는 배포 크기만 늘린다').toEqual([]);
  });

  it('캡처 세트가 없는 로케일은 영어 캡처를 읽는다', () => {
    expect(gatewayScreenSrc('git', 'ja')).toBe('/gateway/git.en.png');
    expect(gatewayScreenSrc('git', 'ko')).toBe('/gateway/git.ko.png');
  });
});
