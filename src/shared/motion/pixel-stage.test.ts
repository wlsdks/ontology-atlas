import { describe, expect, it } from 'vitest';
import { PIXEL_BEAT_MS } from './pixel-beat';
import { LIVELY_MS, MOTION_SHARE, MOTION_SHARE_AWAY, REST_MIN_MS, TURN_MS, createPixelStage } from './pixel-stage';

/** A room's turn is one loop of a 32-cell row; the lobby's a few strides; a breath a 6-pose blink. */
const ROOM_BEATS = 32, LOBBY_BEATS = 16, BLINK_BEATS = 6;

/**
 * Plays rooms and a lobby on one stage for `ms`, a beat at a time, as the room clock and the lobby
 * do: a resting actor asks for a turn, one holding it plays its thing and gives it back, and the
 * lobby blinks when the stage asks it to. Returns the beats anything moved and each actor's turns.
 */
function play({ ms, rooms = 3, lobby = true, share = MOTION_SHARE }: { ms: number; rooms?: number; lobby?: boolean; share?: number }) {
  const stage = createPixelStage({ share: () => share });
  const actors = [...Array.from({ length: rooms }, (_, i) => `room:${i}`), ...(lobby ? ['lobby'] : [])];
  const moved: number[] = [];
  const turns = new Map<string, number[]>(actors.map(actor => [actor, []]));
  const left = new Map<string, number>();
  let blinking = 0;
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
        left.set(actor, actor === 'lobby' ? LOBBY_BEATS : ROOM_BEATS);
      } else if (actor === 'lobby' && blinking === 0 && stage.breathe(actor, now)) blinking = BLINK_BEATS;
    }
    if (blinking > 0) { blinking -= 1; any = true; }
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

  it('grants a turn to the longest in line, lets the next join it at once, and rests about three times what moved, or until the rotation comes round', () => {
    const stage = createPixelStage();
    for (const actor of ['a', 'b', 'c']) stage.join(actor, 0);
    const now = LIVELY_MS + 10_000;
    stage.breathe('c', now);
    expect(stage.ask('b', now)).toBe(true);
    expect(stage.ask('a', now)).toBe(true);
    expect(stage.ask('c', now)).toBe(false);
    expect(stage.may('a', now + TURN_MS - 1)).toBe(true);
    expect(stage.may('a', now + TURN_MS)).toBe(false);
    // One loop, 4.8 s, moves on every beat; the first pose after a still screen counts as held.
    for (let at = now; at <= now + 4800; at += PIXEL_BEAT_MS) stage.moved(at);
    stage.release('a', now + 4000);
    stage.breathe('c', now + 4100);
    expect(stage.ask('c', now + 4100)).toBe(false);
    const end = now + 4800;
    stage.release('b', end);
    stage.breathe('c', end + REST_MIN_MS);
    expect(stage.ask('c', end + REST_MIN_MS)).toBe(false);
    // 5.4 s moved since the turn began would rest until 21.6 s after it; three actors, two to a turn, come
    // round in two turns, so the rotation brings the next sooner, 22 s after the turn began.
    stage.breathe('c', end + 16_000);
    expect(stage.ask('c', end + 16_000)).toBe(false);
    expect(stage.ask('c', end + 17_300)).toBe(true);
  });

  it('gives every room and the lobby a turn within 45 s, keeps about a quarter moving, and never stands still past eight seconds', () => {
    const ms = 10 * 60_000;
    const { moved, turns } = play({ ms });
    const from = LIVELY_MS + 6000;
    for (const [actor, at] of turns) {
      const marks = [from, ...at, ms];
      const waits = marks.slice(1).map((t, i) => t - marks[i]);
      expect(Math.max(...waits), `${actor}'s longest wait`).toBeLessThanOrEqual(45_000);
    }
    expect(longestStill(moved, from)).toBeLessThanOrEqual(8000);
    const steady = shareOf(moved, 60_000, ms);
    expect(steady).toBeGreaterThan(0.2);
    expect(steady).toBeLessThanOrEqual(0.33);
  });

  it('moves less in a window that is not key', () => {
    const ms = 10 * 60_000;
    const key = shareOf(play({ ms }).moved, 60_000, ms), away = shareOf(play({ ms, share: MOTION_SHARE_AWAY }).moved, 60_000, ms);
    expect(away).toBeLessThan(key);
  });

  it('brings the next turn sooner when no lobby can blink a rest awake', () => {
    const ms = 5 * 60_000;
    const { moved } = play({ ms, lobby: false });
    expect(longestStill(moved, LIVELY_MS + 6000)).toBeLessThanOrEqual(6000 + 2 * PIXEL_BEAT_MS);
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
