'use client';

import { ArrowLeft, Check, Clipboard, Download, ExternalLink, Orbit, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/shared/lib/cn';
import { useCopyFeedback } from '@/shared/lib/use-copy-feedback';
import { buttonVariants } from '@/shared/ui';
import { LocaleSwitch } from '@/features/locale-switch';
import { MacosDownloadLink } from '@/features/macos-download-link';
import {
  CLI_COMMAND_COUNT,
  MCP_TOOL_COUNT,
  RELEASE_MIN_MACOS,
  RELEASE_VERSION,
  buildDmgName,
} from '../lib/release-facts';
import {
  ARCH_ORDER,
  MACOS_RELEASE,
  WINDOWS_STATUS,
  formatAssetSize,
  isMacosReleasePublished,
  macosAssetFor,
  type DesktopArch,
} from '../lib/release-state';
import { DOGFOOD_CENSUS } from '../model/dogfood-census.generated';
import { buildMiniatureLayout } from '../model/miniature-layout';

const GITHUB_REPOSITORY_URL = 'https://github.com/wlsdks/ontology-atlas';

/**
 * 이 화면의 일 (2026-07-27 리메이크):
 *
 * > **처음 온 사람이 "이걸 지금 내 맥에 설치해도 되는가" 를 판단하고, 맞으면
 * > 자기 기기에 맞는 파일을 헤매지 않고 받는다.**
 *
 * 그 한 문장이 위계를 정한다. 판단에 쓰이는 것(받을 게 있는가 · 내 맥에
 * 맞는가 · 안전한가 · 안 받아도 되는 길이 있는가)만 접힘 위에 있고, 나머지는
 * 전부 그 아래이거나 없어졌다.
 *
 * 리메이크가 걷어낸 것:
 * - **오늘 거짓이 된 문구.** 2026-07-27 에 Developer ID 인증서가 발급되면서
 *   릴리스가 서명·공증 경로로 돌아왔다(`docs/DECISIONS.md`). 그런데 페이지는
 *   "아직 서명되지 않음" 을 라벨로, "codesign --verify 통과" 를 그 라벨의
 *   주석으로 **한 줄에 같이** 그리고 있었다 — 스스로 모순인 행이었다. 설치
 *   단계 02 의 「확인 없이 열기」 우회 안내, "서명이 없는 동안은 체크섬이
 *   유일한 확인 수단" 도 같이 거짓이 됐다. 원장이 *"인증서가 생기면 그때
 *   페이지 문구도 함께 되돌린다"* 고 남겨 둔 미결 항목이 이것이다.
 * - **한국어만 나오던 릴리스 노트 발췌.** `changelog-preview.ts` 는 한국어
 *   상수였고 영문 페이지에도 그대로 렌더됐다. 릴리스가 생기면 GitHub 이
 *   만드는 릴리스 노트가 진실원이므로, 발췌 대신 그쪽을 가리킨다.
 * - **두 번째 랜딩.** 구 LandingPage 히어로(두 번째 h1 + 4행 리드 + 가치사슬
 *   카드 3장)가 설치 판단 아래 통째로 붙어 있었다. 남긴 것은 그중 유일하게
 *   증거인 것 하나 — 실제 vault 로 그린 미니어처다.
 * - **같은 무게의 박스 17개.** 지금은 5개이고, 채워진 인디고 버튼은 화면당
 *   하나다.
 *
 * 아직 릴리스가 없을 때의 주목 승자는 다운로드가 아니다 — 오늘 그 버튼은 빈
 * 릴리스 페이지로 간다. 그래서 그 상태의 승자는 "웹에서 지도 열기" 이고,
 * 릴리스가 게시되면 승자가 DMG 로 옮겨간다.
 */
export function DownloadPage() {
  const t = useTranslations('download');
  const tFooter = useTranslations('footer');
  const published = isMacosReleasePublished();
  // Apple Silicon 이 기본 제안 — 2020년 말 이후 팔린 맥은 거의 전부 그쪽이다.
  const primaryAsset = published ? macosAssetFor('aarch64') : null;

  return (
    <div className="flex min-h-full w-full flex-col">
      {/* GNB — 관문 표면의 전역 내비 (2026-07-28 소유자 확정).
          이 라우트는 좌측 레일(워크벤치 크롬)을 쓰지 않는다
          (`isGatewayRoute` → `AppShell` 이 레일을 `lg:hidden` 처리). 레일이
          빠진 자리의 "여기가 어디이고 어디로 갈 수 있나" 는 이 상단 바가
          진다 — 예전에는 이 내비가 본문 컬럼(960px) 안에 빵부스러기로 떠
          있어서, 좌측 레일 6개 목적지와 **이중 내비**였고 둘 중 어느 쪽도
          전역으로 읽히지 않았다.

          `sticky` 인 이유: 스크롤하는 관문 페이지라 아래로 내려간 방문자에게
          되돌아갈 길이 계속 보여야 한다. 스크롤 컨테이너는 셸의 본문
          슬롯이므로 여기 sticky 는 그 컨테이너 기준으로 붙는다.

          스크롤 끝 여백은 `--page-bottom-breath` 하나다. 하단 탭바 예약고
          (`--topology-mobile-bottom-tab-reserve`)를 **더하지 않는 이유**는
          이 라우트에 탭바가 없기 때문이다 —
          `shouldHideBottomTabBar('/download')` 가 true 다. 구 코드는
          `calc(56px + safe-area + 1rem)` 을 박아 두어 존재하지 않는 탭바
          자리를 좁은 폭마다 56px 씩 비워 두고 있었다(실측: 탭바 노드 0).
          결합은 `DownloadPage.test.tsx` 가 고정한다. */}
      <nav
        data-testid="download-gnb"
        className="sticky top-0 z-30 w-full shrink-0 border-b border-[color:var(--color-divider)] bg-[color:var(--color-canvas)] px-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] md:px-10"
      >
        <div className="mx-auto flex h-[var(--chrome-tile-size)] w-full max-w-[var(--page-max)] flex-wrap items-center gap-3">
          <Link
            href="/"
            // coarse 포인터에서 히트만 44px 로 — 시각 높이 무변경 (2026-07-28).
            className="touch-hit-expand inline-flex items-center gap-2 transition-colors hover:text-[color:var(--color-text-primary)]"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] text-[color:var(--color-indigo-accent)]">
              <Orbit size={12} />
            </span>
            <span className="text-body leading-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
              Ontology Atlas
            </span>
          </Link>
          <span aria-hidden className="text-body text-[color:var(--color-text-quaternary)]">
            /
          </span>
          <span
            aria-current="page"
            className="text-body leading-body text-[color:var(--color-text-tertiary)]"
          >
            {t('downloadSectionLabel')}
          </span>
          <span className="ml-auto flex items-center gap-3">
            <Link
              href="/"
              className="touch-hit-expand inline-flex items-center gap-1.5 text-body leading-body text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
            >
              <ArrowLeft size={14} aria-hidden />
              {t('back')}
            </Link>
            <LocaleSwitch />
          </span>
        </div>
      </nav>

      <main
        id="main"
        className="min-w-0 flex-1 bg-[color:var(--color-canvas)] px-[max(1.5rem,env(safe-area-inset-left))] pt-[max(1.5rem,env(safe-area-inset-top))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-[max(var(--page-bottom-breath),env(safe-area-inset-bottom))] md:px-10 md:pt-10"
      >
        <div className="mx-auto w-full max-w-[var(--page-max)]">
          <div className="mx-auto w-full max-w-[var(--page-col-utility)]">
            {/* Band 1 — 판단. 제목·리드 다음에 곧바로 결정이 온다. 도판은
                여기 두지 않는다: 2행짜리 리드를 400px 도판 옆에 세우면
                왼쪽 절반이 250px 비고, 그 빈칸을 아무도 고른 적이 없다.
                도판은 그것이 답이 되는 자리(설치 후 무엇을 보게 되나)로
                내려갔다. */}
            {/* GNB 가 이미 아래 보더를 그으므로 여기서 또 그으면 6px 사이에
                구분선이 둘이 된다 (2026-07-28 GNB 승격). */}
            <header className="pt-2">
              <p className="font-mono text-caption uppercase leading-caption tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
                {t('eyebrow')}
              </p>
              <h1 className="mt-2 max-w-[var(--measure-prose)] text-display leading-display-tight font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)] md:text-hero">
                {t('title')}
              </h1>
              <p className="mt-3 max-w-[var(--measure-prose)] break-keep text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
                {t('subtitle')}
              </p>
              <HeroActions published={published} primaryAsset={primaryAsset} />
            </header>

            {/* 결정은 컬럼 폭 전체를 쓴다 — 페이지에서 가장 중요한 것이 가장
                좁은 상자면 위계가 뒤집힌다. */}
            <MacosDecision published={published} primaryAsset={primaryAsset} />

            <TrustPanel published={published} />

            {/* 도판은 02 단계("폴더를 고르면 지도로 그려진다")의 증거다 —
                그 문장 옆이 이 그림이 실제로 답이 되는 유일한 자리다. */}
            <div className="mt-[var(--section-gap)] grid grid-cols-1 items-start gap-[var(--card-gap)] lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
              <InstallPanel />
              <VaultInstrument />
            </div>

            <ElsewherePanel published={published} />

            <footer className="mt-[var(--section-gap)] border-t border-[color:var(--color-divider)] pt-4 text-label leading-label text-[color:var(--color-text-quaternary)]">
              <p className="max-w-[var(--measure-prose)] break-keep">{t('releaseGateNote')}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="font-mono uppercase tracking-[0.14em]">{tFooter('license')}</span>
                <span aria-hidden>·</span>
                <a
                  href={GITHUB_REPOSITORY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="touch-hit-expand inline-flex items-center gap-1.5 transition-colors hover:text-[color:var(--color-text-tertiary)]"
                >
                  <ExternalLink size={12} aria-hidden />
                  {t('sourceCta')}
                </a>
                <span aria-hidden>·</span>
                <span className="font-mono">{tFooter('stack')}</span>
              </div>
            </footer>
          </div>
        </div>
      </main>
    </div>
  );
}

const numeralClass =
  'font-mono text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]';

// ─── Band 1 — the decision ──────────────────────────────────────────────────

/**
 * 한 화면에 채워진 인디고 버튼은 하나다. 게시 전에는 그 하나가 다운로드일 수
 * 없다 — 오늘 릴리스 페이지에는 받을 것이 없고, 빈 페이지로 보내는 버튼이
 * 페이지에서 가장 밝은 것이면 그건 위계가 아니라 낚시다.
 */
function MacosDecision({
  published,
  primaryAsset,
}: {
  published: boolean;
  primaryAsset: ReturnType<typeof macosAssetFor>;
}) {
  const t = useTranslations('download');

  return (
    <section
      data-testid="download-platform-macos"
      aria-labelledby="download-platform-macos-heading"
      className="mt-6 min-w-0 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
    >
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h2
          id="download-platform-macos-heading"
          className="text-title leading-title font-semibold text-[color:var(--color-text-primary)]"
        >
          {t('macosHeading')}
        </h2>
        <span className="font-mono text-caption uppercase leading-caption tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
          {t('factMinOsLabel')} {RELEASE_MIN_MACOS}
        </span>
        <span aria-hidden className="text-caption text-[color:var(--color-text-quaternary)]">
          ·
        </span>
        <span className="font-mono text-caption uppercase leading-caption tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
          {t('factFormatLabel')} DMG
        </span>
        <span className={`ml-auto text-label leading-label ${numeralClass}`}>
          {published ? t('macosPublishedBadge', { tag: MACOS_RELEASE.tag }) : `v${RELEASE_VERSION}`}
        </span>
      </div>

      {published && primaryAsset ? (
        <ArchHelp />
      ) : (
        /* 게시된 빌드가 없으면 크기도 체크섬도 다운로드 URL 도 없다. 그
           사실을 한 번 말하는 것이, 데이터처럼 생긴 자리표시자 넷을
           그리는 것보다 낫다. */
        <p
          data-testid="download-macos-pending"
          className="mt-3 break-keep text-body leading-body text-[color:var(--color-text-secondary)]"
        >
          {t('macosPendingBody', { tag: MACOS_RELEASE.tag })}
        </p>
      )}
    </section>
  );
}

/**
 * 히어로의 행동 — **페이지의 유일한 주 CTA가 사는 자리** (2026-07-28 소유자
 * 확정: 관문형 랜딩).
 *
 * 예전에는 이 두 버튼이 아래 macOS 카드 **안**에 있었다. 그래서 릴리스가
 * 0건인 지금, 「macOS」 라는 제목의 카드가 "아직 게시 전입니다" 라고 말한 뒤
 * 그 카드의 채운 인디고 버튼이 **웹으로 내보내는** 모양이 됐다 — 다운로드
 * 페이지의 최강 컨트롤이 페이지 밖을 가리키고, 카드의 제목과 카드의 행동이
 * 서로 다른 것을 말했다.
 *
 * 관문 구조에서는 히어로가 "지금 당장 할 수 있는 일" 을 쥐고, 아래 macOS
 * 카드는 **앱의 상태를 설명하는 사실 카드**로 남는다. 릴리스가 게시되면
 * 여기 승자가 그대로 DMG 다운로드로 바뀐다 — 자리는 안 움직이고 내용만
 * 바뀌므로, 게시 전/후에 페이지의 위계가 같다.
 *
 * 채운 인디고는 언제나 **하나**다 (`buttonVariants` 기본 = 채움, 나머지는
 * ghost).
 */
function HeroActions({
  published,
  primaryAsset,
}: {
  published: boolean;
  primaryAsset: ReturnType<typeof macosAssetFor>;
}) {
  const t = useTranslations('download');

  if (published && primaryAsset) {
    return (
      <div
        data-testid="download-hero-actions"
        className="mt-5 flex min-w-0 flex-wrap items-center gap-2.5"
      >
        {/* 게시된 상태에서는 이 하나가 곧 aarch64 자산이다 — 승자와
            아키텍처 선택이 같은 버튼이라 testid 도 하나다. */}
        <a
          href={primaryAsset.downloadUrl}
          data-testid="download-primary-cta"
          className={cn(buttonVariants({ size: 'lg' }), 'rounded-chip')}
        >
          <Download size={16} aria-hidden />
          {t('primaryCtaPublished', { size: formatAssetSize(primaryAsset.sizeBytes) })}
        </a>
        <IntelDownload />
      </div>
    );
  }

  return (
    <div data-testid="download-hero-actions" className="mt-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <Link
          href="/"
          data-testid="download-web-cta"
          className={cn(buttonVariants({ size: 'lg' }), 'rounded-chip')}
        >
          {t('webCta')}
        </Link>
        <MacosDownloadLink
          data-testid="download-primary-cta"
          className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'rounded-chip')}
        >
          <ExternalLink size={16} aria-hidden />
          {t('primaryCtaPending')}
        </MacosDownloadLink>
      </div>
      <p className="mt-2.5 max-w-[var(--measure-prose)] break-keep text-label leading-label text-[color:var(--color-text-quaternary)]">
        {t('webBody')}
      </p>
    </div>
  );
}

