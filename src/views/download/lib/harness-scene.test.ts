import { describe, expect, it } from 'vitest';

import facts from './harness-facts.json';
import { buildHarnessScene, fitPath, layoutHarness, pictureZone, type HarnessFacts, type Rect } from './harness-scene';

const FACTS: HarnessFacts = facts;
const scene = buildHarnessScene(FACTS);
/* JetBrains Mono's advance is 0.6em; the layout only needs a width per name. */
const measure = (text: string, px: number) => text.length * px * 0.6;

const inside = (r: Rect, box: { left: number; right: number; top: number; bottom: number }) =>
  r.x >= box.left - 0.5 && r.x + r.w <= box.right + 0.5 && r.y >= box.top - 0.5 && r.y + r.h <= box.bottom + 0.5;
const apart = (a: Rect, b: Rect) => a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;

describe('the harness film shows only what the repository has', () => {
  it('counts what the last act names from the facts themselves', () => {
    expect(scene.counts).toEqual({
      instructions: FACTS.instructions.length,
      hooks: FACTS.hooks.length,
      checks: FACTS.checks.scripts.length + FACTS.checks.gitHooks.length + FACTS.checks.workflows.length,
    });
    expect(scene.columns.reduce((sum, column) => sum + column.paths.length, 0)).toBe(scene.counts.instructions);
    expect(scene.bands.reduce((sum, band) => sum + band.names.length, 0)).toBe(scene.counts.checks);
  });

  it('denies a command only at the plate of the hook that denied it, and lets one through', () => {
    FACTS.commands.forEach((entry, i) => {
      const lane = scene.commands[i]!.lane;
      expect(lane < 0 ? null : scene.gate[lane]).toBe(entry.blockedBy);
    });
    expect(scene.commands.some((command) => command.lane < 0)).toBe(true);
    expect(scene.commands.some((command) => command.lane >= 0)).toBe(true);
  });

  it('turns each gate plate into exactly one hook of the same name', () => {
    scene.gate.forEach((name, plate) => {
      const hooks = scene.hookPlates.flatMap((p, j) => (p === plate ? [FACTS.hooks[j]!.name] : []));
      expect(hooks).toEqual([name]);
    });
  });
});

describe('fitPath', () => {
  it('drops leading folders until the path fits, keeping whole segments', () => {
    const width = (text: string) => text.length;
    expect(fitPath('.claude/rules/design.md', 40, width)).toBe('.claude/rules/design.md');
    expect(fitPath('.claude/rules/design.md', 16, width)).toBe('rules/design.md');
    expect(fitPath('.claude/rules/design.md', 9, width)).toBe('design.md');
    expect(fitPath('.claude/rules/design.md', 5, width)).toBe('desi…');
  });
});

describe('the stage', () => {
  for (const [w, h] of [
    [768, 720],
    [1040, 720],
    [1440, 900],
    [1920, 960],
  ] as const) {
    describe(`at ${w}×${h}`, () => {
      const zone = pictureZone(w, h, 200);
      const layout = layoutHarness(scene, zone, measure);

      it('keeps every act inside the picture zone', () => {
        for (const file of layout.files) expect(inside(file.rect, zone), file.text ?? 'slab').toBe(true);
        for (const plate of layout.plates) expect(inside(plate, zone)).toBe(true);
        for (const cell of layout.cells) expect(inside(cell.rect, zone), cell.name).toBe(true);
        for (const strip of layout.strips) for (const mark of [...strip.parked, ...strip.merged, ...strip.whole]) expect(inside(mark, zone)).toBe(true);
        expect(layout.readoutY).toBeLessThanOrEqual(zone.bottom);
      });

      it('never overlaps two files, two cells or two marks', () => {
        const groups = [layout.files.map((file) => file.rect), layout.cells.map((cell) => cell.rect), ...layout.strips.map((strip) => strip.whole)];
        for (const rects of groups) rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => expect(apart(a, b)).toBe(true)));
      });

      it('gives every check one mark, in an order where no two cells cross on the way', () => {
        expect(layout.cells.map((cell) => cell.slot).sort((a, b) => a - b)).toEqual(layout.cells.map((_, k) => k));
        const first = layout.cells.filter((cell) => cell.band === 0).sort((a, b) => a.rect.x - b.rect.x || a.rect.y - b.rect.y);
        expect(first.map((cell) => cell.slot)).toEqual(first.map((_, k) => k));
        /* The first two strips meet above the checks' first row, so they never pass over a cell. */
        const firstRow = Math.min(...layout.cells.map((cell) => cell.rect.y));
        for (const mark of [...layout.strips[0]!.merged, ...layout.strips[1]!.merged]) expect(mark.y + mark.h).toBeLessThanOrEqual(firstRow);
      });

      it('leaves the longest command clear of the plates', () => {
        const longest = Math.max(...scene.commands.map((command) => measure(`$ ${command.command}`, 28)));
        expect(layout.command.x + longest + 24).toBeLessThan(layout.plates[0]!.x);
      });
    });
  }
});
