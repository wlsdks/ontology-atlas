import { describe, expect, it } from 'vitest';

import facts from './harness-facts.json';
import { buildHarnessScene, layoutReading, type HarnessFacts } from './harness-scene';

const FACTS: HarnessFacts = facts;
const scene = buildHarnessScene(FACTS);
/* JetBrains Mono's advance is 0.6em; the layout only needs a width per name. */
const measure = (text: string, px: number) => text.length * px * 0.6;

describe('the harness film shows only what the repository has', () => {
  it('counts what the caption names from the facts themselves', () => {
    expect(scene.counts).toEqual({
      instructions: FACTS.instructions.length,
      hooks: FACTS.hooks.length,
      checks: FACTS.checks.scripts.length + FACTS.checks.gitHooks.length + FACTS.checks.workflows.length,
    });
    expect(scene.finale.instructions).toHaveLength(scene.counts.instructions);
    expect(scene.finale.hooks).toHaveLength(scene.counts.hooks);
    expect(scene.finale.checks).toHaveLength(scene.counts.checks);
  });

  it('shows at least one command a hook really denies, at the plate of the hook that denied it', () => {
    const denied = scene.commands.filter((chip) => chip.blockedBy !== null);
    expect(denied.length).toBeGreaterThan(0);
    for (const chip of denied) expect(scene.gate[chip.lane]).toBe(chip.blockedBy);
  });

  it('never sends an allowed command down the lane the command before or after it uses', () => {
    scene.commands.forEach((chip, i) => {
      if (chip.blockedBy) return;
      for (const other of [scene.commands[i - 1], scene.commands[i + 1]]) {
        if (other) expect(other.lane, `${chip.command} beside ${other.command}`).not.toBe(chip.lane);
      }
    });
  });

  it('puts every check on a rail exactly once', () => {
    const shown = [...scene.stations.map((station) => station.label), ...scene.backRails.flat()];
    const checks = [...FACTS.checks.scripts, ...FACTS.checks.gitHooks, ...FACTS.checks.workflows];
    expect(shown.filter((name) => checks.includes(name)).sort()).toEqual([...checks].sort());
  });
});

describe('the reading field', () => {
  for (const [w, h] of [
    [1040, 720],
    [1440, 900],
    [1920, 1080],
  ] as const) {
    it(`keeps every card apart and between the page bar and the captions at ${w}×${h}`, () => {
      const spots = layoutReading(scene.files, measure, w, h);
      const boxes = spots.map((spot, i) => {
        const width = measure(scene.files[i]!.label, spot.px) + 30;
        return { ...spot, l: spot.x - width / 2, r: spot.x + width / 2 };
      });
      for (const box of boxes) {
        expect(box.y).toBeGreaterThanOrEqual(76);
        expect(box.y).toBeLessThanOrEqual(h * 0.74);
        expect(box.l).toBeGreaterThanOrEqual(0);
        expect(box.r).toBeLessThanOrEqual(w);
      }
      boxes.forEach((a, i) =>
        boxes.slice(i + 1).forEach((b) => {
          if (a.y !== b.y) return;
          expect(a.r <= b.l || b.r <= a.l, `${scene.files[i]!.label} overlaps a neighbour`).toBe(true);
        }),
      );
    });
  }
});
