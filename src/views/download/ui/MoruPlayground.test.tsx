import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../messages/en.json';
import { setMotionPaused } from '@/shared/motion/motion-pause';
import { MoruPlayground } from './MoruPlayground';

function renderOpen() {
  render(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
      <MoruPlayground open onClose={() => {}} />
    </NextIntlClientProvider>,
  );
  return screen.getByRole('dialog', { name: 'Play with Moru' });
}

function reduceMotion() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: query.includes('reduce'), addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  setMotionPaused(false);
});

describe('MoruPlayground without motion', () => {
  it('offers only the toys, each a still pose, when the system asks for less motion', () => {
    reduceMotion();
    const rafs = vi.spyOn(window, 'requestAnimationFrame');
    const dialog = renderOpen();
    expect(within(dialog).queryByRole('button', { name: 'Start' })).toBeNull();
    expect(within(dialog).getByText(/asks for less motion/)).toBeInTheDocument();
    const toys = within(dialog).getByRole('group', { name: 'Ask Moru' });
    expect(within(toys).getAllByRole('button').map((b) => b.textContent)).toEqual(['Sing', 'Hearts', 'Fish', 'Clap']);

    act(() => {
      fireEvent.click(within(toys).getByRole('button', { name: 'Clap' }));
    });
    const shown = dialog.querySelectorAll<HTMLImageElement>('[data-moru-sheet]:not([hidden])');
    expect(shown).toHaveLength(1);
    expect(shown[0].dataset.moruSheet).toBe('reactions');
    expect(shown[0].style.transform).not.toBe('translate(0px, 0px)');
    expect(dialog.querySelector('[data-moru-play-item]')).toBeNull();
    // The playground schedules no frames of its own; anything else on the page is not its doing.
    expect(rafs.mock.calls.length).toBe(0);
  });

  it('rests the game while the page pause is on, and says why', () => {
    setMotionPaused(true);
    const dialog = renderOpen();
    expect(within(dialog).queryByRole('button', { name: 'Start' })).toBeNull();
    expect(within(dialog).getByText(/Motion on this page is paused/)).toBeInTheDocument();
  });
});
