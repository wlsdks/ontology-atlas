import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import enMessages from '../../../../messages/en.json';
import { GITHUB_RELEASES_URL } from '@/features/macos-download-link';
import { shouldHideBottomTabBar } from '@/widgets/bottom-tab-bar';
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
   * 이 표면은 **두 주소에 산다** — `/`(웹 방문자의 얼굴)과 `/download`(설치
   * 딥링크). 크롬의 두 조각(빵부스러기 마디 · 「지도로 돌아가기」)이 주소에
   * 따라 달라지므로 테스트가 주소를 갈아끼울 수 있어야 한다.
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
      // 미게시일 때 이 태그는 **일부러 낡은 값**이다 — `--unpublished` 로
      // 마지막에 리셋할 때 적힌 것이지 다음에 나올 버전이 아니다. 구
      // 픽스처는 이걸 항상 `v${RELEASE_VERSION}` 로 두어서 페이지가 두 출처를
      // 섞어 쓰는 것을 볼 수 없었다.
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
      // ⚠️ `/` 가 아니라 `/topology` 다 (2026-07-29 밤). 소유자 결정으로 `/` 가
      // **마케팅 페이지**가 되므로, 「브라우저에서 써보기」가 `/` 로 가면 소개
      // 화면으로 되돌아오는 고리가 된다. 이 단언의 의도는 *"앱 없이도 오늘
      // 당장 되는 곳으로 보낸다"* 이고 그 곳은 웹 제품 — `/topology` 다.
      // 두 주소가 같은 화면이던 시절엔 어느 쪽을 적어도 통과해서, 이 값은
      // 의도가 아니라 우연을 굳히고 있었다.
      expect(web).toHaveAttribute('href', '/topology');
      expect(web).toHaveTextContent(/Try it in the browser/i);
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
      // 크기는 이제 라벨 문자열이 아니라 **별도 스팬**이다 — Intel 버튼과 같은
      // 문법이고, `<sm` 에서 그 스팬만 빠져 가로 오버플로가 사라진다(평결 ④).
      expect(appleSilicon).toHaveTextContent(/Download for Apple Silicon/i);
      // 13,002,342 B → 13.0 MB (십진). Finder 가 말하는 것과 같은 단위다.
      expect(appleSilicon).toHaveTextContent(/13\.0 MB/);
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

    /**
     * 히어로 CTA 의 네 목적지 (2026-08-18 소유자: 히어로에 Windows 받기 버튼과
     * 웹으로 가는 버튼이 없고, 데모는 버튼인지도 안 보였다) — ① 내 플랫폼용
     * 받기(채움, 유일한 승자) ② 데모 ③ 나머지 데스크톱 파일 전부 ④ 브라우저
     * 지도. 감지 실패의 기본값(macOS)에서도 넷 전부에 손이 닿아야 한다.
     */
    it('hero reaches every desktop file, the demo, and the browser map — one filled winner', () => {
      publishWindowsRelease();
      renderDownloadPage();

      const primary = screen.getByTestId('gateway-hero-cta');
      expect(primary).toHaveAttribute('href', expect.stringMatching(/_aarch64\.dmg$/));
      expect(primary.className).toMatch(/--color-indigo-brand/);

      const demo = screen.getByTestId('gateway-hero-demo-link');
      expect(demo).toHaveAttribute('href', '#demo');
      // ghost 가 아니다 — 면(overlay)과 테두리를 가진 outline 이어야 「누를 수
      // 있는 것」으로 읽힌다(소유자: "버튼인지도 모르겠고").
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
      // 서명 상태는 받기 **전에** 알아야 하는 사실 — 한 단 아래 버튼에서도
      // 표식을 떼지 않는다(전문 경고·체크섬은 설치 절 `PlatformStatus`).
      expect(windows).toHaveTextContent(/unsigned/i);

      const web = screen.getByTestId('gateway-hero-web-cta');
      expect(web).toHaveAttribute('href', '/topology');

      // 채운 승자는 히어로에 **하나**다 — 나머지는 전부 한 단 아래.
      for (const secondary of [demo, windows, web, screen.getByTestId('gateway-hero-macos-x64')]) {
        expect(secondary.className).not.toMatch(/--color-indigo-brand/);
      }
    });

    /**
     * Windows 방문자에게는 Windows 파일이 승자다 — 그리고 그 승격은 미서명
     * 사실을 같이 데려가야 한다: macOS 방문자가 신뢰줄에서 서명·공증을 읽는
     * 그 자리에서, Windows 방문자는 미서명·SmartScreen 경고를 읽는다.
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
        // 21,500,000 B → 21.5 MB — 승자의 크기는 승자의 파일 것이어야 한다.
        expect(primary).toHaveTextContent(/21\.5 MB/);
        expect(screen.getByText(/Unsigned beta · SmartScreen/i)).toBeInTheDocument();

        // macOS 파일들은 사라지지 않고 한 단 아래로 내려온다.
        expect(screen.getByTestId('gateway-hero-macos-aarch64')).toHaveAttribute(
          'href',
          expect.stringMatching(/_aarch64\.dmg$/),
        );
        expect(screen.getByTestId('gateway-hero-macos-x64')).toBeInTheDocument();
        expect(screen.queryByTestId('gateway-hero-windows')).not.toBeInTheDocument();
      } finally {
        // 인스턴스에 덮어쓴 own property 를 지우면 프로토타입 getter 가 돌아온다.
        delete (navigator as { userAgent?: string }).userAgent;
      }
    });

    // Windows 빌드가 미게시면 Windows UA 라도 승자는 여전히 macOS 다 — 없는
    // 파일을 승격하는 것은 빈 약속이고, 그 방문자의 오늘은 브라우저 CTA 가 연다.
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


  it('tells Windows visitors where they stand instead of omitting the platform', () => {
    renderDownloadPage();

    const windowsCard = screen.getByTestId('download-platform-windows');
    expect(windowsCard).toHaveTextContent(/Windows/);
    expect(windowsCard).toHaveTextContent(/not out yet/i);
    // 판에 남는 결정 사실은 둘뿐이다: **없다**(위 두 줄) · **어디서 추적하나**.
    // "같은 기준을 통과할 때 올린다" 는 정책 산문이라 푸터 접이식으로 내려갔다
    // (fable 판정 2026-07-29) — 받는 자리에서 정책을 읽을 이유가 없다.
    expect(windowsCard).toHaveTextContent(/Follow progress/i);
    expect(windowsCard).not.toHaveTextContent(/same bar/i);
    expect(screen.getByRole('link', { name: /Follow progress/i })).toBeInTheDocument();
  });

  it('offers the published unsigned Windows x64 beta with the warning before download', () => {
    publishRelease();
    publishWindowsRelease();
    renderDownloadPage();

    const windowsCard = screen.getByTestId('download-platform-windows');
    const warning = screen.getByTestId('download-windows-unsigned-warning');
    const download = screen.getByTestId('download-windows-x64');

    expect(download).toHaveAttribute(
      'href',
      expect.stringMatching(/ontology-atlas_.+_windows_x64-setup\.exe$/),
    );
    expect(download).toHaveTextContent(/Windows x64 beta/i);
    expect(download).toHaveAttribute('aria-describedby', warning.id);
    expect(warning).toHaveTextContent(/not code-signed/i);
    expect(warning).toHaveTextContent(/Microsoft Defender SmartScreen/i);
    expect(warning).toHaveTextContent(/unknown publisher/i);
    expect(warning).toHaveTextContent(/managed work PC/i);
    expect(
      warning.compareDocumentPosition(download) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(windowsCard).not.toHaveTextContent(/not out yet/i);
    expect(screen.getByRole('heading', { name: 'macOS' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Windows x64 beta/i })).toBeInTheDocument();
    expect(screen.getAllByTestId('download-web-cta')).toHaveLength(1);

    const exitRow = screen.getByTestId('download-exit-row');
    const github = screen.getByTestId('download-repo-link');
    const web = screen.getByTestId('download-web-cta');
    expect(exitRow).toContainElement(github);
    expect(exitRow).toContainElement(web);
    expect(windowsCard).not.toContainElement(web);
    expect(github).toHaveTextContent(/Go to GitHub/i);
    expect(web).toHaveTextContent(/View web version/i);
    expect(github.compareDocumentPosition(web) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    // 리메이크 후 히어로 신뢰줄("Signed and notarized by Apple · …")이 같은
    // 표현을 화면에 한 번 더 올린다 — 이 단언이 지키는 것은 「검증 절의 행이
    // 공증을 스테이플 티켓과 함께 주장한다」이므로 행 문장으로 좁혀 잰다.
    expect(screen.getByText(/Notarized by Apple, with the ticket stapled/i)).toBeInTheDocument();
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

    expect(screen.getByRole('link', { name: /Go to GitHub/i })).toHaveAttribute(
      'href',
      'https://github.com/wlsdks/ontology-atlas',
    );
    expect(screen.getByText(/Connect your AI agent/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open my markdown folder/i })).not.toBeInTheDocument();
  });

  // Installing is not the end of the journey. Saying the app updates itself
  // is what makes this page a one-time visit rather than a recurring chore.

  // ─── 배경은 증거다 (2026-07-28 백지 재설계) ────────────────────────────────
  //
  // 이 페이지의 헤드라인은 배경을 **가리킨다**("뒤에 보이는 지도는 …이 저장소의
  // 실제 폴더예요"). 그 문장이 참이려면 뒤에 그려진 것이 진짜 vault 여야 하고,
  // 그래서 배경은 지울 수 있는 장식이 아니라 계약이다. 구 미니어처(노드 8개
  // 도식)를 대체하면서 그 정직성 계약도 함께 옮겨 왔다.
  // 2026-07-29 평결 ① — 캡션은 **자기가 설명하는 그림**을 센다. 구 판본은
  // 빌드 스크립트의 frontmatter 파일 수(`DOGFOOD_CENSUS.concepts` = 96)를
  // 적으면서 그 옆에 파생 그래프(287 노드)를 그렸다. 한 화면에 정의가 둘이면
  // 어느 쪽도 못 믿는다 — 허브 각인 `379` vs 캡션 `96` 이 그 증상이었다.
  it('draws the real vault behind the plate, with the same numbers the caption claims', () => {
    renderDownloadPage();

    const caption = screen.getByTestId('download-portrait-caption');
    const { result } = renderHook(() => useStageGraph(), { wrapper: IntlWrapper });
    const graph = result.current;
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(caption).toHaveTextContent(`${graph.nodes.length} concepts`);
    expect(caption).toHaveTextContent(`${graph.edges.length} relations`);
    // [삭제됨 2026-08-01] `expect(graph.nodes.length).not.toBe(DOGFOOD_CENSUS.concepts)`
    //
    // 이건 수를 재는 게이트가 아니라 **결함을 요구하는 게이트**였다. 두 수가
    // 달랐던 이유는 옛 볼트에 「파일 없이 이름만 불린」 파생 노드가 있었기
    // 때문이고 — frontmatter 파일 수 96 vs 파생 그래프 287 — 그 간극을 고정해
    // 두는 것이 당시엔 "캡션을 파일 수로 되돌리지 마라" 는 방벽이었다.
    // 볼트를 규격대로 재생성한 지금은 **모든 노드가 자기 문서를 가져서**
    // 두 정의가 정당하게 같아질 수 있다. 「달라야 한다」를 남기면 그 결함을
    // 되살려야만 초록이 된다.
    //
    // 원래 지키려던 것은 위 두 줄이 이미 지킨다: 캡션은 **자기가 그리는
    // 그래프**를 센다. 둘 다 `useStageGraph()` 한 훅에서 나오므로 손으로 맞출
    // 숫자가 없고, 파일 수를 적는 옛 판본으로 되돌리면 그 순간 빨개진다.

    // [download-honesty] 이 숫자에는 범위 라벨이 붙어야 한다 — 자기 폴더를
    // 열면 다른 정의(런타임 파생 그래프)로 다른 숫자가 나오고, 라벨이 없으면
    // 같은 사용자가 두 숫자를 보고 신뢰를 잃는다.
    expect(caption).toHaveTextContent(/docs\/ontology/i);
    expect(caption).toHaveTextContent(/your own numbers/i);

    // **능력의 범위까지 정직해야 한다** (2026-08-08 카운슬). 이 절은 오래
    // *"in the app"* 이라고만 말했는데, FSA 를 지원하는 브라우저는 이 웹에서도
    // 폴더를 연다 — `surfaces.md` 가 이름 붙인 「되는 것을 안 된다고 쓰는
    // 것」이고, 되는 범위를 좁게 말하면 사람은 할 수 있는 일을 포기한다.
    // 관문에 폴더 여는 컨트롤을 놓지 않기로 한 판정과 짝이 되는 문장이라,
    // 문구가 좁아지면 그 판정도 같이 거짓말이 된다.
    expect(caption).toHaveTextContent(/web version/i);

    // 만질 수 있다는 **보이는** 신호. 정지 프레임의 유일한 어포던스라
    // (커서는 호버 게이트, aria-label 은 AT 전용) 사라지면 지도가 다시
    // "고정된 그림" 으로 읽힌다 — 소유자가 실제로 그렇게 보고했다.
    expect(caption).toHaveTextContent(/drag to move/i);
  });

  // 무대 지도는 **진짜 엔진**이다(2026-07-28 소유자 지시). 배경이 장식이 아니라는
  // 것을 지키는 구조적 장치는 이제 "출처가 캡션과 같은 볼트로 고정돼 있다" 는 것 —
  // `useDogfoodInsight` 는 세션의 샘플 선택을 따라가지 않는다.
  it('mounts the real map engine behind the plate', () => {
    renderDownloadPage();

    expect(screen.getByTestId('download-stage-map')).toBeInTheDocument();
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

  /**
   * 리메이크(2026-08-18) 순서 — **다섯 절, 절마다 생각 하나** (소유자 확정
   * 골격): 히어로(활자+오브젝트+CTA) → 시연 → 증거(지도+census) → 에이전트
   * 왕복 → 설치·다운로드(완전한 정지) → (푸터) 검증 접이식.
   *
   * 구 순서(파일 먼저, 2026-07-28 「홍보해야지」 판정)의 전제 — 판이 첫
   * 화면의 주인공이라는 것 — 는 리메이크로 사라졌다: 이제 첫 화면은 문제
   * 제기(헤드라인)와 제품의 실체(히어로 오브젝트)가 갖고, 파일은 네 절이
   * 논증을 끝낸 뒤의 결정 자리(⑤)에 온다. 검증이 맨 아래 접힌 채라는 요점은
   * 그대로 산다.
   */
  it('walks problem → demo → evidence → agents → decision, verification folded last', () => {
    publishRelease();
    renderDownloadPage();

    const heading = screen.getByRole('heading', { level: 1 });
    const demo = screen.getByTestId('demo-stage');
    const caption = screen.getByTestId('download-portrait-caption');
    // 2026-08-18 재작업: 에이전트 절의 장면은 mcp-verify 터미널에서 앱 안
    // 대화(ACP) 재연으로 바뀌었다 — 순서 계약의 넷째 자리는 그대로다.
    const terminal = screen.getByTestId('gateway-agent-chat');
    const install = screen.getByTestId('download-install');
    const primaryCta = screen.getByTestId('download-primary-cta');
    const windows = screen.getByTestId('download-platform-windows');
    const trust = screen.getByTestId('download-trust');

    for (const [earlier, later] of [
      [heading, demo],
      [demo, caption],
      [caption, terminal],
      [terminal, install],
      // 설치 3단이 판보다 먼저다 — 「설치가 간단하다」는 안심이 받기 결정의
      // 재료라서다(승인 목업 b-hero 의 절 ⑤ 구조 그대로).
      [install, primaryCta],
      [primaryCta, windows],
      [windows, trust],
    ] as const) {
      expect(
        earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  /**
   * 에이전트 절 (2026-08-18 재작업) — 장면은 **앱 안 대화(ACP)의 실측 왕복**
   * 이다. 두 계약을 잠근다:
   *
   * 1. 재연되는 도구 호출은 원장(2026-08-16 (7))의 실측 원문이다 — 지어낸
   *    출력으로 바뀌면 이 절의 논증(재연이지 연출이 아니다)이 무너진다.
   * 2. 우리 실행기 목록을 설명하는 문구는 벤더가 허용한 표시 이름만 쓴다
   *    (원장 2026-08-16 (5) · `vendor-naming.contract.test.ts` 와 같은 규칙 —
   *    그 게이트의 사정거리는 레지스트리·설정 문구라 이 절은 여기서 잠근다).
   */
  it('replays the measured in-app ACP round trip verbatim, under the allowed vendor name', () => {
    renderDownloadPage();

    const chat = screen.getByTestId('gateway-agent-chat');
    expect(chat).toHaveTextContent('add_relation');
    expect(chat).toHaveTextContent(/인증이 죽으면 결제도 같이 죽는다 \(2026-08-16\)/);

    const section = screen.getByTestId('gateway-agents-section');
    expect(section).not.toHaveTextContent(/Claude Code/i);
    expect(section).toHaveTextContent(/Claude Agent/);
    // 우리가 모델 접근을 제공한다는 인상 금지 — 「이미 쓰는 도구」 전제가 문구에 있다.
    expect(section).toHaveTextContent(/already use/i);
  });

  /**
   * 헤드라인은 **소유자의 문장 그대로**다 — 리메이크의 고정점이라 문장으로
   * 잠근다(다듬어 고치는 순간 이 화면의 전제가 바뀐 것이고, 그건 원장을 거쳐야
   * 한다). 두 줄 + 리드까지가 한 벌이다.
   */
  it('keeps the owner-verbatim headline and lead', () => {
    renderDownloadPage();

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Agents write the code.');
    expect(heading).toHaveTextContent('People accumulate the cognitive debt.');
    expect(
      screen.getByText(/One markdown folder is where that debt gets repaid/i),
    ).toBeInTheDocument();
  });

  /**
   * 시연 절은 지금 붙은 자산이 무엇인지 정직하게 말한다 — 두 로케일이 같은
   * 한국어 UI 잠정본을 공유하는 동안, 그 사실이 화면에 있어야 영어 방문자가
   * 속지 않는다. 45초 촬영본이 붙으면 이 문장은 등록부의 `seconds` 만 따라
   * 바뀐다(마크업 무변경 교체 계약).
   */
  it('states honestly that the demo clip is a provisional shared capture', () => {
    renderDownloadPage();

    const note = screen.getByTestId('demo-provisional-note');
    expect(note).toHaveTextContent(/provisional 24s capture/i);
    expect(note).toHaveTextContent(/Korean-UI recording/i);
  });

  // ─── 한 화면 = 한 버전 (2026-07-28 회귀) ──────────────────────────────────
  //
  // 배포된 사이트가 실제로 이랬다: 카드 오른쪽 배지에 `v1.0.0-rc.3`
  // (package.json), 같은 카드 본문에 "v1.0.0-rc.2 는 아직 게시 전입니다"
  // (생성 모듈의 낡은 태그), 그리고 검증 절에는
  // `shasum -a 256 …rc.3_aarch64.dmg` — 체크섬 목록은 rc.2 파일을 세워 둔 채로.
  //
  // 구 픽스처가 릴리스 태그를 **항상** `v${RELEASE_VERSION}` 으로 두어서 두
  // 출처가 갈라지는 순간을 재현할 수 없었다. 갈라진 상태를 픽스처로 만든다.
  describe('when the published release is not the version under development', () => {
    it('verifies the file it actually published, not the one being built', () => {
      const publishedVersion = '1.0.0-rc.2';
      expect(publishedVersion).not.toBe(RELEASE_VERSION);

      mocks.release = {
        published: true,
        prerelease: true,
        tag: `v${publishedVersion}`,
        publishedAt: '2026-07-28T01:44:03Z',
        releaseUrl: `https://github.com/wlsdks/ontology-atlas/releases/tag/v${publishedVersion}`,
        assets: (['aarch64', 'x64'] as const).map((arch) => ({
          arch,
          fileName: `ontology-atlas_${publishedVersion}_${arch}.dmg`,
          sizeBytes: 13_002_342,
          sha256: arch === 'aarch64' ? AARCH64_SHA : X64_SHA,
          downloadUrl: `https://github.com/wlsdks/ontology-atlas/releases/download/v${publishedVersion}/ontology-atlas_${publishedVersion}_${arch}.dmg`,
        })),
      };
      renderDownloadPage();

      const trust = screen.getByTestId('download-trust');
      // 따라 하면 실제로 되는 명령이어야 한다. 개발 중 버전의 파일명을 부르면
      // `No such file` 이 뜨고, 신뢰를 벌겠다는 절이 유일하게 실행 가능한
      // 지시에서 틀린다.
      expect(trust).toHaveTextContent(`shasum -a 256 ontology-atlas_${publishedVersion}_aarch64.dmg`);
      expect(trust).not.toHaveTextContent(`ontology-atlas_${RELEASE_VERSION}_aarch64.dmg`);
    });
  });

  it('names exactly one version while no build is out', () => {
    renderDownloadPage();

    const pending = screen.getByTestId('download-macos-pending');
    // 아직 안 나온 것을 말하는 진실원은 개발 중 버전 하나다. 생성 모듈의
    // 낡은 태그가 본문에 새면 한 상자가 두 버전을 말한다.
    expect(pending).toHaveTextContent(`v${RELEASE_VERSION}`);
    expect(pending).not.toHaveTextContent('v0.9.0-stale');
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
   * ## 같은 화면, 두 주소
   *
   * 2026-07-29 소유자 서명으로 `/` 는 웹 방문자의 **얼굴**이 됐고(원장:
   * 「root-first-open」 뒤집기), 그 얼굴이 이 뷰다. `/download` 는 설치를 부르는
   * 딥링크로 남는다.
   *
   * 크롬의 두 조각이 주소에 따라 달라져야 한다. 둘 다 **죽은 약속**을 막는
   * 장치라 값이 아니라 의미로 잠근다.
   */
  describe('두 주소에 사는 한 화면', () => {
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
     * ⚠️ 「지도로 돌아가기」는 **두 주소 모두에서 사라졌다** (2026-07-31, 소유자:
     * *"이건 홍보 페이지라 메인 화면에서만 이동 가능하게"*).
     *
     * 예전엔 `/` 에서만 지우고 `/download` 에는 남겼다 — 딥링크로 도착한 사람이
     * 돌아갈 길이라는 논리였다. 그 논리가 약했다: 관문은 **설치 전** 방문자가
     * 읽는 자리라 아직 볼트도 없는 사람에게 워크벤치를 권하게 되고, 볼트가 있는
     * 사람은 애초에 `/` 에서 지도로 간다(`isGatewaySurface()`).
     *
     * 지도로 가는 길은 판 안의 「설치 없이 브라우저에서 써보기」 하나가 낸다 —
     * 같은 일을 하는 링크를 크롬과 판에 둘 다 두면 하나는 죽은 약속이 된다.
     */
    it.each(['/', '/download'])('%s 크롬에 「지도로 돌아가기」가 없다', (pathname) => {
      mocks.pathname = pathname;
      renderDownloadPage();
      expect(screen.queryByTestId('download-back-to-map')).toBeNull();
    });

    it('지도로 가는 유일한 길은 판 안의 웹 CTA 이고 /topology 를 가리킨다', () => {
      mocks.pathname = '/';
      renderDownloadPage();
      expect(screen.getByTestId('download-web-cta')).toHaveAttribute('href', '/topology');
    });

    /**
     * 하단 탭바 예약고 — **처방이 제자리에 있는지**만 본다.
     *
     * 실제로 픽셀을 되찾는지는 `tests/e2e/scroll-end-gap.spec.ts` 가 잰다
     * (`design.md`: 클래스 문자열 단언과 실측을 두 층으로 같이 둔다). 이 층이
     * 따로 필요한 이유는 **왜 갈리는지**가 이 컴포넌트의 판정에 있기 때문이다:
     * 같은 뷰가 두 주소에 사는데 탭바는 `/` 에만 선다.
     *
     * 결함 실측(2026-08-06): 예약이 없어서 `/` 스크롤 끝의 마지막 줄이 탭바 뒤로
     * **17px** 들어갔다 — 390·768 양쪽, 프로덕션 정적 export 에서도 동일.
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
     * 예약 여부를 **탭바 자신과 같은 함수로** 판정한다는 계약.
     *
     * 두 곳에서 각자 라우트를 나열하면 한쪽이 드리프트하고, 그때 어긋나는 쪽이
     * 「예약고」라 아무 에러 없이 다시 가려진다. 그래서 이 시험은 위 두 단언의
     * 전제를 `shouldHideBottomTabBar` 로 직접 확인한다.
     */
    it('예약 판정의 전제는 탭바의 판정과 같다', () => {
      expect(shouldHideBottomTabBar('/download', false)).toBe(true);
      expect(shouldHideBottomTabBar('/', false)).toBe(false);
    });
  });
});
