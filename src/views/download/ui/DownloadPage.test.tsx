import { render, renderHook, screen } from '@testing-library/react';
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

// What the page may claim is decided by one generated fact: is a macOS
// release actually published? Both states have to be exercised — the
// pre-release state is what the public site serves until the tag ships, and
// it is the state that used to leak placeholder facts and internal pipeline
// status.
const mocks = vi.hoisted(() => ({
  /**
   * This surface **lives at two addresses** — `/` (the web visitor's face) and `/download` (the
   * install deeplink). Two pieces of chrome (the breadcrumb segment and "back to the map") differ
   * by address, so the tests must be able to swap it.
   */
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
      // While unpublished this tag is **deliberately stale** — it is what was written when the
      // last `--unpublished` reset ran, not the version coming next. The old fixture always set it
      // to `v${RELEASE_VERSION}`, which made it impossible to see the page mixing two sources.
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
    /**
     * While unpublished, the tag comes from **the repository's current version**.
     *
     * Measured 2026-07-28: one screen showed `v1.0.0-rc.3` (the title) and "v1.0.0-rc.2 is not
     * published yet" (the body) at the same time. The title branches on publication and uses
     * `RELEASE_VERSION`, while the body used the generated file's `tag` **regardless of
     * publication** — and that file updates only when a release actually ships, so a
     * generation-old tag survives the window after a version bump and before a release.
     *
     * So this test **does not expect the fixture's tag (`v1.0.0`)** — expecting it would freeze the
     * old defect into a contract.
     *
     * [Retargeted 2026-08-19] The unpublished notice this fact lived on (`download-macos-pending`)
     * was deleted with the install section. The place carrying the same property now is the
     * instrument strip — its version row branches on publication and calls the same helper.
     */
    it('names the current repo version — not the stale generated tag — while unpublished', () => {
      renderDownloadPage();

      const facts = screen.getByTestId('gateway-facts');
      expect(facts).toHaveTextContent(
        new RegExp(`v${RELEASE_VERSION.replace(/\./g, '\\.')}`),
      );
      expect(facts).toHaveTextContent(/not published yet/i);
      // The fixture's generated tag never appears on screen while unpublished.
      expect(facts).not.toHaveTextContent('v0.9.0-stale');
      // A size and a checksum are per-release facts. With no release there is
      // no honest value for either, so neither row exists at all.
      expect(facts).not.toHaveTextContent(/SHA-256/);
      expect(facts).not.toHaveTextContent(/DMG/);
    });

    // Today the GitHub releases page has nothing on it. A filled button is the
    // page's one strongest promise, and pointing it at an empty page spends
    // that promise on a dead end. So the winner before publication is the
    // thing that actually works right now — the map in the browser — while
    // the releases link stays available at a lower weight.
    // [Revised 2026-08-19] The second half ("the releases page is still linked") was deleted —
    // that link (`MacosDownloadLink`) lived only inside the panel, and the panel is gone.
    it('makes the browser map the strongest action while nothing is published', () => {
      renderDownloadPage();

      const primary = screen.getByTestId('gateway-hero-cta');
      // ⚠️ `/topology`, not `/` (evening of 2026-07-29). The owner decided `/` becomes a
      // **marketing page**, so sending "try it in the browser" to `/` loops back to the
      // introduction. This assertion's intent is *"send them where something works today, without
      // the app"* — that place is the web product, `/topology`.
      expect(primary).toHaveAttribute('href', '/topology');
      expect(primary).toHaveTextContent(/Try it in the browser/i);
      // The filled variant is the page's single attention winner.
      expect(primary.className).toMatch(/--color-indigo-brand/);
      expect(
        Array.from(document.querySelectorAll('a[class*="--color-indigo-brand"]')),
      ).toHaveLength(1);
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

    /*
     * [Retargeted 2026-08-19] The download panel these assertions lived on was deleted. The place
     * carrying the same property — a direct per-architecture file link, the winner's real size, and
     * exactly one filled winner — is now the hero.
     *
     * [Deleted 2026-08-19] The three checksum-row tests (per-asset SHA exposure, copy, release-note
     * link) lost their subject and were removed. The checksum is now nowhere on this page
     * (`docs/DECISIONS.md` 2026-08-19 — the owner accepted that cost).
     */
    it('offers a direct per-architecture download with its real size', () => {
      renderDownloadPage();

      const appleSilicon = screen.getByTestId('gateway-hero-cta');
      expect(appleSilicon).toHaveAttribute(
        'href',
        `https://github.com/wlsdks/ontology-atlas/releases/download/v${RELEASE_VERSION}/ontology-atlas_${RELEASE_VERSION}_aarch64.dmg`,
      );
      // The size is a **separate span**, not part of the label string — the same grammar as the
      // Intel button, and below `sm` only that span drops, which removes the horizontal overflow.
      expect(appleSilicon).toHaveTextContent(/Download for Apple Silicon/i);
      // 13,002,342 B → 13.0 MB (decimal) — the same unit Finder reports.
      expect(appleSilicon).toHaveTextContent(/13\.0 MB/);
      expect(screen.getByTestId('gateway-hero-macos-x64')).toHaveAttribute(
        'href',
        `https://github.com/wlsdks/ontology-atlas/releases/download/v${RELEASE_VERSION}/ontology-atlas_${RELEASE_VERSION}_x64.dmg`,
      );
      // There is **one** filled accent in the whole document.
      const filled = Array.from(document.querySelectorAll('a[class*="--color-indigo-brand"]'));
      expect(filled.map((el) => el.getAttribute('data-testid'))).toEqual(['gateway-hero-cta']);
      expect(screen.getByTestId('gateway-hero-macos-x64').className).not.toMatch(
        /--color-indigo-brand/,
      );
    });

    /**
     * The hero CTA's four destinations (owner 2026-08-18: the hero had no Windows download button
     * and no button to the web, and the demo did not read as a button) — ① get it for my platform
     * (filled, the sole winner) ② the demo ③ every other desktop file ④ the browser map. All four
     * must stay reachable even on the detection fallback (macOS).
     */
    it('hero reaches every desktop file, the demo, and the browser map — one filled winner', () => {
      publishWindowsRelease();
      renderDownloadPage();

      const primary = screen.getByTestId('gateway-hero-cta');
      expect(primary).toHaveAttribute('href', expect.stringMatching(/_aarch64\.dmg$/));
      expect(primary.className).toMatch(/--color-indigo-brand/);

      const demo = screen.getByTestId('gateway-hero-demo-link');
      expect(demo).toHaveAttribute('href', '#demo');
      // Not ghost — it needs a face (overlay) and a border to read as "something pressable"
      // (owner: "I can't even tell it's a button").
      expect(demo.className).toMatch(/--color-overlay-1/);

      expect(screen.getByTestId('gateway-hero-macos-x64')).toHaveAttribute(
        'href',
        expect.stringMatching(/_x64\.dmg$/),
      );

      const windows = screen.getByTestId('gateway-hero-windows');
      expect(windows).toHaveAttribute(
        'href',
        expect.stringMatching(/_windows_x64-setup\.exe$/),
      );
      // Signing status is a fact you need **before** downloading — the marker is not dropped even
      // on the demoted button (the full warning and checksum lived in the install section's
      // `PlatformStatus`).
      expect(windows).toHaveTextContent(/unsigned/i);

      const web = screen.getByTestId('gateway-hero-web-cta');
      expect(web).toHaveAttribute('href', '/topology');

      // The hero has **one** filled winner — everything else is a step down.
      for (const secondary of [demo, windows, web, screen.getByTestId('gateway-hero-macos-x64')]) {
        expect(secondary.className).not.toMatch(/--color-indigo-brand/);
      }
    });

    /**
     * For a Windows visitor the Windows file is the winner — and that promotion must bring the
     * unsigned fact with it: in the same slot where a macOS visitor reads about signing and
     * notarization, a Windows visitor reads unsigned and the SmartScreen warning.
     */
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
        // 21,500,000 B → 21.5 MB — the winner's size must be the winner's file.
        expect(primary).toHaveTextContent(/21\.5 MB/);
        expect(screen.getByText(/Unsigned beta · SmartScreen/i)).toBeInTheDocument();

        // The macOS files do not disappear; they move one step down.
        expect(screen.getByTestId('gateway-hero-macos-aarch64')).toHaveAttribute(
          'href',
          expect.stringMatching(/_aarch64\.dmg$/),
        );
        expect(screen.getByTestId('gateway-hero-macos-x64')).toBeInTheDocument();
        expect(screen.queryByTestId('gateway-hero-windows')).not.toBeInTheDocument();
      } finally {
        // Deleting the own property set on the instance restores the prototype getter.
        delete (navigator as { userAgent?: string }).userAgent;
      }
    });

    // While the Windows build is unpublished, a Windows UA still gets the macOS winner — promoting
    // a file that does not exist is an empty promise, and that visitor's today is opened by the
    // browser CTA.
    it('keeps the mac winner for a Windows visitor while the Windows build is unpublished', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        configurable: true,
      });
      try {
        renderDownloadPage();

        expect(screen.getByTestId('gateway-hero-cta')).toHaveAttribute(
          'href',
          expect.stringMatching(/_aarch64\.dmg$/),
        );
        expect(screen.queryByTestId('gateway-hero-windows')).not.toBeInTheDocument();
        expect(screen.getByTestId('gateway-hero-web-cta')).toHaveAttribute('href', '/topology');
      } finally {
        delete (navigator as { userAgent?: string }).userAgent;
      }
    });
  });


  /*
   * [Deleted 2026-08-19] Two platform-section tests — "tells an unpublished Windows visitor where
   * things stand" and "the full warning for a published unsigned Windows beta comes before the
   * button" — had subjects (`download-platform-windows`, `download-windows-unsigned-warning`,
   * `download-windows-x64`, `download-exit-row`, `download-repo-link`) that all lived inside the
   * install section, and that section was deleted.
   *
   * What remains: when a Windows visitor is promoted to winner, the hero trust line still carries
   * the unsigned fact (see `promotes the Windows installer …` above). **What is gone**: the
   * unpublished-Windows notice and its progress link, the full SmartScreen warning, and the
   * repository exit row. `docs/DECISIONS.md` 2026-08-19 records that cost.
   */

  // 2026-07-27: the Developer ID certificate exists (docs/DECISIONS.md), so
  // the release path signs and notarizes again. Until this remake the page
  // still printed the unsigned-era copy — and printed it *contradicting
  // itself*, with "Not signed yet" as a row label and "codesign --verify
  // passes" as that same row's note. Neither the old future tense ("the gate
  // requires") nor the stale present tense survives: what ships is what is
  // true now, plus the way a visitor checks it themselves.
  /*
   * [Narrowed 2026-08-19] The four proof rows (Developer ID signature, notarization plus staple,
   * `codesign verified`, `stapler validate passes`) and the `shasum -a 256 <file>` verification
   * command belonged to the verification rail, and that rail was deleted. The **only** remaining
   * slot for this claim is the hero trust line, so this test measures there — if that sentence
   * shrinks, the signing fact disappears from this page entirely, and this assertion is the last
   * line of defence.
   */
  it('states the signing status that is true today, in the one slot that still carries it', () => {
    publishRelease();
    renderDownloadPage();

    expect(screen.getByText(/Signed and notarized by Apple/i)).toBeInTheDocument();

    // The unsigned-era instructions are gone: they are false today, and a
    // Gatekeeper detour is the single most expensive first impression.
    expect(screen.queryByText(/Not signed yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Open Anyway/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/certificate pending/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Release gate requires/i)).not.toBeInTheDocument();
  });

  // The product's core promise is local-first. Keep the claim scoped to Atlas:
  // the updater and a connected agent can use the network without implying that
  // Atlas has a backend or uploads the user's vault.
  /*
   * [Narrowed 2026-08-19] Two of the three sentences — "No account, no server" and "This website
   * sends nothing to a server" — were rows of the verification rail and went with it. Only the
   * promise about the app survived in the hero trust line. It is now phrased as the durable
   * boundary (no Atlas backend), not the false absolute that no network traffic ever occurs.
   */
  it('states the local-first promise where the download decision is made', () => {
    publishRelease();
    renderDownloadPage();

    expect(screen.getByText(/no Atlas backend/i)).toBeInTheDocument();
    expect(screen.queryByText(/nothing sent to a server/i)).not.toBeInTheDocument();
    // Checks that the false capability claim removed on 2026-07-27 has not returned — Chromium on
    // the web really does open a folder.
    expect(
      screen.queryByText(/never opens or edits your folders/i),
    ).not.toBeInTheDocument();
  });

  it('keeps the hosted page focused on app releases instead of browser vault work', () => {
    renderDownloadPage();

    expect(screen.queryByRole('link', { name: /Open my markdown folder/i })).not.toBeInTheDocument();
  });

  // Installing is not the end of the journey. Saying the app updates itself
  // is what makes this page a one-time visit rather than a recurring chore.

  // ─── The background is evidence (2026-07-28 blank-page redesign) ──────────
  //
  // This page's headline **points at** the background ("the map behind this is … this repository's
  // real folder"). For that sentence to be true, what is drawn behind must be a real vault, so the
  // background is a contract rather than removable decoration. Replacing the old miniature (an
  // 8-node diagram) carried that honesty contract across too.
  // Verdict ① of 2026-07-29 — a caption counts **the picture it describes**. The old version
  // printed the build script's frontmatter file count (`DOGFOOD_CENSUS.concepts` = 96) beside a
  // derived graph of 287 nodes. Two definitions on one screen means neither is believed — the hub
  // engraving `379` against the caption's `96` was the symptom.
  it('draws the real vault in the evidence section, with the same numbers the caption claims', () => {
    renderDownloadPage();

    const caption = screen.getByTestId('download-portrait-caption');
    const { result } = renderHook(() => useStageGraph(), { wrapper: IntlWrapper });
    const graph = result.current;
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(caption).toHaveTextContent(`${graph.nodes.length} concepts`);
    expect(caption).toHaveTextContent(`${graph.edges.length} relations`);
    // [Deleted 2026-08-01] `expect(graph.nodes.length).not.toBe(DOGFOOD_CENSUS.concepts)`
    //
    // That was not a gate measuring a number but **a gate demanding a defect**. The two differed
    // because the old vault had derived nodes that were named without a file — 96 frontmatter
    // files against a 287-node derived graph — and pinning that gap was, at the time, a barrier
    // against "do not put the caption back to a file count".
    // Now that the vault has been regenerated to spec, **every node has its own document** and the
    // two definitions can legitimately coincide. Leaving "they must differ" would require reviving
    // the defect to go green.
    //
    // What it meant to protect is already protected by the two lines above: the caption counts
    // **the graph it draws**. Both come from one `useStageGraph()` hook, so there is no number to
    // reconcile by hand, and reverting to the old file-count version turns this red immediately.

    // This number needs a scope label — opening your own folder yields a different number under a
    // different definition (the runtime derived graph), and without the label the same user sees
    // two numbers and loses trust.
    expect(caption).toHaveTextContent(/docs\/ontology/i);
    expect(caption).toHaveTextContent(/your own numbers/i);

    // **The scope of a capability must be honest too** (council, 2026-08-08). This section long
    // said only *"in the app"*, but a browser with FSA support opens a folder from the web as well —
    // that is what `.claude/rules/surfaces.md` names "writing that something does not work when it
    // does", and understating what works makes people give up on things they could do. It is the
    // counterpart of the decision not to put a folder-opening control on the gateway, so narrowing
    // the copy makes that decision a lie too.
    expect(caption).toHaveTextContent(/web version/i);

    // The **visible** signal that it can be handled. It is the only affordance on a still frame
    // (the cursor is hover-gated, the aria-label is AT-only), so removing it makes the map read as
    // "a fixed picture" again — which the owner actually reported.
    expect(caption).toHaveTextContent(/drag to move/i);
  });

  // The stage map is **the real engine** (owner instruction 2026-07-28). What structurally keeps
  // the background from being decoration is now that its source is pinned to the same vault as the
  // caption — `useDogfoodInsight` does not follow the session's sample choice.
  it('mounts the real map engine in the evidence section', () => {
    renderDownloadPage();

    expect(screen.getByTestId('download-stage-map')).toBeInTheDocument();
  });

  // The retired LandingPage hero was absorbed here in 2026-07 and became a
  // second landing page stapled under the install decision: its own eyebrow,
  // its own h1, a four-line lead, and three value-chain cards. The remake
  // keeps only the part that is evidence rather than pitch.
  it('does not stack a second landing page under the evidence section', () => {
    renderDownloadPage();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByText(/Until we all finally/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Write a markdown file per piece/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/One folder, three views/i)).not.toBeInTheDocument();
  });

  /**
   * The order — **four sections, one idea each** (revised 2026-08-19): hero (type + object + CTA)
   * → demo → evidence (map + census) → the agent round trip → (footer) colophon.
   *
   * ⑤ install and download was deleted (owner: *"Looks like this last one isn't needed? It's all at the top anyway."* — the last one can go; it's all at the top anyway). So **the decision is in the first
   * section**: the download button lives in the hero, and the three sections after it are the
   * argument for that decision. The property this test protects is the argument order
   * (problem → something moving → evidence → agents), and that property survives one section going away.
   */
  it('walks problem → demo → evidence → agents, with the decision in the first screen', () => {
    publishRelease();
    renderDownloadPage();

    const heading = screen.getByRole('heading', { level: 1 });
    const primaryCta = screen.getByTestId('gateway-hero-cta');
    const demo = screen.getByTestId('demo-stage');
    const caption = screen.getByTestId('download-portrait-caption');
    // Reworked 2026-08-18: the agent section's scene changed from an mcp-verify terminal to a
    // re-enactment of the in-app (ACP) conversation — the fourth slot of the order contract is unchanged.
    const terminal = screen.getByTestId('gateway-agent-chat');
    const colophon = screen.getByTestId('download-bottom-band');

    for (const [earlier, later] of [
      [heading, primaryCta],
      [primaryCta, demo],
      [demo, caption],
      [caption, terminal],
      [terminal, colophon],
    ] as const) {
      expect(
        earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  /**
   * The agent section (reworked 2026-08-18) — the scene is **a measured round trip of the in-app
   * conversation (ACP)**. It locks two contracts:
   *
   * 1. The re-enacted tool call is the ledger's verbatim measurement (2026-08-16 (7)) — replacing
   *    it with invented output collapses this section's argument (a re-enactment, not a staging).
   * 2. Copy describing our runner list uses only the vendor's permitted display name (ledger
   *    2026-08-16 (5), the same rule as `vendor-naming.contract.test.ts` — that gate's reach is the
   *    registry and configuration copy, so this section is locked here).
   */
  it('replays the measured in-app ACP round trip verbatim, under the allowed vendor name', () => {
    renderDownloadPage();

    const chat = screen.getByTestId('gateway-agent-chat');
    // The call **name** is a program record and is identical on every screen.
    expect(chat).toHaveTextContent('add_relation');
    /*
     * The `why` payload **follows the screen's language** (corrected 2026-08-18). That sentence is
     * not something a program invented — it is the person's sentence from the bubble directly
     * above — and the `locale-purity` e2e caught the state where the English screen had an English
     * bubble and a Korean call. Here (the English render) English is required, and **the date stays
     * in both languages**, because which day the measurement comes from is this scene's evidence.
     */
    expect(chat).toHaveTextContent(/auth goes down payments go down with it \(2026-08-16\)/);

    const section = screen.getByTestId('gateway-agents-section');
    expect(section).not.toHaveTextContent(/Claude Code/i);
    expect(section).toHaveTextContent(/Claude Agent/);
    // No impression that we provide model access — the copy carries the "a tool you already use" premise.
    expect(section).toHaveTextContent(/already use/i);
  });

  /**
   * **No empty box on the first frame** (regression 2026-08-22).
   *
   * The old score put all three lines on timers (250/1050/1750ms), so after the section entered the
   * viewport a 17rem bordered box stood there **with nothing in it**. Measured: in a screenshot
   * taken right after the scroll arrival, 250px beneath the heading was entirely empty. A box with
   * nothing but a border does not read as "waiting for the choreography" — it reads as broken, or loading.
   *
   * The person's sentence is the **premise** the agent's response answers, not a result of the
   * choreography. So the first line is out of the choreography and is on from the start.
   *
   * What this test locks is not "how many ms" but **"is there text in the first paint"** — pinning
   * timings as values turns every rhythm adjustment red, which is noise rather than a spec. The one
   * property to lock is that the box is never empty.
   */
  it('never paints the ACP scene as an empty box — the human line is the premise', () => {
    renderDownloadPage();

    const chat = screen.getByTestId('gateway-agent-chat');
    const lines = chat.querySelectorAll('.gateway-term-line');
    expect(lines.length, '재연 세 줄이 있어야 이 시험이 뜻을 갖는다').toBe(3);

    // The first line is the person's sentence. It is on even though no timer has run.
    expect(lines[0].className).toContain('is-on');
    // And that line really has text — turning the class on while empty is the same defect.
    expect((lines[0].textContent ?? '').trim().length).toBeGreaterThan(0);
  });

  /**
   * The headline is **the owner's sentence verbatim** — a fixed point of the remake. The lead is
   * the outcome: human review before accepting agent work, rather than agent-authored memory.
   */
  it('keeps the owner-verbatim headline and gives it a human review outcome', () => {
    renderDownloadPage();

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Agents write the code.');
    expect(heading).toHaveTextContent('People accumulate the cognitive debt.');
    expect(screen.getByText(/reviewable map of what the code means/i)).toBeInTheDocument();
    expect(screen.getByText(/before accepting the work/i)).toBeInTheDocument();
  });

  /**
   * The demo section states the length of the asset that is actually attached.
   *
   * ⚠️ **Do not pin a sentence a human wrote** (`.claude/rules/documentation.md`). The 2026-08-03
   * version matched `/provisional 24s capture/` whole, and when new footage changed both the length
   * and the wording it went red for "is the sentence unchanged" rather than "is it honest" — which
   * is not the property this test protects. What is checked is the one thing a machine can produce:
   * the seconds on screen equal the registry's measured `seconds`. The wording is free to change.
   *
   * **A second assertion used to live here and was removed on 2026-08-22, not weakened.** It
   * required the note to say both locales shared one Korean-UI recording, which was the honest
   * thing to state while that was true. English footage was filmed, so the sentence it demanded
   * became the false one — the assertion would have forced the screen to keep claiming a defect it
   * no longer had. What that assertion was really guarding (an English visitor being shown a Korean
   * screen) is now held by something stronger than copy: `demo-clip-assets.contract` compares the
   * two locales' bytes, so the two files cannot silently become one again.
   */
  it('states the attached clip at the registry length', () => {
    renderDownloadPage();

    const note = screen.getByTestId('demo-provisional-note');
    expect(note).toHaveTextContent(new RegExp(`${DEMO_CLIPS[0].seconds}s`, 'i'));
  });

  // ─── One screen, one version (regression 2026-07-28) ──────────────────────
  //
  // The deployed site really did this: `v1.0.0-rc.3` (package.json) in the badge at the card's
  // right, and "v1.0.0-rc.2 is not published yet" (the generation module's stale tag) in the same
  // card's body.
  //
  // [Deleted 2026-08-19] The paired test "verifies the file actually published" had the
  // verification command (`shasum -a 256 …`) as its subject, and that command is gone. The second
  // instrument that caught the published tag and the development tag diverging no longer exists —
  // the one that remains is the unpublished test below.
  it('names exactly one version while no build is out', () => {
    renderDownloadPage();

    const facts = screen.getByTestId('gateway-facts');
    // The single source for what has not shipped yet is the development version. A stale generated
    // tag leaking into the body makes one screen state two versions.
    expect(facts).toHaveTextContent(`v${RELEASE_VERSION}`);
    expect(facts).not.toHaveTextContent('v0.9.0-stale');
  });

  // The page reserves no bottom-tab-bar height because this route has no tab
  // bar. That is a cross-module coupling: if the bar ever returns here, the
  // scroll end would sit underneath it. The old code hardcoded a 56px reserve
  // for a bar that was never rendered, which is the same defect mirrored.
  it('stays the one route without a bottom tab bar, which is why it reserves no height for one', () => {
    expect(shouldHideBottomTabBar('/download', false)).toBe(true);
    expect(shouldHideBottomTabBar('/ko/download/', false)).toBe(true);
  });

  /**
   * ## One screen, two addresses
   *
   * With the owner's sign-off on 2026-07-29, `/` became the web visitor's **face** (the ledger's
   * reversal of "root-first-open"), and that face is this view. `/download` remains the deeplink
   * that calls for an install.
   *
   * Two pieces of chrome must differ by address. Both exist to prevent **dead promises**, so they
   * are locked by meaning rather than by value.
   */
  describe('두 주소에 사는 한 화면', () => {
    it('carries the pixel identity in both the gateway chrome and hero', () => {
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
      expect(screen.getByTestId('gateway-hero-mascot')).toHaveAttribute(
        'src',
        '/brand/mascot-full.png',
      );
      expect(screen.getByTestId('gateway-hero-mascot')).toHaveAttribute(
        'data-brand-detail',
        'full',
      );
    });

    it('/download 에서는 빵부스러기가 여기가 어디인지 말한다', () => {
      mocks.pathname = '/download';
      renderDownloadPage();
      expect(screen.getByTestId('download-gnb')).toHaveTextContent(/다운로드|Download/);
    });

    it('/ 에서는 「다운로드」 마디를 지운다 — 그 주소가 아니다', () => {
      mocks.pathname = '/';
      renderDownloadPage();
      expect(screen.getByTestId('download-gnb')).not.toHaveTextContent(/다운로드|Download/);
    });

    /**
     * ⚠️ "Back to the map" **disappeared from both addresses** (2026-07-31, owner: *"This is a promo page; navigation should only be possible from the main screen."* — this is a promo page; make navigation possible
     * only from the main screen).
     *
     * It used to be removed on `/` but kept on `/download`, reasoning that someone arriving by
     * deeplink needs a way back. That reasoning was weak: the gateway is read by a **pre-install**
     * visitor, so it recommends the workbench to someone who has no vault yet, while someone who
     * does have a vault reaches the map from `/` in the first place (`isGatewaySurface()`).
     *
     * The one path to the map is "try it in the browser without installing", inside the panel —
     * two links doing the same job, one in the chrome and one in the panel, makes one of them a
     * dead promise.
     */
    it.each(['/', '/download'])('%s 크롬에 「지도로 돌아가기」가 없다', (pathname) => {
      mocks.pathname = pathname;
      renderDownloadPage();
      expect(screen.queryByTestId('download-back-to-map')).toBeNull();
    });

    it('지도로 가는 유일한 길은 히어로의 웹 CTA 이고 /topology 를 가리킨다', () => {
      mocks.pathname = '/';
      publishRelease();
      renderDownloadPage();
      expect(screen.getByTestId('gateway-hero-web-cta')).toHaveAttribute('href', '/topology');
    });

    /**
     * The bottom tab bar reserve — this only checks **that the prescription is in the right place**.
     *
     * Whether pixels are actually recovered is measured by `tests/e2e/scroll-end-gap.spec.ts`
     * (`.claude/rules/design.md`: keep the class-string assertion and the measurement as two
     * layers). This layer is needed separately because **why it differs** is this component's
     * verdict: the same view lives at two addresses, and the tab bar stands only on `/`.
     *
     * Measured defect (2026-08-06): with no reserve, the last line at the end of `/`'s scroll went
     * **17px** behind the tab bar — at both 390 and 768, and in the production static export too.
     */
    it('/ 에서는 하단 탭바 높이를 예약한다 — 탭바가 서는 주소다', () => {
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

    it('/download 에서는 예약하지 않는다 — 그 주소엔 탭바가 없다', () => {
      mocks.pathname = '/download';
      renderDownloadPage();
      const band = screen.getByTestId('download-bottom-band');
      expect(band).not.toHaveAttribute('data-gateway-bottom-reserve-token');
      expect(band.className).not.toContain('--topology-mobile-bottom-tab-reserve');
    });

    /**
     * The contract that the reserve decision uses **the same function as the tab bar itself**.
     *
     * Two places listing their own routes lets one drift, and the side that drifts is "the reserve",
     * so content is occluded again with no error. Hence this test checks the premise of the two
     * assertions above directly through `shouldHideBottomTabBar`.
     */
    it('예약 판정의 전제는 탭바의 판정과 같다', () => {
      expect(shouldHideBottomTabBar('/download', false)).toBe(true);
      expect(shouldHideBottomTabBar('/', false)).toBe(false);
    });
  });
});
