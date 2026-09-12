import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import koMessages from '../../../../messages/ko.json';
import enMessages from '../../../../messages/en.json';

import { BuildFromCodeDoor } from './BuildFromCodeDoor';

import type { useBuildFromCode } from '../model/use-build-from-code';

/**
 * **R3 of the re-inspection before v1.2.2 — a bare failure code painted as Korean copy.**
 *
 * `use-build-from-code.ts` returns `failureCodeOf(err) ?? ''`, so `build.errorText` is a
 * kebab-case **code**. This door rendered `{build.errorText || t('buildFromCodeFailed')}`,
 * which put the literal token `permission-denied` onto a Korean first-run screen. Its sibling
 * `BuildFromCodeConfirmDialog` had been converted in the same change; this one had not, and
 * neither rule in `no-raw-error-copy.contract.test.ts` could see it — no `.message`, no catch
 * binding, and the `a || t(…)` spelling was outside the matcher.
 *
 * The inspection could not force the native folder picker into a permission failure, so the
 * defect was source-confirmed and runtime-unconfirmed. This file is the cheap reproduction: the
 * producer's own code, handed to the door as state, rendered in both locales.
 */

/** The three codes `failureCodeOf` mints from a folder-pick refusal. */
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

describe('내 코드로 지도 만들기 — 실패는 코드가 아니라 문장으로 보인다', () => {
  it.each(CODES)('%s 는 화면에 토큰으로 남지 않는다 (ko)', (code) => {
    renderDoor(code, 'ko');
    const line = screen.getByTestId('first-run-build-error');
    expect(line.textContent, 'the producer\'s code is being painted as copy').not.toContain(code);
    // The catalogue's own sentence for the code, not the door's generic fallback.
    expect(line.textContent).toBe(koMessages.failures[code]);
    // The machine half is kept where a developer reads it and a reader does not.
    expect(line.getAttribute('data-failure-detail')).toBe(code);
  });

  it.each(CODES)('%s reaches an English reader as a sentence too', (code) => {
    renderDoor(code, 'en');
    const line = screen.getByTestId('first-run-build-error');
    expect(line.textContent).toBe(enMessages.failures[code]);
    expect(line.getAttribute('data-failure-detail')).toBe(code);
  });

  it('알아보지 못한 실패는 이 문의 자기 문장으로 떨어진다', () => {
    // `messageOf` returns `''` for "it failed and nothing recognised it".
    renderDoor('', 'ko');
    const line = screen.getByTestId('first-run-build-error');
    expect(line.textContent).toBe(koMessages.firstRunStarter.buildFromCodeFailed);
    expect(line.getAttribute('data-failure-detail')).toBeNull();
  });

  it('실패가 없으면 오류 줄 대신 안내가 선다', () => {
    renderDoor(null, 'ko');
    expect(screen.queryByTestId('first-run-build-error')).toBeNull();
    expect(screen.getByText(koMessages.firstRunStarter.buildFromCodeHint)).toBeTruthy();
  });

  /*
   * The probe for this file's own instrument: the pre-repair expression, evaluated here, really
   * does produce the token. Without this the assertions above could pass against a screen that
   * never had the defect.
   */
  it('probe: the pre-repair expression yields the bare token', () => {
    const errorText: string | null = 'permission-denied';
    const preRepair = errorText || koMessages.firstRunStarter.buildFromCodeFailed;
    expect(preRepair).toBe('permission-denied');
  });
});