function IntelDownload() {
  const t = useTranslations('download');
  const asset = macosAssetFor('x64');
  if (!asset) return null;

  return (
    // 아웃라인, 채움 아님 — 두 개의 채워진 버튼은 승자를 없앤다. Intel 은
    // 소수지만 막히면 안 되므로 같은 자리에 두되 무게만 낮춘다.
    <a
      href={asset.downloadUrl}
      data-testid="download-macos-x64"
      className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'rounded-chip')}
    >
      <Download size={15} aria-hidden />
      {t('archIntelCta')}
      <span className={`text-label leading-label ${numeralClass}`}>
        {formatAssetSize(asset.sizeBytes)}
      </span>
    </a>
  );
}

/**
 * 대부분의 방문자는 자기 맥이 Apple Silicon 인지 Intel 인지 모른다. 구
 * 페이지는 사실 스트립에 "아키텍처 Apple Silicon + Intel" 이라고만 적어 두어
 * 그 사람을 두 버튼 앞에 세워 놓고 끝냈다 — 여기서 막히면 페이지가 실패한 것이다.
 */
function ArchHelp() {
  const t = useTranslations('download');

  return (
    <p className="mt-3 max-w-[var(--measure-prose)] break-keep border-t border-[color:var(--color-divider)] pt-3 text-label leading-label text-[color:var(--color-text-tertiary)]">
      {/* 이 문장이 막힌 사람을 푸는 유일한 문장이라, 카드에서 가장 흐린
          글자로 두지 않는다. */}
      <span className="text-[color:var(--color-text-secondary)]">{t('archHelpTitle')}</span>{' '}
      {t('archHelpBody')}
    </p>
  );
}

