import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import enMessages from '../../../../messages/en.json';
import { GITHUB_RELEASES_URL } from '@/features/macos-download-link';
import { shouldHideBottomTabBar } from '@/widgets/bottom-tab-bar';
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
    ...rest
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className} {...rest}>
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
    /**
     * 미게시 상태의 태그는 **지금 저장소의 버전**에서 나온다.
     *
     * 2026-07-28 실측: 한 화면에 `v1.0.0-rc.3`(제목)과 `v1.0.0-rc.2 는 아직
     * 게시 전입니다`(본문)가 동시에 떠 있었다. 제목은 게시 여부로 갈라
     * `RELEASE_VERSION` 을 쓰는데 본문은 **게시 여부와 무관하게** 생성 파일의
     * `tag` 를 썼고, 그 파일은 릴리스가 실제로 나갈 때만 갱신되므로 버전을
     * 올린 뒤 아직 안 내보낸 구간에서 한 세대 전 태그가 남는다.
     *
     * 그래서 이 테스트는 **픽스처의 태그(`v1.0.0`)를 기대하지 않는다** — 그걸
     * 기대하는 것이 곧 옛 결함을 계약으로 굳히는 일이었다.
     */
    it('names the current repo version — not the stale generated tag — while unpublished', () => {
      renderDownloadPage();

      const pending = screen.getByTestId('download-macos-pending');
      expect(pending).toHaveTextContent(
        new RegExp(`v${RELEASE_VERSION.replace(/\./g, '\\.')} has not been published yet`, 'i'),
      );
      // 픽스처의 생성 태그는 미게시 상태에서 화면에 나오지 않는다.
      expect(pending).not.toHaveTextContent(/v1\.0\.0 has not been/i);
      // A size and a checksum are per-release facts. With no release there is
      // no honest value for either, so neither row exists at all.
      expect(screen.queryByTestId('download-checksum-aarch64')).not.toBeInTheDocument();
      expect(screen.queryByTestId('download-checksum-x64')).not.toBeInTheDocument();
      expect(screen.queryByTestId('download-macos-x64')).not.toBeInTheDocument();
      expect(screen.queryByTestId('download-release-notes-link')).not.toBeInTheDocument();
    });

    // Today the GitHub releases page has nothing on it. A filled button is the
    // page's one strongest promise, and pointing it at an empty page spends
    // that promise on a dead end. So the winner before publication is the
    // thing that actually works right now — the map in the browser — while
    // the releases link stays available at a lower weight.
    it('makes the browser map the strongest action, and still links the releases page', () => {
      renderDownloadPage();

      const releases = screen.getByTestId('download-primary-cta');
      expect(releases).toHaveAttribute('href', GITHUB_RELEASES_URL);
      expect(releases).toHaveTextContent(/Open the GitHub releases page/i);

      const web = screen.getByTestId('download-web-cta');
      expect(web).toHaveAttribute('href', '/');
      expect(web).toHaveTextContent(/Open the map in your browser/i);
      // The filled variant is the page's single attention winner.
      expect(web.className).toMatch(/--color-indigo-brand/);
      expect(releases.className).not.toMatch(/--color-indigo-brand/);
    });

    it('keeps operator-only release-pipeline status off the public page', () => {
      renderDownloadPage();

      // These read as build-process status, not as an answer to "can I
      // install this?" — the release runbook owns them now.
      expect(screen.queryByText(/waiting on PR review/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/version alignment/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/desktop:release-status/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Copy audit/i })).not.toBeInTheDocument();
    });
  });

  describe('once a release is published', () => {
    beforeEach(publishRelease);

    it('offers a direct per-architecture download with its real size', () => {
      renderDownloadPage();

      const appleSilicon = screen.getByTestId('download-primary-cta');
      expect(appleSilicon).toHaveAttribute(
        'href',
        `https://github.com/wlsdks/ontology-atlas/releases/download/v${RELEASE_VERSION}/ontology-atlas_${RELEASE_VERSION}_aarch64.dmg`,
      );
      expect(appleSilicon).toHaveTextContent(/Download for Apple Silicon · 12\.4 MB/i);
      expect(screen.getByTestId('download-macos-x64')).toHaveAttribute(
        'href',
        `https://github.com/wlsdks/ontology-atlas/releases/download/v${RELEASE_VERSION}/ontology-atlas_${RELEASE_VERSION}_x64.dmg`,
      );
      // Two filled buttons would leave no winner — Intel keeps the same slot
      // at a lower weight.
      expect(appleSilicon.className).toMatch(/--color-indigo-brand/);
      expect(screen.getByTestId('download-macos-x64').className).not.toMatch(
        /--color-indigo-brand/,
      );
    });

    it('publishes each asset checksum next to the file it verifies', () => {
      renderDownloadPage();

      expect(screen.getByTestId('download-checksum-aarch64')).toHaveTextContent(AARCH64_SHA);
      expect(screen.getByTestId('download-checksum-aarch64')).toHaveTextContent(
        `ontology-atlas_${RELEASE_VERSION}_aarch64.dmg`,
      );
      expect(screen.getByTestId('download-checksum-x64')).toHaveTextContent(X64_SHA);
    });

    it('copies the real checksum a user verifies the DMG against', async () => {
      renderDownloadPage();

      fireEvent.click(screen.getAllByRole('button', { name: /Copy/i })[0]);

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(AARCH64_SHA);
      });
      expect(await screen.findByText(/Checksum copied/i)).toBeInTheDocument();
    });

    it('links to the release notes themselves', () => {
      renderDownloadPage();

      expect(screen.getByTestId('download-release-notes-link')).toHaveAttribute(
        'href',
        `https://github.com/wlsdks/ontology-atlas/releases/tag/v${RELEASE_VERSION}`,
      );
    });
  });

  // Most visitors do not know which chip their Mac has. Naming both
  // architectures without telling them how to find out leaves them stuck in
  // front of two buttons — the page's job fails right there.
  it('tells a visitor how to find out which Mac they have', () => {
    publishRelease();
    renderDownloadPage();

    expect(screen.getByText(/Not sure which Mac you have\?/i)).toBeInTheDocument();
    expect(screen.getByText(/About This Mac/i)).toBeInTheDocument();
    expect(screen.getByText(/Apple M1, M2, M3 or M4/i)).toBeInTheDocument();
  });

  it('tells Windows visitors where they stand instead of omitting the platform', () => {
    renderDownloadPage();

    const windowsCard = screen.getByTestId('download-platform-windows');
    expect(windowsCard).toHaveTextContent('Windows');
    expect(windowsCard).toHaveTextContent(/In preparation/i);
    expect(windowsCard).toHaveTextContent(/signed installer/i);
    expect(screen.getByRole('link', { name: /Follow progress/i })).toBeInTheDocument();
  });

  // 2026-07-27: the Developer ID certificate exists (docs/DECISIONS.md), so
  // the release path signs and notarizes again. Until this remake the page
  // still printed the unsigned-era copy — and printed it *contradicting
  // itself*, with "Not signed yet" as a row label and "codesign --verify
  // passes" as that same row's note. Neither the old future tense ("the gate
  // requires") nor the stale present tense survives: what ships is what is
  // true now, plus the way a visitor checks it themselves.
  it('states the signing status that is true today, with the proof for each claim', () => {
    renderDownloadPage();

    expect(screen.getByText(/Signed with an Apple Developer ID certificate/i)).toBeInTheDocument();
    expect(screen.getByText(/Notarized by Apple/i)).toBeInTheDocument();
    expect(screen.getByText(/codesign verified/i)).toBeInTheDocument();
    expect(screen.getByText(/stapler validate passes/i)).toBeInTheDocument();

    // The unsigned-era instructions are gone: they are false today, and a
    // Gatekeeper detour is the single most expensive first impression.
    expect(screen.queryByText(/Not signed yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Open Anyway/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/certificate pending/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Release gate requires/i)).not.toBeInTheDocument();

    // The verify command names the asset for the current version, so it does
    // not freeze an old filename into a translation string.
    expect(
      screen.getByText(
        new RegExp(
          `shasum -a 256 .*ontology-atlas_${RELEASE_VERSION.replace(/\./g, '\\.')}_aarch64\\.dmg`,
        ),
      ),
    ).toBeInTheDocument();
  });

  // The product's core promise is local-first. A stranger deciding whether to
  // run an unfamiliar binary needs it said plainly, next to the other facts.
  it('states what the app does not do, not only what it does', () => {
    renderDownloadPage();

    expect(screen.getByText(/The app sends nothing anywhere/i)).toBeInTheDocument();
    expect(screen.getByText(/No account, no server/i)).toBeInTheDocument();
    // This line used to read "This website never opens or edits your folders.
    // Only the installed app can do that." Measured 2026-07-27 (web surface
    // smoke ②): in Chromium the site opens a folder and parses it. The privacy
    // claim was true; the capability claim was not, and it contradicted the
    // surface contract that makes the web the second-best workbench where no
    // app exists. Keep the privacy half, tell the truth about the other half.
    expect(screen.getByText(/This website sends nothing to a server/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/never opens or edits your folders/i),
    ).not.toBeInTheDocument();
  });

  it('keeps the hosted page focused on app releases instead of browser vault work', () => {
    renderDownloadPage();

    expect(screen.getByRole('link', { name: /View source code/i })).toHaveAttribute(
      'href',
      'https://github.com/wlsdks/ontology-atlas',
    );
    expect(screen.getByText(/Connect your AI assistant/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open my markdown folder/i })).not.toBeInTheDocument();
  });

  // Installing is not the end of the journey. Saying the app updates itself
  // is what makes this page a one-time visit rather than a recurring chore.
  it('says the installed app updates itself', () => {
    renderDownloadPage();

    expect(screen.getByText(/updates itself with one button/i)).toBeInTheDocument();
  });

  it('renders the census miniature with real dogfood data and its scope label', () => {
    renderDownloadPage();

    expect(screen.getByRole('img', { name: /Miniature map/i })).toBeInTheDocument();
    // [download-honesty] the census card's concepts/relations counts need a
    // scope label so they aren't mistaken for the count shown once a user
    // loads their own vault in the app (different definition, different number).
    expect(screen.getByText(/Counts this repo's own docs\/ontology vault/i)).toBeInTheDocument();
    // The intro used to cite a domain that was never registered.
    expect(screen.queryByText(/ontology-atlas\.dev/i)).not.toBeInTheDocument();
  });

  // The retired LandingPage hero was absorbed here in 2026-07 and became a
  // second landing page stapled under the install decision: its own eyebrow,
  // its own h1, a four-line lead, and three value-chain cards. The remake
  // keeps only the part that is evidence rather than pitch.
  it('does not stack a second landing page under the install decision', () => {
    renderDownloadPage();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByText(/Until we all finally/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Write a markdown file per piece/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/One folder, three views/i)).not.toBeInTheDocument();
  });

  it('puts the install decision above everything that explains it', () => {
    publishRelease();
    renderDownloadPage();

    const heading = screen.getByRole('heading', { level: 1 });
    const primaryCta = screen.getByTestId('download-primary-cta');
    const trust = screen.getByTestId('download-trust');
    const windows = screen.getByTestId('download-platform-windows');

    for (const [earlier, later] of [
      [heading, primaryCta],
      [primaryCta, trust],
      [trust, windows],
    ] as const) {
      expect(
        earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  // The page reserves no bottom-tab-bar height because this route has no tab
  // bar. That is a cross-module coupling: if the bar ever returns here, the
  // scroll end would sit underneath it. The old code hardcoded a 56px reserve
  // for a bar that was never rendered, which is the same defect mirrored.
  it('stays the one route without a bottom tab bar, which is why it reserves no height for one', () => {
    expect(shouldHideBottomTabBar('/download', false)).toBe(true);
    expect(shouldHideBottomTabBar('/ko/download/', false)).toBe(true);
  });
});
