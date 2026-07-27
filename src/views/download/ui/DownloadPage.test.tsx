import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import enMessages from '../../../../messages/en.json';
import { GITHUB_RELEASES_URL } from '@/features/macos-download-link';
import { RELEASE_VERSION } from '../lib/release-facts';
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

// What the page may claim is decided by one generated fact: is a macOS
// release actually published? Both states have to be exercised — the
// pre-release state is what the public site serves until the tag ships, and
// it is the state that used to leak placeholder facts and internal pipeline
// status.
const mocks = vi.hoisted(() => ({
  release: {
    published: false,
    tag: 'v1.0.0',
    publishedAt: null as string | null,
    releaseUrl: 'https://github.com/wlsdks/ontology-atlas/releases',
    assets: [] as Array<{
      arch: 'aarch64' | 'x64';
      fileName: string;
      sizeBytes: number;
      sha256: string;
      downloadUrl: string;
    }>,
  },
}));

vi.mock('../model/macos-release.generated', () => ({
  get MACOS_RELEASE() {
    return mocks.release;
  },
}));

const AARCH64_SHA = 'a'.repeat(64);
const X64_SHA = 'b'.repeat(64);

function publishRelease() {
  mocks.release = {
    published: true,
    tag: `v${RELEASE_VERSION}`,
    publishedAt: '2026-07-27T00:00:00Z',
    releaseUrl: `https://github.com/wlsdks/ontology-atlas/releases/tag/v${RELEASE_VERSION}`,
    assets: [
      {
        arch: 'aarch64',
        fileName: `ontology-atlas_${RELEASE_VERSION}_aarch64.dmg`,
        sizeBytes: 13_002_342,
        sha256: AARCH64_SHA,
        downloadUrl: `https://github.com/wlsdks/ontology-atlas/releases/download/v${RELEASE_VERSION}/ontology-atlas_${RELEASE_VERSION}_aarch64.dmg`,
      },
      {
        arch: 'x64',
        fileName: `ontology-atlas_${RELEASE_VERSION}_x64.dmg`,
        sizeBytes: 14_500_000,
        sha256: X64_SHA,
        downloadUrl: `https://github.com/wlsdks/ontology-atlas/releases/download/v${RELEASE_VERSION}/ontology-atlas_${RELEASE_VERSION}_x64.dmg`,
      },
    ],
  };
}

function renderDownloadPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <DownloadPage />
    </NextIntlClientProvider>,
  );
}

