import { describe, expect, it } from 'vitest';
import { layoutBuilding, stageCapacity, type Box, type LayoutInput } from './building-layout';

const keys = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => `${prefix}${index}`);

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function expectNoOverlap(boxes: Box[]) {
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) expect(overlaps(boxes[i], boxes[j]), `${i} and ${j}`).toBe(false);
  }
}

function layout(patch: Partial<LayoutInput>) {
  return layoutBuilding({ width: 1776, height: 1000, stage: [], floors: [], hasShelf: true, workingBelow: 0, ...patch });
}

describe('layoutBuilding', () => {
  it('sets six rooms in two rows of three when few mini rooms leave the height', () => {
    const result = layout({ stage: keys('s', 6), floors: [{ key: 'a', rooms: ['m0'] }] });
    const stage = keys('s', 6).map(key => result.rooms.get(key)!);
    expect(new Set(stage.map(room => room.y)).size).toBe(2);
    expect(new Set(stage.map(room => room.h)).size).toBe(1);
    expect(stage.every(room => room.size === 'large' && room.unit >= 2)).toBe(true);
    expect(result.banded).toBe(false);
    expect(result.shelf?.inline).toBe(true);
    expectNoOverlap([...result.rooms.values(), result.shelf!]);
  });

  it('bands forty worktrees by session under one row of six, all inside the window', () => {
    const floors = [{ key: 'a', rooms: keys('a', 5) }, { key: 'b', rooms: keys('b', 5) }, { key: 'c', rooms: keys('c', 5) }, { key: 'd', rooms: keys('d', 5) }, { key: 'none', rooms: keys('n', 5) }];
    const result = layout({ height: 1020, stage: keys('s', 6), floors, workingBelow: 4 });
    const stage = keys('s', 6).map(key => result.rooms.get(key)!);
    expect(new Set(stage.map(room => room.y)).size).toBe(1);
    expect(result.banded).toBe(true);
    expect(result.floors.size).toBe(5);
    expect(result.height).toBe(1020);
    expect(result.moreTop).not.toBeNull();
    expectNoOverlap([...result.rooms.values(), ...result.floors.values(), result.shelf!]);
  });

  it('wraps a floor wider than its row instead of squeezing its rooms', () => {
    const result = layout({ stage: keys('s', 2), floors: [{ key: 'a', rooms: keys('a', 14) }] });
    const minis = keys('a', 14).map(key => result.rooms.get(key)!);
    expect(Math.min(...minis.map(room => room.w))).toBeGreaterThanOrEqual(240);
    expect(new Set(minis.map(room => room.y)).size).toBeGreaterThan(1);
    expectNoOverlap([...result.rooms.values(), ...result.floors.values(), result.shelf!]);
  });

  it('keeps rooms legible in the smallest window and lets the board grow', () => {
    const result = layout({ width: 896, height: 620, stage: keys('s', 6), floors: [{ key: 'a', rooms: keys('a', 8) }], workingBelow: 2 });
    const stage = keys('s', 6).map(key => result.rooms.get(key)!);
    expect(Math.min(...stage.map(room => room.w))).toBeGreaterThanOrEqual(260);
    expect(Math.min(...stage.map(room => room.h))).toBeGreaterThanOrEqual(300);
    expect(result.height).toBeGreaterThan(620);
    expectNoOverlap([...result.rooms.values(), ...result.floors.values(), result.shelf!]);
  });

  it('centres a single room at half the width', () => {
    const result = layout({ stage: ['only'] });
    const room = result.rooms.get('only')!;
    expect(room.w).toBe(882);
    expect(room.x + room.w / 2).toBeCloseTo(888, 0);
  });
});

describe('stageCapacity', () => {
  it('keeps four wide rooms where two fit side by side, and six elsewhere', () => {
    expect(stageCapacity(1296)).toBe(4);
    expect(stageCapacity(1776)).toBe(6);
    expect(stageCapacity(896)).toBe(6);
  });
});
