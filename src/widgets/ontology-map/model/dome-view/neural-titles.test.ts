import { describe, expect, it } from 'vitest';

import { clusterRadius, clusterVolumeAnchors } from './cluster-volume';
import { standingDomainTitles, type TitleCandidate } from './neural-titles';
import { DOME_PITCH_DEFAULT, DOME_YAW_DEFAULT } from './orbit';
import { DOME_FIT_RADIUS, DOME_FOCAL } from './projection';

const TITLE_W = 150;
const TITLE_H = 40;
const SCREEN_PX_PER_UNIT = 2.4;

function candidatesAt(members: number[], yaw: number): TitleCandidate[] {
  const radii = members.map(clusterRadius);
  const { anchors } = clusterVolumeAnchors(radii, DOME_YAW_DEFAULT, DOME_PITCH_DEFAULT);
  const reach = Math.max(...anchors.map((a, i) => Math.hypot(a.x, a.y, a.z) + radii[i]));
  const norm = DOME_FIT_RADIUS / reach;
  const [cy, sy, cp, sp] = [Math.cos(yaw), Math.sin(yaw), Math.cos(DOME_PITCH_DEFAULT), Math.sin(DOME_PITCH_DEFAULT)];
  return anchors.map((a, i) => {
    const [px, py, pz] = [a.x * norm, a.y * norm, a.z * norm];
    const x = px * cy - pz * sy;
    const zr = px * sy + pz * cy;
    const z = -py * sp + zr * cp;
    const s = DOME_FOCAL / (DOME_FOCAL + z);
    const disc = { x: x * s * SCREEN_PX_PER_UNIT, y: -(py * cp + zr * sp) * s * SCREEN_PX_PER_UNIT, r: radii[i] * norm * s * SCREEN_PX_PER_UNIT };
    const bottom = disc.y - disc.r - 4;
    return {
      id: `d${i}`,
      box: { minX: disc.x - TITLE_W / 2, maxX: disc.x + TITLE_W / 2, minY: bottom - TITLE_H, maxY: bottom },
      disc,
      depth: z,
    };
  });
}

describe('standingDomainTitles', () => {
  const sizes = [24, 24, 18, 25, 40, 3, 17, 9, 26, 5, 12];

  it.each([4, 11])('keeps %i clusters\' standing titles off each other and off other clusters at 12 yaws', (count) => {
    for (let k = 0; k < 12; k += 1) {
      const candidates = candidatesAt(sizes.slice(0, count), DOME_YAW_DEFAULT + (k * Math.PI) / 6);
      const standing = candidates.filter((c) => standingDomainTitles(candidates).has(c.id));
      expect(standing.length).toBeGreaterThan(0);
      for (const a of standing) {
        for (const b of standing) {
          if (a === b) continue;
          const meet = a.box.minX < b.box.maxX && a.box.maxX > b.box.minX && a.box.minY < b.box.maxY && a.box.maxY > b.box.minY;
          expect(meet, `${a.id} and ${b.id} at turn ${k}`).toBe(false);
        }
        for (const o of candidates) {
          if (o === a) continue;
          const nx = Math.min(Math.max(o.disc.x, a.box.minX), a.box.maxX);
          const ny = Math.min(Math.max(o.disc.y, a.box.minY), a.box.maxY);
          expect(Math.hypot(o.disc.x - nx, o.disc.y - ny), `${a.id} on ${o.id} at turn ${k}`).toBeGreaterThanOrEqual(o.disc.r);
        }
      }
    }
  });

  it.each([4, 9])('names every one of %i clusters at the rest pose', (count) => {
    const candidates = candidatesAt([17, 12, 14, 15, 7, 18, 15, 16, 10].slice(0, count), DOME_YAW_DEFAULT);
    expect(standingDomainTitles(candidates).size).toBe(count);
  });

  it('lets the nearer of two colliding titles stand', () => {
    const near: TitleCandidate = { id: 'near', box: { minX: 0, minY: 0, maxX: 100, maxY: 20 }, disc: { x: 50, y: 200, r: 10 }, depth: -5 };
    const far: TitleCandidate = { id: 'far', box: { minX: 50, minY: 10, maxX: 150, maxY: 30 }, disc: { x: 400, y: 200, r: 10 }, depth: 5 };
    expect([...standingDomainTitles([far, near])]).toEqual(['near']);
  });
});
