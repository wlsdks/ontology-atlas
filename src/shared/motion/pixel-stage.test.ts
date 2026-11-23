import { describe, expect, it } from 'vitest';
import { PIXEL_BEAT_MS } from './pixel-beat';
import { BREATH_MS, LIVELY_MS, MOTION_SHARE, MOTION_SHARE_AWAY, REST_MIN_MS, TURN_MS, createPixelStage } from './pixel-stage';

/** A room's turn is one loop of a 32-cell row. */
const ROOM_BEATS = 32;

/**
 * Plays rooms on one stage for `ms`, a beat at a time, as the room clock does: a resting room asks
 * for a turn, and one holding it plays its loop and gives it back. Returns the beats anything moved
 * and each room's turns.
 */
function play({ ms, rooms = 3, share = MOTION_SHARE }: { ms: number; rooms?: number; share?: number }) {
  const stage = createPixelStage({ share: () => share });
  const actors = Array.from({ length: rooms }, (_, i) => `room:${i}`);
  const moved: number[] = [];
  const turns = new Map<string, number[]>(actors.map(actor => [actor, []]));
  const left = new Map<string, number>();
  for (const actor of actors) stage.join(actor, 0);
  for (let now = 0; now < ms; now += PIXEL_BEAT_MS) {
    let any = stage.lively(now);
    for (const actor of actors) {
      if (stage.lively(now)) continue;
      const beats = left.get(actor);
      if (beats !== undefined) {
        if (beats > 0) { any = true; left.set(actor, beats - 1); } else { stage.release(actor, now); left.delete(actor); }
      } else if (stage.ask(actor, now)) {
        turns.get(actor)!.push(now);
        left.set(actor, ROOM_BEATS);
      }
    }
    if (any) { stage.moved(now); moved.push(now); }
  }
  return { moved, turns };
}

/** The longest time with nothing moving from `from` on. */
const longestStill = (moved: number[], from: number) => {
  const after = moved.filter(at => at >= from);
  return Math.max(...after.slice(1).map((at, i) => at - after[i]));
};
/** The share of the time from `from` to `to` in which something moved. */
const shareOf = (moved: number[], from: number, to: number) => (moved.filter(at => at >= from && at < to).length * PIXEL_BEAT_MS) / (to - from);

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

  it('grants a turn to the longest in line, lets the next join it at once, and rests in the key window until five seconds have stood still', () => {
    const stage = createPixelStage();
    for (const actor of ['a', 'b', 'c']) stage.join(actor, 0);
    const now = LIVELY_MS + 10_000;
    expect(stage.ask('b', now)).toBe(true);
    expect(stage.ask('a', now)).toBe(true);
    expect(stage.ask('c', now)).toBe(false);
    expect(stage.may('a', now + TURN_MS - 1)).toBe(true);
    expect(stage.may('a', now + TURN_MS)).toBe(false);
    // One loop, 4.8 s, moves on every beat; the first pose after a still screen counts as held.
    for (let at = now; at <= now + 4800; at += PIXEL_BEAT_MS) stage.moved(at);
    stage.release('a', now + 4000);
    expect(stage.ask('c', now + 4100)).toBe(false);
    const end = now + 4800;
    stage.release('b', end);
    // The least rest is over, but the share is not met and the screen has not stood still long enough.
    expect(stage.ask('c', end + REST_MIN_MS)).toBe(false);
    expect(stage.ask('c', end + BREATH_MS - PIXEL_BEAT_MS)).toBe(false);
    expect(stage.ask('c', end + BREATH_MS)).toBe(true);
  });

  it('gives every room a turn within 45 s and never stands still past six seconds in the key window', () => {
    const ms = 10 * 60_000;
    const { moved, turns } = play({ ms });
    const from = LIVELY_MS + 6000;
    for (const [actor, at] of turns) {
      const marks = [from, ...at, ms];
      const waits = marks.slice(1).map((t, i) => t - marks[i]);
      expect(Math.max(...waits), `${actor}'s longest wait`).toBeLessThanOrEqual(45_000);
    }
    expect(longestStill(moved, from)).toBeLessThanOrEqual(6000 + 2 * PIXEL_BEAT_MS);
  });

  it('keeps to its share in a window that is not key, and moves more in the key window', () => {
    const ms = 10 * 60_000;
    const key = shareOf(play({ ms }).moved, 60_000, ms), away = shareOf(play({ ms, share: MOTION_SHARE_AWAY }).moved, 60_000, ms);
    expect(away).toBeLessThanOrEqual(MOTION_SHARE_AWAY);
    expect(away).toBeLessThan(key);
  });

  it('takes back a turn its holders never give back', () => {
    const stage = createPixelStage();
    for (const actor of ['a', 'b']) stage.join(actor, 0);
    const now = LIVELY_MS + 10_000;
    expect(stage.ask('a', now)).toBe(true);
    expect(stage.ask('b', now + TURN_MS)).toBe(false);
    expect(stage.ask('b', now + TURN_MS + 12_001)).toBe(true);
    stage.leave('b', now + TURN_MS + 12_002);
    expect(stage.holds('b')).toBe(false);
  });
});