// ─── Band 1 (right) — evidence ──────────────────────────────────────────────

// 결정적 좌표 — 빌드타임 census 에서 1회 계산. 난수/애니메이션 0.
const MINIATURE = buildMiniatureLayout(DOGFOOD_CENSUS);

const HEX_RADIUS = 34;
const CHIP_HALF = 8;
const HUB_RADIUS = 8;

function hexPoints(cx: number, cy: number, r: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    // flat-top hexagon — v2 project 플레이트와 같은 방향.
    const angle = (Math.PI / 180) * (60 * i);
    points.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return points.join(' ');
}

/**
 * 이 페이지에서 유일하게 일반적이지 않은 물건 — 실제 데이터로 그린 지도
 * 미니어처다. project hex 1 + domain 칩 N + 허브 capability 원, contains 는
 * 실선, relates 는 점선. 라벨과 숫자는 전부 빌드 시점의 실제 마크다운에서 온다.
 *
 * 구 버전은 이 도판 아래에 숫자행 · 범위주석 · kind 범례 · 캡션까지 네 줄을
 * 쌓아 도판보다 주석이 무거웠다. 판단에 쓰이는 두 줄만 남긴다.
 */
function VaultInstrument() {
  const t = useTranslations('download.intro.instrument');
  const census = DOGFOOD_CENSUS;
  const layout = MINIATURE;

  return (
    <figure
      data-token="kind-glyph"
      // 좁은 폭에서 이 도판은 컬럼 전폭을 먹어 500px 넘게 자란다 — 결정에
      // 쓰이는 그림이 아니라 예시라, 스택될 때는 넓은 화면과 같은 크기로
      // 묶어 두고 가운데 정렬한다.
      className="mx-auto w-full min-w-0 max-w-[24rem] self-start overflow-hidden rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] lg:max-w-none"
    >
      <div className="flex h-[var(--topology-chrome-control-height)] items-center gap-2 px-4">
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-indigo-brand)]"
        />
        <span className="font-mono text-[length:var(--topology-chrome-eyebrow-size)] uppercase leading-caption tracking-[0.18em] text-[color:var(--color-text-tertiary)]">
          {t('eyebrow')}
        </span>
        <span className="ml-auto font-mono text-[length:var(--topology-chrome-eyebrow-size)] leading-caption tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
          docs/ontology
        </span>
      </div>

      <div className="border-t border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)]">
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="h-auto w-full"
          role="img"
          aria-label={t('svgLabel', {
            concepts: census.concepts,
            relations: census.relations,
          })}
        >
          {layout.domains.map((d) => (
            <line
              key={`c-${d.slug}`}
              x1={layout.project.x}
              y1={layout.project.y}
              x2={d.x}
              y2={d.y}
              stroke="var(--kind-glyph-edge-contains)"
              strokeWidth={1}
            />
          ))}
          {layout.relates.map((e, i) => (
            <line
              key={`r-${i}`}
              x1={e.x1}
              y1={e.y1}
              x2={e.x2}
              y2={e.y2}
              stroke="var(--kind-glyph-edge-relates)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          ))}
          {layout.hub ? (
            <line
              x1={layout.hub.anchor.x}
              y1={layout.hub.anchor.y}
              x2={layout.hub.x}
              y2={layout.hub.y}
              stroke="var(--kind-glyph-edge-contains)"
              strokeWidth={1}
            />
          ) : null}

          {layout.domains.map((d) => {
            const dx = d.x - layout.project.x;
            const dy = d.y - layout.project.y;
            const length = Math.hypot(dx, dy) || 1;
            const ux = dx / length;
            const uy = dy / length;
            const isHubAnchor =
              layout.hub !== null && layout.hub.anchor.x === d.x && layout.hub.anchor.y === d.y;
            const labelX = isHubAnchor
              ? d.x + (ux >= 0 ? 1 : -1) * (CHIP_HALF + 6)
              : d.x + ux * (CHIP_HALF + 8);
            const labelY = isHubAnchor ? d.y + 3 : d.y + uy * (CHIP_HALF + 10) + 3;
            const anchor = isHubAnchor
              ? ux >= 0
                ? 'start'
                : 'end'
              : Math.abs(ux) < 0.3
                ? 'middle'
                : ux > 0
                  ? 'start'
                  : 'end';
            return (
              <g key={d.slug}>
                <rect
                  x={d.x - CHIP_HALF}
                  y={d.y - CHIP_HALF}
                  width={CHIP_HALF * 2}
                  height={CHIP_HALF * 2}
                  rx={2}
                  fill="var(--kind-glyph-fill-domain)"
                  stroke="var(--kind-glyph-stroke-domain)"
                  strokeWidth={1}
                />
                <line
                  x1={d.x}
                  y1={d.y - CHIP_HALF - 3}
                  x2={d.x}
                  y2={d.y - CHIP_HALF}
                  stroke="var(--kind-glyph-stroke-domain)"
                  strokeWidth={1}
                />
                <text
                  x={labelX}
                  y={labelY}
                  textAnchor={anchor}
                  fill="var(--color-text-quaternary)"
                  fontSize={8}
                  fontFamily="var(--font-mono, ui-monospace, monospace)"
                >
                  {d.slug}
                </text>
              </g>
            );
          })}

          {layout.hub ? (
            <g>
              <circle
                cx={layout.hub.x}
                cy={layout.hub.y}
                r={HUB_RADIUS}
                fill="var(--kind-glyph-fill-capability)"
                stroke="var(--kind-glyph-stroke-capability)"
                strokeWidth={1}
              />
              <text
                x={layout.hub.x}
                y={layout.hub.y - HUB_RADIUS - 5}
                textAnchor="middle"
                fill="var(--color-text-quaternary)"
                fontSize={8}
                fontFamily="var(--font-mono, ui-monospace, monospace)"
              >
                {layout.hub.slug}
              </text>
            </g>
          ) : null}

          <polygon
            points={hexPoints(layout.project.x, layout.project.y, HEX_RADIUS)}
            fill="var(--kind-glyph-fill-project)"
            stroke="var(--kind-glyph-stroke-project)"
            strokeWidth={1}
          />
          <text
            x={layout.project.x}
            y={layout.project.y + 2.5}
            textAnchor="middle"
            fill="var(--color-text-tertiary)"
            fontSize={7.5}
            fontFamily="var(--font-mono, ui-monospace, monospace)"
          >
            ontology-atlas
          </text>
        </svg>
      </div>

      <div
        data-token="engraved-numeral"
        className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-[color:var(--color-border-soft)] px-4 py-2.5 font-mono text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
      >
        <span className="text-body leading-body tracking-[0.06em]">
          {census.concepts}{' '}
          <span className="text-caption uppercase leading-caption tracking-[0.18em]">
            {t('conceptsUnit')}
          </span>
        </span>
        <span aria-hidden className="text-caption">
          ·
        </span>
        <span className="text-body leading-body tracking-[0.06em]">
          {census.relations}{' '}
          <span className="text-caption uppercase leading-caption tracking-[0.18em]">
            {t('relationsUnit')}
          </span>
        </span>
      </div>

      {/* [download-honesty] 이 카드의 숫자는 이 저장소 docs/ontology 의
          frontmatter 노드 합이다. 앱에서 자기 폴더를 열면 다른 정의(런타임
          파생 그래프)로 다른 숫자가 나온다 — 문맥 라벨 없이는 같은 사용자가
          두 숫자를 3배 차이로 보고 신뢰를 잃는다. */}
      <figcaption className="break-keep border-t border-[color:var(--color-border-soft)] px-4 py-2.5 text-caption leading-caption text-[color:var(--color-text-quaternary)]">
        {t('caption')} {t('scopeNote')}
      </figcaption>
    </figure>
  );
}

// ─── Band 2 — trust ─────────────────────────────────────────────────────────

/**
 * 신뢰는 자랑이 아니라 사실로 번다. 네 가지 사실만 있고, 각각 확인 방법이
 * 같이 붙는다 — 서명(codesign), 공증(stapler), 체크섬(직접 대조), 그리고
 * 이 제품이 파는 것의 핵심인 "아무것도 보내지 않는다".
 */
function TrustPanel({ published }: { published: boolean }) {
  const t = useTranslations('download');

  return (
    <section
      data-testid="download-trust"
      aria-labelledby="download-trust-heading"
      className="mt-[var(--section-gap)] min-w-0 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
    >
      <div className="flex items-center gap-2 pb-2.5">
        <ShieldCheck size={15} aria-hidden className="text-[color:var(--color-indigo-accent)]" />
        <h2
          id="download-trust-heading"
          className="text-title leading-title font-semibold text-[color:var(--color-text-primary)]"
        >
          {t('trustHeading')}
        </h2>
      </div>

      <TrustFact label={t('proofSigned')} note={t('trustSignedNote')} />
      <TrustFact label={t('proofNotarized')} note={t('trustNotarizedNote')} body={t('trustFirstLaunch')} />

      <TrustFact label={t('proofChecksum')} body={t('trustVerifyNote')}>
        {published ? (
          <div className="mt-2 grid gap-1.5">
            {ARCH_ORDER.map((arch) => (
              <ChecksumRow key={arch} arch={arch} />
            ))}
          </div>
        ) : null}
        {/* 명령은 자기 길이만큼만 상자를 갖는다 — 50자 명령에 900px 보더를
            두르면 잉크가 데이터보다 무거워진다(data-ink). */}
        <p className="mt-2 max-w-full overflow-x-auto whitespace-nowrap rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 py-2 font-mono text-label leading-label text-[color:var(--color-text-tertiary)] md:w-fit">
          {t('trustVerifyCommand', { file: buildDmgName('aarch64') })}
        </p>
      </TrustFact>

      <TrustFact label={t('proofPrivacy')} body={t('trustPrivacyNote')} last />

      <p className="mt-3 break-keep border-t border-[color:var(--color-divider)] pt-3 text-label leading-label text-[color:var(--color-text-quaternary)]">
        {published
          ? t('trustPolicyPublished', { tag: MACOS_RELEASE.tag })
          : t('trustPolicyPending', { tag: MACOS_RELEASE.tag })}
      </p>
    </section>
  );
}

/**
 * 카드가 아니라 행이다. 반복 세트를 나란히 놓으면 글자 수가 높이를 정해
 * 격자가 삐뚤어지지만(치수 규칙성), 세로로 쌓인 행은 서로 비교되지 않으므로
 * 그 대가를 치를 필요가 없고 잉크도 더 적다.
 */
function TrustFact({
  label,
  note,
  body,
  children,
  last = false,
}: {
  label: string;
  note?: string;
  body?: string;
  children?: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        'border-t border-[color:var(--color-divider)] py-2.5',
        last && 'border-b-0 pb-0.5',
      )}
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <Check
          size={13}
          aria-hidden
          className="shrink-0 translate-y-0.5 text-[color:var(--color-indigo-accent)]"
        />
        <span className="min-w-0 text-body leading-body text-[color:var(--color-text-primary)]">
          {label}
        </span>
        {/* 증거는 라벨 바로 옆에 붙는다. 960 컬럼에서 오른쪽 끝으로 밀면
            라벨과 그 증거 사이가 600px 떨어져 짝으로 읽히지 않는다. */}
        {note ? (
          <span className="whitespace-nowrap font-mono text-caption leading-caption text-[color:var(--color-text-quaternary)]">
            {note}
          </span>
        ) : null}
      </div>
      {body ? (
        <p className="mt-1 max-w-[var(--measure-prose)] break-keep pl-6 text-label leading-label text-[color:var(--color-text-tertiary)]">
          {body}
        </p>
      ) : null}
      {children ? <div className="pl-6">{children}</div> : null}
    </div>
  );
}

