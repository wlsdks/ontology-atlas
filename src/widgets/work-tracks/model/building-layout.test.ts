import { describe, expect, it } from 'vitest';
import { SCREEN_H, MAX_SCREEN_ROWS, SCREEN_ROW_H, SHARED_SCREEN_ROWS, fileColumns, layoutBuilding, listsAreas, pairUnit, screenRows, showsWallFacts, stageCapacity, type Box, type LayoutInput, type ScreenLists } from './building-layout';

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
  return layoutBuilding({ width: 1776, height: 1000, stage: [], floors: [], hasShelf: true, ...patch });
}

describe('layoutBuilding', () => {
  it('sets six rooms in two rows of three when few mini rooms leave the height', () => {
    const result = layout({ stage: keys('s', 6), floors: [{ key: 'a', rooms: ['m0'] }] });
    const stage = keys('s', 6).map(key => result.rooms.get(key)!);
    expect(new Set(stage.map(room => room.y)).size).toBe(2);
    expect(new Set(stage.map(room => room.h)).size).toBe(1);
    expect(stage.every(room => room.size === 'large')).toBe(true);
    expect(result.banded).toBe(false);
    expect(result.heading?.kind).toBe('plate');
    expectNoOverlap([...result.rooms.values(), result.shelf!, result.heading!]);
  });

  it('fits a one-row stage to what its rooms hold, with the floors right under it', () => {
    const result = layout({ width: 2300, height: 1020, stage: keys('s', 3), stageLists: [{ commits: 5, files: 0, areas: 0 }, { commits: 2, files: 0, areas: 0 }, { commits: 0, files: 0, areas: 0 }], floors: [{ key: 'a', rooms: ['m0'] }], hasShelf: false });
    const stage = keys('s', 3).map(key => result.rooms.get(key)!);
    const mini = result.rooms.get('m0')!;
    expect(stage[0].y).toBe(24);
    // The screen, Moru under it on the rail, and two more rows for the five its rooms have to list.
    expect(stage[0].h).toBe(12 + SCREEN_H + 116 + 2 * SCREEN_ROW_H);
    expect(screenRows(stage[0])).toBe(5);
    expect(mini.y - (stage[0].y + stage[0].h)).toBe(16);
    expectNoOverlap([...result.rooms.values()]);
  });

  it('sets a room\'s screen above Moru at any width, who keeps his height under it', () => {
    for (const width of [1296, 2300]) {
      const result = layout({ width, height: 1020, stage: keys('s', 3), hasShelf: false });
      expect(result.rooms.get('s0')!.h).toBe(12 + SCREEN_H + 116);
    }
  });

  it('bands forty worktrees by session under one row of six, all inside the window', () => {
    const floors = [{ key: 'a', rooms: keys('a', 5) }, { key: 'b', rooms: keys('b', 5) }, { key: 'c', rooms: keys('c', 5) }, { key: 'd', rooms: keys('d', 5) }, { key: 'none', rooms: keys('n', 5) }];
    const result = layout({ height: 1020, stage: keys('s', 6), floors });
    const stage = keys('s', 6).map(key => result.rooms.get(key)!);
    expect(new Set(stage.map(room => room.y)).size).toBe(1);
    expect(result.banded).toBe(true);
    expect(result.floors.size).toBe(5);
    expect(result.height).toBeLessThanOrEqual(1020);
    expect(result.heading?.kind).toBe('line');
    expectNoOverlap([...result.rooms.values(), ...result.floors.values(), result.shelf!, result.heading!]);
  });

  it('wraps a floor wider than its row instead of squeezing its rooms', () => {
    const result = layout({ stage: keys('s', 2), floors: [{ key: 'a', rooms: keys('a', 14) }] });
    const minis = keys('a', 14).map(key => result.rooms.get(key)!);
    expect(Math.min(...minis.map(room => room.w))).toBeGreaterThanOrEqual(240);
    expect(new Set(minis.map(room => room.y)).size).toBeGreaterThan(1);
    // Every row ends at the floor's right edge: no hole after its last room.
    for (const y of new Set(minis.map(room => room.y))) {
      const row = minis.filter(room => room.y === y);
      expect(Math.max(...row.map(room => room.x + room.w))).toBeGreaterThan(1776 - row.length - 8);
    }
    expectNoOverlap([...result.rooms.values(), ...result.floors.values(), result.shelf!]);
  });

  it('keeps rooms legible in the smallest window and lets the board grow', () => {
    const result = layout({ width: 896, height: 620, stage: keys('s', 6), floors: [{ key: 'a', rooms: keys('a', 8) }] });
    const stage = keys('s', 6).map(key => result.rooms.get(key)!);
    expect(Math.min(...stage.map(room => room.w))).toBeGreaterThanOrEqual(260);
    expect(Math.min(...stage.map(room => room.h))).toBeGreaterThanOrEqual(12 + SCREEN_H + 116);
    expect(result.height).toBeGreaterThan(620);
    expectNoOverlap([...result.rooms.values(), ...result.floors.values(), result.shelf!]);
  });

});

