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

let memory: { lastCheckedAt: number | null; dismissedVersion: string | null } = {
  lastCheckedAt: null,
  dismissedVersion: null,
};

vi.mock('@/features/app-update', () => ({
  useAppUpdateContext: () => contextValue,
  readUpdateMemory: () => memory,
}));

let versionRead: () => Promise<string> = () => Promise.resolve('1.2.6');
vi.mock('@tauri-apps/api/app', () => ({
  getVersion: () => versionRead(),
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
  memory = { lastCheckedAt: null, dismissedVersion: null };
  versionRead = () => Promise.resolve('1.2.6');
});

describe('AppUpdateSettings', () => {
  it('states only what the automatic check remembers: never checked, or a deferred version', () => {
    renderAt({ kind: 'idle' });
    const auto = screen.getByTestId('app-settings-update-auto');
    expect(auto).toHaveTextContent(ko.nav.settingsMenu.appUpdate.autoNever);
    expect(auto.textContent).not.toContain('「나중에」');
  });

  it('names a deferred version and says a check shows it again', () => {
    memory = { lastCheckedAt: Date.UTC(2026, 8, 25, 5, 3), dismissedVersion: '1.2.7' };
    renderAt({ kind: 'idle' });
    const auto = screen.getByTestId('app-settings-update-auto');
    expect(auto.textContent).not.toContain(ko.nav.settingsMenu.appUpdate.autoNever);
    expect(auto).toHaveTextContent('1.2.7');
  });

  it('starts a check when the button is pressed', () => {
    renderAt({ kind: 'idle' });
    fireEvent.click(screen.getByTestId('app-settings-update-check'));
    expect(checkNow).toHaveBeenCalledTimes(1);
  });

  it('shows no result before the button is pressed', () => {
    renderAt({ kind: 'idle' });
    // The live region stands empty so the first result is announced when it arrives.
    expect(screen.getByTestId('app-settings-update-result').textContent).toBe('');
  });

  it('disables the button while a check runs', () => {
    renderAt({ kind: 'checking' });
    const check = screen.getByTestId('app-settings-update-check');
    // aria-disabled rather than disabled: a disabled button drops the focus it holds.
    expect(check).toHaveAttribute('aria-disabled', 'true');
    expect(check).not.toBeDisabled();
    fireEvent.click(check);
    expect(checkNow).not.toHaveBeenCalled();
  });

  it('says the app is up to date', () => {
    renderAt({ kind: 'current' });
    const result = screen.getByTestId('app-settings-update-result');
    expect(result).toHaveAttribute('data-phase', 'current');
    expect(result.textContent).toBe(ko.nav.settingsMenu.appUpdate.resultCurrent);
  });

  it('names an available version and points to where the update continues', () => {
    renderAt({ kind: 'available', version: '1.2.0', notes: null });
    const result = screen.getByTestId('app-settings-update-result');
    expect(result.textContent).toContain('1.2.0');
  });

  it('reports a failed check', () => {
    renderAt({ kind: 'failed', operation: 'check', message: 'network' });
    expect(screen.getByTestId('app-settings-update-result')).toHaveAttribute(
      'data-phase',
      'failed',
    );
  });

  it('renders nothing on the web', () => {
    desktop = false;
    contextValue = makeValue({ kind: 'idle' });
    const { container } = render(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <AppUpdateSettings />
      </NextIntlClientProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing without an updater state machine', () => {
    contextValue = null;
    const { container } = render(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <AppUpdateSettings />
      </NextIntlClientProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('a failed check after a failed version read leaves one warning line, not two', async () => {
    versionRead = () => Promise.reject(new Error('ipc'));
    const view = renderAt({ kind: 'idle' });
    const row = screen.getByTestId('app-settings-update-version');
    const copy = ko.nav.settingsMenu.appUpdate;
    await screen.findByText(copy.versionUnknown);
    fireEvent.click(screen.getByTestId('app-settings-update-check'));
    contextValue = makeValue({ kind: 'failed', operation: 'check', message: 'network' });
    view.rerender(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <AppUpdateSettings />
      </NextIntlClientProvider>,
    );
    await screen.findByText(copy.versionUnknownRetried);
    // The row no longer promises the retry that just ran, and only the result line warns.
    expect(row.textContent).not.toContain(copy.versionUnknown);
    const warnings = Array.from(view.container.querySelectorAll('[class*="status-warning"]'));
    expect(warnings.map((node) => node.textContent)).toEqual([copy.resultFailed]);
  });
});
