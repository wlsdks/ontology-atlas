import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IntlProvider } from 'use-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../../messages/en.json';
import { MoruPlayEntry } from './MoruPlayEntry';

// jsdom has no 2D canvas; the popup's round runs without one and draws nothing.
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  vi.restoreAllMocks();
});

function renderEntry() {
  render(
    <IntlProvider locale="en" messages={enMessages} timeZone="UTC">
      <MoruPlayEntry />
    </IntlProvider>,
  );
  return screen.getByRole('button', { name: "I'm Moru, Atlas's little friend. Play a mini game with me" });
}

describe("the hero's tiny Moru opens a popup to play with Moru", () => {
  it('moves focus in, keeps Tab inside, closes on Escape and returns focus to the opener', async () => {
    const opener = renderEntry();
    expect(opener).toHaveAttribute('aria-haspopup', 'dialog');
    opener.focus();
    act(() => {
      fireEvent.click(opener);
    });
    const dialog = screen.getByRole('dialog', { name: 'Play with Moru' });
    const start = within(dialog).getByRole('button', { name: 'Start' });
    await waitFor(() => expect(start).toHaveFocus());
    expect(document.body.style.overflow).toBe('hidden');

    const close = within(dialog).getByRole('button', { name: 'Close' });
    close.focus();
    act(() => {
      fireEvent.keyDown(window, { key: 'Tab' });
    });
    expect(start).toHaveFocus();

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('closes from its visible close button and starts a game from the keyboard', async () => {
    const opener = renderEntry();
    opener.focus();
    act(() => {
      fireEvent.click(opener);
    });
    const dialog = screen.getByRole('dialog');
    act(() => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Start' }));
    });
    const stop = within(dialog).getByRole('button', { name: 'Stop' });
    await waitFor(() => expect(stop).toHaveFocus());
    expect(within(dialog).getByText('Score 0')).toBeInTheDocument();

    act(() => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(opener).toHaveFocus();
  });
});