function ChecksumRow({ arch }: { arch: DesktopArch }) {
  const t = useTranslations('download');
  const { state: copyState, copy } = useCopyFeedback(1500);
  const asset = macosAssetFor(arch);
  if (!asset) return null;

  const copyLabel =
    copyState === 'copied'
      ? t('checksumCopied')
      : copyState === 'failed'
        ? t('checksumCopyFailed')
        : t('checksumCopy');

  return (
    <div
      data-testid={`download-checksum-${arch}`}
      className="flex min-w-0 items-center gap-2 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-2.5 py-1.5"
    >
      <span className="shrink-0 font-mono text-caption leading-caption text-[color:var(--color-text-quaternary)]">
        {asset.fileName}
      </span>
      <span className={`min-w-0 flex-1 truncate text-right text-label leading-label ${numeralClass}`}>
        {asset.sha256}
      </span>
      <button
        type="button"
        onClick={() => void copy(asset.sha256)}
        aria-label={copyLabel}
        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-chip border border-[color:var(--color-border-soft)] px-2 font-mono text-caption leading-caption text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
      >
        {copyState === 'copied' ? (
          <Check size={12} aria-hidden />
        ) : (
          <Clipboard size={12} aria-hidden />
        )}
        {t('checksumCopy')}
      </button>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {copyState === 'copied'
          ? t('checksumCopied')
          : copyState === 'failed'
            ? t('checksumCopyFailed')
            : ''}
      </span>
    </div>
  );
}

