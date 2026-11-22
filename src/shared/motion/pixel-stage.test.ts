import { describe, expect, it } from 'vitest';
import { PIXEL_BEAT_MS } from './pixel-beat';
import { LIVELY_MS, MOTION_SHARE, MOTION_SHARE_AWAY, REST_MS, SHARE_WINDOW_MS, TURN_MS, createPixelStage } from './pixel-stage';

/**
 * Plays actors on a stage for `ms`, a beat at a time: a resting actor asks for a turn, and one holding
 * it moves for `turnBeats` beats and gives it back. Returns the beats anything moved, and who held turns.
 */
function play({ ms, actors = ['a', 'b', 'c'], turnBeats = 24, share = MOTION_SHARE }: { ms: number; actors?: string[]; turnBeats?: number; share?: number }) {
  const stage = createPixelStage({ share: () => share });
  const moved: number[] = [], turns: string[] = [];
  const left = new Map<string, number>();
  for (const actor of actors) stage.join(actor, 0);
  for (let now = 0; now < ms; now += PIXEL_BEAT_MS) {
    let any = false;
    for (const actor of actors) {
      if (stage.lively(now)) { any = true; continue; }
      if (stage.holds(actor)) {
        const beats = left.get(actor) ?? turnBeats;
        if (beats > 0) { any = true; left.set(actor, beats - 1); } else { stage.release(actor, now); left.delete(actor); }
      } else if (stage.ask(actor, now)) turns.push(actor);
    }
    if (any) { stage.moved(now); moved.push(now); }
  }
  return { stage, moved, turns };
}

/** The most any one minute from `start` held, as a share of it. */
const busiestMinute = (moved: number[], ms: number, start = 0) => {
  let most = 0;
  for (let from = start; from + SHARE_WINDOW_MS <= ms; from += 1000) {
    most = Math.max(most, moved.filter(at => at >= from && at < from + SHARE_WINDOW_MS).length * PIXEL_BEAT_MS / SHARE_WINDOW_MS);
  }
  return most;
};

describe('pixel stage', () => {
  it('lets everybody move through the lively stretch after the first joins, then nobody without a turn', () => {
    const stage = createPixelStage();
    stage.join('a', 1000);
    expect(stage.may('a', 1000 + LIVELY_MS - 1)).toBe(true);
    expect(stage.may('b', 1000 + LIVELY_MS - 1)).toBe(true);
    expect(stage.may('a', 1000 + LIVELY_MS)).toBe(false);
    stage.wake(50_000);
    expect(stage.may('b', 50_000 + LIVELY_MS - 1)).toBe(true);
  });

  it('grants one turn at a time, in the order actors asked, with a rest between', () => {
    const stage = createPixelStage();
    for (const actor of ['a', 'b']) stage.join(actor, 0);
    const now = LIVELY_MS + SHARE_WINDOW_MS;
    expect(stage.ask('b', now)).toBe(true);
    expect(stage.ask('a', now)).toBe(false);
    expect(stage.may('b', now + TURN_MS - 1)).toBe(true);
    expect(stage.may('b', now + TURN_MS)).toBe(false);
    stage.release('b', now + 4000);
    expect(stage.ask('a', now + 4000 + REST_MS - 1)).toBe(false);
    expect(stage.ask('b', now + 4000 + REST_MS)).toBe(false);
    expect(stage.ask('a', now + 4000 + REST_MS)).toBe(true);
  });

  // The lively stretch (a quarter of a minute) comes from opening the screen or returning to the window.
  for (const [window, share] of [['the key window', MOTION_SHARE], ['a window that is not key', MOTION_SHARE_AWAY]] as const) {
    it(`keeps every minute's motion within ${share * 100} % in ${window} after the lively stretch, and still takes turns`, () => {
      const ms = 10 * SHARE_WINDOW_MS;
      const { moved, turns } = play({ ms, share });
      expect(busiestMinute(moved, ms)).toBeLessThanOrEqual(MOTION_SHARE);
      expect(busiestMinute(moved, ms, LIVELY_MS)).toBeLessThanOrEqual(share);
      // After the first minute the cast still moves: turns go round every actor.
      const after = moved.filter(at => at >= 2 * SHARE_WINDOW_MS).length * PIXEL_BEAT_MS / (ms - 2 * SHARE_WINDOW_MS);
      expect(after).toBeGreaterThan(share / 3);
      expect(new Set(turns)).toEqual(new Set(['a', 'b', 'c']));
    });
  }

  it('takes back a turn its holder never gives back', () => {
    const stage = createPixelStage();
    for (const actor of ['a', 'b']) stage.join(actor, 0);
    const now = LIVELY_MS + SHARE_WINDOW_MS;
    expect(stage.ask('a', now)).toBe(true);
    expect(stage.ask('b', now + TURN_MS)).toBe(false);
    expect(stage.ask('b', now + TURN_MS + 10_001)).toBe(true);
    stage.leave('b', now + TURN_MS + 10_002);
    expect(stage.holds('b')).toBe(false);
  });
});
