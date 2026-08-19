import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  AVAILABLE_DEMO_CLIP_IDS,
  DEMO_CLIPS,
  availableDemoClips,
} from '@/views/download/model/demo-clips';

/**
 * 시연 클립의 **선언과 실물이 같은가**.
 *
 * `demo-clips.ts` 는 자기 주석에 *"초 단위 길이(실측). 촬영 후 게이트가
 * 대조한다"* 라고 적어 두었는데 **그 게이트가 없었다**(2026-08-20 발견).
 * 그래서 2026-08-19 에 88.83초짜리로 갈아 끼운 뒤에도 `seconds` 가 종전
 * 촬영본 값에 머물러 있어도 아무도 몰랐을 것이다. 숫자가 조용히 썩는 자리를
 * 주석으로 막아 둔 셈이라, 이 파일이 그 주석을 사실로 만든다.
 *
 * 길이는 **MP4 의 `mvhd` 박스에서 직접 읽는다** — ffprobe 를 부르면 CI 러너에
 * ffmpeg 이 있어야 하고, 없으면 검사가 조용히 건너뛰어진다(그게 바로 이
 * 저장소가 「한 번도 빨개진 적 없는 게이트」로 릴리스를 잃은 방식이다).
 * `mvhd` 는 규격이 고정돼 있어 40줄로 읽힌다.
 */

const DEMO_DIR = join(process.cwd(), 'public', 'demo');
const LOCALES = ['ko', 'en'] as const;

/** MP4 `mvhd` 박스에서 초 단위 길이를 읽는다. 못 읽으면 null 이 아니라 throw. */
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
            // 10KB 는 «파일은 있는데 반쯤 올라간 것»을 거르는 하한이다.
            expect(stat.size, `${name} 가 너무 작다`).toBeGreaterThan(10_000);
          }
        });

        it(`${locale}: MP4 실측 길이가 선언한 seconds 와 같다`, () => {
          const measured = readMp4Seconds(join(DEMO_DIR, `${clip.basename}.${locale}.mp4`));
          // 반올림 한 칸까지만 허용한다. 그보다 벌어지면 촬영본을 갈아 끼우고
          // 숫자를 안 고친 것이다.
          expect(Math.abs(measured - clip.seconds)).toBeLessThan(1);
        });
      }
    });
  }
});
