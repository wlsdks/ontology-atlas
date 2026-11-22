import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LifeAtlas } from './atlas';
import { centre, createWorld, seeded, standing, tick, type Moru, type World } from './behaviour';
import { BACK_FEET, LANE_DY, LOBBY_SEP } from './lobby-canvas';
import { NAPPING_REACH, STANDING_REACH, fixtureBoxes, lobbyClearance, lobbyFixtures, lobbySpots, overlaps, type FloorBox } from './lobby-props';
import { crewSize, openLobby, tend } from './presence';

const atlas = JSON.parse(readFileSync('public/brand/moru-life.json', 'utf8')) as LifeAtlas;
const FRONT_FEET = BACK_FEET + 2 * LANE_DY;
/** The floors of the 1440, 1512 and 1920 windows. */
const FLOORS = [1296, 1368, 1776];

/** Where a Moru's current clip is drawn, in floor pixels: its cell's box, mirrored for one facing left. */
function drawnBox(m: Moru): FloorBox {
  const [bx, by, bw, bh] = atlas.clips[m.clip].box;
  const X = Math.round(m.x), Y = Math.round(BACK_FEET + m.depth * LANE_DY - m.height) - 100;
  return m.facing > 0 ? { x0: X + bx, y0: Y + by, x1: X + bx + bw, y1: Y + by + bh } : { x0: X + 137 - bx - bw, y0: Y + by, x1: X + 137 - bx, y1: Y + by + bh };
}

/** On the fixture it uses: at its spot, or turned there, which carries the body 12px. */
const atItsSpot = (world: World, m: Moru) => world.spots.some(s => Math.abs(s.x - centre(m)) <= 14 && Math.abs(s.lane - m.depth) < 0.1);

/**
 * Runs a lobby the way its canvas does on the rooms' stage: lively for 8 s, then turns of 3 s between rests of 9 s,
 * and lively again each minute as on a return to the window. Returns every time a Moru stood on a fixture away from
 * its spot.
 */
function run(width: number, seed: number, seconds: number) {
  const clearance = lobbyClearance(width, BACK_FEET, LANE_DY, FRONT_FEET, atlas.props);
  const world = createWorld({
    atlas, width, lanes: 3, rand: seeded(seed), busyMax: 2, sep: LOBBY_SEP, extra: 1, spots: lobbySpots(width),
    standsClear: (at, depth, napping) => clearance(at, depth, napping ? NAPPING_REACH : STANDING_REACH),
  });
  const presence = openLobby(world, crewSize(6));
  const boxes = fixtureBoxes(width, BACK_FEET, FRONT_FEET, atlas.props);
  const found: string[] = [];
  const DT = 150;
  for (let t = 0; t < seconds * 1000; t += DT) {
    const since = t % 60_000, lively = since < 8000, turn = !lively && (since - 8000) % 12_000 < 3000;
    world.calm = !lively && !turn;
    world.busyMax = lively ? 2 : turn ? 1 : 0;
    world.breathe = world.calm && (since - 8000) % 12_000 === 9000;
    tick(world, DT);
    if (lively) tend(world, presence);
    for (const m of world.morus) {
      if (m.door || !standing(m) || atItsSpot(world, m)) continue;
      const box = drawnBox(m), hit = boxes.find(b => overlaps(box, b));
      if (hit) found.push(`${(t / 1000).toFixed(1)} s: ${m.id} ${m.clip} at ${Math.round(centre(m))} lane ${m.depth} on the ${hit.name}`);
    }
  }
  return { found, entered: world.stats.entered };
}

describe('lobby fixtures', () => {
  it('reaches round every standing pose and the nap', () => {
    for (const clip of ['rest', 'blink', 'sway', 'look-ahead', 'look-back', 'yawn', 'nap']) {
      const [bx, by, bw] = atlas.clips[clip].box, reach = clip === 'nap' ? NAPPING_REACH : STANDING_REACH;
      // Facing right the centre is at 74 in the cell, facing left at 62 of the mirrored cell.
      expect(74 - bx, clip).toBeLessThanOrEqual(reach.left);
      expect(bx + bw - 74, clip).toBeLessThanOrEqual(reach.right);
      expect(100 - by, clip).toBeLessThanOrEqual(reach.up);
    }
  });

  it('hangs the window and the board between the fixtures, clear of every Moru at its spot', () => {
    for (const width of FLOORS) {
      const boxes = fixtureBoxes(width, BACK_FEET, FRONT_FEET, atlas.props);
      const { bench, mat, crate } = lobbyFixtures(width);
      const window = boxes.find(b => b.name === 'window')!, board = boxes.find(b => b.name === 'board')!;
      expect(window.x0).toBeGreaterThan(bench);
      expect(window.x1).toBeLessThan(mat);
      expect(board.x0).toBeGreaterThan(mat);
      expect(board.x1).toBeLessThan(crate);
      for (const spot of lobbySpots(width)) {
        const reach = spot.clip === 'nap' ? NAPPING_REACH : STANDING_REACH, feet = BACK_FEET + spot.lane * LANE_DY;
        const moru = { x0: spot.x - reach.left, y0: feet - reach.up, x1: spot.x + reach.right, y1: feet };
        expect(overlaps(moru, window), `${spot.clip} at ${width}`).toBe(false);
        expect(overlaps(moru, board), `${spot.clip} at ${width}`).toBe(false);
      }
    }
  });

  it('never leaves a Moru standing on a fixture away from the spot it uses it from', () => {
    for (const width of FLOORS) for (const seed of [3, 11]) {
      const { found, entered } = run(width, seed, 360);
      expect(found.slice(0, 5), `${width}px, seed ${seed}`).toEqual([]);
      expect(entered, `${width}px, seed ${seed}`).toBeGreaterThan(0);
    }
  });
});
