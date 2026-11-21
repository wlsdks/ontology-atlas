import { describe, expect, it } from 'vitest';

import {
  BAND,
  BOUNCE,
  FEET,
  HEAD,
  ITEM,
  REACH,
  ROUND_MS,
  STEP_MS,
  bugShare,
  catches,
  clipTimeline,
  fallMs,
  fitTimeline,
  headLine,
  multiplierFor,
  newRound,
  poseAt,
  readBest,
  spawnGap,
  steer,
  stepRound,
  topSpeed,
  writeBest,
  type Item,
  type ItemKind,
  type Mover,
  type Round,
  type RoundEvent,
} from './moru-play';

const FIELD = { width: 680, floor: 340 };
const HEAD_LINE = headLine(FIELD.floor);
const isPower = (item: Item) => item.kind === 'magnet' || item.kind === 'slow';

/** An item just above Moru's head at `x`, so the next step lands it in his arms. */
function dropAbove(round: Round, kind: ItemKind, x: number, y = HEAD_LINE - 1): Item {
  const item: Item = { id: round.nextId++, kind, x, y, px: x, py: y, homeX: x, age: 0 };
  round.items.push(item);
  return item;
}

/** A round with nothing scheduled to fall, for tests that place every item by hand. */
function quietRound(): Round {
  return { ...newRound(1), spawnIn: Infinity, powerIn: Infinity };
}

function step(round: Round, x: number, ms = STEP_MS): RoundEvent[] {
  const events: RoundEvent[] = [];
  for (let t = 0; t < ms - 1e-6; t += STEP_MS) events.push(...stepRound(round, STEP_MS, FIELD, x));
  return events;
}

/**
 * Plays a whole round with a simple player who walks toward the lowest good drop and steps away
 * from a bug about to land on him. A distracted player stands still one moment in three.
 */
function botRound(seed: number, distracted = false, away = false) {
  const round = newRound(seed);
  let moru: Mover = { x: FIELD.width / 2, v: 0, facing: 1 };
  const events: RoundEvent[] = [];
  const spawns: Array<{ t: number; x: number; kind: ItemKind }> = [];
  while (!round.over) {
    const good = round.items.filter((item) => item.kind !== 'bug').sort((a, b) => b.y - a.y);
    const danger = round.items.find((item) => item.kind === 'bug' && item.y > HEAD_LINE - 90 && Math.abs(item.x - moru.x) < REACH + 20);
    let target = good[0]?.x ?? moru.x;
    if (danger) target = danger.x > moru.x ? danger.x - REACH * 2.2 : danger.x + REACH * 2.2;
    if (distracted && Math.floor(round.t / 4000) % 3 === 2) target = moru.x;
    moru = away ? { x: -1000, v: 0, facing: 1 } : steer(moru, STEP_MS, { target }, 64, FIELD.width - 64, topSpeed(FIELD.width));
    const before = round.nextId;
    events.push(...stepRound(round, STEP_MS, FIELD, moru.x));
    for (const item of round.items) if (item.id >= before) spawns.push({ t: round.t, x: item.x, kind: item.kind });
  }
  return { round, events, spawns };
}

describe('catch detection', () => {
  it('catches an item over Moru in the band below his head, and nothing outside it', () => {
    expect(catches({ x: 300, y: HEAD_LINE + 4 }, 300, FIELD.floor)).toBe(true);
    expect(catches({ x: 300 + REACH, y: HEAD_LINE + 4 }, 300, FIELD.floor)).toBe(true);
    expect(catches({ x: 300 + REACH + 1, y: HEAD_LINE + 4 }, 300, FIELD.floor)).toBe(false);
    expect(catches({ x: 300, y: HEAD_LINE - 1 }, 300, FIELD.floor)).toBe(false);
    expect(catches({ x: 300, y: HEAD_LINE + BAND + 1 }, 300, FIELD.floor)).toBe(false);
  });

  it('grows the arms and the head line with Moru when he is drawn at twice his cell', () => {
    const headAt2x = FIELD.floor - (FEET - HEAD) * 2;
    expect(catches({ x: 300 + REACH * 2, y: headAt2x + 4 }, 300, FIELD.floor, 2)).toBe(true);
    expect(catches({ x: 300, y: headAt2x - 2 }, 300, FIELD.floor, 2)).toBe(false);
  });
});

