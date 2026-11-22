import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PixelStage } from '@/shared/motion/pixel-stage';
import { MORU_CELL_PX, MORU_STEP_MS, createMoruClock, moruCells } from './moru-clock';

/** A stage past its lively stretch that grants one turn to an asker once the test opens it. */
function quietStage() {
  const stage = {
    open: false, granted: false, asked: 0, released: 0,
    join() {}, leave() {}, moved() {}, wake() {}, share: () => 0,
    lively: () => false,
    may: () => stage.granted,
    holds: () => stage.granted,
    ask: () => { stage.asked += 1; stage.granted = stage.open; return stage.granted; },
    release: () => { stage.granted = stage.open = false; stage.released += 1; },
  };
  return stage satisfies PixelStage & Record<string, unknown>;
}

function board({ seen = true, clip = 'desk-type', hold = false, phase = 0, once }: { seen?: boolean; clip?: string; hold?: boolean; phase?: number; once?: string } = {}) {
  const element = document.createElement('div');
  element.innerHTML = `<div data-room-key="a" data-room-seen="${seen}"><span data-moru-live data-moru-slot="front" data-moru-clip="${clip}" data-moru-hold="${hold}" data-moru-phase="${phase}"></span></div>`;
  const sprite = element.querySelector<HTMLElement>('[data-moru-live]')!;
  if (once) sprite.dataset.moruOnce = once;
  return { element, sprite };
}
const cellOf = (sprite: HTMLElement) => Math.abs(Number.parseInt(sprite.style.backgroundPositionX, 10)) / MORU_CELL_PX;
const rowOf = (sprite: HTMLElement) => /mascot-(.+)-row-128/.exec(sprite.style.backgroundImage)?.[1];

describe('createMoruClock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom's window is never the key window; these run at the key window's pace.
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('loops a Moru on screen from his own pose, one cell per step', () => {
    const { element, sprite } = board({ phase: 5 });
    const clock = createMoruClock(element);
    clock.sync(true);
    vi.advanceTimersByTime(MORU_STEP_MS * 2);
    expect([rowOf(sprite), cellOf(sprite)]).toEqual(['desk-type', 7]);
    clock.stop();
  });

  it('reaches the neutral pose before a row it plays once, plays it through and hands back to the loop on it', () => {
    const { element, sprite } = board({ phase: 4 });
    const clock = createMoruClock(element);
    clock.sync(true);
    sprite.dataset.moruOnce = 'crate-send@1';
    const cells: string[] = [];
    for (let step = 0; step < 40; step += 1) {
      vi.advanceTimersByTime(MORU_STEP_MS);
      cells.push(`${rowOf(sprite)}:${cellOf(sprite)}`);
    }
    // Back to the neutral pose the shorter way, then the whole row once, then the loop from neutral.
    expect(cells.slice(0, 3)).toEqual(['desk-type:2', 'desk-type:0', 'crate-send:0']);
    const once = cells.filter(cell => cell.startsWith('crate-send'));
    expect(once).toHaveLength(moruCells('crate-send'));
    expect(cells[cells.indexOf(once.at(-1)!) + 1]).toBe('desk-type:0');
    clock.stop();
  });

  it('settles a Moru out of sight on his new row at once and drops what his room asked to play while away', () => {
    const { element, sprite } = board({ seen: false, phase: 9, once: 'merge-cheer@merge' });
    const clock = createMoruClock(element);
    clock.sync(true);
    vi.advanceTimersByTime(3000);
    sprite.dataset.moruClip = 'nod-off';
    clock.sync(true);
    expect([rowOf(sprite), cellOf(sprite)]).toEqual(['nod-off', 0]);
    sprite.closest<HTMLElement>('[data-room-key]')!.dataset.roomSeen = 'true';
    clock.sync(true);
    vi.advanceTimersByTime(MORU_STEP_MS * 3);
    expect(rowOf(sprite)).toBe('nod-off');
    clock.stop();
  });

  it('holds no timer while no Moru is on screen, while motion is not allowed, or after it stops', () => {
    createMoruClock(board({ seen: false }).element).sync(true);
    createMoruClock(board().element).sync(false);
    expect(vi.getTimerCount()).toBe(0);
    const running = createMoruClock(board().element);
    running.sync(true);
    expect(vi.getTimerCount()).toBe(1);
    running.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rests on the neutral pose where a loop ends between turns, asks for one, and plays one loop in it', () => {
    const { element, sprite } = board({ phase: 5 });
    const stage = quietStage();
    const clock = createMoruClock(element, stage);
    clock.sync(true);
    const cells = moruCells('desk-type');
    const seen: number[] = [];
    for (let step = 0; step < cells + 6; step += 1) {
      vi.advanceTimersByTime(MORU_STEP_MS);
      seen.push(cellOf(sprite));
    }
    // The loop under way is finished, never cut: every cell from 6 to the end, then the neutral pose held.
    expect(seen.slice(0, cells - 5)).toEqual([...Array.from({ length: cells - 6 }, (_, i) => i + 6), 0]);
    expect(seen.slice(cells - 5).every(cell => cell === 0)).toBe(true);
    expect(stage.asked).toBeGreaterThan(0);

    stage.open = true;
    const turn: number[] = [];
    for (let step = 0; step < cells * 3; step += 1) {
      vi.advanceTimersByTime(MORU_STEP_MS);
      turn.push(cellOf(sprite));
    }
    // A resting room asks every few beats; its turn is one whole loop from the neutral pose back to it,
    // then the turn is given back and he rests.
    const waited = turn.indexOf(1);
    expect(waited).toBeGreaterThanOrEqual(0);
    expect(waited).toBeLessThanOrEqual(3);
    expect(turn.slice(waited, waited + cells)).toEqual([...Array.from({ length: cells - 1 }, (_, i) => i + 1), 0]);
    expect(stage.released).toBe(1);
    expect(turn.slice(waited + cells).every(cell => cell === 0)).toBe(true);
    clock.stop();
  });

  it('plays what his room asks to play once, and the row of a changed state, at once and without a turn', () => {
    const { element, sprite } = board({ phase: 0 });
    const stage = quietStage();
    const clock = createMoruClock(element, stage);
    clock.sync(true);
    vi.advanceTimersByTime(MORU_STEP_MS * 3);
    expect([rowOf(sprite), cellOf(sprite)]).toEqual(['desk-type', 0]);
    sprite.dataset.moruOnce = 'crate-send@1';
    clock.sync(true);
    vi.advanceTimersByTime(MORU_STEP_MS);
    expect([rowOf(sprite), cellOf(sprite)]).toEqual(['crate-send', 0]);
    vi.advanceTimersByTime(MORU_STEP_MS * (moruCells('crate-send') + 4));
    expect([rowOf(sprite), cellOf(sprite)]).toEqual(['desk-type', 0]);

    sprite.dataset.moruClip = 'nod-off';
    clock.sync(true);
    const row: string[] = [];
    for (let step = 0; step < moruCells('nod-off') + 4; step += 1) {
      vi.advanceTimersByTime(MORU_STEP_MS);
      row.push(`${rowOf(sprite)}:${cellOf(sprite)}`);
    }
    // The new row once through from the neutral pose, then rest on it.
    expect(row.slice(0, moruCells('nod-off') + 1)).toEqual([...Array.from({ length: moruCells('nod-off') }, (_, i) => `nod-off:${i}`), 'nod-off:0']);
    expect(row.at(-1)).toBe('nod-off:0');
    expect(stage.granted).toBe(false);
    clock.stop();
  });
});
