import { describe, expect, it } from 'vitest';

import {
  BOUNCE,
  FEET,
  REACH,
  TOP_SPEED,
  catches,
  clipTimeline,
  milestoneFor,
  newGame,
  poseAt,
  readBest,
  steer,
  stepGame,
  writeBest,
  type Game,
  type Mover,
} from './moru-play';

const FIELD = { width: 680, floor: 340 };
const HEAD_LINE = FIELD.floor - FEET + 48;

/** Runs a game for `ms` in 16 ms frames with Moru parked at `x`. */
function play(game: Game, ms: number, x: number, canCatch = true) {
  let state = game;
  const milestones: string[] = [];
  let caught = 0;
  for (let t = 0; t < ms; t += 16) {
    const step = stepGame(state, 16, FIELD, { x, canCatch, hold: false });
    state = step.game;
    caught += step.caught;
    if (step.milestone) milestones.push(step.milestone);
  }
  return { game: state, milestones, caught };
}

describe('catch detection', () => {
  it('catches an item over Moru in the band below his head, and nothing outside it', () => {
    expect(catches({ x: 300, y: HEAD_LINE + 4 }, 300, FIELD.floor)).toBe(true);
    expect(catches({ x: 300 + REACH, y: HEAD_LINE + 4 }, 300, FIELD.floor)).toBe(true);
    expect(catches({ x: 300 + REACH + 1, y: HEAD_LINE + 4 }, 300, FIELD.floor)).toBe(false);
    expect(catches({ x: 300, y: HEAD_LINE - 1 }, 300, FIELD.floor)).toBe(false);
    expect(catches({ x: 300, y: FIELD.floor }, 300, FIELD.floor)).toBe(false);
  });
});

describe('milestones', () => {
  it('celebrates every fifth catch and plays every fifteenth, each cycling', () => {
    expect(milestoneFor(4, { celebrations: 0, plays: 0 })).toBeNull();
    expect(milestoneFor(5, { celebrations: 0, plays: 0 })).toBe('hop');
    expect(milestoneFor(10, { celebrations: 1, plays: 0 })).toBe('clap');
    expect(milestoneFor(15, { celebrations: 2, plays: 0 })).toBe('sing');
    expect(milestoneFor(20, { celebrations: 2, plays: 1 })).toBe('success');
    expect(milestoneFor(30, { celebrations: 4, plays: 1 })).toBe('hearts');
  });

  it('counts catches across a game and returns each milestone once', () => {
    // A drop lands in the band only when Moru stands under it; follow each one.
    let game = newGame(7);
    const milestones: string[] = [];
    for (let frame = 0; frame < 60 * 120 && game.score < 15; frame += 1) {
      const falling = game.items.find((item) => item.state === 'falling');
      const step = stepGame(game, 16, FIELD, { x: falling?.x ?? 340, canCatch: true, hold: false });
      game = step.game;
      if (step.milestone) milestones.push(step.milestone);
    }
    expect(game.score).toBe(15);
    expect(milestones).toEqual(['hop', 'clap', 'sing']);
    expect(game.best).toBe(15);
  });
});

describe('a game with no end', () => {
  it('keeps dropping and never ends when every item is missed', () => {
    const { game, caught } = play(newGame(3), 5 * 60_000, 0, false);
    expect(caught).toBe(0);
    expect(game.score).toBe(0);
    expect(game.nextId).toBeGreaterThan(200);
    // Misses fade on the floor and leave; nothing piles up.
    expect(game.items.length).toBeLessThan(8);
    expect(game.items.every((item) => item.y <= FIELD.floor)).toBe(true);
  });

  it('drops nothing new while Moru is busy with a clip', () => {
    let game = newGame(5);
    for (let t = 0; t < 10_000; t += 16) game = stepGame(game, 16, FIELD, { x: 0, canCatch: false, hold: true }).game;
    expect(game.nextId).toBe(1);
  });

  it('replays the same drops from the same seed', () => {
    const a = play(newGame(11), 4000, 0, false).game.items.map((item) => [item.kind, Math.round(item.x)]);
    const b = play(newGame(11), 4000, 0, false).game.items.map((item) => [item.kind, Math.round(item.x)]);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });
});

describe('steering', () => {
  it('eases in, holds a constant top speed, and brakes onto the target without overshoot', () => {
    let m: Mover = { x: 100, v: 0, facing: 1 };
    const path: Mover[] = [];
    for (let t = 0; t < 3000; t += 16) {
      m = steer(m, 16, { target: 600 }, 64, 616);
      path.push(m);
    }
    expect(m).toMatchObject({ x: 600, v: 0 });
    expect(Math.max(...path.map((p) => p.x))).toBeLessThanOrEqual(600);
    const speeds = path.map((p) => p.v);
    expect(speeds[0]).toBeLessThan(TOP_SPEED / 4);
    expect(Math.max(...speeds)).toBeCloseTo(TOP_SPEED, 0);
    // While moving, no frame changes speed by more than the easing allows.
    const stop = speeds.indexOf(0);
    const jumps = speeds.slice(1, stop).map((v, i) => Math.abs(v - speeds[i]));
    expect(Math.max(...jumps)).toBeLessThanOrEqual(1700 * 0.016 + 1e-6);
    // The frame that comes to rest covers under a pixel and a half, so the stop cannot be seen as a snap.
    expect(path[stop].x - path[stop - 1].x).toBeLessThan(1.5);
  });

  it('faces the way it travels and stays inside the floor', () => {
    let m: Mover = { x: 200, v: 0, facing: 1 };
    for (let t = 0; t < 2000; t += 16) m = steer(m, 16, { direction: -1 }, 64, 616);
    expect(m.facing).toBe(-1);
    expect(m.x).toBe(64);
  });
});

describe('clip timing', () => {
  it('starts and ends a requested clip on its first and last authored pose', () => {
    const line = clipTimeline('clap');
    expect(poseAt(line, 0).frame).toBe(line.frames[0]);
    expect(poseAt(line, line.total).done).toBe(true);
    expect(poseAt(line, line.total).frame).toBe(line.frames[line.frames.length - 1]);
  });

  it('builds the travel bounce from the hop clip, about six tenths of a second a bounce', () => {
    expect(BOUNCE.frames).toHaveLength(18);
    expect(BOUNCE.total).toBeGreaterThan(500);
    expect(BOUNCE.total).toBeLessThan(800);
  });
});

describe('best score storage', () => {
  it('reads back what it wrote and survives blocked storage', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => void values.set(k, v) };
    writeBest(storage, 23);
    expect(readBest(storage)).toBe(23);
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => writeBest(blocked, 4)).not.toThrow();
    expect(readBest(blocked)).toBe(0);
    expect(readBest(undefined)).toBe(0);
  });
});
