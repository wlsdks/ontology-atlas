import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ko from '../../../../messages/ko.json';
import { DISMISSED_VERSION_KEY, type UpdatePhase } from '../model/update-state';
import { UpdateToast } from './UpdateToast';

const handlers = {
  onInstall: vi.fn(),
  onRestart: vi.fn(),
  onDismiss: vi.fn(),
  onHide: vi.fn(),
};

function renderPhase(phase: UpdatePhase) {
  return render(
    <NextIntlClientProvider locale="ko" messages={ko}>
      <UpdateToast phase={phase} {...handlers} />
    </NextIntlClientProvider>,
  );
}

const moru = () => screen.getByTestId('brand-waiting-mark');

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  for (const handler of Object.values(handlers)) handler.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('UpdateToast', () => {
  it.each<[string, UpdatePhase]>([
    ['idle', { kind: 'idle' }],
    ['checking', { kind: 'checking' }],
    ['current', { kind: 'current' }],
    ['a failed check that already lives in Settings', { kind: 'failed', operation: 'check', message: 'remote 404' }],
  ])('draws nothing for %s', (_, phase) => {
    renderPhase(phase);
    expect(screen.queryByTestId('app-update-toast')).not.toBeInTheDocument();
  });

  it('offers a new version with the greeting, then rests on the waiting loop', () => {
    renderPhase({ kind: 'available', version: '2.1.0', notes: null });
    const toast = screen.getByTestId('app-update-toast');
    expect(toast).toHaveTextContent('2.1.0 버전이 나왔어요');
    expect(toast).toHaveTextContent(ko.appUpdate.availableBody);
    expect(moru()).toHaveAttribute('data-moru-motion', 'greeting');
    expect(moru(), 'Moru moved before the card landed').toHaveAttribute('data-waiting-motion', 'still');

    fireEvent.click(within(toast).getByRole('button', { name: ko.appUpdate.install }));
    expect(handlers.onInstall).toHaveBeenCalledTimes(1);
    fireEvent.click(within(toast).getByRole('button', { name: ko.appUpdate.dismiss }));
    expect(handlers.onDismiss).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(1_000));
    fireEvent.animationEnd(moru());
    expect(moru()).toHaveAttribute('data-moru-motion', 'waiting');
  });

  it('shows a download with a real progress bar and Moru dancing', () => {
    renderPhase({ kind: 'downloading', version: '2.1.0', received: 6 * 1024 * 1024, total: 24 * 1024 * 1024 });
    const toast = screen.getByTestId('app-update-toast');
    expect(toast).toHaveTextContent('2.1.0 내려받는 중');
    expect(toast).toHaveTextContent('25% · 6.0 / 24.0 MB');
    expect(within(toast).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
    expect(moru()).toHaveAttribute('data-moru-motion', 'flipper-groove');
    expect(within(toast).queryByTestId('app-update-action')).not.toBeInTheDocument();
  });

  it('draws the fill moved, not stretched, to the received share', () => {
    renderPhase({ kind: 'downloading', version: '2.1.0', received: 9, total: 36 });
    expect(screen.getByTestId('app-update-fill').style.translate).toBe('-75% 0');
  });

  it('mounts a fresh fill when the size becomes known, so it never sweeps in from full', () => {
    const view = renderPhase({ kind: 'downloading', version: '2.1.0', received: 0, total: null });
    const sweep = within(screen.getByRole('progressbar')).getByText('', { selector: 'span' });
    view.rerender(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <UpdateToast phase={{ kind: 'downloading', version: '2.1.0', received: 1, total: 36 }} {...handlers} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId('app-update-fill'), 'the sweep element was reused and transitions from no offset').not.toBe(sweep);
  });

  it('hands one state to the next inside the same card, then drops the old one', () => {
    const view = renderPhase({ kind: 'available', version: '2.1.0', notes: null });
    const card = screen.getByTestId('app-update-toast');
    view.rerender(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <UpdateToast phase={{ kind: 'downloading', version: '2.1.0', received: 0, total: 10 }} {...handlers} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId('app-update-toast'), 'the card was replaced, so its box jumps').toBe(card);
    expect(card).toHaveAttribute('data-phase', 'downloading');
    const leaving = card.querySelector('[data-update-layer="leaving"]');
    expect(leaving, 'the previous state vanished in one frame').toHaveTextContent('2.1.0 버전이 나왔어요');
    expect(leaving).toHaveAttribute('inert');

    act(() => vi.advanceTimersByTime(1_000));
    expect(card.querySelector('[data-update-layer="leaving"]')).toBeNull();
  });

  it('fades the card out with its last state before it leaves', () => {
    const view = renderPhase({ kind: 'ready', version: '2.1.0' });
    view.rerender(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <UpdateToast phase={{ kind: 'idle' }} {...handlers} />
      </NextIntlClientProvider>,
    );
    const card = screen.getByTestId('app-update-toast');
    expect(card).toHaveAttribute('data-state', 'closed');
    expect(card).toHaveTextContent('2.1.0 준비됐어요');

    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.queryByTestId('app-update-toast')).not.toBeInTheDocument();
  });

  it('invents no percentage when the download size is unknown', () => {
    renderPhase({ kind: 'downloading', version: '2.1.0', received: 1_000, total: null });
    const toast = screen.getByTestId('app-update-toast');
    expect(toast).toHaveTextContent(ko.appUpdate.downloadingUnknown);
    expect(toast.textContent).not.toMatch(/\d+%/);
    expect(within(toast).getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
  });

  it('hides a download without dismissing its version', () => {
    renderPhase({ kind: 'downloading', version: '2.1.0', received: 1, total: 2 });
    fireEvent.click(screen.getByRole('button', { name: ko.appUpdate.hide }));
    expect(handlers.onHide).toHaveBeenCalledTimes(1);
    expect(handlers.onDismiss).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(DISMISSED_VERSION_KEY)).toBeNull();
  });

  it('asks for a restart with a finishing gesture', () => {
    renderPhase({ kind: 'ready', version: '2.1.0' });
    const toast = screen.getByTestId('app-update-toast');
    expect(toast).toHaveTextContent('2.1.0 준비됐어요');
    expect(moru()).toHaveAttribute('data-moru-motion', 'success');
    fireEvent.click(within(toast).getByRole('button', { name: ko.appUpdate.restart }));
    expect(handlers.onRestart).toHaveBeenCalledTimes(1);
  });

  it('offers a retry after an install failure and never shows the raw library error', () => {
    renderPhase({ kind: 'failed', operation: 'install', message: 'Could not fetch a valid release JSON from the remote' });
    const toast = screen.getByTestId('app-update-toast');
    expect(toast).toHaveTextContent('업데이트를 설치하지 못했어요');
    expect(toast).toHaveTextContent(ko.appUpdate.failedBody);
    expect(toast).not.toHaveTextContent('Could not fetch a valid release JSON');
    expect(moru()).toHaveAttribute('data-moru-motion', 'pondering');
    fireEvent.click(within(toast).getByRole('button', { name: ko.appUpdate.retry }));
    expect(handlers.onInstall).toHaveBeenCalledTimes(1);
    fireEvent.click(within(toast).getByRole('button', { name: ko.appUpdate.close }));
    expect(handlers.onDismiss).toHaveBeenCalledTimes(1);
  });
});
