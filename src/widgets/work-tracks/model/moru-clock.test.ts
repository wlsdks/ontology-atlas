import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MORU_CELL_PX, MORU_STEP_MS, createMoruClock } from './moru-clock';

function board(motion: 'running' | 'paused', loop: string | null) {
  const element = document.createElement('div');
  element.innerHTML = `<div data-room-motion="${motion}"><span data-room-moru><span ${loop === null ? '' : `data-moru-loop="${loop}"`}></span></span></div>`;
  return { element, cell: element.querySelector('span > span') as HTMLElement };
}

describe('createMoruClock', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('steps a looping Moru in a running room from its own phase, one cell per tick', () => {
    const { element, cell } = board('running', '5');
    const clock = createMoruClock(element);
    clock.sync(true);
    vi.advanceTimersByTime(MORU_STEP_MS * 2);
    expect(cell.style.backgroundPositionX).toBe(`${-7 * MORU_CELL_PX}px`);
    clock.stop();
  });

  it('holds no timer while nothing loops, while motion is not allowed, or after it stops', () => {
    const idle = createMoruClock(board('paused', '0').element);
    idle.sync(true);
    const still = createMoruClock(board('running', null).element);
    still.sync(true);
    const reduced = createMoruClock(board('running', '0').element);
    reduced.sync(false);
    expect(vi.getTimerCount()).toBe(0);

    const running = createMoruClock(board('running', '0').element);
    running.sync(true);
    expect(vi.getTimerCount()).toBe(1);
    running.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
