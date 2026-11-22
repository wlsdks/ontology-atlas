import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LifeAtlas } from './atlas';
import { addMoru, CALM_BLINK_MS, centre, createWorld, middle, raise, seeded, standing, tick, TRAVEL, type World } from './behaviour';
import { MOST_ON_FLOOR, nearestGap, openLobby, tend } from './presence';
import { pickLook } from './wardrobe';

const atlas = JSON.parse(readFileSync('public/brand/moru-life.json', 'utf8')) as LifeAtlas;
const STAND = new Set(['rest', 'blink', 'sway', 'look-ahead', 'look-back', 'nap', 'yawn']);
/** Where a Moru's body fill is drawn, in floor coordinates. */
const drawnAt = (world: World, id: string) => {
  const m = world.morus.find(o => o.id === id)!, f = world.atlas.clips[m.clip].f[m.frame];
  return [m.facing > 0 ? m.x + f.cx : m.x + 136 - f.cx, f.cy + m.depth * 26 - m.height];
};

/** Runs a floor like `scripts/brand/moru-cast/life/measure-life.mjs` and counts what a viewer would see as wrong. */
function measure(world: World, seconds: number, step?: (world: World) => void) {
  const DT = 100, pop = atlas.limits.air + 4;
  let pops = 0, piles = 0, overlaps = 0, ticks = 0;
  let prev = new Map(world.morus.map(m => [m.id, drawnAt(world, m.id)]));
  for (let t = 0; t < seconds * 1000; t += DT) {
    if (Math.floor(t / 9000) > Math.floor((t - DT) / 9000)) {
      const k = Math.floor(t / 9000);
      raise(world, `m${k % 2}`, ['commit', 'stuck', 'merge', 'waiting'][k % 4]);
    }
    tick(world, DT);
    step?.(world);
    ticks++;
    // A pile: three standing bodies within 60px, in any lanes.
    const xs = world.morus.filter(m => !m.plan.length && STAND.has(m.clip) && m.clip !== 'yawn').map(centre).sort((a, b) => a - b);
    for (let i = 2; i < xs.length; i++) if (xs[i] - xs[i - 2] < 60) { piles++; break; }
    // An overlap: two bodies in one lane nearer than 70px.
    for (const a of world.morus) for (const b of world.morus) if (a.id < b.id && Math.abs(a.depth - b.depth) < 0.5 && Math.abs(centre(a) - centre(b)) < 70) overlaps++;
    // A pop: a Moru drawn further in one tick than the catalogue's airborne p90 plus the fastest travel.
    const now = new Map(world.morus.map(m => [m.id, drawnAt(world, m.id)]));
    for (const [id, [x, y]] of now) {
      const was = prev.get(id);
      if (was && Math.hypot(x - was[0], y - was[1]) > pop) pops++;
    }
    prev = now;
  }
  return { pops, piles, overlaps, ticks };
}

describe('Moru life', () => {
  it('shows twelve Moru for ten minutes with no pop, pile or overlap', () => {
    const world = createWorld({ atlas, width: 1920, lanes: 3, rand: seeded(7), busyMax: 5 });
    for (let i = 0; i < 12; i++) addMoru(world, { id: `m${i}`, x: 60 + i * ((1920 - 180) / 12), lane: i % 3, ...pickLook(world.rand, world.morus), room: i < 2 });
    const seen = measure(world, 600);
    expect(seen).toEqual({ pops: 0, piles: 0, overlaps: 0, ticks: 6000 });
    expect(world.stats.interactions).toBeGreaterThan(10);
  });

  it('cuts a real event in on a room Moru within 400 ms', () => {
    const world = createWorld({ atlas, width: 1512, rand: seeded(3), busyMax: 5 });
    for (let i = 0; i < 6; i++) addMoru(world, { id: `m${i}`, x: 80 + i * 230, lane: i % 3, room: i < 2 });
    measure(world, 120);
    expect(world.stats.eventLatency.length).toBeGreaterThan(10);
    expect(Math.max(...world.stats.eventLatency)).toBeLessThanOrEqual(400);
  });

  it('plays only the clips the lobby ships', () => {
    const world = createWorld({ atlas, width: 1512, rand: seeded(11), busyMax: 2, sep: 150, extra: 1 });
    const presence = openLobby(world, 12);
    measure(world, 300, w => tend(w, presence));
    for (const clip of Object.keys(world.stats.actions)) expect(atlas.clips[clip], clip).toBeDefined();
    expect([...TRAVEL].every(clip => atlas.clips[clip])).toBe(true);
  });
});

