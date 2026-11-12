import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BrandCompanion } from './brand-companion';

const labels = { pause: 'pause', resume: 'resume', still: 'still' };
let hidden = false, reduced = false;
let reveal: (visible: boolean) => void;
const listeners = new Set<() => void>();
const animations: Array<{ play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> }> = [];
const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
beforeEach(() => {
  hidden = reduced = false;
  animations.length = 0;
  listeners.clear();
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  vi.stubGlobal('matchMedia', () => ({ get matches() { return reduced; }, addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) }));
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { reveal = visible => callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
    observe() {} disconnect() {}
  });
  vi.stubGlobal('ResizeObserver', undefined);
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => 'linear' }));
  vi.stubGlobal('Animation', class {});
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: () => {
    const animation = { play: vi.fn(), pause: vi.fn(), cancel: vi.fn() };
    animations.push(animation);
    return animation as unknown as Animation;
  } });
});
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (originalAnimate) Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate);
  else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
});

it('pauses all movement while hidden and preserves an explicit pause when visibility returns', () => {
  render(<BrandCompanion labels={labels} />);
  act(() => reveal(true));
  for (const animation of animations) expect(animation.play).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'pause' }));
  for (const animation of animations) { expect(animation.pause).toHaveBeenCalled(); animation.play.mockClear(); }
  hidden = true;
  fireEvent(document, new Event('visibilitychange'));
  hidden = false;
  fireEvent(document, new Event('visibilitychange'));
  act(() => { reveal(false); reveal(true); });
  for (const animation of animations) expect(animation.play).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'resume' }));
  for (const animation of animations) expect(animation.play).toHaveBeenCalled();
});

it('holds a moving control still for pointer and keyboard interaction', () => {
  render(<BrandCompanion labels={labels} />);
  act(() => reveal(true));
  const button = screen.getByRole('button');
  for (const animation of animations) animation.pause.mockClear();
  fireEvent.pointerEnter(button);
  for (const animation of animations) expect(animation.pause).toHaveBeenCalledOnce();
  fireEvent.pointerLeave(button);
  for (const animation of animations) animation.pause.mockClear();
  fireEvent.focus(button);
  for (const animation of animations) expect(animation.pause).toHaveBeenCalledOnce();
  fireEvent.pointerEnter(button);
  for (const animation of animations) animation.play.mockClear();
  fireEvent.pointerLeave(button);
  for (const animation of animations) expect(animation.play).not.toHaveBeenCalled();
});

it('cancels decorative movement when reduced motion is requested and on unmount', () => {
  const { unmount } = render(<BrandCompanion labels={labels} />);
  act(() => reveal(true));
  act(() => { reduced = true; for (const listener of listeners) listener(); });
  for (const animation of animations) expect(animation.cancel).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'still' })).toHaveAttribute('data-moru-paused', 'true');
  unmount();
  expect(listeners.size).toBe(0);
});
