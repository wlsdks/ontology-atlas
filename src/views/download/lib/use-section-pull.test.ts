import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setMotionPaused } from '@/shared/motion/motion-pause';

import {
  PULL_DWELL_MS,
  PULL_REACH,
  glideDuration,
  glideProgress,
  pullTarget,
  stageRest,
  useSectionPull,
} from './use-section-pull';

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

  it('decides by the section start but lands on its centred stage', () => {
    const stops = [{ near: 1800, rest: 1980 }];
    expect(pullTarget(stops, 1500, 1, 378)).toBe(1980);
    expect(pullTarget(stops, 1900, 1, 378)).toBe(1980);
    expect(pullTarget(stops, 1990, 1, 378)).toBeNull();
  });

  it('leaves a rest that already sits on a start where it is', () => {
    expect(pullTarget(starts, 1799, -1, 378)).toBeNull();
    expect(pullTarget(starts, 2700, 1, 378)).toBeNull();
  });
});

describe('stageRest', () => {
  const header = 65;
  const height = 860;

  it('rests on the section title while the stage fits under it', () => {
    expect(stageRest({ start: 3000, offset: 96, stageTop: 3186, stageBottom: 3700, header, height })).toBe(2904);
  });

  it('centres a stage that would run past the window under the header', () => {
    // The game frame of a 1900x860 window: 742px tall, 186px under the section start.
    const rest = stageRest({ start: 3000, offset: 96, stageTop: 3186, stageBottom: 3928, header, height });
    const top = 3186 - rest;
    expect(top).toBeGreaterThanOrEqual(header + 16);
    expect(top + 742).toBeLessThanOrEqual(height - 16);
    expect(top - header).toBeCloseTo(height - (top + 742), 0);
  });

  it('keeps a stage taller than the room at least 16px under the header', () => {
    expect(3186 - stageRest({ start: 3000, offset: 96, stageTop: 3186, stageBottom: 4186, header, height })).toBe(header + 16);
  });
});

describe('the glide', () => {
  it('lasts long enough to read as a pull and never longer than 640ms', () => {
    expect(glideDuration(100)).toBe(480);
    expect(glideDuration(371)).toBeCloseTo(593.6);
    expect(glideDuration(-371)).toBeCloseTo(593.6);
    expect(glideDuration(900)).toBe(640);
  });

  it('eases in and out and never steps back', () => {
    let previous = glideProgress(0);
    expect(previous).toBe(0);
    for (let i = 1; i <= 100; i += 1) {
      const next = glideProgress(i / 100);
      expect(next).toBeGreaterThanOrEqual(previous);
      previous = next;
    }
    expect(previous).toBe(1);
    // Peak speed of a 371px glide, in px per second: about a fifth of a smooth scroll's.
    const duration = glideDuration(371);
    const peak = ((glideProgress(0.505) - glideProgress(0.495)) / (0.01 * duration)) * 371 * 1000;
    expect(peak).toBeLessThan(1000);
  });
});

const HEIGHT = 900;
const FILM_TOP = 1000;
const BUILD_TOP = 2000;