describe('the lobby crew', () => {
  // The floor at the 1,512, 1,440 and 1,920px windows, drawn at Moru's own scale.
  for (const width of [1432, 1360, 1840]) {
    it(`keeps at most five on a ${width}px floor, far apart, and lets them come and go by walking`, () => {
      const world = createWorld({ atlas, width, rand: seeded(width), busyMax: 2, sep: 150, extra: 1 });
      const presence = openLobby(world, 12);
      let most = 0, fewest = Infinity, gap = Infinity, walking = 0;
      const sizes = new Set<number>();
      const seen = measure(world, 600, w => {
        tend(w, presence);
        const visible = w.morus.filter(m => centre(m) > -40 && centre(m) < w.width + 40);
        most = Math.max(most, visible.length);
        fewest = Math.min(fewest, visible.length);
        sizes.add(w.morus.length);
        // Standing Moru keep a body and a half apart; only two playing together stand flipper to flipper.
        const standing = w.morus.filter(m => !m.door && !m.plan.length && STAND.has(m.clip));
        for (const a of standing) for (const b of standing) if (a !== b && a.pairs[0] !== b.id && b.pairs[0] !== a.id) gap = Math.min(gap, Math.abs(middle(a) - middle(b)));
        walking = Math.max(walking, w.morus.filter(m => m.clip === 'step' || TRAVEL.has(m.clip)).length);
      });
      expect(seen.pops).toBe(0);
      expect(seen.overlaps).toBe(0);
      expect(most).toBeLessThanOrEqual(MOST_ON_FLOOR);
      expect(fewest).toBeGreaterThanOrEqual(1);
      expect(sizes.size).toBeGreaterThan(1);
      expect(world.stats.entered).toBeGreaterThan(2);
      expect(world.stats.left).toBeGreaterThan(2);
      expect(gap).toBeGreaterThanOrEqual(146);
      expect(walking).toBeLessThanOrEqual(3);
      expect(nearestGap(world)).toBeGreaterThan(0);
    });
  }

  it('dresses a newcomer unlike anybody on the floor', () => {
    const rand = seeded(5), present = [pickLook(rand, [])];
    for (let i = 0; i < 4; i++) present.push(pickLook(rand, present));
    expect(new Set(present.map(look => look.palette)).size).toBe(5);
    expect(new Set(present.map(look => look.wear.head)).size).toBe(5);
  });

  it('rests a calm floor: walks end at a stride, everybody stands, and only a rare blink moves it', () => {
    const world = createWorld({ atlas, width: 1512, rand: seeded(5), busyMax: 2, extra: 1 });
    for (let i = 0; i < 4; i++) addMoru(world, { id: `m${i}`, x: 80 + i * 340, lane: i % 3, ...pickLook(world.rand, world.morus) });
    // Lively first, until somebody is walking.
    for (let t = 0; t < 60_000 && !world.morus.some(m => m.clip === 'step'); t += 100) tick(world, 100);
    expect(world.morus.some(m => m.clip === 'step')).toBe(true);
    world.calm = true;
    world.busyMax = 0;
    world.extra = 0;
    const strideEnds: boolean[] = [];
    let settledAt: number | null = null;
    const started: string[] = [];
    let prev = new Map(world.morus.map(m => [m.id, m.clip]));
    for (let t = 0; t < 120_000; t += 100) {
      const walking = new Map(world.morus.filter(m => m.clip === 'step').map(m => [m.id, m.i]));
      tick(world, 100);
      // A walker who stopped did so from his stride's last pose, never mid-stride, and stands.
      for (const m of world.morus) if (walking.has(m.id) && m.clip !== 'step') strideEnds.push(walking.get(m.id) === atlas.clips.step.n - 1 && standing(m));
      if (settledAt === null && world.morus.every(standing)) settledAt = t;
      if (settledAt !== null) for (const m of world.morus) if (m.clip !== prev.get(m.id) && m.clip !== 'rest') started.push(m.clip);
      prev = new Map(world.morus.map(m => [m.id, m.clip]));
    }
    expect(settledAt).not.toBeNull();
    expect(settledAt!).toBeLessThan(6000);
    expect(strideEnds.length).toBeGreaterThan(0);
    expect(strideEnds.every(Boolean)).toBe(true);
    // Only blinks, at most one per CALM_BLINK_MS across the floor.
    expect(new Set(started)).toEqual(new Set(['blink']));
    expect(started.length).toBeLessThanOrEqual(Math.ceil((120_000 - settledAt!) / CALM_BLINK_MS));
  });
});
