import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
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
      screen.getByText(/app release is still waiting on PR review, version alignment, Apple signing, or the v0\.1\.0 GitHub Release/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Before the first release is fully available/i)).toBeInTheDocument();
    expect(
      screen.getByText(/PR #274 must be reviewed and merged before v0\.1\.0 can ship/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/v0\.1\.0 tag must match package\.json, Tauri, and Cargo metadata/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Apple Developer ID signing\/notarization secrets must be configured before the macOS app release/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/v0\.1\.0 GitHub Release is the source of truth for verified Apple Silicon and Intel DMGs/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Separately, Firebase Hosting must deploy the promo\/download site so \/ko\/download\/ is live after the app release/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/hosted site does not open or edit vault folders/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open my markdown folder/i })).not.toBeInTheDocument();
  });

  it('can hide the first-release checklist after public DMGs are published', () => {
    renderDownloadPage({ showFirstReleaseChecklist: false });

    expect(screen.queryByText(/Before the first release is fully available/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/PR #274 must be reviewed and merged before v0\.1\.0 can ship/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/v0\.1\.0 tag must match package\.json, Tauri, and Cargo metadata/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Firebase Hosting must deploy the promo\/download site/i),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open macOS releases/i })).toHaveAttribute(
      'href',
      GITHUB_RELEASES_URL,
    );
  });
});
