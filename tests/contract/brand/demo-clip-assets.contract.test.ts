import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  AVAILABLE_DEMO_CLIP_IDS,
  DEMO_CLIPS,
  DEMO_WEBM_TYPE,
  availableDemoClips,
} from '@/views/download/model/demo-clips';

/**
 * The length is read from the MP4 `mvhd` box directly: ffprobe would need ffmpeg on the CI runner
 * and the check would silently skip. Declared `seconds` must match the real file.
 */

const DEMO_DIR = join(process.cwd(), 'public', 'demo');
const LOCALES = ['ko', 'en'] as const;

/** Reads the length in seconds from an MP4 `mvhd` box. Throws rather than returning null when unreadable. */
function readMp4Seconds(path: string): number {
  const buf = readFileSync(path);
  const marker = buf.indexOf('mvhd');
  if (marker < 0) throw new Error(`${path}: no mvhd box — not an MP4 or broken`);

  const version = buf.readUInt8(marker + 4);
  if (version === 0) {
    const timescale = buf.readUInt32BE(marker + 16);
    const duration = buf.readUInt32BE(marker + 20);
    return duration / timescale;
  }
  if (version === 1) {
    const timescale = buf.readUInt32BE(marker + 24);
    const duration = Number(buf.readBigUInt64BE(marker + 28));
    return duration / timescale;
  }
  throw new Error(`${path}: unknown mvhd version ${version}`);
}

/**
 * Builds the `av01.P.LLT.DD` codec string from the WebM's CodecPrivate (`av1C`): byte 1 holds the
 * profile and level, byte 2 the tier and bit-depth flags. Throws rather than guessing.
 */
function readWebmAv1Codec(path: string): string {
  const buf = readFileSync(path);
  const marker = buf.indexOf(Buffer.from([0x63, 0xa2]));
  if (marker < 0) throw new Error(`${path}: no CodecPrivate element`);
  const sizeByte = buf.readUInt8(marker + 2);
  const sizeLength = Math.clz32(sizeByte) - 23;
  const av1c = marker + 2 + sizeLength;
  if (buf.readUInt8(av1c) !== 0x81) throw new Error(`${path}: CodecPrivate is not an av1C record`);
  const profileLevel = buf.readUInt8(av1c + 1);
  const flags = buf.readUInt8(av1c + 2);
  const bitDepth = flags & 0x40 ? (flags & 0x20 ? 12 : 10) : 8;
  const level = String(profileLevel & 0x1f).padStart(2, '0');
  return `av01.${profileLevel >> 5}.${level}${flags & 0x80 ? 'H' : 'M'}.${String(bitDepth).padStart(2, '0')}`;
}

describe('demo clip — declaration and assets', () => {
  it('a clip declared as attached is really in the declaration table', () => {
    const declared = new Set(DEMO_CLIPS.map((clip) => clip.id));
    for (const id of AVAILABLE_DEMO_CLIP_IDS) {
      expect(declared, `${id} is only in AVAILABLE and not in DEMO_CLIPS`).toContain(id);
    }
  });

  for (const clip of availableDemoClips()) {
    describe(clip.id, () => {
      for (const locale of LOCALES) {
        it(`${locale}: webm · mp4 · poster all exist and are non-empty`, () => {
          for (const name of [
            `${clip.basename}.${locale}.webm`,
            `${clip.basename}.${locale}.mp4`,
            `${clip.basename}.${locale}-poster.png`,
          ]) {
            const stat = statSync(join(DEMO_DIR, name));
            // 10KB is the floor that filters out "the file exists but only half uploaded".
            expect(stat.size, `${name} is too small`).toBeGreaterThan(10_000);
          }
        });

        it(`${locale}: the poster is the declared frame size, which the video reserves before it loads`, () => {
          const png = readFileSync(join(DEMO_DIR, `${clip.basename}.${locale}-poster.png`));
          expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([clip.width, clip.height]);
        });

        it(`${locale}: the declared webm codec matches the file, or an iPhone without AV1 picks it and shows black`, () => {
          const codec = readWebmAv1Codec(join(DEMO_DIR, `${clip.basename}.${locale}.webm`));
          expect(DEMO_WEBM_TYPE).toBe(`video/webm; codecs="${codec}"`);
        });

        it(`${locale}: the measured MP4 length equals the declared seconds`, () => {
          const measured = readMp4Seconds(join(DEMO_DIR, `${clip.basename}.${locale}.mp4`));
          // Only one rounding step of slack is allowed. A wider gap means the recording was
          // swapped and the number was not updated.
          expect(Math.abs(measured - clip.seconds)).toBeLessThan(1);
        });
      }

      /**
       * The two locales must be two recordings, not one file copied under two names, which every check
       * above would pass. Compares bytes, not pixels.
       */
      it('the two locales are not the same file — if one is overwritten every check above stays green', () => {
        for (const ext of ['webm', 'mp4', '-poster.png'] as const) {
          const name = (locale: string) =>
            ext.startsWith('-')
              ? `${clip.basename}.${locale}${ext}`
              : `${clip.basename}.${locale}.${ext}`;
          const ko = readFileSync(join(DEMO_DIR, name('ko')));
          const en = readFileSync(join(DEMO_DIR, name('en')));
          expect(ko.length, `${name('ko')} is empty — this test idles`).toBeGreaterThan(10_000);
          expect(
            ko.equals(en),
            `${name('ko')} and ${name('en')} are the same file — a user of one language sees the screen of the other`,
          ).toBe(false);
        }
      });
    });
  }
});
