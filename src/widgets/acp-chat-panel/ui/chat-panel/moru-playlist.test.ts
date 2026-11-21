import { describe, expect, it } from 'vitest';

import { PLAY_ROW_FRAMES } from '@/shared/ui/marks/moru/moru-rows';

import type { TurnActivityKind } from '../turn-activity';
import { WORK_PLAYLIST, celebrationClip, stageClip } from './moru-playlist';

const KINDS = Object.keys(WORK_PLAYLIST) as TurnActivityKind[];
const isPlay = (clip: string) => clip in PLAY_ROW_FRAMES;
const run = (kind: TurnActivityKind, turnId: string, loops: number) => Array.from({ length: loops }, (_, loop) => stageClip(kind, turnId, loop));
const TURN_IDS = Array.from({ length: 24 }, (_, index) => `user-${index}-${index * 7919}`);

describe('Moru stage playlist', () => {
  it('repeats the same order for the same kind and turn', () => {
    for (const kind of KINDS) for (const turnId of TURN_IDS) expect(run(kind, turnId, 12)).toEqual(run(kind, turnId, 12));
  });

  it("starts each kind on that kind's first work clip, so a change of kind shows at once", () => {
    for (const kind of KINDS) for (const turnId of TURN_IDS) expect(stageClip(kind, turnId, 0)).toBe(WORK_PLAYLIST[kind][0]);
  });

  it('plays on every third loop of a long stretch of thinking and works on the others', () => {
    for (const turnId of TURN_IDS) {
      const clips = run('thinking', turnId, 12);
      clips.forEach((clip, loop) => expect(isPlay(clip), `loop ${loop + 1}: ${clip}`).toBe((loop + 1) % 3 === 0));
      expect(clips.filter((clip) => !isPlay(clip))).toEqual(['think', 'pondering', 'think', 'pondering', 'think', 'pondering', 'think', 'pondering']);
    }
  });

  it('does not play the same break twice in a row', () => {
    for (const turnId of TURN_IDS) {
      const breaks = run('reading', turnId, 30).filter(isPlay);
      breaks.slice(1).forEach((clip, index) => expect(clip).not.toBe(breaks[index]));
    }
  });

  it('keeps Moru typing and never playing while the answer streams', () => {
    for (const turnId of TURN_IDS) expect(new Set(run('answering', turnId, 30))).toEqual(new Set(['code']));
  });

  it('varies play and the finishing gesture across turns', () => {
    expect(new Set(TURN_IDS.map((turnId) => stageClip('thinking', turnId, 2))).size).toBeGreaterThan(1);
    expect(new Set(TURN_IDS.map(celebrationClip)).size).toBeGreaterThan(1);
  });
});
