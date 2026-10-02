import { act, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../../messages/en.json';
import koMessages from '../../../../../messages/ko.json';
import { recordApproval, listMachineApprovals } from '@/shared/lib/machine-approvals';
import { writeUpdateAutoCheck } from '@/features/app-update';
import { OUTBOUND_DESTINATION_PLACEHOLDERS, OUTBOUND_PATHS } from '../../model/outbound-paths';
import { PRIVACY_CATALOG } from '../../model/catalog/privacy';
import { PrivacyPane } from './PrivacyPane';

const shell = vi.hoisted(() => ({ desktop: true }));
const vault = vi.hoisted(() => ({
  recentVaults: [] as { id: string; name: string }[],
  forgetRecent: vi.fn(async () => {}),
}));

vi.mock('@/shared/lib/desktop-shell', () => ({ isDesktopShell: () => shell.desktop }));
vi.mock('@/entities/vault-session', () => ({ useLocalVault: () => vault }));

function withScope(messages: typeof enMessages, scope: string) {
  return {
    ...messages,
    nav: { ...messages.nav, settingsMenu: { ...messages.nav.settingsMenu, scope: { computer: scope } } },
  };
}

function mount(locale: 'en' | 'ko' = 'en', onShowSection = vi.fn()) {
  const messages = locale === 'en' ? withScope(enMessages, 'This computer') : withScope(koMessages as typeof enMessages, '이 컴퓨터');
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <PrivacyPane onShowSection={onShowSection} onClose={vi.fn()} />
    </NextIntlClientProvider>,
  );
  return onShowSection;
}

beforeEach(() => {
  let clock = Date.parse('2026-10-02T00:00:00Z');
  vi.spyOn(Date, 'now').mockImplementation(() => (clock += 1000));
  window.localStorage.clear();
  shell.desktop = true;
  vault.recentVaults = [];
  vault.forgetRecent.mockReset();
});

describe('Privacy · data says what can leave and what this computer remembers', () => {
  it('lists every desktop path, with honest wording for each destination in both locales', () => {
    mount();
    for (const path of OUTBOUND_PATHS) {
      expect(screen.getByTestId(`app-settings-outbound-${path.id}`).getAttribute('data-setting-id')).toBe('outbound');
    }
    expect(screen.getByTestId('app-settings-outbound-model-providers').textContent).toContain(
      'Recorded in .ontology-atlas/llm-audit.jsonl',
    );
    expect(screen.getByTestId('app-settings-outbound-coding-tools').textContent).toContain('Atlas does not see it');
    expect(screen.getByTestId('app-settings-privacy-outbound').textContent).toContain('This computer');
    for (const locale of [enMessages, koMessages] as const) {
      const words = locale.settingsPrivacy.destinations as Record<string, string>;
      for (const placeholder of OUTBOUND_DESTINATION_PLACEHOLDERS) expect(words[placeholder]?.length).toBeGreaterThan(0);
    }
  });

  it('shows the update check state and sends Change to About', () => {
    writeUpdateAutoCheck('off');
    const onShowSection = mount();
    expect(screen.getByTestId('app-settings-outbound-update-state').textContent).toBe('Off');
    fireEvent.click(screen.getByTestId('app-settings-outbound-update-change'));
    expect(onShowSection).toHaveBeenCalledWith('about');
  });

  it('on the web lists the website files, says the folder is never uploaded, and hides allowances', () => {
    shell.desktop = false;
    mount();
    expect(screen.getByTestId('app-settings-outbound-website-files')).toBeTruthy();
    expect(screen.queryByTestId('app-settings-outbound-update-check')).toBeNull();
    expect(screen.getByTestId('app-settings-privacy-lead').textContent).toContain('never uploaded');
    expect(screen.queryByTestId('app-settings-privacy-allowances')).toBeNull();
  });

  it('names allowed folders without the allowed definitions, and forgets one folder after two presses', () => {
    recordApproval('connector', '/Users/probe/alpha', 'c1', 'definition-value');
    recordApproval('round', '/Users/probe/alpha', 'r1', 'v1');
    recordApproval('round', '/Users/probe/beta', 'r1', 'v1');
    mount();
    const rows = screen.getAllByTestId('app-settings-allowances-folder');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('1 connector · 1 schedule'),
      expect.stringContaining('1 schedule'),
    ]);
    expect(screen.getByTestId('app-settings-privacy-allowances').textContent).not.toContain('definition-value');
    const forget = screen.getAllByTestId('app-settings-allowances-forget')[0]!;
    fireEvent.click(forget);
    expect(listMachineApprovals()).toHaveLength(3);
    act(() => {
      fireEvent.click(forget);
    });
    expect(listMachineApprovals()).toEqual([{ subject: 'round', folder: '/Users/probe/beta', id: 'r1' }]);
    expect(screen.getAllByTestId('app-settings-allowances-folder')).toHaveLength(1);
  });

  it('forgets every allowance with Forget all', () => {
    recordApproval('round', '/Users/probe/alpha', 'r1', 'v1');
    mount();
    const all = screen.getByTestId('app-settings-allowances-forget-all');
    fireEvent.click(all);
    act(() => {
      fireEvent.click(all);
    });
    expect(listMachineApprovals()).toEqual([]);
    expect(screen.getByTestId('app-settings-allowances-empty')).toBeTruthy();
  });

  it('forgets the whole recent list at once, and says so when it fails', async () => {
    vault.recentVaults = [
      { id: '1', name: 'alpha' },
      { id: '2', name: 'beta' },
    ];
    vault.forgetRecent.mockRejectedValueOnce(new Error('blocked'));
    mount();
    expect(screen.getByTestId('app-settings-recent-folders').textContent).toContain('2 folders remembered');
    const all = screen.getByTestId('app-settings-recent-forget-all');
    fireEvent.click(all);
    await act(async () => {
      fireEvent.click(all);
    });
    expect(vault.forgetRecent).toHaveBeenCalledWith(vault.recentVaults);
    expect(screen.getByTestId('app-settings-recent-folders').textContent).toContain('Could not forget');
  });

  it('draws in Korean', () => {
    mount('ko');
    expect(screen.getByTestId('app-settings-privacy-outbound').textContent).toContain('이 컴퓨터');
    expect(screen.getByTestId('app-settings-outbound-git-remote').textContent).toContain('Git 원격 저장소');
  });

  it('anchors every catalog entry the desktop pane draws', () => {
    recordApproval('round', '/Users/probe/alpha', 'r1', 'v1');
    mount();
    for (const entry of PRIVACY_CATALOG) {
      expect(document.querySelector(`[data-setting-id="${entry.id}"]`)).not.toBeNull();
    }
  });
});