describe('stageCapacity', () => {
  it('keeps four rooms where only two across can list their files, six elsewhere, and one row in a short window', () => {
    expect(stageCapacity(1296, 840)).toBe(4);
    expect(stageCapacity(1900, 1020)).toBe(6);
    expect(stageCapacity(896, 900)).toBe(6);
    expect(stageCapacity(896, 660)).toBe(3);
  });
});

describe('mini rooms', () => {
  it('stand five to a row, never narrower than 300px', () => {
    const wide = layout({ stage: keys('s', 6), floors: [{ key: 'a', rooms: keys('a', 9) }, { key: 'b', rooms: keys('b', 2) }] });
    const row = keys('a', 5).map(key => wide.rooms.get(key)!);
    expect(new Set(row.map(room => room.y)).size).toBe(1);
    expect(wide.rooms.get('a5')!.y).toBeGreaterThan(row[0].y);
    expect(Math.min(...row.map(room => room.w))).toBeGreaterThanOrEqual(300);
    const narrow = layout({ width: 1296, stage: keys('s', 4), floors: [{ key: 'a', rooms: keys('a', 9) }] });
    expect(Math.min(...keys('a', 9).map(key => narrow.rooms.get(key)!.w))).toBeGreaterThanOrEqual(300);
  });
});

describe('few mini rooms', () => {
  it('share the whole width beside the floor plate, and a lone one spreads across it', () => {
    const two = layout({ stage: keys('s', 3), floors: [{ key: 'a', rooms: keys('a', 2) }] });
    const minis = keys('a', 2).map(key => two.rooms.get(key)!);
    expect(two.heading).toMatchObject({ kind: 'plate', x: 0, w: 188 });
    expect(minis[0].x).toBe(196);
    expect(minis[1].x + minis[1].w).toBe(1776);
    expect(minis.every(room => room.h === 96)).toBe(true);
    expect(two.shelf!.y).toBeGreaterThan(minis[0].y + minis[0].h);
    expectNoOverlap([...minis, two.shelf!, two.heading!]);
    const one = layout({ stage: keys('s', 3), floors: [{ key: 'a', rooms: ['a0'] }], hasShelf: false });
    expect(one.rooms.get('a0')!.w).toBe(1776 - 196);
    const five = layout({ width: 1296, stage: keys('s', 3), floors: [{ key: 'a', rooms: keys('a', 4) }], hasShelf: false });
    expect(five.heading?.kind).toBe('line');
    expect(five.rooms.get('a0')!.x).toBe(0);
    expect(five.rooms.get('a0')!.y).toBe(five.heading!.y + 30);
  });
});

