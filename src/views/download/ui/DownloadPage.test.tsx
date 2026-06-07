import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import enMessages from '../../../../messages/en.json';
import { GITHUB_RELEASES_URL } from '@/features/macos-download-link';
import { DownloadPage } from './DownloadPage';

vi.mock('@/features/locale-switch', () => ({
  LocaleSwitch: () => <div data-testid="locale-switch" />,
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

function renderDownloadPage({ showFirstReleaseChecklist = true } = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <DownloadPage showFirstReleaseChecklist={showFirstReleaseChecklist} />
    </NextIntlClientProvider>,
  );
}

describe('DownloadPage', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('keeps the hosted page focused on app releases instead of browser vault work', () => {
    renderDownloadPage();

    expect(screen.getByRole('link', { name: /Open macOS releases/i })).toHaveAttribute(
      'href',
      GITHUB_RELEASES_URL,
    );
    expect(screen.getByRole('link', { name: /View source code/i })).toHaveAttribute(
      'href',
      'https://github.com/wlsdks/ontology-atlas',
    );
    expect(
      screen.getByText(/direct-download app release is still waiting on PR review, version alignment, Developer ID signing\/notarization, or the v0\.1\.0 GitHub Release/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Before the first release is fully available/i)).toBeInTheDocument();
    expect(
      screen.getByText(/desktop release workflow must be merged to main before v0\.1\.0 can ship/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/v0\.1\.0 tag must match package\.json, Tauri, and Cargo metadata/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Apple Developer ID signing\/notarization secrets are required for direct-download DMGs, not Mac App Store submission/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/v0\.1\.0 GitHub Release is the source of truth for verified Apple Silicon and Intel DMGs/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Separately, Firebase Hosting must deploy the promo\/download site so \/ko\/download\/ is live after the app release/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Local completion audit/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Run this before waiting on CI: it writes owner-grouped release blockers to JSON and a reviewer checklist/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /pnpm desktop:release-status -- --pr=<number> --tag=v0\.1\.0 --include-hosted-surface --json-file=\.tmp\/desktop-release-status\.json --markdown-file=\.tmp\/desktop-release-status\.md/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/hosted site does not open or edit vault folders/i)).toBeInTheDocument();
    expect(screen.getByText(/Obsidian-style direct download/i)).toBeInTheDocument();
    expect(screen.getByText(/Verify agent access/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Codex, Claude Code, or Cursor reads and writes the same vault over MCP/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open my markdown folder/i })).not.toBeInTheDocument();
  });

  it('copies the local release completion audit command', async () => {
    renderDownloadPage();

    fireEvent.click(screen.getByRole('button', { name: /Copy audit/i }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'pnpm desktop:release-status -- --pr=<number> --tag=v0.1.0 --include-hosted-surface --json-file=.tmp/desktop-release-status.json --markdown-file=.tmp/desktop-release-status.md',
      );
    });
    expect(await screen.findByText(/Release audit copied/i)).toBeInTheDocument();
  });

  it('can hide the first-release checklist after public DMGs are published', () => {
    renderDownloadPage({ showFirstReleaseChecklist: false });

    expect(screen.queryByText(/Before the first release is fully available/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/desktop release workflow must be merged to main before v0\.1\.0 can ship/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/v0\.1\.0 tag must match package\.json, Tauri, and Cargo metadata/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Firebase Hosting must deploy the promo\/download site/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Local completion audit/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open macOS releases/i })).toHaveAttribute(
      'href',
      GITHUB_RELEASES_URL,
    );
  });
});
