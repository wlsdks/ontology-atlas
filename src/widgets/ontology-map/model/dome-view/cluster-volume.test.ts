import { describe, expect, it } from 'vitest';

import { CLUSTER_GAP, CLUSTER_TITLE_ASPECT, CLUSTER_TITLE_SHARE, clusterRadius, clusterVolumeAnchors } from './cluster-volume';
import { DOME_PITCH_DEFAULT, DOME_YAW_DEFAULT } from './orbit';
import { DOME_FIT_RADIUS, projectWithTrig } from './projection';
import type { DomeModel } from './types';

const MODEL = { centerX: 0, centerY: 0, unit: 1 } as Pick<DomeModel, 'centerX' | 'centerY' | 'unit'> as DomeModel;
const REST = [Math.cos(DOME_YAW_DEFAULT), Math.sin(DOME_YAW_DEFAULT), Math.cos(DOME_PITCH_DEFAULT), Math.sin(DOME_PITCH_DEFAULT)] as const;
/** The settling passes hold the title band and the drawn scale to within this share. */
const SETTLED = 0.01;

interface Disc {
  x: number;
  y: number;
  r: number;
  depth: number;
}

/** The clusters (and the loose group, last) as the rest pose draws them once the cloud is normalised, y up. */
function drawn(members: readonly number[], looseMembers = 0) {
  const radii = members.map(clusterRadius);
  const looseRadius = looseMembers > 0 ? clusterRadius(looseMembers) : 0;
  const { anchors, centre } = clusterVolumeAnchors(radii, DOME_YAW_DEFAULT, DOME_PITCH_DEFAULT, looseRadius);
  const points = looseMembers > 0 ? [...anchors, centre] : anchors;
  const all = looseMembers > 0 ? [...radii, looseRadius] : radii;
  const norm = DOME_FIT_RADIUS / Math.max(...points.map((a, i) => Math.hypot(a.x, a.y, a.z) + all[i]));
  const discs: Disc[] = points.map((a, i) => {
    const p = projectWithTrig(MODEL, { px: a.x * norm, py: a.y * norm, pz: a.z * norm }, ...REST);
    return { x: p.wx, y: -p.wy, r: all[i] * norm * p.s, depth: p.z };
  });
  const box = {
    left: Math.min(...discs.map((d) => d.x - d.r)),
    right: Math.max(...discs.map((d) => d.x + d.r)),
    bottom: Math.min(...discs.map((d) => d.y - d.r)),
    top: Math.max(...discs.map((d) => d.y + d.r)),
  };
  return { discs, box, gap: CLUSTER_GAP * norm, band: CLUSTER_TITLE_SHARE * (box.top - box.bottom) };
}

/** The distance from a box to a point. */
function boxToPoint(x0: number, x1: number, y0: number, y1: number, px: number, py: number): number {
  return Math.hypot(px - Math.min(Math.max(px, x0), x1), py - Math.min(Math.max(py, y0), y1));
}

/**
 * How much of the required room two clusters leave, 1 at exactly enough: `gap` between the discs,
 * between each title box (`band` tall, standing on its disc) and the other disc, and between the titles.
 */
function clearance(a: Disc, b: Disc, gap: number, band: number, bTitled = true): number {
  const halfWidth = (d: Disc) => Math.max(d.r, (CLUSTER_TITLE_ASPECT * band) / 2);
  const titleOf = (d: Disc) => [d.x - halfWidth(d), d.x + halfWidth(d), d.y + d.r, d.y + d.r + band] as const;
  const room = [Math.hypot(a.x - b.x, a.y - b.y) / (a.r + b.r + gap), boxToPoint(...titleOf(a), b.x, b.y) / (b.r + gap)];
  if (bTitled) {
    room.push(boxToPoint(...titleOf(b), a.x, a.y) / (a.r + gap));
    room.push(Math.max(Math.abs(a.x - b.x) / (halfWidth(a) + halfWidth(b) + gap), Math.abs(a.y + a.r - b.y - b.r) / (band + gap)));
  }
  return Math.min(...room);
}

const mixed = (count: number) => Array.from({ length: count }, (_, i) => [40, 3, 17, 1, 9, 26, 5, 12, 21, 7, 33, 14, 0][i % 13]);
const equal = (count: number) => Array.from({ length: count }, () => 15);