describe('scoring and the combo', () => {
  it('scores ten a catch and raises the multiplier at five, ten and fifteen in a row, up to ×4', () => {
    const round = quietRound();
    const points: number[] = [];
    const tiers: number[] = [];
    for (let i = 0; i < 22; i += 1) {
      dropAbove(round, 'note', 300);
      for (const event of step(round, 300, 50)) {
        if (event.type === 'catch') points.push(event.points);
        if (event.type === 'tier') tiers.push(event.multiplier);
      }
    }
    expect(points.slice(0, 4)).toEqual([10, 10, 10, 10]);
    expect(points[4]).toBe(20);
    expect(points[9]).toBe(30);
    expect(points[14]).toBe(40);
    expect(points[21]).toBe(40);
    expect(tiers).toEqual([2, 3, 4]);
    expect(round.combo).toBe(22);
    expect(round.score).toBe(points.reduce((a, b) => a + b, 0));
    expect([0, 4, 5, 9, 10, 15, 99].map(multiplierFor)).toEqual([1, 1, 2, 2, 3, 4, 4]);
  });

  it('makes the golden star worth five times a note, multiplied like any catch', () => {
    const round = quietRound();
    round.combo = 9;
    dropAbove(round, 'gold', 300);
    const caught = step(round, 300, 50).find((event) => event.type === 'catch');
    expect(caught).toMatchObject({ kind: 'gold', points: 150, multiplier: 3 });
  });

  it('breaks the combo when a note, heart or star reaches the floor, but not for a missed bonus', () => {
    const round = quietRound();
    round.combo = 7;
    dropAbove(round, 'gold', 40, FIELD.floor - 1);
    step(round, 600, 50);
    expect(round.combo).toBe(7);
    dropAbove(round, 'heart', 40, FIELD.floor - 1);
    const events = step(round, 600, 50);
    expect(events).toContainEqual(expect.objectContaining({ type: 'miss', kind: 'heart', broke: true }));
    expect(round.combo).toBe(0);
    expect(round.lives).toBe(3);
  });
});

describe('lives', () => {
  it('takes a life and the combo for a caught bug, shrugs off one straight after, and ends on the third', () => {
    const round = quietRound();
    round.combo = 12;
    dropAbove(round, 'bug', 300);
    expect(step(round, 300, 50)).toContainEqual(expect.objectContaining({ type: 'hit', lives: 2 }));
    expect(round.combo).toBe(0);
    // A bug right behind the first passes through while Moru recovers.
    dropAbove(round, 'bug', 300);
    expect(step(round, 300, 50).some((event) => event.type === 'hit')).toBe(false);
    step(round, 900, 1000);
    dropAbove(round, 'bug', 300);
    step(round, 300, 50);
    step(round, 900, 1000);
    dropAbove(round, 'bug', 300);
    expect(step(round, 300, 50)).toContainEqual({ type: 'end', reason: 'lives' });
    expect(round.over).toBe('lives');
    expect(round.lives).toBe(0);
    // A finished round does not move.
    expect(stepRound(round, STEP_MS, FIELD, 300)).toEqual([]);
  });

  it('lets a bug that misses Moru fall away without cost', () => {
    const round = quietRound();
    dropAbove(round, 'bug', 40, FIELD.floor - 1);
    expect(step(round, 600, 50)).toContainEqual(expect.objectContaining({ type: 'dodge' }));
    expect(round.lives).toBe(3);
  });
});

