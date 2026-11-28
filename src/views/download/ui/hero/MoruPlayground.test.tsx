import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { IntlProvider } from 'use-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../../messages/en.json';
import { setMotionPaused } from '@/shared/motion/motion-pause';
import { MoruPlayground } from './MoruPlayground';

function renderOpen() {
  render(
    <IntlProvider locale="en" messages={enMessages} timeZone="UTC">
      <MoruPlayground open onClose={() => {}} />
    </IntlProvider>,
  );
  return screen.getByRole('dialog', { name: 'Play with Moru' });
}

function reduceMotion() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: query.includes('reduce'), addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

// jsdom has no 2D canvas; the round's rules run without one and draw nothing.
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
  // Unmount before lifting the pause, so a closing popup never starts a round on its way out.
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setMotionPaused(false);
});

describe('MoruPlayground', () => {
  it('explains what falls before the first round and starts with a countdown', () => {
    const dialog = renderOpen();
    const legend = within(dialog).getByRole('list', { name: 'What falls' });
    expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '+10 each; catch in a row for ×2 to ×4',
      'Golden star +50',
      'Bug: costs one of three lives',
      'Magnet 5 s · Slow motion 4 s',
    ]);
    act(() => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Start' }));
    });
    expect(dialog.querySelector('[data-moru-play-field]')).toHaveAttribute('data-phase', 'countdown');
    expect(within(dialog).getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    // Stopping during the countdown goes back to the start.
    act(() => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Stop' }));
    });
    expect(within(dialog).getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('keeps the round playable, and calm, when the system asks for less motion', () => {
    reduceMotion();
    const dialog = renderOpen();
    expect(within(dialog).getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(within(dialog).getByText(/plays calmly, without shaking or flashes/)).toBeInTheDocument();
  });

  it('rests the game while the page pause is on, and says why', () => {
    setMotionPaused(true);
    const rafs = vi.spyOn(window, 'requestAnimationFrame');
    const dialog = renderOpen();
    expect(within(dialog).queryByRole('button', { name: 'Start' })).toBeNull();
    expect(within(dialog).getByText(/Motion on this page is paused/)).toBeInTheDocument();
    expect(dialog.querySelector('[data-moru-play-canvas]')).toBeNull();
    // Only the focus hand-off asks for a frame; no game loop runs.
    expect(rafs.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
