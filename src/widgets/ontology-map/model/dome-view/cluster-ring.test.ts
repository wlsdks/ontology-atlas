import { describe, expect, it } from 'vitest';

import { CLUSTER_TITLE_BAND, clusterRadius, clusterRingAnchors } from './cluster-ring';
import { DOME_PITCH_DEFAULT, DOME_YAW_DEFAULT } from './orbit';
import { DOME_FIT_RADIUS, DOME_FOCAL } from './projection';

const MODEL_UNIT = { centerX: 0, centerY: 0, unit: 1 };

function projectedDiscs(members: number[], yaw: number) {
  const radii = members.map(clusterRadius);
  const anchors = clusterRingAnchors(radii, DOME_YAW_DEFAULT, DOME_PITCH_DEFAULT);
  const reach = Math.max(...anchors.map((a, i) => Math.hypot(a.x, a.y, a.z) + radii[i]));
  const norm = DOME_FIT_RADIUS / reach;
  const [cy, sy, cp, sp] = [Math.cos(yaw), Math.sin(yaw), Math.cos(DOME_PITCH_DEFAULT), Math.sin(DOME_PITCH_DEFAULT)];
  return anchors.map((a, i) => {
    const [px, py, pz] = [a.x * norm, a.y * norm, a.z * norm];
    const x = px * cy - pz * sy;
    const zr = px * sy + pz * cy;
    const y = py * cp + zr * sp;
    const s = DOME_FOCAL / (DOME_FOCAL + (-py * sp + zr * cp));
    return { x: MODEL_UNIT.centerX + x * s, y: MODEL_UNIT.centerY - y * s, r: radii[i] * norm * s, band: CLUSTER_TITLE_BAND * norm * s };
  });
}

describe('clusterRingAnchors', () => {
  const sizes = [40, 3, 17, 1, 9, 26, 5, 12];

  it.each([2, 3, 4, 5, 6, 7, 8])('keeps %i unequal clusters apart at the rest pose, within a cluster and a title of each other', (count) => {
    const discs = projectedDiscs(sizes.slice(0, count), DOME_YAW_DEFAULT);
    let nearest = Infinity;
    for (let i = 0; i < discs.length; i += 1) {
      for (let j = i + 1; j < discs.length; j += 1) {
        const gap = Math.hypot(discs[i].x - discs[j].x, discs[i].y - discs[j].y) - discs[i].r - discs[j].r;
        expect(gap, `clusters ${i} and ${j}`).toBeGreaterThan(0);
        nearest = Math.min(nearest, gap);
      }
    }
    expect(nearest).toBeLessThan(2 * Math.min(...discs.map((d) => d.r)) + Math.max(...discs.map((d) => d.band)));
  });

  it('centres the rest pose', () => {
    const discs = projectedDiscs(sizes.slice(0, 5), DOME_YAW_DEFAULT);
    const left = Math.min(...discs.map((d) => d.x - d.r));
    const right = Math.max(...discs.map((d) => d.x + d.r));
    expect(Math.abs(left + right) / (right - left)).toBeLessThan(0.2);
  });

  it('leaves a title\'s band between two clusters that stand one above the other', () => {
    const discs = projectedDiscs([15, 15, 15, 15, 15, 15, 15, 15, 15], DOME_YAW_DEFAULT);
    for (let i = 0; i < discs.length; i += 1) {
      for (let j = 0; j < discs.length; j += 1) {
        const below = discs[j];
        const above = discs[i];
        if (i === j || below.y <= above.y || Math.abs(below.x - above.x) > above.r + below.r) continue;
        expect(below.y - below.r - (above.y + above.r), `${j} under ${i}`).toBeGreaterThan(below.band * 0.8);
      }
    }
  });

  it('keeps nine clusters on one ring and shares thirteen between two', () => {
    const heights = (count: number) => {
      const anchors = clusterRingAnchors(Array.from({ length: count }, () => clusterRadius(10)), DOME_YAW_DEFAULT, DOME_PITCH_DEFAULT);
      const perHeight = new Map<number, number>();
      for (const a of anchors) perHeight.set(Math.round(a.y), (perHeight.get(Math.round(a.y)) ?? 0) + 1);
      return [...perHeight.values()].sort((a, b) => b - a);
    };
    expect(heights(9)).toEqual([9]);
    expect(heights(13)).toEqual([7, 6]);
  });

  it('stacks more than twelve clusters into rings that stay apart', () => {
    const members = [...sizes, ...sizes, 4, 2];
    const discs = projectedDiscs(members, DOME_YAW_DEFAULT);
    for (let i = 0; i < discs.length; i += 1) {
      for (let j = i + 1; j < discs.length; j += 1) {
        expect(Math.hypot(discs[i].x - discs[j].x, discs[i].y - discs[j].y), `${i} ${j}`).toBeGreaterThan(discs[i].r + discs[j].r);
      }
    }
  });
});
