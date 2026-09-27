import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import enMessages from '../../../../messages/en.json';
import { shouldHideBottomTabBar } from '@/widgets/bottom-tab-bar';
import { DEMO_CLIPS } from '../model/demo-clips';
import { RELEASE_VERSION } from '../lib/release-facts';
import { DownloadPage } from './DownloadPage';
import { useStageGraph } from './StageMap';

vi.mock('@/features/locale-switch', () => ({
  LocaleSwitch: () => <div data-testid="locale-switch" />,
}));

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => mocks.pathname,
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

// Both publication states are exercised: the public site serves the unpublished one until a tag ships.
const mocks = vi.hoisted(() => ({
  /** The view lives at `/` and `/download`, whose chrome differs. */
  pathname: '/download',
  release: {
    published: false,
    prerelease: false,
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
  windowsRelease: {
    published: false,
    prerelease: false,
    tag: 'v1.0.0',
    publishedAt: null as string | null,
    releaseUrl: 'https://github.com/wlsdks/ontology-atlas/releases',
    assets: [] as Array<{
      arch: 'x64';
      fileName: string;
      sizeBytes: number;
      sha256: string;
      downloadUrl: string;
      signed: false;
    }>,
  },
}));

vi.mock('../model/macos-release.generated', () => ({
  get MACOS_RELEASE() {
    return mocks.release;
  },
  get WINDOWS_RELEASE() {
    return mocks.windowsRelease;
  },
}));

const AARCH64_SHA = 'a'.repeat(64);
const X64_SHA = 'b'.repeat(64);

function publishRelease() {
  mocks.release = {
    published: true,
    prerelease: false,
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

function publishWindowsRelease() {
  mocks.windowsRelease = {
    published: true,
    prerelease: true,
    tag: `v${RELEASE_VERSION}`,
    publishedAt: '2026-08-01T00:00:00Z',
    releaseUrl: `https://github.com/wlsdks/ontology-atlas/releases/tag/v${RELEASE_VERSION}`,
    assets: [
      {
        arch: 'x64',
        fileName: `ontology-atlas_${RELEASE_VERSION}_windows_x64-setup.exe`,
        sizeBytes: 21_500_000,
        sha256: 'c'.repeat(64),
        downloadUrl: `https://github.com/wlsdks/ontology-atlas/releases/download/v${RELEASE_VERSION}/ontology-atlas_${RELEASE_VERSION}_windows_x64-setup.exe`,
        signed: false,
      },
    ],
  };
}

const IntlWrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={enMessages}>
    {children}
  </NextIntlClientProvider>
);

function renderDownloadPage() {
  return render(<IntlWrapper>{<DownloadPage />}</IntlWrapper>);
}

describe('DownloadPage', () => {
  beforeEach(() => {
    mocks.release = {
      published: false,
      prerelease: false,
      // Deliberately stale, as the generated file is between releases, so mixing sources shows.
      tag: 'v0.9.0-stale',
      publishedAt: null,
      releaseUrl: 'https://github.com/wlsdks/ontology-atlas/releases',
      assets: [],
    };
    mocks.windowsRelease = {
      published: false,
      prerelease: false,
      tag: 'v0.9.0-stale',
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
    it('names the current repo version — not the stale generated tag — while unpublished', () => {
      renderDownloadPage();

      const facts = screen.getByTestId('gateway-facts');
      expect(facts).toHaveTextContent(
        new RegExp(`v${RELEASE_VERSION.replace(/\./g, '\\.')}`),
      );
      expect(facts).toHaveTextContent(/not published yet/i);
      expect(facts).not.toHaveTextContent('v0.9.0-stale');
      expect(facts).not.toHaveTextContent(/SHA-256/);
      expect(facts).not.toHaveTextContent(/DMG/);
    });

    it('makes the browser map the strongest action while nothing is published', () => {
      renderDownloadPage();

      const primary = screen.getByTestId('gateway-hero-cta');
      // Not `/`, which is this page again.
      expect(primary).toHaveAttribute('href', '/topology');
      expect(primary).toHaveTextContent(/Try it in the browser/i);
      expect(primary.className).toMatch(/--color-indigo-brand/);
      expect(
        Array.from(document.querySelectorAll('a[class*="--color-indigo-brand"]')),
      ).toHaveLength(1);
    });

    it('keeps operator-only release-pipeline status off the public page', () => {
      renderDownloadPage();

      expect(screen.queryByText(/waiting on PR review/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/version alignment/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/desktop:release-status/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Copy audit/i })).not.toBeInTheDocument();
    });
  });

  describe('once a release is published', () => {
    beforeEach(publishRelease);

    it('offers both Mac files with their real sizes behind one Mac control', () => {
      renderDownloadPage();

      const mac = screen.getByTestId('gateway-hero-cta');
      expect(mac).toHaveAttribute('aria-haspopup', 'menu');
      expect(mac).toHaveTextContent(/Download for Mac/i);
      expect(screen.queryByTestId('gateway-hero-macos-aarch64')).toBeNull();
      fireEvent.click(mac);
      expect(mac).toHaveAttribute('aria-expanded', 'true');

      const appleSilicon = screen.getByTestId('gateway-hero-macos-aarch64');
      expect(appleSilicon).toHaveAttribute(
        'href',
        `https://github.com/wlsdks/ontology-atlas/releases/download/v${RELEASE_VERSION}/ontology-atlas_${RELEASE_VERSION}_aarch64.dmg`,
      );
      expect(appleSilicon).toHaveTextContent(/Apple Silicon/i);
      // 13,002,342 B in decimal MB, as Finder reports.
      expect(appleSilicon).toHaveTextContent(/13\.0 MB/);
      expect(screen.getByTestId('gateway-hero-macos-x64')).toHaveAttribute(
        'href',
        `https://github.com/wlsdks/ontology-atlas/releases/download/v${RELEASE_VERSION}/ontology-atlas_${RELEASE_VERSION}_x64.dmg`,
      );
      const filled = Array.from(document.querySelectorAll('a[class*="--color-indigo-brand"], button[class*="--color-indigo-brand"]'));
      expect(filled.map((el) => el.getAttribute('data-testid'))).toEqual(['gateway-hero-cta']);
    });

    it('hero holds exactly the Mac control, the Windows file, and the playground — one filled winner', () => {
      publishWindowsRelease();
      renderDownloadPage();

      const primary = screen.getByTestId('gateway-hero-cta');
      expect(primary).toHaveAttribute('aria-haspopup', 'menu');
      expect(primary.className).toMatch(/--color-indigo-brand/);

      expect(screen.queryByTestId('gateway-hero-demo-link')).toBeNull();
      expect(screen.queryByTestId('gateway-hero-alt-row')).toBeNull();

      const windows = screen.getByTestId('gateway-hero-windows');
      expect(windows).toHaveAttribute(
        'href',
        expect.stringMatching(/_windows_x64-setup\.exe$/),
      );
      expect(windows).toHaveTextContent(/unsigned/i);

      const web = screen.getByTestId('gateway-hero-web-cta');
      expect(web).toHaveAttribute('href', '/topology');
      expect(web).toHaveTextContent(/playground/i);

      const row = primary.parentElement!.parentElement!;
      expect(row.querySelectorAll(':scope > a, :scope > div > button')).toHaveLength(3);

      for (const secondary of [windows, web]) {
        expect(secondary.className).not.toMatch(/--color-indigo-brand/);
      }
    });

    it('promotes the Windows installer for a Windows visitor, unsigned fact in the trust slot', () => {
      publishWindowsRelease();
      Object.defineProperty(navigator, 'userAgent', {
        value:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        configurable: true,
      });
      try {
        renderDownloadPage();

        const primary = screen.getByTestId('gateway-hero-cta');
        expect(primary).toHaveAttribute(
          'href',
          expect.stringMatching(/_windows_x64-setup\.exe$/),
        );
        expect(primary).toHaveTextContent(/21\.5 MB/);
        // The hero trust line and the closing band.
        expect(screen.getAllByText(/Unsigned beta · SmartScreen/i)).toHaveLength(2);
        expect(screen.getByTestId('download-closing-cta')).toHaveAttribute(
          'href',
          expect.stringMatching(/_windows_x64-setup\.exe$/),
        );
        expect(screen.getByTestId('download-closing-command')).toHaveTextContent(
          /Get-FileHash ontology-atlas_.*_windows_x64-setup\.exe -Algorithm SHA256/,
        );

        const mac = screen.getByTestId('gateway-hero-mac');
        expect(mac.className).not.toMatch(/--color-indigo-brand/);
        fireEvent.click(mac);
        expect(screen.getByTestId('gateway-hero-macos-aarch64')).toHaveAttribute(
          'href',
          expect.stringMatching(/_aarch64\.dmg$/),
        );
        expect(screen.getByTestId('gateway-hero-macos-x64')).toBeInTheDocument();
        expect(screen.queryByTestId('gateway-hero-windows')).not.toBeInTheDocument();
      } finally {
        // Removing the instance property restores the prototype getter.
        delete (navigator as { userAgent?: string }).userAgent;
      }
    });

    it('keeps the mac winner for a Windows visitor while the Windows build is unpublished', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        configurable: true,
      });
      try {
        renderDownloadPage();

        expect(screen.getByTestId('gateway-hero-cta')).toHaveTextContent(/Download for Mac/i);
        expect(screen.queryByTestId('gateway-hero-windows')).not.toBeInTheDocument();
        expect(screen.getByTestId('gateway-hero-web-cta')).toHaveAttribute('href', '/topology');
      } finally {
        delete (navigator as { userAgent?: string }).userAgent;
      }
    });
  });


  /* The only slots left for the signing fact, so this is its last line of defence. */
  it('states the signing status that is true today, at the top and at the foot', () => {
    publishRelease();
    renderDownloadPage();

    expect(screen.getAllByText(/Signed and notarized by Apple/i)).toHaveLength(2);
    expect(screen.getByTestId('download-closing-command')).toHaveTextContent(
      /shasum -a 256 ontology-atlas_.*_aarch64\.dmg/,
    );
    expect(screen.getByTestId('download-closing-sha')).toHaveTextContent(/^[0-9a-f]{64}$/);

    expect(screen.queryByText(/Not signed yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Open Anyway/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/certificate pending/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Release gate requires/i)).not.toBeInTheDocument();
  });

  // Scoped to Atlas: the updater and a connected agent do use the network.
  it('states the local-first promise where the download decision is made', () => {
    publishRelease();
    renderDownloadPage();

    expect(screen.getAllByText(/no Atlas backend/i)).toHaveLength(2);
    expect(screen.queryByText(/nothing sent to a server/i)).not.toBeInTheDocument();
    // Chromium on the web does open a folder.
    expect(
      screen.queryByText(/never opens or edits your folders/i),
    ).not.toBeInTheDocument();
  });

  it('keeps the hosted page focused on app releases instead of browser vault work', () => {
    renderDownloadPage();

    expect(screen.queryByRole('link', { name: /Open my markdown folder/i })).not.toBeInTheDocument();
  });

  it('draws the real vault in the evidence section, with the same numbers the caption claims', () => {
    renderDownloadPage();

    const caption = screen.getByTestId('download-portrait-caption');
    const { result } = renderHook(() => useStageGraph(), { wrapper: IntlWrapper });
    const graph = result.current;
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(caption).toHaveTextContent(`${graph.nodes.length} concepts`);
    expect(caption).toHaveTextContent(`${graph.edges.length} relations`);
    // Scoped, since the reader's own folder yields a different number.
    expect(caption).toHaveTextContent(/docs\/ontology/i);
    expect(caption).toHaveTextContent(/your own numbers/i);

    // Understating what works is dishonest too (`.claude/rules/surfaces.md`).
    expect(caption).toHaveTextContent(/web version/i);

    // The only visible affordance on a still frame.
    expect(caption).toHaveTextContent(/drag to move/i);
  });

  it('mounts the real map engine in the evidence section', () => {
    renderDownloadPage();

    expect(screen.getByTestId('download-stage-map')).toBeInTheDocument();
  });

  it('does not stack a second landing page under the evidence section', () => {
    renderDownloadPage();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByText(/Until we all finally/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Write a markdown file per piece/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/One folder, three views/i)).not.toBeInTheDocument();
  });

  it('walks problem → demo → map → architecture → library → agents, with the decision in the first screen', () => {
    publishRelease();
    renderDownloadPage();

    const heading = screen.getByRole('heading', { level: 1 });
    const primaryCta = screen.getByTestId('gateway-hero-cta');
    const demo = screen.getByTestId('demo-stage');
    const caption = screen.getByTestId('download-portrait-caption');
    const terminal = screen.getByTestId('gateway-agent-chat');
    const colophon = screen.getByTestId('download-bottom-band');
    const architecture = screen.getByTestId('gateway-architecture-capture');
    const library = screen.getByTestId('gateway-library-capture');

    for (const [earlier, later] of [
      [heading, primaryCta],
      [primaryCta, demo],
      [demo, caption],
      [caption, architecture],
      [architecture, library],
      [library, terminal],
      [terminal, colophon],
    ] as const) {
      expect(
        earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it('shows the folder’s other screens on one stage, in the rail’s order, swapped in place', () => {
    renderDownloadPage();

    const stage = screen.getByTestId('gateway-screens-stage');
    const tabs = screen.getAllByRole('tab').filter((tab) => stage.contains(tab));
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Harness',
      'Library',
      'Automations',
      'Insights',
      'Projects',
      'Git',
    ]);

    const map = screen.getByTestId('gateway-screens-map');
    expect(map).toHaveAttribute('href', '#evidence');
    expect(document.getElementById('evidence')).toBe(screen.getByTestId('gateway-evidence-section'));

    for (const tab of tabs) {
      expect(document.getElementById(tab.getAttribute('aria-controls')!)).not.toBeNull();
    }

    const harness = screen.getByTestId('gateway-architecture-section');
    expect(harness).toHaveAttribute('data-state', 'active');
    expect(harness.querySelector('img')?.getAttribute('src')).toMatch(/\/gateway\/harness\.en\.png$/);
    const door = (id: string) => screen.getByTestId(`gateway-${id}-door`);
    expect(door('architecture')).toHaveAttribute('href', '/architecture');
    expect(door('architecture').parentElement).toHaveAttribute('data-state', 'active');

    fireEvent.click(screen.getByTestId('gateway-screens-tab-git'));
    const git = screen.getByTestId('gateway-git-section');
    expect(git).toHaveAttribute('data-state', 'active');
    expect(door('git')).toHaveAttribute('href', '/git');
    expect(door('git')).toHaveTextContent('Open Git');
    expect(door('git').parentElement).toHaveAttribute('data-state', 'active');
    expect(harness).toHaveAttribute('data-state', 'leaving');

    const gitTab = screen.getByTestId('gateway-screens-tab-git');
    fireEvent.keyDown(gitTab, { key: 'Home' });
    expect(harness).toHaveAttribute('data-state', 'active');
    expect(door('library')).toHaveAttribute('href', '/library');
  });

  it('replays the measured in-app ACP round trip verbatim, under the allowed vendor name', () => {
    renderDownloadPage();

    const chat = screen.getByTestId('gateway-agent-chat');
    expect(chat).toHaveTextContent('add_relation');
    /* The payload follows the screen's language; the date is the measurement's evidence. */
    expect(chat).toHaveTextContent(/auth goes down payments go down with it \(2026-08-16\)/);

    const section = screen.getByTestId('gateway-agents-section');
    expect(section).not.toHaveTextContent(/Claude Code/i);
    expect(section).toHaveTextContent(/Claude Agent/);
    expect(section).toHaveTextContent(/already use/i);
  });

  /** Locks text in the first paint, not timings, which would redden every rhythm change. */
  it('never paints the ACP scene as an empty box — the human line is the premise', () => {
    renderDownloadPage();

    const chat = screen.getByTestId('gateway-agent-chat');
    const lines = chat.querySelectorAll('.gateway-term-line');
    expect(lines.length, 'the replay needs three lines for this test to mean anything').toBe(3);

    expect(lines[0].className).toContain('is-on');
    expect((lines[0].textContent ?? '').trim().length).toBeGreaterThan(0);
  });

  it('renders the catalogue headline and lead in their semantic slots', () => {
    renderDownloadPage();

    const heading = screen.getByRole('heading', { level: 1 });
    const { heroTitleLine1, heroTitleLine2, heroLead } = enMessages.download;

    expect(heading).toHaveAccessibleName(`${heroTitleLine1} ${heroTitleLine2}`);
    expect(heading).toHaveTextContent(heroTitleLine1);
    expect(heading).toHaveTextContent(heroTitleLine2);

    const lead = screen.getByText(heroLead);
    expect(lead.tagName).toBe('P');
  });

  /** Checks only the seconds, never the human-written sentence (`.claude/rules/documentation.md`). */
  it('states the attached clip at the registry length', () => {
    renderDownloadPage();

    const note = screen.getByTestId('demo-provisional-note');
    expect(note).toHaveTextContent(new RegExp(`${DEMO_CLIPS[0].seconds}s`, 'i'));
  });

  it('quotes the request the take was filmed on, word for word, with its tool names as code', () => {
    renderDownloadPage();

    // The shoot sends this message verbatim (docs/launch/demo-scenario.md §3); backticks render as code.
    const prompt = screen.getByTestId('gateway-demo-prompt');
    const sentence = enMessages.download.demoAgentPrompt;
    expect(prompt.querySelector('blockquote')!.textContent).toBe(sentence.replaceAll('`', ''));
    const codes = [...prompt.querySelectorAll('code')].map((node) => node.textContent);
    expect(codes).toEqual([...sentence.matchAll(/`([^`]+)`/g)].map((match) => match[1]));
    expect(codes).toContain('find_path');
  });

  it('names exactly one version while no build is out', () => {
    renderDownloadPage();

    const facts = screen.getByTestId('gateway-facts');
    expect(facts).toHaveTextContent(`v${RELEASE_VERSION}`);
    expect(facts).not.toHaveTextContent('v0.9.0-stale');
  });

  // A cross-module coupling: if the bar returns here, the scroll end sits under it.
  it('stays the one route without a bottom tab bar, which is why it reserves no height for one', () => {
    expect(shouldHideBottomTabBar('/download', false)).toBe(true);
    expect(shouldHideBottomTabBar('/ko/download/', false)).toBe(true);
  });

  describe('one screen served at two addresses', () => {
    it('carries the pixel identity in the gateway chrome, and only there', () => {
      mocks.pathname = '/download';
      renderDownloadPage();

      expect(screen.getByTestId('gateway-brand-mark')).toHaveAttribute(
        'src',
        '/brand/mascot-compact.png',
      );
      expect(screen.getByTestId('gateway-brand-mark')).toHaveAttribute(
        'data-brand-detail',
        'compact',
      );
      // Beside the dome a mascot reads as map data; the chrome's mark is the one mascot.
      expect(screen.queryByTestId('gateway-hero-mascot')).toBeNull();
    });

    it('names the page in the breadcrumb at /download', () => {
      mocks.pathname = '/download';
      renderDownloadPage();
      expect(screen.getByTestId('download-gnb')).toHaveTextContent(/다운로드|Download/);
    });

    it('drops the Download crumb at /, which is not that address', () => {
      mocks.pathname = '/';
      renderDownloadPage();
      expect(screen.getByTestId('download-gnb')).not.toHaveTextContent(/다운로드|Download/);
    });

    it.each(['/', '/download'])('offers no back-to-map link in the %s chrome', (pathname) => {
      mocks.pathname = pathname;
      renderDownloadPage();
      expect(screen.queryByTestId('download-back-to-map')).toBeNull();
    });

    it('makes the hero web CTA the only way to the map, pointing at /topology', () => {
      mocks.pathname = '/';
      publishRelease();
      renderDownloadPage();
      expect(screen.getByTestId('gateway-hero-web-cta')).toHaveAttribute('href', '/topology');
    });

    /** The class only; `tests/e2e/scroll-end-gap.spec.ts` measures the pixels (`.claude/rules/design.md`). */
    it('reserves the bottom tab bar height at /, where the tab bar shows', () => {
      mocks.pathname = '/';
      renderDownloadPage();
      const band = screen.getByTestId('download-bottom-band');
      expect(band).toHaveAttribute(
        'data-gateway-bottom-reserve-token',
        '--topology-mobile-bottom-tab-reserve',
      );
      expect(band.className).toContain(
        'max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))]',
      );
    });

    it('reserves nothing at /download, which has no tab bar', () => {
      mocks.pathname = '/download';
      renderDownloadPage();
      const band = screen.getByTestId('download-bottom-band');
      expect(band).not.toHaveAttribute('data-gateway-bottom-reserve-token');
      expect(band.className).not.toContain('--topology-mobile-bottom-tab-reserve');
    });

    it('decides the reservation with the same premise as the tab bar', () => {
      expect(shouldHideBottomTabBar('/download', false)).toBe(true);
      expect(shouldHideBottomTabBar('/', false)).toBe(false);
    });
  });
});
