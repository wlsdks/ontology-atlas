import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BrandCompanion } from './brand-companion';
import { companionMotion } from './moru-companion-motion';

const labels = { pause: 'pause', resume: 'resume', still: 'still', interact: 'pet' };
let hidden = false, reduced = false;
let reveal: (visible: boolean) => void;
const listeners = new Set<() => void>();
type FakeAnimation = { play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn>;
  currentTime: number; onfinish: (() => void) | null; frames: Keyframe[]; options: KeyframeAnimationOptions };
const animations: FakeAnimation[] = [];
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
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: (frames: Keyframe[], options: KeyframeAnimationOptions) => {
    const animation = { play: vi.fn(), pause: vi.fn(), cancel: vi.fn(), currentTime: 0, onfinish: null, frames, options };
    animations.push(animation);
    return animation as unknown as Animation;
  } });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (originalAnimate) Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate);
  else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
});

it('pauses all movement while hidden and preserves an explicit pause when visibility returns', () => {
  render(<BrandCompanion labels={labels} />);
  act(() => reveal(true));
  for (const animation of animations) expect(animation.play).toHaveBeenCalled();
  fireEvent.contextMenu(screen.getByRole('button', { name: 'pet' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'pause' }));
  for (const animation of animations) { expect(animation.pause).toHaveBeenCalled(); animation.play.mockClear(); }
  hidden = true;
  fireEvent(document, new Event('visibilitychange'));
  hidden = false;
  fireEvent(document, new Event('visibilitychange'));
  act(() => { reveal(false); reveal(true); });
  for (const animation of animations) expect(animation.play).not.toHaveBeenCalled();
  fireEvent.contextMenu(screen.getByRole('button', { name: 'pet' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'resume' }));
  expect(screen.getByRole('button', { name: 'pet' })).toHaveAttribute('data-moru-paused', 'false');
  // Menu dismissal restores keyboard focus; leave that intentional hold before
  // checking that the explicit pause has been lifted.
  fireEvent.blur(screen.getByRole('button', { name: 'pet' }));
  for (const animation of animations) expect(animation.play).toHaveBeenCalled();
});

it('holds a moving control still for pointer and keyboard interaction', () => {
  render(<BrandCompanion labels={labels} />);
  act(() => reveal(true));
  const button = screen.getByRole('button', { name: 'pet' });
  for (const animation of animations) animation.pause.mockClear();
  fireEvent.pointerEnter(button);
  for (const animation of animations) expect(animation.pause).toHaveBeenCalledOnce();
  fireEvent.pointerLeave(button);
  for (const animation of animations) animation.pause.mockClear();
  vi.spyOn(button, 'matches').mockReturnValue(true);
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
  fireEvent.contextMenu(screen.getByRole('button', { name: 'pet' }));
  expect(screen.getByRole('menuitem', { name: 'still' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'pet' })).toHaveAttribute('data-moru-paused', 'true');
  unmount();
  expect(listeners.size).toBe(0);
});

it('shows only the character and responds without adding playback buttons', () => {
  render(<BrandCompanion labels={labels} />);
  act(() => reveal(true));
  fireEvent.click(screen.getByRole('button', { name: 'pet' }));
  expect(screen.getAllByRole('button')).toHaveLength(1);
  expect(screen.queryByRole('menu')).toBeNull();
  expect(screen.getByRole('button', { name: 'pet' })).toHaveAttribute('data-moru-reaction', 'shy');
});

it('finishes one reaction before accepting another and does not lose an explicit pause', () => {
  render(<BrandCompanion labels={labels} />);
  act(() => reveal(true));
  const pet = screen.getByRole('button', { name: 'pet' });
  fireEvent.click(pet);
  const first = animations.at(-1)!;
  expect(first.options.iterations ?? 1).toBe(1);
  fireEvent.click(pet); fireEvent.click(pet);
  expect(animations.at(-1)).toBe(first);
  fireEvent.contextMenu(screen.getByRole('button', { name: 'pet' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'pause' }));
  expect(first.pause).toHaveBeenCalled();
  act(() => first.onfinish?.());
  for (const animation of animations.slice(0, 3)) animation.play.mockClear();
  fireEvent.click(pet);
  expect(pet).toHaveAttribute('data-moru-reaction', 'clap');
  for (const animation of animations.slice(0, 3)) expect(animation.play).not.toHaveBeenCalled();
  expect(pet).toHaveAttribute('data-moru-paused', 'true');
});

