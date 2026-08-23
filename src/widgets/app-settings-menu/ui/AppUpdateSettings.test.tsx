import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ko from '../../../../messages/ko.json';
import type { AppUpdateValue } from '@/features/app-update';
import type { UpdatePhase } from '@/features/app-update';
import { AppUpdateSettings } from './AppUpdateSettings';

/**
 * 「Check for updates」 — this test's subject is **what was blocked
 * while this section did not exist**.
 *
 * Automatic checking and the bottom-right toast have existed since 2026-07-27, but
 * there was **no way for the user to press it**: `check(manual)` had 0 callers in
 * the whole repository, and 「Latest」 could not even be drawn because the toast
 * returned `null` for it. Automatic checks run once a day and a dismissal is
 * remembered for that version, so anyone who pressed 「Later」 once had **no way to
 * reach an update at all until the next version shipped.**
 */

const checkNow = vi.fn();
let contextValue: AppUpdateValue | null = null;
let desktop = true;

vi.mock('@/features/app-update', () => ({
  useAppUpdateContext: () => contextValue,
}));

vi.mock('@/shared/lib/desktop-shell', () => ({
  isDesktopShell: () => desktop,
}));

function makeValue(phase: UpdatePhase): AppUpdateValue {
  return { phase, checkNow, install: vi.fn(), restart: vi.fn(), dismiss: vi.fn() };
}

function renderAt(phase: UpdatePhase) {
  contextValue = makeValue(phase);
  return render(
    <NextIntlClientProvider locale="ko" messages={ko}>
      <AppUpdateSettings />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  checkNow.mockReset();
  desktop = true;
  contextValue = null;
});

describe('업데이트 확인 절', () => {
  it('버튼이 실제로 확인을 시작한다 — 이 배선이 없던 것이 결함이었다', () => {
    renderAt({ kind: 'idle' });
    fireEvent.click(screen.getByTestId('app-settings-update-check'));
    expect(checkNow).toHaveBeenCalledTimes(1);
  });

  it('아직 안 눌렀으면 결과를 말하지 않는다', () => {
    renderAt({ kind: 'idle' });
    expect(screen.queryByTestId('app-settings-update-result')).toBeNull();
  });

  it('확인 중에는 두 번 누르지 못한다', () => {
    renderAt({ kind: 'checking' });
    expect(screen.getByTestId('app-settings-update-check')).toBeDisabled();
  });

  it('최신이면 최신이라고 말한다 — 토스트가 못 하던 말이다', () => {
    renderAt({ kind: 'current' });
    const result = screen.getByTestId('app-settings-update-result');
    expect(result).toHaveAttribute('data-phase', 'current');
    expect(result.textContent).toBe(ko.nav.settingsMenu.appUpdate.resultCurrent);
  });

  it('새 버전이 있으면 버전을 대고, 이어지는 자리를 가리킨다', () => {
    renderAt({ kind: 'available', version: '1.2.0', notes: null });
    const result = screen.getByTestId('app-settings-update-result');
    expect(result.textContent).toContain('1.2.0');
  });

  it('실패는 실패라고 말한다 — 조용히 아무 일도 없던 척하지 않는다', () => {
    renderAt({ kind: 'failed', operation: 'check', message: 'network' });
    expect(screen.getByTestId('app-settings-update-result')).toHaveAttribute(
      'data-phase',
      'failed',
    );
  });

  it('웹에서는 절 자체가 없다 — 탭은 자기를 교체할 수 없다', () => {
    desktop = false;
    contextValue = makeValue({ kind: 'idle' });
    const { container } = render(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <AppUpdateSettings />
      </NextIntlClientProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('상태 기계가 없으면 아무것도 안 그린다 — 없는 능력을 있는 척하지 않는다', () => {
    contextValue = null;
    const { container } = render(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <AppUpdateSettings />
      </NextIntlClientProvider>,
    );
    expect(container.firstChild).toBeNull();
  });
});
