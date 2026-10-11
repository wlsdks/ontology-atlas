import { act, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../../../messages/en/ontologyPages.json';
import ko from '../../../../../messages/ko/ontologyPages.json';
import { SourceDateRecovery } from './SourceDateRecovery';

describe('source date recovery', () => {
  it.each([['en', en], ['ko', ko]] as const)('keeps the picker action pending and exposes wrong-folder recovery in %s', async (locale, messages) => {
    let finish!: () => void;
    const choose = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const retry = vi.fn();
    const view = (status: string) => <NextIntlClientProvider locale={locale} messages={{ ontologyPages: messages }}><SourceDateRecovery status={status} onChoose={choose} onRetry={retry} /></NextIntlClientProvider>;
    const { rerender } = render(view('ungranted'));
    fireEvent.click(screen.getByTestId('analysis-choose-source'));
    expect(screen.getByTestId('analysis-choose-source')).toBeDisabled();
    expect(choose).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    rerender(view('wrong-folder'));
    expect(screen.getByRole('status')).toBeVisible();
    expect(screen.getByTestId('analysis-choose-source')).toBeEnabled();
    rerender(view('binding-changed'));
    fireEvent.click(screen.getByTestId('analysis-retry-source'));
    expect(retry).toHaveBeenCalledTimes(1);
    rerender(view('app-only'));
    expect(screen.queryByTestId('analysis-source-recovery')).toBeNull();
  });
});
