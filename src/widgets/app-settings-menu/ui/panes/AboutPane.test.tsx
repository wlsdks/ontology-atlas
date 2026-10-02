import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import en from '../../../../../messages/en.json';
import { ABOUT_CATALOG } from '../../model/catalog/about';
import { AboutPane } from './AboutPane';

let desktop = false;
const push = vi.fn();
const requestShortcutSheet = vi.fn(() => true);
const revealAppLogFolder = vi.fn(() => Promise.resolve());
const copyText = vi.fn((_text: string) => Promise.resolve(true));

vi.mock('@/shared/lib/desktop-shell', () => ({
  isDesktopShell: () => desktop,
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/shared/lib/surface-requests', () => ({
  requestShortcutSheet: () => requestShortcutSheet(),
}));

vi.mock('@/shared/lib/tauri-app-logs', () => ({
  revealAppLogFolder: () => revealAppLogFolder(),
}));

vi.mock('@/shared/lib/copy-text', () => ({
  copyText: (text: string) => copyText(text),
}));

vi.mock('@/entities/vault-session', () => ({
  useLocalVault: () => ({
    status: 'loaded',
    manifest: {
      docs: [
        { slug: 'project', frontmatter: { kind: 'project', title: 'Private Name' } },
        { slug: 'capabilities/search', frontmatter: { kind: 'capability' } },
      ],
    },
  }),
}));

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: () => Promise.resolve('1.4.0'),
}));

vi.mock('@/features/app-update', () => ({
  useAppUpdateContext: () => ({
    phase: { kind: 'idle' },
    checkNow: vi.fn(),
    install: vi.fn(),
    restart: vi.fn(),
    dismiss: vi.fn(),
  }),
  readUpdateMemory: () => ({ lastCheckedAt: null, dismissedVersion: null }),
  useUpdateAutoCheck: () => 'on',
  writeUpdateAutoCheck: vi.fn(),
}));

const onLeave = vi.fn();
const copy = en.settingsAbout;

function renderPane() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <AboutPane onLeave={onLeave} />
    </NextIntlClientProvider>,
  );
}

function drawnIds(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-setting-id]')).map(
    (node) => node.getAttribute('data-setting-id') ?? '',
  );
}

beforeEach(() => {
  desktop = false;
  push.mockClear();
  onLeave.mockClear();
  requestShortcutSheet.mockClear();
  revealAppLogFolder.mockClear();
  copyText.mockClear();
});

describe('AboutPane', () => {
  it('draws every web catalog entry on the web and no app-only row', () => {
    const { container } = renderPane();
    const web = ABOUT_CATALOG.filter((entry) => entry.surface === 'both').map((entry) => entry.id);
    expect(drawnIds(container).sort()).toEqual([...web].sort());
    expect(screen.getByTestId('app-settings-about-web-version')).toHaveTextContent('Website version');
  });

  it('draws every catalog entry in the app', () => {
    desktop = true;
    const { container } = renderPane();
    expect(drawnIds(container).sort()).toEqual(ABOUT_CATALOG.map((entry) => entry.id).sort());
  });

  it('closes the sheet before leaving for the changelog', () => {
    renderPane();
    fireEvent.click(screen.getByTestId('app-settings-about-whats-new'));
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]?.[0]).toContain('/changelog');
  });

  it('closes the sheet and asks for the shortcut sheet', () => {
    renderPane();
    fireEvent.click(screen.getByTestId('app-settings-about-shortcuts-open'));
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(requestShortcutSheet).toHaveBeenCalledTimes(1);
  });

  it('opens the source in a new tab', () => {
    renderPane();
    const link = screen.getByTestId('app-settings-about-source-link');
    expect(link).toHaveAttribute('href', 'https://github.com/wlsdks/ontology-atlas');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('previews diagnostics without a folder name or path, then copies what it showed', async () => {
    renderPane();
    expect(screen.queryByTestId('app-settings-about-diagnostics-text')).toBeNull();
    fireEvent.click(screen.getByTestId('app-settings-about-diagnostics-preview'));
    const preview = screen.getByTestId('app-settings-about-diagnostics-text');
    expect(preview).toHaveTextContent('2 concepts');
    expect(preview).toHaveTextContent(`${copy.diagnostic.language}: en`);
    expect(preview.textContent).not.toContain('Private Name');
    expect(preview.textContent).not.toMatch(/\/Users\//);
    fireEvent.click(screen.getByTestId('app-settings-about-diagnostics-copy'));
    await waitFor(() => expect(copyText).toHaveBeenCalledTimes(1));
    expect(preview.querySelector('pre')?.textContent).toBe(copyText.mock.calls[0]?.[0]);
  });

  it('reads the licence file only when its dialog opens', async () => {
    const fetchMock = vi.fn((_input: string) =>
      Promise.resolve({ ok: true, text: () => Promise.resolve('MIT License') } as Response),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderPane();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('app-settings-about-licences-open'));
    expect(await screen.findByText('MIT License')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/third-party-licenses\.txt$/);
    vi.unstubAllGlobals();
  });

  it('reveals the log folder in the app and says when it could not', async () => {
    desktop = true;
    revealAppLogFolder.mockImplementationOnce(() => Promise.reject(new Error('denied')));
    renderPane();
    fireEvent.click(screen.getByTestId('app-settings-about-logs-open'));
    expect(revealAppLogFolder).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(copy.logsFailed)).toBeInTheDocument();
  });
});
