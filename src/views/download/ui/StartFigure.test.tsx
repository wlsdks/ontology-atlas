import { act, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../messages/en.json';
import { frames, TEST_ENV } from './showpiece-player';
import { START_BEATS, START_DRAFT_COUNT, startRest, startTracks } from './start-scene';
import { StartSection } from './StartFigure';

function IntlWrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

const MEASURE = {
  wide: true,
  pointer: [
    { x: -900, y: -200 },
    { x: -500, y: -180 },
    { x: -120, y: -150 },
  ],
  stamp: { dx: -80, dy: 120 },
};

const m = enMessages as unknown as Record<string, Record<string, unknown>>;
const at = (key: string) => key.split('.').reduce<unknown>((node, step) => (node as Record<string, unknown>)[step], m) as string;

describe('the after-you-install choreography', () => {
  for (const wide of [true, false]) {
    const tracks = startTracks({ ...MEASURE, wide }, TEST_ENV);

    it(`moves at most 32 elements (${wide ? 'wide' : 'narrow'})`, () => {
      expect(Object.keys(tracks).length).toBeLessThanOrEqual(32);
    });

    it(`ends every lane on the frame React renders at rest (${wide ? 'wide' : 'narrow'})`, () => {
      for (const [part, lanes] of Object.entries(tracks)) {
        const rest = startRest(part, wide);
        for (const stops of lanes) {
          const last = frames(4000, stops).at(-1)!;
          for (const key of Object.keys(last)) {
            if (key === 'offset' || key === 'easing' || !(key in rest)) continue;
            const value = String(rest[key]);
            expect(String(last[key]), `${part}.${key}`).toBe(value.startsWith('var(') ? String(TEST_ENV.light.restAlpha) : value);
          }
        }
      }
    });
  }

  it('runs its beats on the spec’s clock', () => {
    expect(START_BEATS.presses).toEqual([420, 1300, 2300]);
    expect(START_BEATS.gutters).toEqual([520, 1400]);
    expect(START_BEATS.stamp).toBe(2450);
    expect(START_BEATS.tiers).toEqual([2600, 2640, 2680]);
    expect(START_BEATS.light).toBe(2800);
    expect(START_BEATS.state).toBe(3300);
  });
});

describe('StartSection', () => {
  const animate = vi.fn();
  let reduced = false;
  const observers: IntersectionObserverCallback[] = [];

  beforeEach(() => {
    reduced = false;
    observers.length = 0;
    animate.mockReset();
    animate.mockImplementation(() => ({
      pause: vi.fn(),
      play: vi.fn(),
      cancel: vi.fn(),
      finished: new Promise(() => undefined),
    }));
    Element.prototype.animate = animate as unknown as Element['animate'];
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('reduce') ? reduced : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          observers.push(callback);
        }
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (Element.prototype as { animate?: unknown }).animate;
  });

  const mount = () =>
    render(
      <IntlWrapper>
        <StartSection />
      </IntlWrapper>,
    );

  const deliver = (ratio: number) =>
    act(() => {
      for (const callback of observers) {
        callback([{ isIntersecting: ratio > 0, intersectionRatio: ratio } as IntersectionObserverEntry], {} as IntersectionObserver);
      }
    });

  it('renders the app’s own words for each step, and a description that tells the whole story', () => {
    mount();
    expect(screen.getByRole('figure', { name: /illustration/i })).toHaveAccessibleDescription(/Open a folder to start working/);
    const section = screen.getByTestId('download-start-section').textContent ?? '';
    for (const key of [
      'firstRun.eyebrow',
      'firstRun.title',
      'firstRun.openTitle',
      'firstRun.justStartTitle',
      'topology.startSteps.analyze.title',
      'topology.startSteps.analyze.bodyAgent',
      'topology.startSteps.analyze.ctaAgent',
      'acpChat.permission.ontologyWriteBody',
      'acpChat.permission.reject',
      'acpChat.permission.allowOnce',
      'acpChat.permission.answered.allow',
    ]) {
      expect(section, key).toContain(at(key));
    }
    expect(section).toContain(`Creates ${START_DRAFT_COUNT} concepts`);
    expect(section).toContain(`${START_DRAFT_COUNT} concepts an agent wrote`);
  });

  it('plays once it is a third in view, with a pause control', async () => {
    mount();
    deliver(0);
    expect(animate).not.toHaveBeenCalled();
    deliver(0.5);
    await waitFor(() => expect(animate).toHaveBeenCalled());
    expect(screen.getByTestId('download-start-figure')).toHaveAttribute('data-showpiece-state', 'running');
    expect(screen.getByRole('button', { name: 'Pause the illustration' })).toBeInTheDocument();
    deliver(0.1);
    await waitFor(() => expect(screen.getByTestId('download-start-figure')).toHaveAttribute('data-showpiece-state', 'paused'));
  });

  it('shows the rest frame on a reload with the figure already in view', async () => {
    mount();
    deliver(0.6);
    await waitFor(() => expect(screen.getByTestId('download-start-figure')).toHaveAttribute('data-showpiece-state', 'finished'));
    expect(animate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Play the illustration again' })).toBeInTheDocument();
  });

  it('under reduced motion is the rest frame: no animation and no control', () => {
    reduced = true;
    mount();
    deliver(0);
    deliver(0.6);
    expect(animate).not.toHaveBeenCalled();
    expect(screen.getByTestId('download-start-figure')).toHaveAttribute('data-showpiece-state', 'still');
    expect(screen.queryByTestId('download-start-figure-control')).toBeNull();
  });

  it('falls back to the rest frame when the browser refuses an animation', async () => {
    animate.mockImplementation(() => {
      throw new Error('refused');
    });
    mount();
    deliver(0);
    deliver(0.6);
    await waitFor(() => expect(screen.getByTestId('download-start-figure')).toHaveAttribute('data-showpiece-state', 'still'));
    expect(screen.queryByTestId('download-start-figure-control')).toBeNull();
  });
});