/**
 * A pane that scrolls a page with the film at 1000 and `#build` at 2000 of its content; a section's
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
  /** The glide writes one offset a frame; the mock records each and moves the pane there. */
  const scrollTo = vi.fn((options: ScrollToOptions) => {
    pane.scrollTop = options.top ?? pane.scrollTop;
  });
  pane.scrollTo = scrollTo as unknown as HTMLElement['scrollTo'];
  for (const [attribute, top] of [
    ['data-testid=gateway-film', FILM_TOP],
    ['id=build', BUILD_TOP],
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
  /** Where the last glide frame left the pane, after the dwell and the glide have both run. */
  const landing = () => {
    vi.advanceTimersByTime(PULL_DWELL_MS + 1000);
    return scrollTo.mock.calls.at(-1)?.[0];
  };
  return { pane, scrollTo, scrollBy, rest, wheel, turn, place, landing };
}

describe('useSectionPull', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setMotionPaused(false);
  });
  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    setMotionPaused(false);
  });

  it('glides on to a section start a wheel left within the reach ahead, after a dwell', () => {
    const { place, scrollTo, turn, landing } = mountPage();
    place(BUILD_TOP - 300);
    turn(100);
    vi.advanceTimersByTime(PULL_DWELL_MS - 10);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(landing()).toEqual({ top: BUILD_TOP - 96, behavior: 'instant' });
    const path = scrollTo.mock.calls.map(([options]) => options.top as number);
    expect(path.length).toBeGreaterThan(20);
    expect(path.every((top, i) => i === 0 || top >= path[i - 1]!)).toBe(true);
  });

  it.each([
    ['a wheel turn', (pane: HTMLElement) => pane.dispatchEvent(new WheelEvent('wheel', { deltaY: 40 }))],
    ['a key', () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))],
    ['a pointer press', () => window.dispatchEvent(new Event('pointerdown'))],
    ['a touch', () => window.dispatchEvent(new Event('touchstart'))],
  ])('lets go of the glide at %s', (_, input) => {
    const { pane, place, scrollTo, turn } = mountPage();
    place(BUILD_TOP - 300);
    turn(100);
    vi.advanceTimersByTime(PULL_DWELL_MS + 200);
    const reached = pane.scrollTop;
    expect(reached).toBeGreaterThan(BUILD_TOP - 200);
    expect(reached).toBeLessThan(BUILD_TOP - 96);
    const calls = scrollTo.mock.calls.length;
    input(pane);
    vi.advanceTimersByTime(1000);
    expect(scrollTo).toHaveBeenCalledTimes(calls);
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
    const { place, scrollTo, turn, landing } = mountPage();
    place(BUILD_TOP - 96 - 150);
    turn(-100);
    expect(scrollTo).not.toHaveBeenCalled();
    place(FILM_TOP + 250);
    turn(-100);
    expect(landing()).toEqual({ top: FILM_TOP, behavior: 'instant' });
  });

  it('pulls on the rest a scrolling key made, not one a link, script or Tab focus made', () => {
    const { place, scrollTo, scrollBy, rest, landing } = mountPage();
    place(BUILD_TOP - 300);
    scrollBy(100);
    rest();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    scrollBy(20);
    rest();
    vi.advanceTimersByTime(1000);
    expect(scrollTo).not.toHaveBeenCalled();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    scrollBy(40);
    rest();
    expect(landing()).toEqual({ top: BUILD_TOP - 96, behavior: 'instant' });
  });

  it('does not pull again when its own glide comes to rest', () => {
    const { pane, place, scrollTo, turn, rest, landing } = mountPage();
    place(BUILD_TOP - 300);
    turn(100);
    landing();
    const calls = scrollTo.mock.calls.length;
    pane.dispatchEvent(new Event('scroll'));
    rest();
    vi.advanceTimersByTime(1000);
    expect(scrollTo).toHaveBeenCalledTimes(calls);
  });

  it.each([
    ['under reduced motion', { reduced: true }],
    ['on a small window or a coarse pointer', { allowed: false }],
  ])('stays still %s', (_, media) => {
    const { place, scrollTo, turn } = mountPage(media);
    place(BUILD_TOP - 300);
    turn(100);
    vi.advanceTimersByTime(1000);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('stays still while the page motion is paused', () => {
    const { place, scrollTo, turn } = mountPage();
    setMotionPaused(true);
    place(BUILD_TOP - 300);
    turn(100);
    vi.advanceTimersByTime(1000);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('reaches as far as its share of the window and no further', () => {
    const { place, scrollTo, turn, landing } = mountPage();
    const reach = Math.floor(PULL_REACH * HEIGHT);
    place(BUILD_TOP - 96 - reach - 102);
    turn(100);
    vi.advanceTimersByTime(1000);
    expect(scrollTo).not.toHaveBeenCalled();
    place(BUILD_TOP - 96 - reach - 100);
    turn(100);
    expect(landing()).toEqual({ top: BUILD_TOP - 96, behavior: 'instant' });
  });
});