it('suspends a pet reaction offscreen and cancels it when the view leaves', () => {
  const { unmount } = render(<BrandCompanion labels={labels} />);
  act(() => reveal(true));
  fireEvent.click(screen.getByRole('button', { name: 'pet' }));
  const reaction = animations.at(-1)!;
  hidden = true;
  fireEvent(document, new Event('visibilitychange'));
  expect(reaction.pause).toHaveBeenCalled();
  hidden = false;
  act(() => reveal(false));
  reaction.play.mockClear();
  fireEvent(document, new Event('visibilitychange'));
  expect(reaction.play).not.toHaveBeenCalled();
  act(() => reveal(true));
  expect(reaction.play).toHaveBeenCalled();
  unmount();
  expect(reaction.cancel).toHaveBeenCalled();
  expect(reaction.onfinish).toBeNull();
});

it('lands an airborne hop before responding and cancels the handoff when unmounted', () => {
  vi.useFakeTimers();
  const { unmount } = render(<BrandCompanion labels={labels} />);
  act(() => reveal(true));
  const motion = companionMotion(32);
  const airborne = motion.sprite.find(frame => motion.restAt(Number(frame.offset) * motion.duration).delay > 0)!;
  const time = Number(airborne.offset) * motion.duration;
  for (const animation of animations) animation.currentTime = time;
  const pet = screen.getByRole('button', { name: 'pet' });
  fireEvent.pointerEnter(pet);
  fireEvent.click(pet);
  expect(pet).not.toHaveAttribute('data-moru-reaction');
  const landing = motion.restAt(time);
  act(() => vi.advanceTimersByTime(landing.delay));
  expect(pet).toHaveAttribute('data-moru-reaction', 'shy');
  for (const animation of animations.slice(0, 3)) expect(animation.currentTime).toBe(landing.at);
  act(() => animations.at(-1)?.onfinish?.());
  for (const animation of animations.slice(0, 3)) animation.currentTime = time;
  fireEvent.click(pet);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('answers a pet with a still expression under reduced motion', () => {
  reduced = true;
  render(<BrandCompanion labels={labels} />);
  const pet = screen.getByRole('button', { name: 'pet' });
  fireEvent.click(pet);
  expect(pet).toHaveAttribute('data-moru-reaction', 'shy');
  expect(animations).toHaveLength(0);
});

it('lands before holding for a pointer and cancels that handoff when the pointer leaves', () => {
  vi.useFakeTimers();
  const { unmount } = render(<BrandCompanion labels={labels} />);
  act(() => reveal(true));
  const motion = companionMotion(32);
  const airborne = motion.sprite.find(frame => motion.restAt(Number(frame.offset) * motion.duration).delay > 0)!;
  const time = Number(airborne.offset) * motion.duration;
  for (const animation of animations) { animation.currentTime = time; animation.pause.mockClear(); animation.play.mockClear(); }
  const pet = screen.getByRole('button', { name: 'pet' });
  fireEvent.pointerEnter(pet);
  for (const animation of animations) {
    expect(animation.pause).not.toHaveBeenCalled();
    expect(animation.play).toHaveBeenCalled();
  }
  const landing = motion.restAt(time);
  act(() => vi.advanceTimersByTime(landing.delay));
  for (const animation of animations) {
    expect(animation.currentTime).toBe(landing.at);
    expect(animation.pause).toHaveBeenCalled();
  }
  fireEvent.pointerLeave(pet);
  for (const animation of animations) animation.currentTime = time;
  fireEvent.pointerEnter(pet);
  fireEvent.pointerLeave(pet);
  act(() => vi.advanceTimersByTime(landing.delay));
  for (const animation of animations) expect(animation.currentTime).toBe(time);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('opens playback only on a context-menu request and restores focus on Escape', async () => {
  render(<BrandCompanion labels={labels} />);
  const pet = screen.getByRole('button', { name: 'pet' });
  expect(screen.queryByRole('menu')).toBeNull();
  fireEvent.keyDown(pet, { key: 'F10', shiftKey: true });
  const item = screen.getByRole('menuitem', { name: 'pause' });
  await waitFor(() => expect(item).toHaveFocus());
  fireEvent.keyDown(item, { key: 'Escape' });
  expect(pet).toHaveFocus();
  expect(pet).toHaveAttribute('aria-expanded', 'false');
});
