import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LifeAtlas } from './atlas';
import { createWorld, seeded, tick, type Moru } from './behaviour';
import { BACK_FEET, LANE_DY, LOBBY_SEP, lobbyTickMs } from './lobby-canvas';
import { openLobby, tend } from './presence';

const atlas = JSON.parse(readFileSync('public/brand/moru-life.json', 'utf8')) as LifeAtlas;

/**
 * Per drawn frame, the body as the lobby canvas places it (`lobby-canvas.ts`, `compose`): the cell at whole pixels,
 * mirrored for a Moru facing left, and the pose's body-fill middle in it.
 */
const drawn = (m: Moru) => {
  const id = m.facing < 0 && atlas.clips[`${m.clip}~left`] ? `${m.clip}~left` : m.clip, f = atlas.clips[id].f[m.frame];
  const X = Math.round(m.x), Y = Math.round(BACK_FEET + m.depth * LANE_DY - m.height) - 100;
  return { x: m.facing > 0 ? X + f.cx : X + 137 - f.cx, y: Y + f.cy, clip: m.clip, frame: m.frame, facing: m.facing, depth: m.depth };
};

describe('lobby motion, frame by frame', () => {
  for (const width of [1432, 1360, 1840]) {
    it(`moves no body more than 2px between frames beyond its clip's own drawn move, on a ${width}px floor`, () => {
      const world = createWorld({ atlas, width, rand: seeded(width + 1), busyMax: 2, sep: LOBBY_SEP, extra: 1 });
      const presence = openLobby(world, 12);
      const last = new Map<Moru, ReturnType<typeof drawn>>();
      let worst = 0, boundaries = 0, doors = 0, walks = 0;
      const over: string[] = [];
      // On the lobby's own clock: 8 Hz while somebody walks, 4 Hz otherwise.
      for (let t = 0, dt = 125; t < 600_000; t += dt, dt = lobbyTickMs(world)) {
        tick(world, dt);
        tend(world, presence);
        for (const m of world.morus) {
          const now = drawn(m), was = last.get(m);
          last.set(m, now);
          if (!was || (was.clip === now.clip && was.frame === now.frame && was.facing === now.facing)) continue;
          // The clip's own drawn move, over the poses a slower tick passed over: the change of its pose's body middle, and
          // what its steps carry the body; the rest is what drawing at whole pixels adds, and any jump.
          const sameClip = was.clip === now.clip && now.frame > was.frame && was.facing === now.facing;
          const authored = sameClip ? (() => {
            const id = (c: string) => (m.facing < 0 && atlas.clips[`${c}~left`] ? `${c}~left` : c);
            const a = atlas.clips[id(was.clip)].f[was.frame], b = atlas.clips[id(now.clip)].f[now.frame];
            const travel = atlas.clips[now.clip].travel;
            const carried = travel ? m.facing * (travel[now.frame] - travel[was.frame]) * (m.cur.scale ?? 1) : 0;
            // A step that changes lane carries the body half a lane deeper over its poses.
            return { x: (b.cx - a.cx) * m.facing + carried, y: b.cy - a.cy + (now.depth - was.depth) * LANE_DY };
          })() : { x: 0, y: 0 };
          // A turn ends on the neutral facing the other way: its last pose and the mirrored neutral are one picture.
          const residual = Math.hypot(now.x - was.x - authored.x, now.y - was.y - authored.y);
          if (!sameClip) boundaries++;
          if (m.door) doors++;
          if (now.clip === 'step') walks++;
          if (residual > worst) worst = residual;
          if (residual > 2 && over.length < 6) over.push(`${t} ${m.id} ${was.clip}:${was.frame}->${now.clip}:${now.frame} ${residual.toFixed(2)}`);
        }
      }
      expect(over).toEqual([]);
      expect(worst).toBeLessThanOrEqual(2);
      expect(boundaries).toBeGreaterThan(200);
      expect(doors).toBeGreaterThan(20);
      expect(walks).toBeGreaterThan(200);
    });
  }
});
