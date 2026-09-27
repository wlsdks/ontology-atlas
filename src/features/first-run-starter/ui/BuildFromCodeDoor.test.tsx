import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import koMessages from '../../../../messages/ko.json';
import enMessages from '../../../../messages/en.json';

import { BuildFromCodeDoor } from './BuildFromCodeDoor';

import type { useBuildFromCode } from '../model/use-build-from-code';

/**
 * `build.errorText` is a kebab-case failure code; the door must render its catalogue sentence in
 * both locales rather than the bare token (`no-raw-error-copy.contract.test.ts` cannot see the
 * `a || t(…)` spelling).
 */

const CODES = ['permission-denied', 'target-missing', 'already-exists'] as const;

function buildWith(errorText: string | null): ReturnType<typeof useBuildFromCode> {
  return {
    stage: 'idle',
    location: null,
    reusesExisting: false,
    pickedMapFolder: false,
    errorText,
    chooseProject: vi.fn(async () => undefined),
    confirm: vi.fn(async () => undefined),
    reset: vi.fn(),
  };
}

function renderDoor(errorText: string | null, locale: 'ko' | 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'ko' ? koMessages : enMessages}>
      <BuildFromCodeDoor build={buildWith(errorText)} variant="card" />
    </NextIntlClientProvider>,
  );
}

describe('BuildFromCodeDoor shows failures as sentences rather than codes', () => {
  it.each(CODES)('does not render %s as a raw token (ko)', (code) => {
    renderDoor(code, 'ko');
    const line = screen.getByTestId('first-run-build-error');
    expect(line.textContent, 'the producer\'s code is being painted as copy').not.toContain(code);
    expect(line.textContent).toBe(koMessages.failures[code]);
    // The machine half stays where a developer reads it and a reader does not.
    expect(line.getAttribute('data-failure-detail')).toBe(code);
  });

  it.each(CODES)('%s reaches an English reader as a sentence too', (code) => {
    renderDoor(code, 'en');
    const line = screen.getByTestId('first-run-build-error');
    expect(line.textContent).toBe(enMessages.failures[code]);
    expect(line.getAttribute('data-failure-detail')).toBe(code);
  });

  it('falls back to the door sentence for an unrecognised failure', () => {
    // `messageOf` returns `''` when nothing recognised the failure.
    renderDoor('', 'ko');
    const line = screen.getByTestId('first-run-build-error');
    expect(line.textContent).toBe(koMessages.firstRunStarter.buildFromCodeFailed);
    expect(line.getAttribute('data-failure-detail')).toBeNull();
  });

  it('shows guidance instead of an error line when nothing failed', () => {
    renderDoor(null, 'ko');
    expect(screen.queryByTestId('first-run-build-error')).toBeNull();
    expect(screen.getByText(koMessages.firstRunStarter.buildFromCodeHint)).toBeTruthy();
  });

  /*
   * Proves this file's instrument: the pre-repair expression really produces the token.
   */
  it('probe: the pre-repair expression yields the bare token', () => {
    const errorText: string | null = 'permission-denied';
    const preRepair = errorText || koMessages.firstRunStarter.buildFromCodeFailed;
    expect(preRepair).toBe('permission-denied');
  });
});
