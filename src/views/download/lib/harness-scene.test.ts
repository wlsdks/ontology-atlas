import { describe, expect, it } from 'vitest';

import facts from './harness-facts.json';
import { buildHarnessScene, fitPath, layoutHarness, layoutPoster, pictureZone, type HarnessFacts, type Rect } from './harness-scene';

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
      const cards = layout.stacks.flatMap((stack) => stack.cards.map((card) => card.rect));

      it('keeps every act inside the picture zone', () => {
        for (const card of cards) expect(inside(card, zone)).toBe(true);
        for (const plate of layout.plates) expect(inside(plate, zone)).toBe(true);
        for (const cell of layout.cells) expect(inside(cell.rect, zone), cell.name).toBe(true);
        for (const mark of layout.strips.flat()) expect(inside(mark, zone)).toBe(true);
        expect(layout.readoutY).toBeLessThanOrEqual(zone.bottom);
      });

      it('stacks one card per instruction file, the column\'s first path on top', () => {
        expect(cards).toHaveLength(scene.counts.instructions);
        layout.stacks.forEach((stack, c) => expect(stack.cards.at(-1)?.path).toBe(scene.columns[c]!.paths[0]));
        layout.stacks.forEach((stack, c) => {
          const next = layout.stacks[c + 1];
          if (next) expect(stack.x + stack.width).toBeLessThan(next.x);
        });
      });

      it('never overlaps two cells, two plates or two parked marks', () => {
        const groups = [layout.cells.map((cell) => cell.rect), layout.plates, layout.strips.flat()];
        for (const rects of groups) rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => expect(apart(a, b)).toBe(true)));
      });

      it('gives every check one piece of its underline, in the order the sweep fills them', () => {
        expect(layout.cells.map((cell) => cell.slot).sort((a, b) => a - b)).toEqual(layout.cells.map((_, k) => k));
        const swept = [...layout.cells].sort((a, b) => a.band - b.band || a.rect.x - b.rect.x || a.rect.y - b.rect.y);
        expect(swept.map((cell) => cell.slot)).toEqual(swept.map((_, k) => k));
      });

      it('leaves the longest command and its caret clear of the plates, in type no smaller than 15px', () => {
        const longest = Math.max(...scene.commands.map((command) => measure(`$ ${command.command}`, layout.command.px)));
        expect(layout.command.x + longest + 32).toBeLessThan(layout.plates[0]!.x);
        expect(layout.plateTextPx).toBeGreaterThanOrEqual(15);
        expect(layout.command.px).toBeGreaterThanOrEqual(24);
      });
    });
  }
});

describe('the last frame', () => {
  for (const width of [186, 272]) {
    const gap = 40;
    const columns = [0, 1, 2].map((i) => ({ x: 200 + i * (width + gap), w: width }));
    const base = 600;
    const poster = layoutPoster(scene, columns, base, measure);

    it(`puts one object per file, hook and check above its own count, in ${width}px columns`, () => {
      expect(poster.cards).toHaveLength(scene.counts.instructions);
      expect(poster.hooks).toHaveLength(scene.counts.hooks);
      expect(poster.cells).toHaveLength(scene.counts.checks);
      [poster.cards, poster.hooks, poster.cells].forEach((group, i) => {
        const column = columns[i]!;
        for (const r of group) {
          expect(r.x).toBeGreaterThanOrEqual(column.x - 0.5);
          expect(r.x + r.w).toBeLessThanOrEqual(column.x + column.w + 0.5);
          expect(r.y + r.h).toBeLessThanOrEqual(base + 0.5);
        }
      });
    });

    it(`names three real files and every gate plate, each inside its card, in ${width}px columns`, () => {
      expect(poster.names).toHaveLength(3);
      for (const name of poster.names) {
        const card = poster.cards[name.card]!;
        expect(name.x + measure(name.text, 18)).toBeLessThanOrEqual(card.x + card.w);
      }
      expect(poster.plateNames).toHaveLength(scene.gate.length);
      for (const name of poster.plateNames) {
        const plate = poster.hooks[name.hook]!;
        expect(name.x + measure(name.text, poster.plateTextPx)).toBeLessThanOrEqual(plate.x + plate.w);
      }
      expect(poster.plateTextPx).toBeGreaterThanOrEqual(15);
    });

    it(`never overlaps two cells or two hooks, in ${width}px columns`, () => {
      for (const rects of [poster.cells, poster.hooks]) rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => expect(apart(a, b)).toBe(true)));
    });
  }
});
