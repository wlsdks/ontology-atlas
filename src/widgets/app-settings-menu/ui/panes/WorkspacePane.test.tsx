import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../../messages/en.json';
import koMessages from '../../../../../messages/ko.json';
import { WORKSPACE_CATALOG } from '../../model/catalog/workspace';
import { WorkspacePane } from './WorkspacePane';

const env = vi.hoisted(() => ({
  desktop: true,
  push: vi.fn(),
  gitStatus: vi.fn(),
  roundsRead: vi.fn(),
  sourcesRead: vi.fn(),
  connectors: {
    status: 'ready' as string,
    connectors: [] as { id: string }[],
    allowedHere: (connector: { id: string }) => connector.id === 'c1',
  },
}));
const vault = vi.hoisted(() => ({
  status: 'loaded' as string,
  handle: { name: 'atlas-vault' } as { name: string } | null,
  manifest: { docs: [] as unknown[] },
  recentVaults: [] as { id: string; name: string; desktopRootPath?: string }[],
  errorCode: null as string | null,
  open: vi.fn(),
  openRecent: vi.fn(),
  forgetRecent: vi.fn(async () => {}),
  requestPermission: vi.fn(),
  scaffoldOntology: vi.fn(),
}));

vi.mock('@/shared/lib/desktop-shell', () => ({ isDesktopShell: () => env.desktop }));
vi.mock('@/entities/vault-session', () => ({ useLocalVault: () => vault }));
vi.mock('@/features/mcp-connectors', () => ({ useVaultConnectors: () => env.connectors }));
vi.mock('@/features/ontology-blocks', () => ({ BlockImportModule: () => null }));
vi.mock('@/entities/library-round', () => ({
  createVaultFileRoundStore: () => ({ read: env.roundsRead }),
}));
vi.mock('@/shared/lib/project-source-store', () => ({
  createVaultFileProjectSourceStore: () => ({ read: env.sourcesRead }),
}));
vi.mock('@/shared/lib/tauri-git', () => ({ gitStatus: env.gitStatus }));
vi.mock('@/shared/lib/tauri-vault-fs', () => ({
  getTauriVaultRootPath: () => (env.desktop ? '/Users/probe/atlas-vault' : null),
  isTauriVaultRuntime: () => env.desktop,
  openTauriVaultInFinder: vi.fn(),
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: env.push }),
}));
vi.mock('@/shared/ui/toast', () => ({ useToast: () => ({ show: vi.fn() }) }));

function withScope(messages: typeof enMessages, scope: string) {
  return {
    ...messages,
    nav: { ...messages.nav, settingsMenu: { ...messages.nav.settingsMenu, scope: { folder: scope } } },
  };
}

function mount(locale: 'en' | 'ko' = 'en', onClose = vi.fn()) {
  const messages =
    locale === 'en'
      ? withScope(enMessages, 'This folder')
      : withScope(koMessages as typeof enMessages, '이 폴더');
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <WorkspacePane mode="local" onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return onClose;
}

beforeEach(() => {
  env.desktop = true;
  env.push.mockReset();
  env.connectors.status = 'ready';
  env.connectors.connectors = [{ id: 'c1' }, { id: 'c2' }];
  env.roundsRead.mockReset().mockResolvedValue({
    status: 'ok',
    state: { rounds: [{ enabled: true }, { enabled: false }, { enabled: true }] },
  });
  env.sourcesRead.mockReset().mockResolvedValue({ status: 'ok', bindings: [{}] });
  env.gitStatus.mockReset().mockResolvedValue({ initialized: true, branch: 'main', hasOrigin: true });
  vault.status = 'loaded';
  vault.handle = { name: 'atlas-vault' };
  vault.recentVaults = [];
  vault.forgetRecent.mockReset().mockResolvedValue(undefined);
});

describe('the Ontology folder pane', () => {
  it("keeps today's rows without Wiki write mode", () => {
    mount();
    expect(screen.getByTestId('app-settings-workspace-folder').textContent).toContain('atlas-vault');
    expect(screen.getByTestId('app-settings-vault-path').textContent).toContain('/Users/probe/atlas-vault');
    expect(screen.getByTestId('app-settings-vault-docs')).toBeTruthy();
    expect(screen.queryByTestId('app-settings-wiki-write-mode')).toBeNull();
  });

  it('reads what the folder keeps and says where it lives', async () => {
    mount();
    await waitFor(() =>
      expect(screen.getByTestId('app-settings-folder-door-schedules').textContent).toContain('3 schedules · 1 paused'),
    );
    expect(screen.getByTestId('app-settings-folder-door-connectors').textContent).toContain(
      '2 in this folder · 1 allowed here',
    );
    await waitFor(() =>
      expect(screen.getByTestId('app-settings-folder-door-git').textContent).toContain('Branch main · remote set'),
    );
    expect(screen.getByTestId('app-settings-folder-door-projects').textContent).toContain('1 project connected');
    expect(env.gitStatus).toHaveBeenCalledWith('/Users/probe/atlas-vault');
    expect(screen.getByTestId('app-settings-folder-kept').textContent).toContain('This folder');
    expect(screen.getByTestId('app-settings-folder-kept-caption').textContent).toContain('.ontology-atlas/');
  });

  it('reads nothing while no folder is loaded', () => {
    vault.status = 'idle';
    vault.handle = null;
    mount();
    expect(env.roundsRead).not.toHaveBeenCalled();
    expect(env.sourcesRead).not.toHaveBeenCalled();
    expect(env.gitStatus).not.toHaveBeenCalled();
    expect(screen.getByTestId('app-settings-folder-door-projects').textContent).toContain('Open a folder');
  });

  it('closes the sheet and leaves through a door', () => {
    const onClose = mount();
    fireEvent.click(screen.getByTestId('app-settings-folder-door-connectors'));
    expect(onClose).toHaveBeenCalled();
    expect(env.push).toHaveBeenCalledWith(expect.stringContaining('/agents/'));
  });

  it('draws no schedules or Git door on the web', () => {
    env.desktop = false;
    mount();
    expect(screen.queryByTestId('app-settings-folder-door-schedules')).toBeNull();
    expect(screen.queryByTestId('app-settings-folder-door-git')).toBeNull();
    expect(env.gitStatus).not.toHaveBeenCalled();
    expect(screen.getByTestId('app-settings-folder-door-connectors').textContent).toContain('2 in this folder');
  });

  it('forgets a recent folder only after the second press', async () => {
    vault.status = 'idle';
    vault.handle = null;
    vault.recentVaults = [{ id: '1', name: 'older' }];
    mount();
    const forget = screen.getByTestId('app-settings-recent-vault-forget');
    fireEvent.click(forget);
    expect(vault.forgetRecent).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(forget);
    });
    expect(vault.forgetRecent).toHaveBeenCalledWith(vault.recentVaults[0]);
  });

  it('anchors every desktop catalog entry it draws, and draws in Korean', async () => {
    mount('ko');
    await waitFor(() => expect(screen.getByTestId('app-settings-folder-door-git').textContent).toContain('브랜치 main'));
    for (const entry of WORKSPACE_CATALOG) {
      if (entry.id === 'folder-import') continue;
      expect(document.querySelector(`[data-setting-id="${entry.id}"]`)).not.toBeNull();
    }
    expect(screen.getByTestId('app-settings-folder-kept').textContent).toContain('이 폴더');
  });
});