describe('clusterVolumeAnchors', () => {
  it.each([2, 4, 9, 13, 30])('keeps %i mixed clusters a gap apart, titles included', (count) => {
    const { discs, gap, band } = drawn(mixed(count));
    for (let i = 0; i < discs.length; i += 1) {
      for (let j = 0; j < discs.length; j += 1) {
        if (i !== j) expect(clearance(discs[i], discs[j], gap, band), `clusters ${i} and ${j}`).toBeGreaterThanOrEqual(1 - SETTLED);
      }
    }
  });

  it('keeps 200 mixed clusters a gap apart, where rows of titles no longer fit the window', () => {
    const { discs, gap } = drawn(mixed(200));
    for (let i = 0; i < discs.length; i += 1) {
      for (let j = i + 1; j < discs.length; j += 1) {
        const room = Math.hypot(discs[i].x - discs[j].x, discs[i].y - discs[j].y) / (discs[i].r + discs[j].r + gap);
        expect(room, `clusters ${i} and ${j}`).toBeGreaterThanOrEqual(1 - SETTLED);
      }
    }
  });

  it.each([2, 9, 30])('centres the rest pose of %i clusters', (count) => {
    const { box } = drawn(mixed(count));
    expect(Math.abs(box.left + box.right) / (box.right - box.left)).toBeLessThan(SETTLED);
    expect(Math.abs(box.top + box.bottom) / (box.top - box.bottom)).toBeLessThan(SETTLED);
  });

  it.each([4, 9, 13])('packs %i equal clusters into more than one row', (count) => {
    const { discs } = drawn(equal(count));
    const rows = new Set(discs.map((d) => Math.round(d.y / d.r)));
    expect(rows.size).toBeGreaterThan(1);
  });

  it('stands four like clusters round a loose group one to each quarter of the pack', () => {
    const { discs } = drawn([24, 24, 18, 25], 1);
    const titled = discs.slice(0, 4);
    const midX = (Math.min(...titled.map((d) => d.x - d.r)) + Math.max(...titled.map((d) => d.x + d.r))) / 2;
    const midY = (Math.min(...titled.map((d) => d.y - d.r)) + Math.max(...titled.map((d) => d.y + d.r))) / 2;
    const quarters = new Set(titled.map((d) => (d.x > midX ? 1 : 0) + (d.y > midY ? 2 : 0)));
    expect(quarters.size).toBe(4);
  });

  it('fills the middle of nine equal clusters', () => {
    const { discs, box } = drawn(equal(9));
    const midX = (box.left + box.right) / 2;
    const midY = (box.top + box.bottom) / 2;
    expect(discs.some((d) => Math.hypot(d.x - midX, d.y - midY) < 2 * d.r)).toBe(true);
  });

  it('stands nine equal clusters at four or more depths, no two screen neighbours at one depth', () => {
    const { discs, gap } = drawn(equal(9));
    const depthSpan = Math.max(...discs.map((d) => d.depth)) - Math.min(...discs.map((d) => d.depth));
    const sameDepth = (a: Disc, b: Disc) => Math.abs(a.depth - b.depth) < depthSpan * 1e-6;
    expect(new Set(discs.map((d) => Math.round(d.depth / (depthSpan * 1e-3)))).size).toBeGreaterThanOrEqual(4);
    let neighbours = 0;
    for (let i = 0; i < discs.length; i += 1) {
      for (let j = i + 1; j < discs.length; j += 1) {
        const a = discs[i];
        const b = discs[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) >= 1.6 * (a.r + b.r + gap)) continue;
        neighbours += 1;
        expect(sameDepth(a, b), `clusters ${i} and ${j}`).toBe(false);
      }
    }
    expect(neighbours).toBeGreaterThan(0);
  });

  it('draws nearer clusters larger', () => {
    const { discs } = drawn(equal(9));
    const nearest = discs.reduce((a, b) => (b.depth < a.depth ? b : a));
    const farthest = discs.reduce((a, b) => (b.depth > a.depth ? b : a));
    expect(nearest.r).toBeGreaterThan(farthest.r);
  });

  it('returns the same anchors for the same input', () => {
    const radii = mixed(30).map(clusterRadius);
    expect(clusterVolumeAnchors(radii, DOME_YAW_DEFAULT, DOME_PITCH_DEFAULT, 40)).toEqual(clusterVolumeAnchors(radii, DOME_YAW_DEFAULT, DOME_PITCH_DEFAULT, 40));
  });

  it.each([4, 13])('sets a loose group at the centre of %i clusters, clear of every one', (count) => {
    const { discs, box, gap, band } = drawn(mixed(count), 6);
    const loose = discs[discs.length - 1];
    const smallest = Math.min(...discs.map((d) => d.r));
    expect(Math.hypot(loose.x - (box.left + box.right) / 2, loose.y - (box.top + box.bottom) / 2)).toBeLessThan(2 * smallest + gap);
    for (const cluster of discs.slice(0, -1)) expect(clearance(cluster, loose, gap, band, false)).toBeGreaterThanOrEqual(1 - SETTLED);
  });
});
