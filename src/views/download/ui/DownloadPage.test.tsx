import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import enMessages from '../../../../messages/en.json';
import { GITHUB_RELEASES_URL } from '@/features/macos-download-link';
import { shouldHideBottomTabBar } from '@/widgets/bottom-tab-bar';
import { RELEASE_VERSION } from '../lib/release-facts';
import { DOGFOOD_CENSUS } from '../model/dogfood-census.generated';
import { DownloadPage } from './DownloadPage';
import { useStageGraph } from './StageMap';

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
      expect(appleSilicon).toHaveTextContent(/12\.4 MB/);
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
    // 파생 그래프는 frontmatter 파일 수와 **다르다**. 그 차이를 여기 고정해
    // 두지 않으면 다음 사람이 "같으니 캡션을 되돌려도 된다" 고 읽는다.
    expect(graph.nodes.length).not.toBe(DOGFOOD_CENSUS.concepts);

    // [download-honesty] 이 숫자에는 범위 라벨이 붙어야 한다 — 앱에서 자기
    // 폴더를 열면 다른 정의(런타임 파생 그래프)로 다른 숫자가 나오고, 라벨이
    // 없으면 같은 사용자가 두 숫자를 보고 신뢰를 잃는다.
    expect(caption).toHaveTextContent(/docs\/ontology/i);
    expect(caption).toHaveTextContent(/your own numbers/i);

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

  // 2026-07-28 소유자 판정("이 페이지는 서비스를 홍보해야지") 이후의 순서:
  // 파일 → 파는 말 → 두 사용자 → 설치 → 다른 환경 → (푸터) 검증.
  // 검증이 **맨 아래 접힌 채로** 있는 것이 이 순서의 요점이라, 그 위치를 고정한다.
  it('puts the file first and the verification footnote last', () => {
    publishRelease();
    renderDownloadPage();

    const heading = screen.getByRole('heading', { level: 1 });
    const primaryCta = screen.getByTestId('download-primary-cta');
    const windows = screen.getByTestId('download-platform-windows');
    const install = screen.getByTestId('download-install');
    const trust = screen.getByTestId('download-trust');

    for (const [earlier, later] of [
      [heading, primaryCta],
      // 플랫폼 상태는 **받는 자리**에 있다 — 스크롤을 내려야 자기가 못 받는다는
      // 걸 아는 것은 늦다(소유자 판정 2026-07-29).
      [primaryCta, windows],
      [windows, install],
      [install, trust],
    ] as const) {
      expect(
        earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
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
});
