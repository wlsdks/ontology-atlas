import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setMotionPaused } from '@/shared/motion/motion-pause';

import { PULL_REACH, pullTarget, useSectionPull } from './use-section-pull';

describe('pullTarget', () => {
  const starts = [900, 1800, 2700];

  it('carries a rest on to the next start ahead within the reach', () => {
    expect(pullTarget(starts, 1500, 1, 378)).toBe(1800);
    expect(pullTarget(starts, 1100, -1, 378)).toBe(900);
  });

  it('never moves against the direction of travel or past the reach', () => {
    expect(pullTarget(starts, 1000, 1, 378)).toBeNull();
    expect(pullTarget(starts, 2500, -1, 378)).toBeNull();
    expect(pullTarget(starts, 1700, -1, 378)).toBeNull();
  });

  it('leaves a rest that already sits on a start where it is', () => {
    expect(pullTarget(starts, 1799, -1, 378)).toBeNull();
    expect(pullTarget(starts, 2700, 1, 378)).toBeNull();
  });
});

const HEIGHT = 900;
const FILM_TOP = 1000;
const HOW_TOP = 2000;

/**
 * A pane that scrolls a page with the film at 1000 and `#how` at 2000 of its content; a section's
 * rect is its content position less the pane's scroll offset, as a browser reports it.
 */
function mountPage(media: { reduced?: boolean; allowed?: boolean } = {}) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce') ? Boolean(media.reduced) : media.allowed !== false,
    addEventListener() {},
    removeEventListener() {},
  }));
  const pane = document.createElement('div');
  pane.setAttribute('data-app-shell-pane', '');
  Object.defineProperties(pane, {
    clientHeight: { value: HEIGHT },
    scrollHeight: { value: 6000 },
    onscrollend: { value: null },
  });
  pane.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
  const scrollTo = vi.fn();
  pane.scrollTo = scrollTo as unknown as HTMLElement['scrollTo'];
  for (const [attribute, top] of [
    ['data-testid=gateway-film', FILM_TOP],
    ['id=how', HOW_TOP],
  ] as const) {
    const section = document.createElement('section');
    const [name, value] = attribute.split('=');
    section.setAttribute(name, value);
    section.getBoundingClientRect = () => ({ top: top - pane.scrollTop }) as DOMRect;
    pane.append(section);
  }
  document.body.append(pane);
  renderHook(() => useSectionPull());

  const scrollBy = (delta: number) => {
    pane.scrollTop += delta;
    pane.dispatchEvent(new Event('scroll'));
  };
  const rest = () => pane.dispatchEvent(new Event('scrollend'));
  const wheel = (deltaY: number) => pane.dispatchEvent(new WheelEvent('wheel', { deltaY }));
  /** A scripted jump, as a browser reports it: one scroll and a rest, with no wheel or key. */
  const place = (top: number) => {
    pane.scrollTop = top;
    pane.dispatchEvent(new Event('scroll'));
    rest();
  };
  /** A wheel turn the reader makes: the pane moves by it and comes to rest. */
  const turn = (delta: number) => {
    wheel(delta);
    scrollBy(delta);
    rest();
  };
  return { pane, scrollTo, scrollBy, rest, wheel, turn, place };
}

describe('useSectionPull', () => {
  beforeEach(() => setMotionPaused(false));
  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
    setMotionPaused(false);
  });

  it('glides on to a section start a wheel left within the reach ahead', () => {
    const { place, scrollTo, turn } = mountPage();
    place(HOW_TOP - 300);
    turn(100);
    expect(scrollTo).toHaveBeenCalledWith({ top: HOW_TOP - 96, behavior: 'smooth' });
  });

  it('leaves a single notch away from a section where the reader put it, either way', () => {
    const { place, scrollTo, turn } = mountPage();
    place(FILM_TOP);
    turn(100);
    turn(-100);
    turn(-100);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('carries on only in the direction of travel', () => {
    const { place, scrollTo, turn } = mountPage();
    place(HOW_TOP - 96 - 150);
    turn(-100);
    expect(scrollTo).not.toHaveBeenCalled();
    place(FILM_TOP + 250);
    turn(-100);
    expect(scrollTo).toHaveBeenCalledWith({ top: FILM_TOP, behavior: 'smooth' });
  });

  it('pulls on the rest a scrolling key made, not one a link, script or Tab focus made', () => {
    const { place, scrollTo, scrollBy, rest } = mountPage();
    place(HOW_TOP - 300);
    scrollBy(100);
    rest();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    scrollBy(20);
    rest();
    expect(scrollTo).not.toHaveBeenCalled();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    scrollBy(40);
    rest();
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('does not pull again when its own glide comes to rest', () => {
    const { place, scrollTo, turn, scrollBy, rest } = mountPage();
    place(HOW_TOP - 300);
    turn(100);
    scrollBy(104);
    rest();
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['under reduced motion', { reduced: true }],
    ['on a small window or a coarse pointer', { allowed: false }],
  ])('stays still %s', (_, media) => {
    const { place, scrollTo, turn } = mountPage(media);
    place(HOW_TOP - 300);
    turn(100);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('stays still while the page motion is paused', () => {
    const { place, scrollTo, turn } = mountPage();
    setMotionPaused(true);
    place(HOW_TOP - 300);
    turn(100);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('reaches as far as its share of the window and no further', () => {
    const { place, scrollTo, turn } = mountPage();
    const reach = Math.floor(PULL_REACH * HEIGHT);
    place(HOW_TOP - 96 - reach - 102);
    turn(100);
    expect(scrollTo).not.toHaveBeenCalled();
    place(HOW_TOP - 96 - reach - 100);
    turn(100);
    expect(scrollTo).toHaveBeenCalledWith({ top: HOW_TOP - 96, behavior: 'smooth' });
  });
});
