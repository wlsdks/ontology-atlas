import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MORU_CELL_PX, MORU_STEP_MS, createMoruClock, moruCells } from './moru-clock';

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
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

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
});