// ─── Band 3 — what using it looks like ──────────────────────────────────────

function InstallPanel() {
  const t = useTranslations('download');

  return (
    <section
      aria-labelledby="download-install-heading"
      className="min-w-0 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
    >
      <h2
        id="download-install-heading"
        className="pb-1 text-title leading-title font-semibold text-[color:var(--color-text-primary)]"
      >
        {t('installTitle')}
      </h2>
      <ol>
        <InstallStep index="01" title={t('step1Title')} body={t('step1Body')} />
        <InstallStep index="02" title={t('step2Title')} body={t('step2Body')} />
        <InstallStep
          index="03"
          title={t('step3Title')}
          body={t('step3Body', { tools: MCP_TOOL_COUNT, commands: CLI_COMMAND_COUNT })}
        />
      </ol>
      {/* #726 — 설치한 사람에게 이 페이지는 마지막 방문이어야 한다. */}
      <p className="mt-3 break-keep border-t border-[color:var(--color-divider)] pt-3 text-label leading-label text-[color:var(--color-text-quaternary)]">
        {t('updateNote')}
      </p>
    </section>
  );
}

function InstallStep({ index, title, body }: { index: string; title: string; body: string }) {
  return (
    <li className="flex min-w-0 gap-3 border-t border-[color:var(--color-divider)] py-2.5">
      <span className={`shrink-0 text-label leading-body tracking-[0.1em] ${numeralClass}`}>
        {index}
      </span>
      <div className="min-w-0">
        <h3 className="text-body leading-body font-semibold text-[color:var(--color-text-primary)]">
          {title}
        </h3>
        {/* 두 줄 자리를 예약한다 — 실측(ko, 1512): 01 은 한 줄이고 02·03 은
            두 줄이라 같은 세트 안에서 행 높이가 59 / 75 / 75 로 갈렸다.
            반복 세트의 치수는 설계 결정이지 글자 수의 부산물이 아니다. */}
        <p className="mt-0.5 min-h-[calc(var(--leading-label)*2)] max-w-[var(--measure-prose)] break-keep text-label leading-label text-[color:var(--color-text-tertiary)]">
          {body}
        </p>
      </div>
    </li>
  );
}

