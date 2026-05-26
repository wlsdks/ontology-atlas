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
      'https://github.com/wlsdks/oh-my-ontology',
    );
    expect(
      screen.getByText(/first public release is still waiting on PR review, Apple signing, and Firebase Hosting gates/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Before the first DMG appears/i)).toBeInTheDocument();
    expect(
      screen.getByText(/PR #274 must be reviewed and merged before v0\.1\.0 can ship/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Apple Developer ID signing\/notarization secrets and the Firebase Hosting service account must be configured before release/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/v0\.1\.0 GitHub Release is the source of truth for verified Apple Silicon and Intel DMGs/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/hosted site does not open or edit vault folders/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open my markdown folder/i })).not.toBeInTheDocument();
  });

  it('can hide the first-release checklist after public DMGs are published', () => {
    renderDownloadPage({ showFirstReleaseChecklist: false });

    expect(screen.queryByText(/Before the first DMG appears/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/PR #274 must be reviewed and merged before v0\.1\.0 can ship/i),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open macOS releases/i })).toHaveAttribute(
      'href',
      GITHUB_RELEASES_URL,
    );
  });
});
