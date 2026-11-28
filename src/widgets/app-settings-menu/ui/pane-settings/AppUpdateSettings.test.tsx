import { fireEvent, render, screen } from '@testing-library/react';
import { IntlProvider } from 'use-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ko from '../../../../../messages/ko.json';
import type { useAppUpdateContext } from '@/features/app-update';
import { AppUpdateSettings } from './AppUpdateSettings';

type AppUpdateValue = NonNullable<ReturnType<typeof useAppUpdateContext>>;
type UpdatePhase = AppUpdateValue['phase'];

const checkNow = vi.fn();
let contextValue: AppUpdateValue | null = null;
let desktop = true;

let memory: Pick<AppUpdateValue, 'lastCheckedAt' | 'dismissedVersion'> = {
  lastCheckedAt: null,
  dismissedVersion: null,
};

let autoCheck: 'on' | 'off' = 'on';
const writeUpdateAutoCheck = vi.fn((value: 'on' | 'off') => {
  autoCheck = value;
});

vi.mock('@/features/app-update', () => ({
  useAppUpdateContext: () => contextValue,
  useUpdateAutoCheck: () => autoCheck,
  writeUpdateAutoCheck: (value: 'on' | 'off') => writeUpdateAutoCheck(value),
}));

let versionRead: () => Promise<string> = () => Promise.resolve('1.2.6');
vi.mock('@tauri-apps/api/app', () => ({
  getVersion: () => versionRead(),
}));

vi.mock('@/shared/lib/desktop-shell/desktop-shell', () => ({
  isDesktopShell: () => desktop,
}));

function makeValue(phase: UpdatePhase, pending: Partial<AppUpdateValue> = {}): AppUpdateValue {
  return {
    phase,
    noticeHidden: false,
    pendingVersion: null,
    readyVersion: null,
    ...memory,
    checkNow,
    install: vi.fn(),
    restart: vi.fn(),
    dismiss: vi.fn(),
    hide: vi.fn(),
    showNotice: vi.fn(),
    ...pending,
  };
}

function renderAt(phase: UpdatePhase, pending: Partial<AppUpdateValue> = {}) {
  contextValue = makeValue(phase, pending);
  return render(
    <IntlProvider locale="ko" messages={ko}>
      <AppUpdateSettings />
    </IntlProvider>,
  );
}

beforeEach(() => {
  checkNow.mockReset();
  writeUpdateAutoCheck.mockClear();
  autoCheck = 'on';
  desktop = true;
  contextValue = null;
  memory = { lastCheckedAt: null, dismissedVersion: null };
  versionRead = () => Promise.resolve('1.2.6');
});