describe('power-ups', () => {
  it('runs the magnet for five seconds, pulling good drops toward Moru but not bugs', () => {
    const round = quietRound();
    dropAbove(round, 'magnet', 300);
    expect(step(round, 300, 50)).toContainEqual({ type: 'power', kind: 'magnet', ms: 5000 });
    const note = dropAbove(round, 'note', 100, 0);
    const bug = dropAbove(round, 'bug', 140, 0);
    step(round, 600, 500);
    expect(note.x).toBeGreaterThan(400);
    expect(bug.x).toBe(140);
    expect(step(round, 600, 4600)).toContainEqual({ type: 'power-end', kind: 'magnet' });
    expect(round.power).toBeNull();
  });

  it('halves the falling speed for four seconds under slow motion', () => {
    const fast = quietRound();
    const a = dropAbove(fast, 'note', 40, 0);
    step(fast, 600, 500);
    const slow = quietRound();
    slow.power = { kind: 'slow', left: 4000 };
    const b = dropAbove(slow, 'note', 40, 0);
    step(slow, 600, 500);
    expect(b.y / a.y).toBeCloseTo(0.5, 2);
  });

  it('never has two powers at once: none falls while one runs or is on its way', () => {
    for (const seed of [3, 5, 17, 29]) {
      const round = newRound(seed);
      let x = 340;
      let powers = 0;
      while (!round.over) {
        const power = round.items.find(isPower);
        x = power ? power.x : x;
        powers += stepRound(round, STEP_MS, FIELD, x).filter((event) => event.type === 'power').length;
        const falling = round.items.filter(isPower).length;
        expect(falling + (round.power ? 1 : 0)).toBeLessThanOrEqual(1);
      }
      expect(powers).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('the difficulty curve', () => {
  it('starts gentle and climbs on a curve that is steepest near the end', () => {
    expect(fallMs(0)).toBe(2600);
    expect(fallMs(ROUND_MS)).toBe(1250);
    expect(spawnGap(0)).toBe(950);
    expect(spawnGap(ROUND_MS)).toBe(360);
    const samples = [0, 15, 30, 45, 60].map((s) => fallMs(s * 1000));
    const drops = samples.slice(1).map((ms, i) => samples[i] - ms);
    expect(drops.every((d, i) => i === 0 || d > drops[i - 1])).toBe(true);
    expect(bugShare(2000)).toBe(0);
    expect(bugShare(ROUND_MS)).toBeGreaterThan(bugShare(20_000));
  });

  it('drops nearly twice as often in the last ten seconds as in the first ten, with more bugs', () => {
    // Moru stands off the field, so nothing he does changes what falls.
    const { spawns, round } = botRound(42, false, true);
    expect(round.over).toBe('time');
    const early = spawns.filter((s) => s.t < 10_000);
    const late = spawns.filter((s) => s.t >= 50_000);
    expect(late.length).toBeGreaterThanOrEqual(early.length * 1.8);
    expect(late.filter((s) => s.kind === 'bug').length).toBeGreaterThan(early.filter((s) => s.kind === 'bug').length);
  });

  it('never drops a bug right beside the drop just before it', () => {
    for (const seed of [2, 9, 13]) {
      const { spawns } = botRound(seed, false, true);
      spawns.forEach((s, i) => {
        const prev = spawns[i - 1];
        if (s.kind !== 'bug' || !prev || s.t - prev.t >= 600) return;
        expect(Math.abs(s.x - prev.x)).toBeGreaterThanOrEqual(ITEM * 1.4 - 1e-6);
      });
    }
  });
});

describe('a whole round', () => {
  it('lasts one minute and replays exactly from the same seed', () => {
    const a = botRound(11);
    const b = botRound(11);
    expect(a.round.over).toBe('time');
    expect(a.round.t).toBeGreaterThanOrEqual(ROUND_MS);
    expect(a.round.t).toBeLessThan(ROUND_MS + STEP_MS * 2);
    expect(b.round.score).toBe(a.round.score);
    expect(b.events).toEqual(a.events);
  });

  it('rewards attention: a steady player outscores a distracted one and reaches ×4', () => {
    const steady = botRound(7);
    const distracted = botRound(7, true);
    expect(steady.round.score).toBeGreaterThan(distracted.round.score);
    expect(steady.round.bestCombo).toBeGreaterThanOrEqual(15);
    expect(steady.round.caught).toBeGreaterThan(40);
  });
});

describe('steering', () => {
  it('eases in, holds a constant top speed, and brakes onto the target without overshoot', () => {
    const top = topSpeed(680);
    let m: Mover = { x: 100, v: 0, facing: 1 };
    const path: Mover[] = [];
    for (let t = 0; t < 3000; t += 16) {
      m = steer(m, 16, { target: 600 }, 64, 616, top);
      path.push(m);
    }
    expect(m).toMatchObject({ x: 600, v: 0 });
    expect(Math.max(...path.map((p) => p.x))).toBeLessThanOrEqual(600);
    const speeds = path.map((p) => p.v);
    expect(speeds[0]).toBeLessThan(top / 4);
    expect(Math.max(...speeds)).toBeCloseTo(top, 0);
    // While moving, no frame changes speed by more than the easing allows.
    const stop = speeds.indexOf(0);
    const jumps = speeds.slice(1, stop).map((v, i) => Math.abs(v - speeds[i]));
    expect(Math.max(...jumps)).toBeLessThanOrEqual(top * 6 * 0.016 + 1e-6);
    // The frame that comes to rest covers under two pixels, so the stop cannot be seen as a snap.
    expect(path[stop].x - path[stop - 1].x).toBeLessThan(2);
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

  it('keeps the hurt reaction short and fits the wave to the countdown exactly', () => {
    expect(clipTimeline('hurt').total).toBeLessThan(1800);
    expect(fitTimeline(clipTimeline('wave'), 3000).total).toBe(3000);
    expect(clipTimeline('clap', 1.35).total).toBeLessThan(clipTimeline('clap').total);
  });

  it('builds the travel bounce from the hop clip, under half a second a bounce', () => {
    expect(BOUNCE.frames).toHaveLength(18);
    expect(BOUNCE.total).toBeGreaterThan(350);
    expect(BOUNCE.total).toBeLessThan(500);
  });
});

describe('best score storage', () => {
  it('reads back what it wrote and survives blocked storage', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => void values.set(k, v) };
    writeBest(storage, 230);
    expect(readBest(storage)).toBe(230);
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