describe('floor rows', () => {
  it('spreads a wrapping floor evenly over its rows instead of leaving one room alone', () => {
    const keys = (n: number, prefix: string) => Array.from({ length: n }, (_, index) => `${prefix}${index}`);
    const floors = [{ key: 'a', rooms: keys(4, 'a') }, { key: 'b', rooms: keys(7, 'b') }, { key: 'c', rooms: keys(3, 'c') }];
    const layout = layoutBuilding({ width: 1296, height: 900, stage: [], floors, hasShelf: false });
    const rows = (prefix: string, n: number) => {
      const ys = keys(n, prefix).map(key => layout.rooms.get(key)!.y);
      return [...new Set(ys)].map(y => ys.filter(other => other === y).length);
    };
    expect(rows('a', 4)).toEqual([2, 2]);
    expect(rows('b', 7)).toEqual([3, 2, 2]);
    expect(rows('c', 3)).toEqual([3]);
  });

  it('gives two Moru a scale in half steps, the largest that fits both apart on the rail, up to the room\'s own', () => {
    expect(pairUnit(882, 3)).toBe(3);
    // The 1440 and 1512 boards: three quarters of the single Moru beside them, both on the floor.
    for (const width of [424, 448]) {
      expect(pairUnit(width, 2)).toBe(1.5);
      expect(218 * pairUnit(width, 2)).toBeLessThanOrEqual(width - 32 - 16);
    }
    expect(pairUnit(320, 1)).toBe(1);
    expect(pairUnit(200, 1)).toBe(0.5);
  });

  it('keeps Moru at his drawn size in a room of any size, so the width goes to the screen', () => {
    for (const width of [1368, 2400]) {
      const room = layout({ width, height: 1200, stage: keys('s', 2), hasShelf: false }).rooms.get('s0')!;
      expect(room.unit).toBe(1);
    }
  });

  it('gives a room alone on the stage the whole width, as tall as what it lists and no taller than the window', () => {
    const lone = (patch: Partial<LayoutInput>) => layout({ width: 1840, height: 1100, stage: ['s0'], hasShelf: false, ...patch });
    const rowsFor = (lists: Partial<ScreenLists>, patch: Partial<LayoutInput> = {}) => screenRows(lone({ stageLists: [{ commits: 0, files: 0, areas: 0, ...lists }], ...patch }).rooms.get('s0')!);
    expect(lone({}).rooms.get('s0')).toMatchObject({ x: 0, w: 1840 });
    expect(rowsFor({ commits: 2, files: 0 })).toBe(3);
    expect(rowsFor({ commits: 12, files: 0 })).toBe(12);
    expect(rowsFor({ commits: 99, files: 0 })).toBe(MAX_SCREEN_ROWS);
    // Its files flow over the screen's columns: forty-eight in three is sixteen rows, with or without commits beside them.
    expect(rowsFor({ commits: 0, files: 48 })).toBe(16);
    expect(rowsFor({ commits: 4, files: 48 })).toBe(16);
    expect(rowsFor({ commits: 4, files: 99 })).toBe(MAX_SCREEN_ROWS);
    // Beside its commits and the folders its files are in, the files keep two columns: thirty-six is eighteen rows.
    expect(rowsFor({ commits: 4, files: 36, areas: 1 })).toBe(12);
    expect(rowsFor({ commits: 4, files: 36, areas: 5 })).toBe(18);
    const low = lone({ stageLists: [{ commits: 20, files: 0, areas: 0 }], height: 500 }).rooms.get('s0')!;
    expect(low.y + low.h).toBeLessThanOrEqual(500);
  });

  it('keeps rooms that share a stage to eight rows, however long one list is', () => {
    const result = layout({ width: 1900, height: 1100, stage: keys('s', 3), stageLists: [{ commits: 14, files: 0, areas: 0 }, { commits: 1, files: 0, areas: 0 }, { commits: 0, files: 0, areas: 0 }], hasShelf: false });
    expect(screenRows(result.rooms.get('s0')!)).toBe(SHARED_SCREEN_ROWS);
  });

  it('flows uncommitted files into as many columns as keep their width, and lists none on a screen too narrow', () => {
    expect(fileColumns(560, true, false)).toBe(0);
    expect(fileColumns(604, true, false)).toBe(1);
    expect(fileColumns(760, true, false)).toBe(1);
    // A wide screen keeps its three columns beside its commits; a narrower one gives one up to them.
    expect(fileColumns(1840, true, false)).toBe(3);
    expect(fileColumns(1840, false, false)).toBe(3);
    expect(fileColumns(1456, true, false)).toBe(2);
    // The folders take a column's worth from the files.
    expect(fileColumns(1840, true, true)).toBe(2);
    expect(fileColumns(1840, false, true)).toBe(3);
  });

  it('says a room\'s state on its wall once three rooms across leave the wall beside Moru', () => {
    const across = (width: number, count: number) => layout({ width, stage: keys('s', count), hasShelf: false }).rooms.get('s0')!.w;
    expect(showsWallFacts(across(1840, 3))).toBe(true);
    expect(showsWallFacts(across(1296, 3))).toBe(false);
    expect(showsWallFacts(across(1296, 2))).toBe(true);
  });

  it('lists the folders only for a room alone on the stage, with files in two or more, where a column of files still fits', () => {
    const lists = { commits: 4, files: 36, areas: 5 };
    expect(listsAreas(1840, lists, true)).toBe(true);
    expect(listsAreas(1840, lists, false)).toBe(false);
    expect(listsAreas(1840, { ...lists, areas: 1 }, true)).toBe(false);
    expect(listsAreas(1100, lists, true)).toBe(false);
    expect(listsAreas(1100, { ...lists, commits: 0 }, true)).toBe(true);
  });
});