describe('DownloadPage', () => {
  beforeEach(() => {
    mocks.release = {
      published: false,
      tag: 'v1.0.0',
      publishedAt: null,
      releaseUrl: 'https://github.com/wlsdks/ontology-atlas/releases',
      assets: [],
    };
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  describe('before a release is published', () => {
    it('says the build is not out yet instead of rendering placeholder facts', () => {
      renderDownloadPage();

      expect(screen.getByTestId('download-macos-pending')).toHaveTextContent(
        /v1\.0\.0 has not been published yet/i,
      );
      // A size and a checksum are per-release facts. With no release there is
      // no honest value for either, so neither row exists at all.
      expect(screen.getByTestId('download-fact-strip')).not.toHaveTextContent(/size/i);
      expect(screen.queryByTestId('download-macos-aarch64')).not.toBeInTheDocument();
      expect(screen.queryByTestId('download-macos-x64')).not.toBeInTheDocument();
      expect(screen.queryByTestId('download-release-notes-link')).not.toBeInTheDocument();
    });

    it('sends the primary action to the releases page rather than promising a download', () => {
      renderDownloadPage();

      const primary = screen.getByTestId('download-primary-cta');
      expect(primary).toHaveAttribute('href', GITHUB_RELEASES_URL);
      expect(primary).toHaveTextContent(/Open the GitHub releases page/i);
    });

    it('keeps operator-only release-pipeline status off the public page', () => {
      renderDownloadPage();

      // These read as build-process status, not as an answer to "can I
      // install this?" — the release runbook owns them now.
      expect(screen.queryByText(/waiting on PR review/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/version alignment/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Before the first release is fully available/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/desktop:release-status/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Copy audit/i })).not.toBeInTheDocument();
    });
  });

  describe('once a release is published', () => {
    beforeEach(publishRelease);

    it('offers a direct per-architecture download with its real size and checksum', () => {
      renderDownloadPage();

      const appleSilicon = screen.getByTestId('download-macos-aarch64');
      expect(appleSilicon).toHaveAttribute(
        'href',
        `https://github.com/wlsdks/ontology-atlas/releases/download/v${RELEASE_VERSION}/ontology-atlas_${RELEASE_VERSION}_aarch64.dmg`,
      );
      expect(screen.getByTestId('download-macos-x64')).toHaveAttribute(
        'href',
        `https://github.com/wlsdks/ontology-atlas/releases/download/v${RELEASE_VERSION}/ontology-atlas_${RELEASE_VERSION}_x64.dmg`,
      );

      const macosCard = screen.getByTestId('download-platform-macos');
      expect(macosCard).toHaveTextContent('12.4 MB');
      expect(macosCard).toHaveTextContent(AARCH64_SHA);
      expect(macosCard).toHaveTextContent(X64_SHA);
      expect(macosCard).toHaveTextContent(`ontology-atlas_${RELEASE_VERSION}_aarch64.dmg`);
    });

    it('makes the header action the download itself, not a detour to GitHub', () => {
      renderDownloadPage();

      const primary = screen.getByTestId('download-primary-cta');
      expect(primary).toHaveAttribute(
        'href',
        `https://github.com/wlsdks/ontology-atlas/releases/download/v${RELEASE_VERSION}/ontology-atlas_${RELEASE_VERSION}_aarch64.dmg`,
      );
      expect(primary).toHaveTextContent(/Download for Apple Silicon · 12\.4 MB/i);
    });

    it('copies the real checksum a user verifies the DMG against', async () => {
      renderDownloadPage();

      fireEvent.click(screen.getAllByRole('button', { name: /Copy/i })[0]);

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(AARCH64_SHA);
      });
      expect(await screen.findByText(/Checksum copied/i)).toBeInTheDocument();
    });

    it('links to the release notes themselves, not only the changelog excerpt', () => {
      renderDownloadPage();

      expect(screen.getByTestId('download-release-notes-link')).toHaveAttribute(
        'href',
        `https://github.com/wlsdks/ontology-atlas/releases/tag/v${RELEASE_VERSION}`,
      );
    });
  });

  it('tells Windows visitors where they stand instead of omitting the platform', () => {
    renderDownloadPage();

    const windowsCard = screen.getByTestId('download-platform-windows');
    expect(windowsCard).toHaveTextContent('Windows');
    expect(windowsCard).toHaveTextContent(/In preparation/i);
    expect(windowsCard).toHaveTextContent(/signed installer/i);
    expect(screen.getByRole('link', { name: /Follow progress/i })).toBeInTheDocument();
  });

  it('states the signing status that is true today, and gives the way through it', () => {
    renderDownloadPage();

    // Unsigned until the certificate exists (owner decision 2026-07-27,
    // docs/DECISIONS.md). Neither the old future tense ("the gate requires")
    // nor a premature past tense ("signed") — what is true now.
    expect(screen.getByText(/Not signed yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Not notarized by Apple/i)).toBeInTheDocument();
    expect(screen.queryByText(/Release gate requires/i)).not.toBeInTheDocument();
    // Stating the state without the way through it is neglect, not honesty.
    // Both the trust panel and the install step carry it — the state and the
    // way through it appear where each is needed.
    expect(screen.getAllByText(/Open Anyway/).length).toBeGreaterThanOrEqual(2);
    // The verify command names the asset for the current version, so it does
    // not freeze an old filename into a translation string.
    // With no signature, the checksum is the only integrity check a downloader
    // has — so the verify command is the one that checks it.
    expect(
      screen.getByText(
        new RegExp(`shasum -a 256 .*ontology-atlas_${RELEASE_VERSION.replace(/\./g, '\\.')}_aarch64\\.dmg`),
      ),
    ).toBeInTheDocument();
  });

  it('keeps the hosted page focused on app releases instead of browser vault work', () => {
    renderDownloadPage();

    expect(screen.getByRole('link', { name: /View source code/i })).toHaveAttribute(
      'href',
      'https://github.com/wlsdks/ontology-atlas',
    );
    expect(screen.getByText(/hosted site does not open or edit vault folders/i)).toBeInTheDocument();
    expect(screen.getByText(/only way to confirm you got the file we published/i)).toBeInTheDocument();
    expect(screen.getByText(/Connect your AI assistant/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open my markdown folder/i })).not.toBeInTheDocument();
  });

  it('renders the intro section absorbed from the retired LandingPage (root-first-open Slice 2) with the real dogfood census', () => {
    renderDownloadPage();

    expect(screen.getByText('Until we all finally')).toBeInTheDocument();
    expect(screen.getByText('see the same thing')).toBeInTheDocument();
    expect(screen.getByText('Write a markdown file per piece')).toBeInTheDocument();
    expect(screen.getByText('One folder, three views')).toBeInTheDocument();
    // dogfood census is real data (build-time generated), not a placeholder.
    expect(screen.getByRole('img', { name: /Topology miniature/i })).toBeInTheDocument();
    // [download-honesty] the census card's concepts/relations counts need a
    // scope label so they aren't mistaken for the count shown once a user
    // loads their own vault in the app (different definition, different number).
    expect(screen.getByText(/Counts this repo's own docs\/ontology vault/i)).toBeInTheDocument();
    // The intro used to cite a domain that was never registered.
    expect(screen.queryByText(/ontology-atlas\.dev/i)).not.toBeInTheDocument();
  });

  it('puts the download decision before the secondary product introduction', () => {
    publishRelease();
    renderDownloadPage();

    const downloadHeading = screen.getByRole('heading', { level: 1 });
    const primaryCta = screen.getByTestId('download-primary-cta');
    const sourceCta = screen.getByRole('link', { name: /View source code/i });
    const factStrip = screen.getByTestId('download-fact-strip');
    const platforms = screen.getByTestId('download-platforms');
    const introHeading = screen.getByRole('heading', {
      level: 2,
      name: /Until we all finally/i,
    });

    for (const decisionElement of [
      downloadHeading,
      primaryCta,
      sourceCta,
      factStrip,
      platforms,
    ]) {
      expect(
        decisionElement.compareDocumentPosition(introHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(
      primaryCta.compareDocumentPosition(sourceCta) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
