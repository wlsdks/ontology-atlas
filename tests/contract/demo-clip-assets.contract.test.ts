import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  AVAILABLE_DEMO_CLIP_IDS,
  DEMO_CLIPS,
  availableDemoClips,
} from '@/views/download/model/demo-clips';

/**
 * Does the demo clip's **declaration match the real file**?
 *
 * `demo-clips.ts` says in its own comment *"length in seconds (measured); a gate
 * compares it after filming"* — and **that gate did not exist** (found 2026-08-20).
 * So after the 2026-08-19 swap to an 88.83 s recording, nobody would have noticed
 * `seconds` still holding the previous take's value. A place where a number rots
 * quietly was blocked with a comment; this file makes that comment true.
 *
 * The length is **read directly from the MP4's `mvhd` box** — calling ffprobe would
 * require ffmpeg on the CI runner, and without it the check would silently skip
 * (exactly how this repository lost a release to a gate that had never once gone
 * red). `mvhd` has a fixed layout and reads in 40 lines.
 */

const DEMO_DIR = join(process.cwd(), 'public', 'demo');
const LOCALES = ['ko', 'en'] as const;

/** Reads the length in seconds from an MP4 `mvhd` box. Throws rather than returning null when unreadable. */
function readMp4Seconds(path: string): number {
  const buf = readFileSync(path);
  const marker = buf.indexOf('mvhd');
  if (marker < 0) throw new Error(`${path}: mvhd 박스가 없다 — MP4 가 아니거나 깨졌다`);

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
  throw new Error(`${path}: 모르는 mvhd 버전 ${version}`);
}

describe('시연 클립 — 선언과 자산', () => {
  it('붙어 있다고 선언한 클립은 실제로 선언 표에 있다', () => {
    const declared = new Set(DEMO_CLIPS.map((clip) => clip.id));
    for (const id of AVAILABLE_DEMO_CLIP_IDS) {
      expect(declared, `${id} 는 AVAILABLE 에만 있고 DEMO_CLIPS 에 없다`).toContain(id);
    }
  });

  for (const clip of availableDemoClips()) {
    describe(clip.id, () => {
      for (const locale of LOCALES) {
        it(`${locale}: webm · mp4 · 포스터가 모두 있고 비어 있지 않다`, () => {
          for (const name of [
            `${clip.basename}.${locale}.webm`,
            `${clip.basename}.${locale}.mp4`,
            `${clip.basename}.${locale}-poster.png`,
          ]) {
            const stat = statSync(join(DEMO_DIR, name));
            // 10KB is the floor that filters out "the file exists but only half uploaded".
            expect(stat.size, `${name} 가 너무 작다`).toBeGreaterThan(10_000);
          }
        });

        it(`${locale}: MP4 실측 길이가 선언한 seconds 와 같다`, () => {
          const measured = readMp4Seconds(join(DEMO_DIR, `${clip.basename}.${locale}.mp4`));
          // Only one rounding step of slack is allowed. A wider gap means the recording was
          // swapped and the number was not updated.
          expect(Math.abs(measured - clip.seconds)).toBeLessThan(1);
        });
      }
    });
  }
});