describe('AppUpdateSettings', () => {
  it('states only what the automatic check remembers: never checked, or a deferred version', () => {
    renderAt({ kind: 'idle' });
    const auto = screen.getByTestId('app-settings-update-auto');
    expect(auto).toHaveTextContent(ko.settingsAbout.appUpdate.autoNever);
    expect(auto.textContent).not.toContain('「나중에」');
  });

  it('names a deferred version and says a check shows it again', () => {
    memory = { lastCheckedAt: Date.UTC(2026, 8, 25, 5, 3), dismissedVersion: '1.2.7' };
    renderAt({ kind: 'idle' });
    const auto = screen.getByTestId('app-settings-update-auto');
    expect(auto.textContent).not.toContain(ko.settingsAbout.appUpdate.autoNever);
    expect(auto).toHaveTextContent('1.2.7');
  });

  it('starts a check when the button is pressed', () => {
    renderAt({ kind: 'idle' });
    fireEvent.click(screen.getByTestId('app-settings-update-check'));
    expect(checkNow).toHaveBeenCalledTimes(1);
  });

  it('shows no result before the button is pressed', () => {
    renderAt({ kind: 'idle' });
    expect(screen.getByTestId('app-settings-update-result').textContent).toBe('');
  });

  it('disables the button while a check runs', () => {
    renderAt({ kind: 'checking' });
    const check = screen.getByTestId('app-settings-update-check');
    expect(check).toHaveAttribute('aria-disabled', 'true');
    expect(check).not.toBeDisabled();
    fireEvent.click(check);
    expect(checkNow).not.toHaveBeenCalled();
  });

  it('says the app is up to date', () => {
    renderAt({ kind: 'current' });
    const result = screen.getByTestId('app-settings-update-result');
    expect(result).toHaveAttribute('data-phase', 'current');
    expect(result.textContent).toBe(ko.settingsAbout.appUpdate.resultCurrent);
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
      <IntlProvider locale="ko" messages={ko}>
        <AppUpdateSettings />
      </IntlProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing without an updater state machine', () => {
    contextValue = null;
    const { container } = render(
      <IntlProvider locale="ko" messages={ko}>
        <AppUpdateSettings />
      </IntlProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('a failed check after a failed version read leaves one warning line, not two', async () => {
    versionRead = () => Promise.reject(new Error('ipc'));
    const view = renderAt({ kind: 'idle' });
    const row = screen.getByTestId('app-settings-update-version');
    const copy = ko.settingsAbout.appUpdate;
    await screen.findByText(copy.versionUnknown);
    fireEvent.click(screen.getByTestId('app-settings-update-check'));
    contextValue = makeValue({ kind: 'failed', operation: 'check', message: 'network' });
    view.rerender(
      <IntlProvider locale="ko" messages={ko}>
        <AppUpdateSettings />
      </IntlProvider>,
    );
    await screen.findByText(copy.versionUnknownRetried);
    expect(row.textContent).not.toContain(copy.versionUnknown);
    const warnings = Array.from(view.container.querySelectorAll('[class*="status-warning"]'));
    expect(warnings.map((node) => node.textContent)).toEqual([copy.resultFailed]);
  });

  it('turns the automatic check off and still offers the manual check and the last time', () => {
    memory = { lastCheckedAt: Date.UTC(2026, 8, 25, 5, 3), dismissedVersion: null };
    autoCheck = 'off';
    renderAt({ kind: 'idle' });
    const auto = screen.getByTestId('app-settings-update-auto');
    expect(auto).toHaveAttribute('data-setting-id', 'update-auto');
    expect(auto).toHaveTextContent(ko.settingsAbout.appUpdate.autoOff);
    expect(auto.textContent).not.toContain(ko.settingsAbout.appUpdate.autoNever);
    expect(screen.getByTestId('app-settings-update-check')).toHaveAttribute('data-setting-id', 'update-check');
    fireEvent.click(screen.getByRole('radio', { name: ko.settingsAbout.on }));
    expect(writeUpdateAutoCheck).toHaveBeenCalledWith('on');
  });

  it('orders the switch On before Off', () => {
    renderAt({ kind: 'idle' });
    const labels = Array.from(
      screen.getByTestId('app-settings-update-auto-switch').querySelectorAll('[role="radio"]'),
    ).map((node) => node.textContent);
    expect(labels).toEqual([ko.settingsAbout.on, ko.settingsAbout.off]);
  });

  it.each([
    ['an offered version', null, '2.1.0 버전이 나와 있어요.', 'install', '업데이트 설치'],
    ['a version waiting for restart', '2.1.0', '2.1.0 설치가 끝났어요.', 'restart', '지금 다시 시작'],
  ] as const)('names %s after its notice was put away and carries its action', (_, readyVersion, expected, action, label) => {
    renderAt({ kind: 'idle' }, { pendingVersion: '2.1.0', readyVersion });
    expect(screen.getByTestId('app-settings-update-result')).toHaveTextContent(expected);
    const chip = screen.getByTestId('app-settings-update-away-action');
    expect(chip).toHaveTextContent(label);
    fireEvent.click(chip);
    expect(contextValue?.[action]).toHaveBeenCalledTimes(1);
  });

  it('names a hidden download and brings its notice back', () => {
    renderAt({ kind: 'downloading', version: '2.1.0', received: 1, total: 4 }, { noticeHidden: true });
    expect(screen.getByTestId('app-settings-update-result')).toHaveTextContent('2.1.0 내려받는 중이에요.');
    fireEvent.click(screen.getByTestId('app-settings-update-away-action'));
    expect(contextValue?.showNotice).toHaveBeenCalledTimes(1);
  });

  it('offers no second action while the notice is on screen', () => {
    renderAt({ kind: 'downloading', version: '2.1.0', received: 1, total: 4 }, { pendingVersion: '2.1.0' });
    expect(screen.queryByTestId('app-settings-update-away-action')).toBeNull();
  });
});