// ─── Band 4 — elsewhere ─────────────────────────────────────────────────────

/**
 * Windows 방문자는 침묵당하지 않는다. 다만 macOS 와 같은 크기의 카드를 주면
 * "두 플랫폼이 대등하게 있다" 로 읽히므로, 한 행으로 낮춘다.
 */
function ElsewherePanel({ published }: { published: boolean }) {
  const t = useTranslations('download');

  return (
    <section className="mt-[var(--section-gap)] min-w-0 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]">
      <div
        data-testid="download-platform-windows"
        className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1.5"
      >
        <h2 className="text-body leading-body font-semibold text-[color:var(--color-text-primary)]">
          {t('windowsHeading')}
        </h2>
        <span className="rounded-chip border border-[color:var(--color-border-soft)] px-2 py-0.5 font-mono text-caption uppercase leading-caption tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
          {t('windowsPendingBadge')}
        </span>
        <p className="min-w-0 flex-1 break-keep text-label leading-label text-[color:var(--color-text-tertiary)]">
          {t('windowsPendingBody')}
        </p>
        <a
          href={WINDOWS_STATUS.trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="touch-hit-expand inline-flex h-7 shrink-0 items-center gap-1.5 rounded-chip border border-[color:var(--color-border-soft)] px-2.5 text-label leading-label text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
        >
          <ExternalLink size={12} aria-hidden />
          {t('windowsTrackCta')}
        </a>
      </div>

      {/* 게시 전에는 이 두 줄이 없다 — 웹 CTA 는 이미 위에서 승자이고,
          존재하지 않는 릴리스의 노트를 가리키는 링크는 만들지 않는다. */}
      {published ? (
        <div className="mt-2.5 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1.5 border-t border-[color:var(--color-divider)] pt-2.5">
          <h2 className="text-body leading-body font-semibold text-[color:var(--color-text-primary)]">
            {t('webHeading')}
          </h2>
          <p className="min-w-0 flex-1 break-keep text-label leading-label text-[color:var(--color-text-tertiary)]">
            {t('webBody')}
          </p>
          <a
            href={MACOS_RELEASE.releaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="download-release-notes-link"
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-chip border border-[color:var(--color-border-soft)] px-2.5 text-label leading-label text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
          >
            <ExternalLink size={12} aria-hidden />
            {t('releaseNotesLink')}
          </a>
          <Link
            href="/"
            data-testid="download-web-cta"
            className="inline-flex h-7 shrink-0 items-center rounded-chip border border-[color:var(--color-indigo-a50)] px-2.5 text-label leading-label text-[color:var(--color-indigo-accent)] transition-colors hover:bg-[color:var(--color-overlay-2)]"
          >
            {t('webCta')}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
