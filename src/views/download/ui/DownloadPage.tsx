'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Clipboard,
  Download,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { useFormatter, useTranslations } from 'next-intl';
import { resolveDisplayReleaseTag } from '../lib/pending-release-tag';
import { Link, usePathname } from '@/i18n/navigation';
import { shouldHideBottomTabBar } from '@/widgets/bottom-tab-bar';
import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/gateway-frame';
import { GatewayNav, GatewayReadingLinks } from '@/widgets/gateway-chrome';
import { DemoStage } from './DemoStage';
import { useCopyFeedback } from '@/shared/lib/use-copy-feedback';
import { GithubMark, buttonVariants } from '@/shared/ui';
import { MacosDownloadLink } from '@/features/macos-download-link';
import { RELEASE_MIN_MACOS, RELEASE_VERSION, buildDmgName } from '../lib/release-facts';
import {
  ARCH_ORDER,
  MACOS_RELEASE,
  WINDOWS_STATUS,
  formatAssetSize,
  isMacosReleasePublished,
  macosAssetFor,
  macosPublishedDate,
  windowsAsset,
  type DesktopArch,
} from '../lib/release-state';
import { StageMap, useStageGraph } from './StageMap';
import { GatewayFx } from './GatewayFx';
import { HeroObject } from './HeroObject';
import { AcpChatScene } from './AcpChatScene';
import { useInViewOnce } from '../lib/use-in-view-once';
import { useVisitorDesktopPlatform } from '../lib/visitor-platform';
import type { StageGraph } from '../lib/stage-graph';
import { buildEvidenceRailModel } from '../lib/evidence-rail';
import { controlClass } from '@/shared/ui/control-class';

const GITHUB_REPOSITORY_URL = 'https://github.com/wlsdks/ontology-atlas';

/**
 * **이 페이지의 그리드는 한 벌이다** (2026-07-29 카운슬 평결 ③ — 리메이크에도
 * 그대로 산다).
 *
 * 정렬 원점 하나에서 시작해 `--page-max` 에서 멈춘다. 원소는 일곱이고 x 는
 * 하나다: GNB · 헤드라인 · 지도 절 · 캡션 · 설치 띠 · 판 · 푸터.
 *
 * ```
 * 원점 = max(--gateway-gutter, (뷰포트 − --page-max) / 2)   ← --gateway-origin
 * ```
 *
 * 소유자 지적(*"좌우가 같아야함"*)의 전말과 `mx-auto` 기각 사유는
 * `shared/lib/gateway-frame.ts` 와 `app/globals.css` 의 원점 독블록에 있다.
 * 이 파일이 하는 일은 하나다 — 모든 절의 내용을 `PAGE_GUTTER` + `PAGE_COLUMN`
 * 안에 앉히는 것. 게이트: `tests/e2e/download-gateway-grid.spec.ts` (원점을
 * 라이브로 읽고, 좌우 여백 동일 · 리사이즈 추종 · 설치 3단 접힘 금지를 잰다).
 *
 * [은퇴 2026-08-18] 구 카메라 예약폭(`--topology-v2-safe-inset-left` 파생)은
 * 지도가 판 뒤 배경이던 시절의 산수다. 지도가 자기 절(증거)로 내려가면서 판과
 * 지도는 구조적으로 겹칠 수 없게 됐고, 파생(`computeGatewaySafeInset`)과 그
 * 소비처는 삭제됐다 — 같은 게이트가 이제 rect 로 비겹침을 잰다.
 */

/**
 * 다운로드 판의 콘텐츠 폭 상한 — 값의 진실원은 `--gateway-plate-width`
 * (`app/globals.css` `:root`, 880). 판이 컬럼 전폭(1600)으로 늘어나면 행이
 * 데이터보다 넓어져 SHA·크기·버튼이 서로에게서 너무 멀어진다.
 */
const STAGE_COLUMN = 'w-full max-w-[calc(var(--gateway-plate-width)*1px)]';

/** 절 사이 리듬 — 값의 진실원은 `--gateway-section-gap`(160px). */
const SECTION_GAP = 'mt-[var(--gateway-section-gap)]';

/**
 * `/download` — **살아있는 화면** (2026-08-18 소유자 승인 리메이크,
 * `docs/DECISIONS.md`).
 *
 * ## 이 화면의 일
 *
 * > 처음 온 사람이 30초 안에 「에이전트가 코드를 쓰는 동안 쌓이는 인지 부채」
 * > 라는 문제를 자기 문제로 알아보고, 제품이 **움직이는 것**을 본 다음,
 * > 헤매지 않고 자기 기기의 파일을 받는다.
 *
 * ## 다섯 절, 절마다 생각 하나 (소유자 확정 골격)
 *
 * ① 히어로 — 활자(기념비 헤드라인, 소유자의 문장 그대로) + 히어로 오브젝트
 *    (실그래프 심도 투영) + 채운 CTA 하나. 지도는 첫 화면에서 **뺐다**(소유자
 *    콜) — 증거 절에서 자기 자리로 돌아온다.
 * ② 시연 — 뷰포트에 들어오면 스스로 재생. 지금 붙은 클립이 잠정본이라는 것을
 *    화면이 정직하게 말한다.
 * ③ 증거 — 실제 지도 엔진이 눈앞에서 1회 조립되고, census 캡션이 조립이 끝난
 *    뒤 도착한다(숫자는 조립의 결과라서). 캡션은 지도와 같은 절에 산다.
 * ④ 에이전트 — 앱 안 대화(ACP) 실측 왕복 1사이클 재연 + 정지 카드 3장
 *    (2026-08-18 재작업 — 구 `mcp-verify` 터미널은 소유자 기각).
 * ⑤ 설치·다운로드 — **완전한 정지.** 네 절이 움직인 끝의 정지가 곧 「이제
 *    결정하라」는 위계 장치다. 사실(SHA·크기·버전)은 어디서도 움직이지 않는다.
 *    설치 3단이 컬럼 전폭 가로 한 줄, 그 아래 왼쪽 판 + 오른쪽 검증 레일이
 *    같은 오른끝에서 멈춘다(2026-08-18 — 오른쪽 절반이 비어 있던 것의 처방).
 *
 * 모션의 규율은 「정보 모션만」이다 (소유자: *"다운로드 페이지는 모션이
 * 중요함.. 보여지는게 최선인 만큼"*) — 첫 3초 안무(150/220 헤드라인 → 700
 * 리드 → 800 CTA → 950 사실층), 이후 전경 영구 정지. 효과층(전류장·그레인·
 * 커서 링)은 `--gateway-fx-*` 봉인 예외다(`GatewayFx` 독블록).
 */
export function DownloadPage() {
  const pathname = usePathname() ?? '/';
  const tFooter = useTranslations('footer');
  const published = isMacosReleasePublished();
  // Apple Silicon 이 기본 제안 — 2020년 말 이후 팔린 맥은 거의 전부 그쪽이다.
  const primaryAsset = published ? macosAssetFor('aarch64') : null;
  /**
   * 하단 탭바가 서는 화면인가 — 이 뷰는 두 주소에 살고 둘이 다르다.
   * `/download` 는 탭바를 숨기고 `/` 는 세운다. 판정은 탭바 자신과 같은 함수로
   * 한다(각자 라우트를 나열하면 한쪽이 드리프트한다 — 2026-08-06 실측 17px).
   */
  const bottomTabBarPresent = !shouldHideBottomTabBar(pathname, false);
  /**
   * 한 훅이 히어로 오브젝트 · 증거 절 지도 · census 캡션을 전부 먹인다 —
   * 화면이 주장하는 숫자와 그리는 그래프가 같은 객체라는 정직성 계약이
   * 이 한 줄이다(`DownloadPage.test.tsx` 가 잠근다).
   */
  const graph = useStageGraph();

  return (
    <div className="gateway-fx-stage relative flex min-h-full w-full flex-col">
      <GatewayFx />
      <GatewayNav />

      <main id="main" tabIndex={-1} className="relative z-[1] flex min-w-0 flex-1 flex-col">
        <HeroSection published={published} primaryAsset={primaryAsset} graph={graph} />
        <DemoSection />
        <EvidenceSection graph={graph} />
        <AgentSection />
        <InstallSection published={published} primaryAsset={primaryAsset} />

        {/*
         * **바닥 띠** — 콜로폰. 읽을거리 링크와 라이선스만 산다 (검증 목록은
         * 2026-08-18 설치 절의 검증 레일로 올라갔다 — `VerifyRail` 독블록).
         * 탭바 예약고 관용구는 리메이크 전과 동일하다(`/` 에만 탭바가 선다).
         */}
        <div
          data-testid="download-bottom-band"
          data-gateway-bottom-reserve-token={
            bottomTabBarPresent ? '--topology-mobile-bottom-tab-reserve' : undefined
          }
          data-gateway-bottom-reserve-active={bottomTabBarPresent ? 'true' : undefined}
          className={cn(
            PAGE_GUTTER,
            'mt-24 shrink-0 pb-[max(var(--page-bottom-breath),env(safe-area-inset-bottom))]',
            bottomTabBarPresent &&
              'max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))]',
          )}
        >
          <div className={PAGE_COLUMN}>
            <footer className="border-t border-[color:var(--color-divider)] pt-5 text-label leading-label text-[color:var(--color-text-quaternary)]">
              <GatewayReadingLinks />
              <ReleasePolicyNotes published={published} />
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="font-mono uppercase tracking-[var(--tracking-caps-14)]">
                  {tFooter('license')}
                </span>
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

// ─── 절 공통 부품 ────────────────────────────────────────────────────────────

/**
 * 절 머리 — 아이브로우(mono caps + 악센트 점) · 제목 · 부제.
 *
 * 제목은 `--text-display`(23px) — 카드 제목(16px)보다 작던 구 절 제목(14px)의
 * 위계 역전을 바로잡는 자리다(리메이크 결정). 아이브로우 라벨(Demo · Evidence
 * · Agents · Install)은 두 로케일이 공유하는 mono 표기라 번역하지 않는다.
 *
 * `still` 이면 등장 안무 없이 그린다 — 설치 절의 정지가 그 소비처다.
 */
function SectionIntro({
  eyebrow,
  title,
  sub,
  inView,
  still = false,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  inView?: boolean;
  still?: boolean;
}) {
  const rise = (step?: string) =>
    still ? undefined : cn('gateway-rise', step, inView && 'is-in');

  return (
    <>
      <p
        className={cn(
          rise(),
          'flex items-center gap-2 font-mono text-label uppercase leading-label tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]',
        )}
      >
        {/* 정적 점 — 신호는 상태다. 여기 상태가 없으므로 깜빡이지 않는다. */}
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-indigo-brand)]" />
        {eyebrow}
      </p>
      <h2
        className={cn(
          rise('gateway-rise-d2'),
          'mt-4 break-keep text-display font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]',
        )}
      >
        {title}
      </h2>
      {sub ? (
        <p
          className={cn(
            rise('gateway-rise-d3'),
            'mt-3 max-w-[40rem] break-keep text-body-lg leading-body-lg text-[color:var(--color-text-tertiary)]',
          )}
        >
          {sub}
        </p>
      ) : null}
    </>
  );
}

// ─── ① 히어로 — 활자 + 오브젝트 + 채운 CTA 하나 ─────────────────────────────

/**
 * 첫 3초 시간축 (소유자 확정): 0–150ms 배경이 정지 상태로 칠해지고 →
 * 150/220ms 헤드라인 두 줄이 자기 줄 상자에서 올라오고 → 700ms 아이브로우와
 * 리드 → 800ms CTA → 950ms 신뢰줄 + 계기 스트립. 이후 전경은 영구 정지.
 * 지연은 전부 CSS(`gateway-t***`)에 있고 JS 는 마운트 다음 프레임에 `is-in`
 * 클래스 하나만 단다.
 *
 * ## 헤드라인 — 소유자의 문장 그대로 (한 글자도 다듬지 않는다)
 *
 * 「에이전트는 코드를 작성하고 / 사람의 인지 부채는 쌓여갑니다」. 크기는
 * `--text-monument`(clamp 40px–96px) — 지도가 첫 화면에서 빠지면서 활자가
 * 그 무게를 이어받는다(램프 등재는 `app/globals.css` · `cn.ts`).
 *
 * ## 배치 — 기념비 단 + 분할 밴드 (승인 목업 `b-hero.html` 의 2026-08-18 2차 개정)
 *
 * 목업의 「헤드라인 왼쪽 / 오브젝트 오른쪽」 분할을 헤드라인까지 컬럼에 넣어
 * 구현했더니 실측이 기념비를 부쉈다: 1728 에서 텍스트 컬럼 800px 에 ko 줄 예산
 * 916/1009px — 두 문장이 넉 줄로 갈라졌다(`작성하고` · `쌓여갑니다` 가 홀로
 * 남는 랙 라인). 기념비는 **문장 = 줄** 일 때만 기념비다. 그래서 헤드라인은
 * 컬럼 전폭을 단(measure)으로 쓰고(`@container` 래퍼가 단을 선언, 크기는
 * `--text-monument` 4.8cqw 가 단에서 따진다), 분할은 그 아래 밴드부터다:
 * 리드·CTA·신뢰줄이 왼쪽, 히어로 오브젝트(실그래프 심도 투영)가 오른쪽 기둥.
 * `<lg` 에서는 오브젝트가 활자 아래 받침으로 내려간다.
 */
function HeroSection({
  published,
  primaryAsset,
  graph,
}: {
  published: boolean;
  primaryAsset: ReturnType<typeof macosAssetFor>;
  graph: StageGraph;
}) {
  const t = useTranslations('download');
  const [heroIn, setHeroIn] = useState(false);
  useEffect(() => {
    // rAF 콜백이라 effect 본문의 동기 setState 가 아니다 — 첫 페인트(배경 정지)
    // 가 지나간 다음 프레임에 안무가 시작된다.
    const id = requestAnimationFrame(() => setHeroIn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  /**
   * 히어로 CTA 의 네 목적지 (2026-08-18 소유자: *"윈도우 다운로드 하기 버튼이랑
   * 웹 플레이그라운드 보기 버튼이 없음.. 데모 먼저 보기도 버튼인지도 모르겠고"*):
   * ① 내 플랫폼용 받기(채움 — 유일한 주목 승자) ② 데모 먼저 보기(outline lg)
   * ③ 나머지 데스크톱 파일 전부(outline md 한 단 아래) ④ 브라우저에서 열기
   * (outline md). 감지는 클라이언트 한 곳(`useVisitorDesktopPlatform`)이고
   * 실패 시 macOS 기본 — 어느 분기에서도 네 목적지 전부에 손이 닿는다.
   *
   * Windows 가 승자가 될 때 미서명 사실은 **누르기 전에** 신뢰줄 자리에서
   * 말한다(`trustLineWindows`) — macOS 방문자가 같은 자리에서 서명·공증을
   * 읽는 것과 정확히 같은 문법이다. 강등 버전(둘째 줄의 Windows 버튼)은
   * 라벨 옆 `미서명` 표식이 같은 일을 한다. 자세한 경고 전문·체크섬은 설치
   * 절(`PlatformStatus`)이 계속 진다 — 히어로는 요약, 판은 증명.
   */
  const visitorPlatform = useVisitorDesktopPlatform();
  const windowsInstaller = windowsAsset();
  const heroWindowsPrimary = visitorPlatform === 'windows' && windowsInstaller !== null;

  const releaseTag = published
    ? MACOS_RELEASE.tag
    : resolveDisplayReleaseTag({
        published: false,
        publishedTag: MACOS_RELEASE.tag,
        releaseVersion: RELEASE_VERSION,
      });
  const rise = (extra: string) => cn('gateway-rise', extra, heroIn && 'is-in');

  return (
    <section data-testid="gateway-hero" className={cn(PAGE_GUTTER, 'w-full')}>
      {/* 기념비 단 — 헤드라인은 컬럼 전폭을 단으로 쓴다. `@container` 가 이
          단을 선언하고 `--text-monument`(4.8cqw)가 그 폭에서 크기를 따져, 두
          문장이 분할 히어로의 모든 폭에서 각각 한 줄에 선다(예산 산식은 토큰
          독블록). */}
      <div className={cn(PAGE_COLUMN, '@container min-w-0 pt-12 md:pt-16')}>
        <p
          className={cn(
            rise('gateway-t700'),
            'flex flex-wrap items-center gap-2 font-mono text-label uppercase leading-label tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]',
          )}
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-indigo-brand)]" />
          <span>{releaseTag}</span>
          <span aria-hidden>·</span>
          <span>{t('eyebrow')}</span>
        </p>

        <h1
          className={cn(
            'mt-6 break-keep text-monument font-[var(--font-weight-signature)] tracking-[var(--tracking-monument)] text-[color:var(--color-text-primary)]',
            heroIn && 'gateway-hero-in',
          )}
        >
          {/* 첫 줄은 한 단 낮은 잉크 — 두 번째 줄(사람의 부채)이 문장의
              주인공이라는 위계를 밝기로 만든다. */}
          <span className="gateway-hero-line">
            <span className="text-[color:var(--color-text-secondary)]">
              {t('heroTitleLine1')}
            </span>
          </span>
          <span className="gateway-hero-line">
            <span>{t('heroTitleLine2')}</span>
          </span>
        </h1>
      </div>

      {/* 분할 밴드 — 리드·CTA·신뢰줄 왼쪽, 오브젝트 오른쪽 기둥. `items-center`
          는 오브젝트의 질량 중심과 결정 블록(리드→CTA)을 같은 축에 놓는다. */}
      <div
        className={cn(
          PAGE_COLUMN,
          'grid min-w-0 items-center gap-x-12 gap-y-10 pb-6 pt-7 lg:pb-7',
          'lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]',
        )}
      >
        {/* 구 `lg:pb-14` 광학 보정은 반납했다 (2026-08-18 소유자: *"윗공백이
            너무 심한데"* — 실측 1512: 보정이 결정 블록을 28px 올려 블록 하단과
            캔버스 하단 사이 108px 의 빈 좌하단을 만들고, 상대적으로 오브젝트를
            아래로 몰아 보이게 했다). CTA 가 두 줄이 되며 블록이 캔버스 키에
            가까워졌으므로 순수 `items-center` 가 광학으로도 맞는다. */}
        <div className="min-w-0">
          <p
            className={cn(
              rise('gateway-t700'),
              'max-w-[40rem] break-keep text-title font-normal leading-title text-[color:var(--color-text-secondary)]',
            )}
          >
            {t('heroLead')}
          </p>

          <div className={cn(rise('gateway-t800'), 'mt-9 flex flex-wrap items-center gap-3')}>
            {published && primaryAsset ? (
              /* 채운 CTA — 실파일 직링크. 판(⑤)의 주 CTA 와 같은 행동이라
                 중복이 아니라 반복이다(스크롤 4절 아래의 같은 결정). 파일은
                 방문자의 플랫폼을 따른다 — Windows 방문자가 「Apple Silicon용
                 받기」만 보던 것이 이 분기가 고친 결함이다. */
              <a
                href={heroWindowsPrimary ? windowsInstaller!.downloadUrl : primaryAsset.downloadUrl}
                data-testid="gateway-hero-cta"
                className={cn(buttonVariants({ size: 'lg' }), 'rounded-chip px-6')}
              >
                <Download size={ICON_SIZE.lg} aria-hidden />
                {heroWindowsPrimary ? t('windowsDownloadCta') : t('primaryCtaPublished')}
                <AssetSize
                  bytes={heroWindowsPrimary ? windowsInstaller!.sizeBytes : primaryAsset.sizeBytes}
                  onFill
                />
              </a>
            ) : (
              /* 받을 것이 없으면 승자는 지금 되는 것 — 브라우저의 지도다. */
              <Link
                href="/topology"
                data-testid="gateway-hero-cta"
                className={cn(buttonVariants({ size: 'lg' }), 'rounded-chip px-6')}
              >
                {t('webCta')}
              </Link>
            )}
            {/* `outline` — ghost 는 면도 테두리도 없어 산문으로 읽혔다(소유자:
                *"버튼인지도 모르겠고"*). 누를 수 있는 것은 누를 수 있게
                생겨야 하고, 이 램프에서 그 최소 단위가 outline 이다. */}
            <a
              href="#demo"
              data-testid="gateway-hero-demo-link"
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'rounded-chip px-4 sm:px-6')}
            >
              {t('heroDemoCta')}
            </a>
          </div>

          {published && primaryAsset ? (
            /* 둘째 줄 — 승자가 아닌 목적지 전부, 한 단 아래(`md`, h-10 vs h-11).
               크기 표기는 주 CTA 만 갖는다(결정 재료는 승자의 것, 전 파일의
               크기·체크섬은 판이 낸다). Windows 의 「미서명」 표식만은 여기서도
               뗄 수 없다 — 서명 상태는 받기 전에 알아야 하는 사실이라서다. */
            <div
              data-testid="gateway-hero-alt-row"
              className={cn(rise('gateway-t800'), 'mt-2.5 flex flex-wrap items-center gap-2.5')}
            >
              {heroWindowsPrimary ? (
                <a
                  href={primaryAsset.downloadUrl}
                  data-testid="gateway-hero-macos-aarch64"
                  className={cn(buttonVariants({ variant: 'outline', size: 'md' }), 'touch-hit-expand rounded-chip px-4')}
                >
                  <Download size={ICON_SIZE.md} aria-hidden />
                  {t('primaryCtaPublished')}
                </a>
              ) : null}
              <HeroIntelLink />
              {!heroWindowsPrimary && windowsInstaller ? (
                <a
                  href={windowsInstaller.downloadUrl}
                  data-testid="gateway-hero-windows"
                  className={cn(buttonVariants({ variant: 'outline', size: 'md' }), 'touch-hit-expand rounded-chip px-4')}
                >
                  <Download size={ICON_SIZE.md} aria-hidden />
                  {t('windowsDownloadCta')}
                  <span className="font-mono text-label leading-label text-[color:var(--color-text-tertiary)]">
                    {t('windowsUnsignedShort')}
                  </span>
                </a>
              ) : null}
              {/* 관문의 둘째 약속 — 설치 없이 보는 길이 항상 열려 있다. 종전
                  `webCta` 는 미게시 분기에만 살아서 게시된 지금은 절대 안
                  나왔다(소유자: *"웹 플레이그라운드 보기 버튼이 없음"*).
                  라벨이 `webCta` 보다 짧은 것은 줄 예산이다 — 긴 라벨이면 이
                  줄이 ko 575px 단에서 홀로 셋째 줄로 떨어진다(실측 1512). */}
              <Link
                href="/topology"
                data-testid="gateway-hero-web-cta"
                className={cn(buttonVariants({ variant: 'outline', size: 'md' }), 'touch-hit-expand rounded-chip px-4')}
              >
                {t('heroWebCta')}
              </Link>
            </div>
          ) : null}

          <p
            className={cn(
              rise('gateway-t950'),
              'mt-5 break-keep text-body leading-body text-[color:var(--color-text-tertiary)]',
            )}
          >
            {/* 신뢰줄 자리 = 「누르기 전에 알아야 하는 사실」. 승자가 Windows 면
                Apple 서명 문장은 그 파일의 사실이 아니다 — 미서명·SmartScreen
                경고가 그 자리의 정직한 문장이다. */}
            {heroWindowsPrimary ? t('trustLineWindows') : t('trustLine')}
          </p>
        </div>

        <div className="min-w-0">
          <HeroObject graph={graph} />
        </div>
      </div>

      <FactsStrip published={published} primaryAsset={primaryAsset} heroIn={heroIn} />
    </section>
  );
}

/**
 * 히어로 둘째 줄의 Intel Mac 파일 — 감지 분기와 무관하게 항상 선다.
 * 브라우저는 맥의 칩을 판별할 수 없으므로(아키텍처 안내 주석) Apple Silicon
 * 이 기본이고 Intel 은 감지가 아니라 **상시 노출**로 손이 닿는다.
 */
function HeroIntelLink() {
  const t = useTranslations('download');
  const intel = macosAssetFor('x64');
  if (!intel) return null;

  return (
    <a
      href={intel.downloadUrl}
      data-testid="gateway-hero-macos-x64"
      className={cn(buttonVariants({ variant: 'outline', size: 'md' }), 'touch-hit-expand rounded-chip px-4')}
    >
      <Download size={ICON_SIZE.md} aria-hidden />
      {t('archIntelCta')}
    </a>
  );
}

/**
 * 음각 계기 스트립 — **등장(950ms) 후 영구 정지.** 사실은 절대 움직이지 않는다:
 * 버전·날짜·최소 OS·크기·SHA-256 전부 릴리스 생성 모듈에서 온 값이고, 미게시
 * 상태에서는 정직하게 줄어든다(없는 파일의 크기·체크섬 행은 존재하지 않는다).
 *
 * census 는 여기 없다 — 그 숫자의 캡션은 **자기가 세는 지도와 같은 절**(③)에
 * 산다(소유자 확정). 한 페이지에 같은 정의가 두 번 적히면 둘 다 각주가 된다.
 */
function FactsStrip({
  published,
  primaryAsset,
  heroIn,
}: {
  published: boolean;
  primaryAsset: ReturnType<typeof macosAssetFor>;
  heroIn: boolean;
}) {
  const t = useTranslations('download');
  const format = useFormatter();
  const publishedAt = macosPublishedDate();

  const version = published
    ? [
        MACOS_RELEASE.tag,
        publishedAt
          ? format.dateTime(publishedAt, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              timeZone: 'UTC',
            })
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : `${resolveDisplayReleaseTag({
        published: false,
        publishedTag: MACOS_RELEASE.tag,
        releaseVersion: RELEASE_VERSION,
      })} · ${t('factUnpublished')}`;

  const facts: { label: string; value: string }[] = [
    { label: 'Version', value: version },
    { label: 'Requires', value: `${RELEASE_MIN_MACOS}${t('factMinOsSuffix')}` },
  ];
  if (published && primaryAsset) {
    facts.push({ label: 'DMG', value: formatAssetSize(primaryAsset.sizeBytes) });
    facts.push({
      label: 'SHA-256',
      value: `${primaryAsset.sha256.slice(0, 8)}…${primaryAsset.sha256.slice(-8)}`,
    });
  }

  return (
    <div className={cn('gateway-rise gateway-t950', heroIn && 'is-in', 'w-full')}>
      <dl
        data-testid="gateway-facts"
        className={cn(
          PAGE_COLUMN,
          'flex flex-wrap gap-x-12 gap-y-4 border-t border-[color:var(--color-border-soft)] py-5',
        )}
      >
        {facts.map((fact) => (
          <div key={fact.label} className="min-w-0">
            <dt className="font-mono text-caption uppercase leading-caption tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
              {fact.label}
            </dt>
            <dd
              data-token="engraved-numeral"
              className="mt-1 font-mono text-body leading-body text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
            >
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ─── ② 시연 — 보이면 스스로 재생 ────────────────────────────────────────────

function DemoSection() {
  const t = useTranslations('download');
  const { ref, inView } = useInViewOnce<HTMLElement>();

  return (
    <section
      id="demo"
      ref={ref}
      data-testid="gateway-demo-section"
      className={cn(PAGE_GUTTER, SECTION_GAP, 'w-full scroll-mt-24')}
    >
      <div className={cn(PAGE_COLUMN, 'min-w-0')}>
        <SectionIntro eyebrow="Demo" title={t('demoTitle')} sub={t('demoSub')} inView={inView} />
        <div className={cn('gateway-rise gateway-rise-d3', inView && 'is-in', 'mt-9')}>
          <DemoStage />
        </div>
      </div>
    </section>
  );
}

// ─── ③ 증거 — 지도가 눈앞에서 조립되고, 끝나는 순간 숫자가 온다 ─────────────

/**
 * 지도는 첫 화면에서 빠졌지만(소유자 콜) 사라진 것이 아니다 — **증거**로서
 * 자기 절을 갖는다. 절이 뷰포트에 들어오면 실제 엔진(`StageMap` →
 * `TopologyMapV2`)의 도착 안무(E1 호밍 스프링)가 1회 발화하고, census 캡션은
 * 조립이 끝난 뒤(1400ms) 도착한다 — 숫자는 조립의 **결과**라서다.
 *
 * 캡션의 정직성 계약은 리메이크 전과 같다: 캡션이 세는 숫자와 지도가 그리는
 * 그래프가 `useStageGraph()` 한 훅에서 나온다.
 */
function EvidenceSection({ graph }: { graph: StageGraph }) {
  const t = useTranslations('download');
  const { ref, inView } = useInViewOnce<HTMLDivElement>(0.25);
  const [captionIn, setCaptionIn] = useState(false);

  useEffect(() => {
    if (!inView) return;
    const reduced =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    const id = window.setTimeout(() => setCaptionIn(true), reduced ? 0 : 1400);
    return () => window.clearTimeout(id);
  }, [inView]);

  return (
    <section
      id="evidence"
      data-testid="gateway-evidence-section"
      className={cn(PAGE_GUTTER, SECTION_GAP, 'w-full scroll-mt-24')}
    >
      <div className={cn(PAGE_COLUMN, 'min-w-0')}>
        <SectionIntro
          eyebrow="Evidence"
          title={t('evidenceTitle')}
          sub={t('evidenceSub')}
          inView={inView}
        />

        {/*
         * 지도 55 / 실데이터 45 (2026-08-18 소유자 지적 — 전폭 프레임에서
         * 그래프가 폭의 20%만 쓰고 80%가 빈 검정이었다). 절반은 그래프가
         * 정방형에 가까운 틀을 얻어 bbox 맞춤으로 채우고(카메라·티어 공개는
         * `StageMap`·`--topology-v2-overview-entry-ratio`), 나머지 절반은 같은
         * 그래프에서 파생한 실데이터(종류 census · 관계 원문 · 영향 반경)가
         * 채운다 — 이 절의 이름이 「증거」다.
         */}
        <div
          ref={ref}
          className="mt-9 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)] lg:gap-12"
        >
          <div
            data-testid="download-stage-map-frame"
            className="relative h-[24rem] min-w-0 overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] md:h-[30rem] lg:h-[34rem]"
          >
            <StageMap graph={graph} />
          </div>
          <EvidenceRail graph={graph} inView={inView} />
        </div>

        {/* [download-honesty] 이 숫자는 바로 위에 그려진 그래프 자신이다 —
            출처·범위 라벨·촉각 힌트의 계보는 리메이크 전 주석과 원장에 있다. */}
        <p
          data-testid="download-portrait-caption"
          className={cn('gateway-map-after', captionIn && 'is-in', 'pointer-events-none mt-5')}
        >
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-caption leading-caption text-[color:var(--color-text-quaternary)]">
            <span>docs/ontology</span>
            <span aria-hidden>·</span>
            <span
              data-token="engraved-numeral"
              className="text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
            >
              {t('portraitCensus', {
                concepts: graph.nodes.length,
                relations: graph.edges.length,
              })}
            </span>
            <span aria-hidden>·</span>
            <span className="min-w-0 break-keep text-[color:var(--color-text-tertiary)]">
              {t('portraitHint')}
            </span>
            <span aria-hidden>·</span>
            <span className="min-w-0 break-keep">{t('portraitScope')}</span>
          </span>
        </p>
      </div>
    </section>
  );
}

/**
 * 증거 레일 — 지도 옆 절반을 채우는 **같은 그래프의 다른 표현**. 숫자·관계·
 * 이름은 전부 `buildEvidenceRailModel` 이 왼쪽 지도와 같은 `StageGraph` 에서
 * 파생한다(장식 0 — 이 절의 이름이 증거라서다). 표기 문법은 계기 스트립과
 * 같다: 라벨은 본문 서체, 숫자는 음각 mono. 한글 라벨에 mono 를 걸지 않는
 * 이유는 `ReleaseFactLine` 의 주석과 같다 — 한글은 mono 폴백으로 서체가 섞인다.
 *
 * ## 치수 — 각주가 아니라 둘째 리드다 (2026-08-18 소유자: *"너무 작아서"*)
 *
 * 첫 판은 계기 스트립의 치수(caption 9.5 · label 11 · body-lg 14)를 그대로
 * 입었는데, 계기 스트립은 히어로의 **각주**이고 이 레일은 「증거」 절의 오른쪽
 * **절반**이다 — 같은 옷이 여기서는 위계 미달이다. 램프 안에서 전 단을 한
 * 칸씩 올린다(새 스텝 0): 절 머리 caption→label, 이름 label→body,
 * 숫자 body-lg→title, 관계 원문 body→body-lg, 영향 문장 body-lg→title.
 */
function EvidenceRail({ graph, inView }: { graph: StageGraph; inView: boolean }) {
  const t = useTranslations('download');
  const tKind = useTranslations('kinds');
  const model = useMemo(() => buildEvidenceRailModel(graph), [graph]);

  return (
    <div
      data-testid="download-evidence-rail"
      className={cn('gateway-rise gateway-rise-d3', inView && 'is-in', 'min-w-0 lg:self-center')}
    >
      <div className="border-t border-[color:var(--color-border-soft)] py-6">
        <h3 className="font-mono text-label uppercase leading-label tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
          {t('evidenceKindsHeading')}
        </h3>
        <dl className="mt-4 flex flex-wrap gap-x-12 gap-y-3">
          {model.census.map((row) => (
            <div key={row.kind} className="min-w-0">
              <dt className="break-keep text-body leading-body text-[color:var(--color-text-tertiary)]">
                {tKind(row.kind)}
              </dt>
              <dd
                data-token="engraved-numeral"
                className="mt-1 font-mono text-title leading-title text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
              >
                {row.count}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="border-t border-[color:var(--color-border-soft)] py-6">
        <h3 className="font-mono text-label uppercase leading-label tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
          {t('evidenceRelationsHeading')}
        </h3>
        <ul className="mt-4 grid gap-3">
          {model.relations.map((line) => (
            <li
              key={`${line.source}-${line.type}-${line.target}`}
              className="min-w-0 break-keep text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]"
            >
              {line.source}
              {/* 타입은 frontmatter 의 원문 그대로 — 번역하지 않는다. 타입 있는
                  사실이 이 제품의 물건이고, 원문이 곧 증거다. */}
              <span
                aria-hidden
                className="mx-1.5 font-mono text-body leading-body text-[color:var(--color-text-quaternary)]"
              >
                --{line.type}--&gt;
              </span>
              {line.target}
            </li>
          ))}
        </ul>
      </div>

      {model.impact ? (
        <div className="border-t border-[color:var(--color-border-soft)] py-6 pb-0">
          <h3 className="font-mono text-label uppercase leading-label tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
            {t('evidenceImpactHeading')}
          </h3>
          <p className="mt-4 break-keep text-title font-normal leading-title text-[color:var(--color-text-secondary)]">
            {t('evidenceImpactLine', { name: model.impact.name, count: model.impact.count })}
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ─── ④ 에이전트 — 앱 안 대화(ACP) 실측 왕복 + 정지 카드 3장 ─────────────────

/**
 * 이 절의 생각 하나 (2026-08-18 재작업, `docs/DECISIONS.md`):
 *
 * > **에이전트가 앱 안에 산다 — 채팅만으로 온톨로지를 분석하고 고친다.**
 *
 * 직전 판은 `mcp-verify` 터미널이었고 소유자가 기각했다(*"이건 뭔말인지를
 * 모르겠어"* — 개발자가 설정을 검증하는 장면이지 파는 장면이 아니다). 실물은
 * 이미 있다: `AcpChatPanel`(앱 안 대화창) · `AcpRuntimeSettings` · 볼트
 * capability 「앱 안 코딩 에이전트 실행기 (ACP)」. 장면(`AcpChatScene`)은
 * 그 실물의 실측 왕복(원장 2026-08-16 (7)) 재연이다.
 *
 * 문구의 경계는 원장 2026-08-16 (5): ① 우리가 재배포하는 것 없음(어댑터는
 * 사용자 기기에서 npx) ② 우리 실행기 목록을 설명하는 자리에 "Claude Code"
 * 금지 — 레지스트리의 허용 이름(Claude Agent)만 ③ **「이미 쓰는 에이전트를
 * 연결한다」** 위에만 선다 — 우리가 모델 접근을 제공한다는 인상 금지.
 */
function AgentSection() {
  const t = useTranslations('download');
  const { ref, inView } = useInViewOnce<HTMLElement>();

  const columns = [
    { title: t('col1Title'), body: t('col1Body'), code: t('col1Code') },
    { title: t('col2Title'), body: t('col2Body'), code: t('col2Code') },
    { title: t('col3Title'), body: t('col3Body'), code: 'git diff docs/ontology/' },
  ];

  return (
    <section
      id="agents"
      ref={ref}
      data-testid="gateway-agents-section"
      className={cn(PAGE_GUTTER, SECTION_GAP, 'w-full scroll-mt-24')}
    >
      <div className={cn(PAGE_COLUMN, 'min-w-0')}>
        <SectionIntro eyebrow="Agents" title={t('agentsTitle')} sub={t('agentsSub')} inView={inView} />

        <div className={cn('gateway-rise gateway-rise-d3', inView && 'is-in', 'mt-9 max-w-[48rem]')}>
          <AcpChatScene />
        </div>
        <p
          className={cn(
            'gateway-rise gateway-rise-d3',
            inView && 'is-in',
            'mt-5 max-w-[48rem] break-keep text-body-lg leading-body-lg text-[color:var(--color-text-tertiary)]',
          )}
        >
          {t('agentsCap')}
        </p>

        {/* 카드 3장은 정지다 — 움직이는 것은 위 왕복 하나면 충분하다. */}
        <div className="mt-14 grid min-w-0 gap-y-10 md:grid-cols-3">
          {columns.map((column, i) => (
            <div
              key={column.title}
              className={cn(
                'min-w-0 md:px-8',
                i === 0 && 'md:pl-0',
                i > 0 && 'md:border-l md:border-[color:var(--color-border-soft)]',
              )}
            >
              <h3 className="break-keep text-title font-[var(--font-weight-emphasis)] leading-title text-[color:var(--color-text-primary)]">
                {column.title}
              </h3>
              <p className="mt-2.5 break-keep text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
                {column.body}
              </p>
              <code className="mt-4 block border-l border-[color:var(--color-border-strong)] pl-3 font-mono text-body leading-body text-[color:var(--color-text-tertiary)]">
                {column.code}
              </code>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── ⑤ 설치 + 다운로드 — 완전한 정지 ────────────────────────────────────────

/**
 * 네 절이 움직인 끝의 **완전한 정지**: 등장 안무 없음, 전이 없음. 정지가
 * 「이제 결정하라」를 말하는 위계 장치다(소유자 골격 확정). 담는 것은 설치
 * 3단 · 다운로드 판(릴리스 상태 분기 전부) · 검증 레일 · 저장소 출구다.
 *
 * ## 배치 — 오른쪽 절반을 비워 두지 않는다 (2026-08-18 소유자:
 * *"우측 공백이 너무길잖아.. 아예 디자인을 다시해야함"* — 같은 병을 세 번째
 * 지적받았다)
 *
 * 직전 판은 3단과 판을 판 폭(880)으로 통일했는데, 그 결과 컬럼의 오른쪽
 * 절반이 통째로 빈 검정이 됐다. 판 폭은 게이트가 토큰으로 재는 상한이라
 * (`--gateway-plate-width`) 답은 더 넓은 판이 아니라 **다른 배치**다:
 *
 * - 설치 3단은 컬럼 **전폭** 가로 한 줄로 복귀한다(원래 자기 자리).
 * - 그 아래 [판 | 검증 레일] 두 칸 그리드가 같은 전폭을 쓴다 — 오른쪽 칸은
 *   푸터 접이식에 접혀 있던 「받아도 되는 이유」(서명·공증·체크섬·프라이버시)
 *   가 펼쳐진 채 올라온다. 결정하는 자리 바로 옆이 그 증명의 제자리다
 *   (사실은 한 글자도 안 지웠다 — 자리만 옮겼다).
 * - 모든 행의 오른끝이 컬럼 오른끝에서 멈춘다 — 「한 절 안 두 그리드」라는
 *   직전 지적은 오른끝 정렬로 답한다.
 */
function InstallSection({
  published,
  primaryAsset,
}: {
  published: boolean;
  primaryAsset: ReturnType<typeof macosAssetFor>;
}) {
  const t = useTranslations('download');

  return (
    <section
      id="download"
      data-testid="gateway-install-section"
      className={cn(PAGE_GUTTER, SECTION_GAP, 'w-full scroll-mt-24')}
    >
      <div className={cn(PAGE_COLUMN, 'min-w-0')}>
        <SectionIntro eyebrow="Install" title={t('installTitle')} still />
        <InstallTrack />
        {/*
         * 7:5 — 판(결정)이 주, 레일(증명)이 부라는 위계를 폭이 말한다.
         * 1512(컬럼 1112)에서 왼 620 · 오른 444: 판의 CTA 행(두 버튼)이 ko/en
         * 모두 한 줄에 서고, 레일의 체크섬 행은 SHA 가 truncate 라 폭에
         * 관대하다. `<lg` 는 판 → 레일 세로 쌓임.
         */}
        <div className="mt-10 grid min-w-0 items-start gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12">
          <div className={cn(STAGE_COLUMN, 'min-w-0')}>
            <DownloadPlate published={published} primaryAsset={primaryAsset} />
          </div>
          <VerifyRail published={published} primaryAsset={primaryAsset} />
        </div>
      </div>
    </section>
  );
}

/**
 * 지도 위에 뜨는 **불투명** 판. 이 페이지에서 보더를 가진 유일한 표면이다.
 *
 * 반투명(glassmorphism)은 헌장 금지이고, 여기서는 금지가 아니어도 틀렸을
 * 것이다 — 뒤에 선과 점이 지나가는 위에 반투명을 얹으면 본문 대비가 픽셀마다
 * 달라져서 어느 값으로도 WCAG 를 보장할 수 없다. 불투명 패널 + 상승 그림자로
 * 띄운다.
 *
 * 이제 담는 것은 **거래 다섯 줄**뿐이다: CTA 쌍 · 사실줄 · 신뢰 · 플랫폼 ·
 * 괘선+출구. 파는 말은 위 네 절이 이미 끝냈다 — 여기서부터는 결정만 남는다.
 * (리메이크 2026-08-18: 판은 더 이상 지도 위에 뜨지 않고 설치 절의 흐름에
 * 앉는다. 불투명 규율은 그대로 지킨다 — 뒤에 전류장이 지나가기 때문이다.)
 */
function DownloadPlate({
  published,
  primaryAsset,
}: {
  published: boolean;
  primaryAsset: ReturnType<typeof macosAssetFor>;
}) {
  return (
    <div
      data-testid="download-plate"
      // `<sm` 의 `p-4` 는 취향이 아니라 산술이다 — 320px 에서 판 실질 폭이
      // 곧 CTA 가 들어갈 자리이고, `p-6` 이면 영어 라벨이 22px 넘친다(실측).
      className="min-w-0 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-4 shadow-[var(--shadow-elevation-2)] sm:p-6 md:p-7 [@media(min-width:64rem)_and_(max-height:56.25rem)]:py-4"
    >
      {published && primaryAsset ? (
        <PublishedActions primaryAsset={primaryAsset} />
      ) : (
        <PendingActions />
      )}
      {/* 출구 줄은 **두 분기가 공유한다** — 게시 여부와 무관하게 "안 받기로 한
          사람" 은 언제나 있고, 저장소는 언제나 열려 있다. 예전엔 이 줄이
          `PublishedActions` 안에만 있어서 미게시 상태에서는 페이지 전체에
          저장소로 가는 컨트롤이 하나도 없었다(콜로폰의 11px 링크 하나 제외 —
          그리고 그 링크는 이번에 반납했다). */}
      <PlateExitRow published={published} />
    </div>
  );
}

function PublishedActions({
  primaryAsset,
}: {
  primaryAsset: NonNullable<ReturnType<typeof macosAssetFor>>;
}) {
  const t = useTranslations('download');
  const intel = macosAssetFor('x64');

  return (
    <div data-testid="download-hero-actions" className="min-w-0">
      <PlatformHeading title={t('macosPlatformTitle')} status={t('macosTrustBadge')} />
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
        {/*
         * **채운 인디고는 이 판이 아니라 히어로가 진다** (2026-08-18).
         *
         * 절 단위 서사로 펴면서 같은 행동·같은 라벨·같은 250×44 의 채워진
         * 인디고가 한 문서에 **둘**이 됐다(`gateway-hero-cta` + 여기).
         * 「주 CTA 가 둘이면 하나는 거짓말이다」에 걸린다 —
         * `screen-hierarchy.spec.ts` ②.
         *
         * 어느 쪽을 내릴지는 2026-08-08 편집 화면의 선례를 그대로 따랐다:
         * 같은 행동이 두 번 나오면 **먼저 만나는 쪽**이 채운 것을 지고 되풀이는
         * `outline` 으로 내려온다. 여기서 먼저 만나는 것은 히어로다 — 소유자가
         * 이 리메이크에 건 요구 자체가 「첫 화면의 인상」이었다.
         *
         * 이 판이 약해지지 않는 이유: 앞의 네 절이 전부 움직인 뒤 여기서 화면이
         * 정지하고, 버튼 둘레에 체크섬·크기·최소 OS·서명 상태가 다 깔린다.
         * 무엇을 결정하는 자리인지는 테두리가 아니라 그 정지와 사실들이 말한다.
         *
         * **미게시 분기(`PendingActions`)는 그대로 채운 채다** — 거기엔 히어로가
         * 질 채운 CTA 가 없어서 이 자리가 유일한 주 CTA 다(편집/만들기 선례의
         * 후반부와 같은 판정).
         */}
        <a
          href={primaryAsset.downloadUrl}
          data-testid="download-primary-cta"
          className={cn(
            buttonVariants({ variant: 'outline', size: 'lg' }),
            'rounded-chip px-4 sm:px-6',
          )}
        >
          <Download size={ICON_SIZE.lg} aria-hidden />
          {t('primaryCtaPublished')}
          <AssetSize bytes={primaryAsset.sizeBytes} />
        </a>
        {/* 채운 인디고는 화면당 하나 — Intel 은 막히면 안 되므로 같은 자리에
            두되 무게만 낮춘다. */}
        {intel ? (
          /*
           * **`outline` 이어야 버튼으로 읽힌다.** `ghost` 는 테두리도 배경도 없어
           * 아이콘 붙은 텍스트로 보였다(소유자: *"인텔용은 버튼으로도 안보임"*).
           * 채운 인디고는 여전히 화면당 하나(Apple Silicon)이고, Intel 은 테두리로만
           * 무게를 올린다 — 위계는 유지하면서 어포던스만 회복한다.
           */
          <a
            href={intel.downloadUrl}
            data-testid="download-macos-x64"
            className={cn(
              buttonVariants({ variant: 'outline', size: 'lg' }),
              /*
               * `lg` — 판 폭이 520 이 되면서 이 버튼이 주 CTA 와 **같은 줄**에 선다.
               * 같은 선택의 두 갈래이므로 높이도 같아야 한다.
               *
               * 종전에 `md`(40px)로 낮췄던 것은 1512×850 한 화면 게이트 때문이었고
               * 위계 판단이 아니었다 — **게이트가 디자인을 정하는 상태**였다. 한 행이
               * 접히며 50px 이 돌아왔으므로 그 대차를 되돌린다. 44px 터치 최소도
               * `lg` 자체로 만족되지만 `touch-hit-expand` 는 남긴다(무해하고,
               * 다음에 크기가 또 흔들려도 손가락 계약은 안 깨진다).
               */
              'touch-hit-expand rounded-chip px-4 sm:px-6',
            )}
          >
            <Download size={ICON_SIZE.md} aria-hidden />
            {t('archIntelCta')}
            <AssetSize bytes={intel.sizeBytes} />
          </a>
        ) : null}
      </div>

      <ReleaseFactLine />
      <TrustChips />
      <PlatformStatus />
    </div>
  );
}

/**
 * 버튼에 붙는 파일 크기 — **`<sm` 에서는 안 붙는다** (2026-07-29 평결 ④).
 *
 * `buttonVariants` 는 `whitespace-nowrap` 이라 라벨이 길면 버튼이 컨테이너를
 * 뚫는다. 실측(320px): 주 CTA 콘텐츠 폭 261px vs 판 실질 폭 216px → 가로
 * 오버플로. 무대가 `overflow-hidden` 이라 스크롤바도 안 생기고 **그냥 잘렸다**.
 *
 * 잘라낸 것이 크기인 이유: 320px 폰에서는 macOS DMG 를 설치할 수 없다. 크기는
 * **설치를 결정하는 사람의 사실**이고 그 사람은 데스크톱에 있다. 접이식의
 * 체크섬 행이 파일 이름을 여전히 전부 부른다.
 *
 * 두 버튼이 같은 문법을 쓰게 된 것은 덤이다 — 예전엔 주 CTA 만 `· {size}` 를
 * **번역 문자열 안에** 넣고 Intel 은 별도 스팬으로 그려서, 같은 줄의 두 버튼이
 * 같은 사실을 다른 서체·다른 구두점으로 말했다.
 *
 * ⚠️ **음각 숫자는 무채색 표면 위의 문법이다** (`--engraved-numeral-face`
 * #8c8c94 + 아래로 1px `#08080a` 하이라이트 — 어두운 패널에 눌러 새긴 효과).
 * 채운 인디고(#5e6ad2) 위에 그대로 얹으면 대비가 **1.41:1** 로 무너진다
 * (실측 2026-07-29 — 첫 시안이 정확히 이 실수를 했다). 채운 버튼 위에서는
 * 버튼 자신의 전경색을 쓴다: 같은 문장의 일부라 색이 갈릴 이유도 없다.
 */
function AssetSize({ bytes, onFill = false }: { bytes: number; onFill?: boolean }) {
  return (
    <span
      className={cn(
        'hidden font-mono text-label leading-label sm:inline',
        // 채운 버튼 위에서는 **약화도 하지 않는다**. `opacity-80` 을 얹어 봤더니
        // 합성 대비가 3.45:1 로 떨어졌다(11px 텍스트, 실측 2026-07-29) — 한 단만
        // 낮춰도 바로 밑으로 뚫린다. 크기와 라벨을 가르는 것은 이미 mono
        // 페이스와 간격이 한다.
        //
        // 잉크는 라벨과 **같은 토큰**이어야 한다. 2026-08-03 까지 이 자리는
        // `--color-text-primary` 였고 채운 인디고 위에서 4.42:1 이라 AA 미달
        // 이었다(위 주석의 «라벨 자신이 4.42:1» 이 그 값이다). 라벨이
        // `--color-text-on-accent`(4.70:1)로 올라갔으므로 크기 배지도 같이
        // 간다 — 한 버튼 안에서 잉크가 둘로 갈리면 그게 다음 회귀다.
        onFill
          ? 'text-[color:var(--color-text-on-accent)]'
          : 'text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]',
      )}
    >
      {formatAssetSize(bytes)}
    </span>
  );
}

/**
 * 판의 바닥 줄 — **받기 다음에 갈 수 있는 곳** (소유자 지시 2026-07-28:
 * *"다운로드, 웹 이동 하단에 깃허브 주소 이런 느낌으로 가자"* → 2026-07-29:
 * *"다운로드 페이지에는 예쁘게 GITHUB 페이지 이동 버튼도 있어야할듯?"*).
 *
 * ## 저장소가 각주에서 컨트롤로 (2026-07-29)
 *
 * 그전까지 저장소는 **두 곳에 각주로** 있었다: 이 줄의 11px mono 주소, 그리고
 * 페이지 콜로폰의 11px 「소스 코드 보기」. 오픈소스 제품에서 *코드를 본다* 는
 * 신뢰를 버는 행동인데, 같은 목적지가 둘로 쪼개져 양쪽 다 눌러 볼 만한 것으로
 * 읽히지 않았다. 그래서 **더하지 않고 옮겼다** — 콜로폰 링크를 반납하고, 남은
 * 하나를 이 자리에서 고스트 버튼으로 세운다.
 *
 * ## 왜 고스트가 아니라 **아웃라인** 인가 (2026-07-29 2차 보강)
 *
 * 첫 판은 `variant: 'ghost'` 로 세웠는데, ghost 는 **정의상 면이 없다** —
 * 실측하면 `border 1px solid rgba(0,0,0,0)` · `background rgba(0,0,0,0)` 이라
 * 화면에서는 그냥 텍스트 링크다. 소유자가 요청한 것은 「예쁘게 GITHUB 페이지
 * **이동 버튼**」이었고, 버튼으로 안 읽히면 그 요청은 안 들어간 것이다. 게다가
 * 바로 옆에 진짜 텍스트 링크(「브라우저에서 써보기」)가 나란히 서 있어서, 면
 * 없는 컨트롤 둘이 서로 위계를 못 만들고 있었다.
 *
 * `outline` 은 이 램프에 이미 있는 「판 위 2차 액션」의 자리다 — 면
 * (`--color-overlay-1`) + 테두리(`--color-overlay-3`) + inset 헤어라인으로
 * 눌러지는 것임을 말하되, 채운 인디고는 여전히 화면에 **하나**뿐이라 주목
 * 승자(받기)는 안 흔들린다(`design.md`: 채색은 인디고 하나). 높이는 받기
 * 버튼(h-11)보다 한 단 낮은 h-10이라 목적지가 읽히면서도 주 CTA를 넘지 않는다.
 *
 * ## 아이콘이 `↗` 가 아니라 **GitHub 마크** 인 이유
 *
 * `↗`(lucide `external-link`)는 "밖으로 나간다" 까지만 말한다. 옥토캣은
 * **"여기가 GitHub 이다"** 를 말한다 — 오픈소스 제품에서 이 컨트롤의 존재
 * 이유가 정확히 그 목적지이므로, 목적지를 못 말하는 아이콘은 이 자리에서
 * 정보를 절반만 나른다. 목적지 특정 마크는 일반 화살표보다 **강한** 클릭 전
 * 경고이기도 하다(`design.md` 의 선행 `↗` 규칙이 지키려던 것을 더 크게 지킨다).
 * 헌장 판정과 `lucide-react` 에 브랜드 아이콘이 없는 사정은
 * `@/shared/ui/github-mark` 주석이 갖는다.
 *
 * **★ 배지는 달지 않는다.** 별 수는 숫자가 클 때만 신뢰이고, 작을 때는 반대
 * 증거다. 이 판에서 신뢰를 지는 것은 서명·공증·체크섬이지 남의 카운터가 아니다.
 *
 * ## 잃은 것 — URL 문자열
 *
 * 예전 주석은 `github.com/wlsdks/ontology-atlas` 를 라벨 대신 쓰는 이유를
 * *신원* 으로 변호했고 그건 링크였을 때 맞는 말이었다. 컨트롤이 되면 사정이
 * 다르다: ① 320px 판(실질 216px)에서 URL 라벨은 버튼을 뚫는다 ② en/ko 어느
 * 쪽에서도 같은 줄에 서지 못해 로케일마다 판 높이가 갈린다 ③ 목적지 경고는
 * 선행 `↗` 가 이미 진다. 신원은 클릭 한 번 뒤 주소창이 말한다.
 */
function PlateExitRow({ published }: { published: boolean }) {
  const t = useTranslations('download');

  return (
    <div
      data-testid="download-exit-row"
      /*
       * ⚠️ **2열은 두 버튼이 설계 여백으로 들어갈 때만 선다** (2026-08-08 실측).
       *
       * 종전엔 `sm:`(640px)부터 두 칸을 `1.08fr 0.92fr` 로 갈랐는데, 640~830
       * 구간에서는 그 칸이 내용보다 좁다. 실측(768·ko): 행 폭 310px 인데 두
       * 버튼이 설계 여백(px-6=24)을 지키려면 325px 이 필요하다. 부족분 15px 은
       * **여백에서 조용히 깎였다** — GitHub 버튼의 실효 좌우 여백이 24 → 15.5 로
       * 눌리고, 그 옆 형제는 22 라서 나란히 선 두 출구의 여백이 서로 달라졌다.
       * 글자가 잘리거나 삐져나오지는 않아서 넘침 계측에는 안 잡히는 종류다.
       *
       * 그래서 문턱을 «칸이 있다» 가 아니라 «내용이 들어간다» 로 옮긴다.
       * 52rem(832px)은 실측 임계(≈825px)에 여유를 둔 값이고, 그 아래에서는
       * `<sm` 과 같은 한 줄 쌓기가 된다 — 눌러 담기보다 낫다.
       */
      /*
       * 2026-08-18: 두 칸 스트레치(1.08fr/0.92fr · h-11)를 반납했다 — 실측에서
       * 출구 두 버튼이 판에서 가장 넓은 컨트롤이 되어 주 CTA(받기)와 경쟁했다
       * (소유자: *"난잡한데?"* — 이 절의 주 행동은 받기 하나다). 출구는 셋째
       * 위계이므로 `md`(h-10, 받기보다 한 단 낮음 — 2026-07-29 원 처방으로
       * 복귀) + 내용만큼의 폭 + 왼쪽 정렬로 내려간다. 구 52rem 임계는 칸
       * 스트레치의 여백 산수였으므로 칸과 함께 은퇴한다.
       */
      className="mt-5 flex min-w-0 flex-wrap items-center gap-2.5 border-t border-[color:var(--color-divider)] pt-3.5 [@media(min-width:64rem)_and_(max-height:56.25rem)]:mt-3 [@media(min-width:64rem)_and_(max-height:56.25rem)]:pt-2.5"
    >
      <a
        href={GITHUB_REPOSITORY_URL}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="download-repo-link"
        // 좌우 패딩은 **위 두 버튼과 같은 값**이다(`px-4 sm:px-6`). 판 안의
        // 왼쪽 정렬선은 원래 둘뿐이었다 — 상자 모서리 189, 버튼 아이콘 214.
        // 기본 패딩을 그대로 쓰면 아이콘이 204 에 서서 세 번째 정렬선이 생긴다.
        // 2026-08-01 소유자 피드백으로 출구 둘을 같은 h-11 행에 올렸고, GitHub가
        // 조금 더 넓은 첫 칸을 가져 오픈소스 신뢰 경로임을 분명히 한다.
        className={cn(
          buttonVariants({ variant: 'outline', size: 'md' }),
          'touch-hit-expand min-w-0 justify-center rounded-chip px-4',
        )}
      >
        {/* 14px 인 이유(원본은 16)는 마크 쪽 주석 — 이 자리에 있던 lucide
            아이콘과 **광학적으로 같은 폭**을 차지해야 214 아이콘 열이 유지된다. */}
        <GithubMark className="shrink-0" />
        {t('sourceCta')}
      </a>
      {/* 미게시 분기에서는 「브라우저에서 써보기」가 이미 판의 **주** CTA 다
          (`PendingActions`). 같은 목적지를 한 판에 두 번 두면 그건 출구가
          아니라 중복이므로, 그때는 이 줄이 저장소 하나만 든다. */}
      {published ? (
        /*
         * **버튼 형태다.** 인디고 텍스트 링크는 산문 속 링크로 읽혀서, 판의 두 번째
         * 출구인데 출구처럼 보이지 않았다(소유자 지시). `outline` — 채운 인디고는
         * 다운로드가 갖는다.
         */
        <Link
          href="/topology"
          data-testid="download-web-cta"
          className={cn(
            buttonVariants({ variant: 'outline', size: 'md' }),
            'touch-hit-expand min-w-0 justify-center rounded-chip px-4',
          )}
        >
          {t('windowsBrowserFallback')}
        </Link>
      ) : null}
    </div>
  );
}

/**
 * 받을 것이 없을 때. 그때의 주목 승자는 다운로드일 수 없다 — 빈 릴리스
 * 페이지로 보내는 버튼이 화면에서 가장 밝으면 그건 위계가 아니라 낚시다.
 * 대신 **지금 보고 있는 지도를 열어 보는 것**이 승자가 된다. 무대 뼈대가
 * 그 전환을 자연스럽게 만든다: 배경이 이미 그 지도다.
 */
function PendingActions() {
  const t = useTranslations('download');

  return (
    <div data-testid="download-hero-actions" className="min-w-0">
      <PlatformHeading title={t('macosPlatformTitle')} status={t('macosPendingBadge')} />
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
        <Link
          href="/topology"
          data-testid="download-web-cta"
          className={cn(buttonVariants({ size: 'lg' }), 'rounded-chip px-4 sm:px-6')}
        >
          {t('webCta')}
        </Link>
        <MacosDownloadLink
          data-testid="download-primary-cta"
          className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'rounded-chip px-4 sm:px-6')}
        >
          <ExternalLink size={ICON_SIZE.lg} aria-hidden />
          {t('primaryCtaPending')}
        </MacosDownloadLink>
      </div>

      {/* ⚠️ 미게시 상태에서 `MACOS_RELEASE.tag` 는 **정의상 낡은 값**이다 —
          `--unpublished` 로 마지막에 리셋할 때 적힌 태그일 뿐 다음에 나올
          버전이 아니다. 배포된 사이트가 실제로 한 화면에 배지 `v1.0.0-rc.3`
          (package.json)과 본문 `v1.0.0-rc.2 는 아직 게시 전`(낡은 태그)을
          동시에 적고 있었다(실측 2026-07-28). 아직 안 나온 것을 부르는
          진실원은 이 저장소가 지금 만들고 있는 버전 하나다. */}
      <p
        data-testid="download-macos-pending"
        className="mt-3.5 max-w-[var(--measure-prose)] break-keep border-l-2 border-[color:var(--color-border-strong)] pl-3 text-label leading-label text-[color:var(--color-text-tertiary)]"
      >
        {/* main 이 독립적으로 같은 결함을 발견해 뽑아낸 헬퍼를 쓴다
            (`lib/pending-release-tag`) — 내 인라인 수정보다 낫다. 이름이 있고
            자기 테스트가 있어서, 다음 사람이 두 출처를 다시 만들 여지가 없다. */}
        {t('macosPendingBody', {
          tag: resolveDisplayReleaseTag({
            published: false,
            publishedTag: MACOS_RELEASE.tag,
            releaseVersion: RELEASE_VERSION,
          }),
        })}
      </p>

      {/* macOS 쪽 설치 가능성의 앵커 — Windows 는 `PlatformStatus` 가 진다.
          두 플랫폼이 **각자 이름을 갖는다**는 계약의 시험 대상이라
          (`tests/e2e/ontology-ui.spec.ts`), 게시/미게시 두 분기 모두 단다.
          동시에 그려지지 않으므로 중복 매치는 없다. */}
      <p
        data-testid="download-platform-macos"
        className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-label leading-label text-[color:var(--color-text-quaternary)]"
      >
        <span>
          {RELEASE_MIN_MACOS}
          {t('factMinOsSuffix')}
        </span>
      </p>
      <PlatformStatus />
    </div>
  );
}

/**
 * 버튼 바로 아래 한 줄 — 조사한 레퍼런스 8곳이 **전부** 여기에 두는 것이다
 * (Zed 는 버전 + 날짜 + 체인지로그, Ghostty 는 버전 + 릴리스 노트, OrbStack ·
 * Tailscale 은 최소 OS 를 버튼에 붙인다). 날짜가 버전과 짝인 이유: `v1.0.0`
 * 만으로는 이게 지난주 빌드인지 재작년 빌드인지 알 수 없다.
 */
/*
 * ⚠️ **이 블록의 세로 리듬은 세 값이다** (2026-08-08 실측).
 *
 * 히어로 액션 블록의 형제 간 간격을 재 보니 **네 종류**였다 —
 * 0 · 10 · 8 · 12(1440) / 0 · 10 · 8 · 20(768). 0 과 큰 값은 뜻이 분명하다:
 * 앞은 「제목과 버튼은 한 덩어리」, 뒤는 「구분선을 낀 다른 절」. 문제는
 * 가운데 둘이다 — **8 과 10 은 2px 차이라 위계 신호가 되지 못하고**, 자리마다
 * 골랐다는 인상만 남긴다.
 *
 * 그래서 캡션 두 줄(출시 사실 · 신뢰 칩)을 같은 8 로 묶었다. 남는 값은
 * 0(한 덩어리) · 8(보통 쌓임) · 12~20(절 전환) 셋이고, 셋은 서로 충분히 멀어
 * 실제로 읽힌다. 8 인 것은 4px 배수이기 때문이다 — 10 은 반스텝이다.
 * 게시/미게시 두 분기가 같은 값을 쓴다(동시에 그려지지 않지만, 릴리스 당일에
 * 리듬이 바뀌면 그건 디자인이 아니라 사고다).
 */
function ReleaseFactLine() {
  const t = useTranslations('download');
  const format = useFormatter();
  const publishedAt = macosPublishedDate();

  // 미게시 분기와 **같은 앵커**를 쓴다 — 두 분기가 서로 다른 이름을 가지면
  // 릴리스 당일에 시험이 깨진다(두 분기는 동시에 그려지지 않으므로 중복
  // 매치도 없다). 구 `download-release-facts` 는 소비자가 0이라 여기서 정리했다.
  return (
    <p
      data-testid="download-platform-macos"
      className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-label leading-label text-[color:var(--color-text-quaternary)]"
    >
      <span>
        {RELEASE_MIN_MACOS}
        {t('factMinOsSuffix')}
      </span>
      <Dot />
      {/*
       * 버전·날짜 **자체가** 릴리스 노트 링크다 — "릴리스 노트 보기" 라는 9글자
       * 라벨은 죽었다(fable 판정 2026-07-29). 어디로 가는지는 버전 문자열이
       * 이미 말하고, 외부로 나간다는 경고는 선행 아이콘이 맡는다.
       */}
      <a
        href={MACOS_RELEASE.releaseUrl}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="download-release-notes-link"
        className={controlClass({ shape: "link", tone: "secondary", className: "touch-hit-expand items-baseline gap-1.5 hover:text-[color:var(--color-text-secondary)]" })}
      >
        <ExternalLink size={ICON_SIZE.sm} aria-hidden className="shrink-0 self-center" />
        {/*
         * ⚠️ mono 는 **이 스팬 하나뿐**이다. 예전에는 줄 전체가 `font-mono` 라
         * 한글("이상" · "릴리스 노트 보기")이 JetBrains Mono 에 없어 시스템
         * 폴백으로 떨어졌고, 9.5px 한 줄 안에 **두 서체가 섞였다**(자간이
         * 벌어져 보이던 그것). 소유자가 본 "조잡함"의 픽셀 원인이다.
         * 숫자·태그는 mono 가 맞고, 한글은 본체 서체가 맞다.
         */}
        <span className="font-mono text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]">
          {MACOS_RELEASE.tag}
        </span>
        {publishedAt ? (
          <span>
            {format.dateTime(publishedAt, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              // 릴리스 시각의 진실원은 GitHub 이고 그쪽은 UTC 다.
              timeZone: 'UTC',
            })}
          </span>
        ) : null}
      </a>
    </p>
  );
}

function Dot() {
  return (
    <span aria-hidden className="text-[color:var(--color-text-quaternary)]">
      ·
    </span>
  );
}

/**
 * 신뢰의 **주장**이 사는 자리 — 누르기 직전이다. 증명(체크섬 · `shasum`)은
 * 아래 검증 절이 갖는다.
 *
 * 조사한 8곳 중 페이지에 체크섬을 내는 곳은 **0곳**이라, 검증 절은 걷어낼
 * 군더더기가 아니라 이 제품이 남보다 더 주는 것이다. 다만 그것이 **결정을
 * 가리면** 안 된다 — 받을지 정하는 사람에게 `shasum` 명령은 결정 재료가
 * 아니고, 검증하는 사람에게 그 명령은 한 화면 아래여도 늦지 않다.
 */
function TrustChips() {
  const t = useTranslations('download');

  return (
    <p
      data-testid="download-trust-chips"
      className="mt-2 flex min-w-0 items-baseline gap-2 break-keep text-label leading-label text-[color:var(--color-text-tertiary)]"
    >
      <Check
        size={ICON_SIZE.sm}
        aria-hidden
        className="mt-1 shrink-0 text-[color:var(--color-indigo-accent)]"
      />
      <span className="min-w-0">{t('trustLine')}</span>
    </p>
  );
}

// ─── 설치 3단 — 바닥 띠의 한 줄 ────────────────────────────────────────────────

/**
 * 설치 3단계 — **가로 한 줄**이고, 이제 **절이 아니다** (2026-07-29 평결 ③).
 *
 * 예전에는 세로 스택 3행 × 각 2행 본문 + 제목 + 갱신 각주 = 308px 였다. 그
 * 치수는 "읽어야 하는 절차서" 의 것인데, 이 세 줄이 실제로 하는 일은 **받기
 * 전에 "설치가 복잡하지 않다" 를 안심시키는 것**뿐이다. 안심은 길이로 주는
 * 것이 아니라 짧음으로 준다 — 세 단계가 한 눈에 들어오면 그 자체가 "간단하다"
 * 는 논증이다.
 *
 * 이번 패스에서 마지막으로 남은 절 표식(자기 괘선 + 64px 여백)까지 반납했다.
 * 관문 한 장에 대등한 괘선이 셋이면 그건 위계가 아니라 목록이고, 무대의 아래
 * 보더가 이미 "여기부터는 부록" 을 말한다. 내용 세 줄은 그대로 산다 — 줄인
 * 것은 **지위**지 사실이 아니다.
 */
function InstallTrack() {
  const t = useTranslations('download');

  const steps = [
    { i: '01', label: t('step1Title'), body: t('step1Body') },
    { i: '02', label: t('step2Title'), body: t('step2Body') },
    { i: '03', label: t('step3Title'), body: t('step3Body') },
  ];

  return (
    /*
     * 컬럼 **전폭** 복귀 (2026-08-18 3차). 직전 판이 3단을 판 폭(880)으로
     * 내렸던 근거(*"난잡한데?"* — 한 절 안 두 그리드)는 오른쪽 절반을 통째로
     * 비우는 대가를 치렀고, 소유자가 그 빈 공간을 다시 지적했다. 이제 절의
     * 두 행(3단 · 판+검증 레일)이 **같은 전폭**을 쓰고 같은 오른끝에서
     * 멈추므로, 겹치는 그리드도 빈 절반도 없다(`InstallSection` 독블록).
     */
    <section
      data-testid="download-install"
      aria-label={t('installTitle')}
      className="mt-9 w-full min-w-0"
    >
      <ol className="grid min-w-0 grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-9">
        {steps.map((step) => (
          <li
            key={step.i}
            className="min-w-0 border-t border-[color:var(--color-border-strong)] pt-4"
          >
            <span className="block font-mono text-label leading-label tracking-[var(--tracking-caps-12)] text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]">
              {step.i}
            </span>
            <span className="mt-2 block min-w-0 break-keep text-title font-[var(--font-weight-emphasis)] leading-title text-[color:var(--color-text-primary)]">
              {step.label}
            </span>
            <span className="mt-1.5 block min-w-0 break-keep text-body-lg leading-body-lg text-[color:var(--color-text-tertiary)]">
              {step.body}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ─── 검증 레일 — 설치 절의 오른쪽 칸 ─────────────────────────────────────────

/**
 * 「받아도 되는 이유」 — 서명·공증·체크섬·프라이버시의 증명 목록.
 *
 * ## 자리의 역사
 *
 * 2026-07-29 소유자 판정("이 페이지는 서비스를 홍보해야지")으로 본문에서
 * 푸터 접이식으로 내려갔고, 2026-08-18 설치 절 재배치에서 **판 옆으로
 * 돌아왔다** — 접힌 각주가 아니라 펼쳐진 레일로. 두 판정은 충돌하지 않는다:
 * 그때 내려간 이유는 검증이 **결정을 가렸기** 때문이고(판 위에 얹힌 벽),
 * 지금 자리는 결정(판)의 **옆**이라 가리는 것 없이 오른쪽 절반의 빈 검정을
 * 실사실로 채운다(소유자: *"우측 공백이 너무길잖아"*). 서명·공증·체크섬은
 * 레퍼런스 8곳 중 이 제품만 페이지에 내는 사실이다 — 각주로 접어 두기에는
 * 아깝고, 받기 직전이 정확히 그 증명이 필요한 순간이다.
 *
 * 표기 문법은 증거 절 레일과 같다(mono caps 절 머리 + 괘선 행) — 두 레일이
 * 같은 문법이면 페이지가 「왼쪽 = 물건 · 오른쪽 = 근거」 를 한 벌로 말한다.
 */

function VerifyRail({
  published,
  primaryAsset,
}: {
  published: boolean;
  primaryAsset: ReturnType<typeof macosAssetFor>;
}) {
  const t = useTranslations('download');

  /**
   * ⚠️ 검증 명령의 파일명은 **게시된 자산의 실제 이름**이어야 한다.
   *
   * 예전에는 `buildDmgName('aarch64')` 로 만들었는데 그건 `package.json` 의
   * `RELEASE_VERSION` 을 쓴다. 그래서 rc.3 을 개발 중이면서 게시된 것이 rc.2
   * 인 **릴리스 사이의 평상시 상태**에서 화면이 이렇게 됐다: 체크섬 목록은
   * `…rc.2_aarch64.dmg` 를 세워 두고 바로 아래 명령은
   * `shasum -a 256 …rc.3_aarch64.dmg` 를 시켰다(실측 2026-07-28). 존재하지
   * 않는 파일이라 그대로 따라 하면 `No such file` 이 뜬다 — **신뢰를 벌겠다는
   * 절이 유일하게 실행 가능한 지시에서 틀리는** 형태다.
   */
  const verifyFileName = primaryAsset?.fileName ?? buildDmgName('aarch64');

  return (
    <div data-testid="download-trust" className="min-w-0 border-t border-[color:var(--color-border-soft)] pt-5">
      <h3 className="font-mono text-label uppercase leading-label tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
        {t('trustHeading')}
      </h3>

      <div className="mt-4">
        <TrustFact label={t('proofSigned')} note={t('trustSignedNote')} />
        <TrustFact
          label={t('proofNotarized')}
          note={t('trustNotarizedNote')}
          body={t('trustFirstLaunch')}
        />
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
          <p className="mt-2 max-w-full overflow-x-auto whitespace-nowrap rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-3 py-2 font-mono text-label leading-label text-[color:var(--color-text-tertiary)] md:w-fit">
            {t('trustVerifyCommand', { file: verifyFileName })}
          </p>
        </TrustFact>
        <TrustFact label={t('proofPrivacy')} body={t('trustPrivacyNote')} />
        {/*
         * ⚠️ 이 줄은 **웹사이트**의 주장이라 판 안 「서버 전송 0」 칩(=앱의
         * 주장)과 주체가 다르다. 위계석이 중복으로 지목했지만 2026-07-27 에 한
         * 번 정정된 이력이 있는 문장이고(그때는 "이 사이트는 폴더를 열지 못한다"
         * 는 **거짓 능력 주장**을 걷어냈다), 주체 구분은 원장대로 존중한다.
         *
         * 바뀐 것은 자리다: 푸터의 **자유 문단**이었을 때는 이 페이지에서
         * 유일하게 아무 행 구조도 안 가진 산문이라 바닥에 떠 있었다. 같은 주장을
         * 하는 이웃 행 바로 밑으로 옮기면 "앱은 / 이 사이트는" 이 나란히 읽혀
         * 주체 구분이 오히려 선명해진다.
         */}
        <TrustFact label={t('releaseGateNote')} />
        {/*
         * 아키텍처 안내는 **판에서 내려왔지만 사라지지 않았다** (소유자 판정
         * 2026-07-29: 판이 조잡하다 / 게이트 `validate-messages.test.mjs`: 둘을
         * 이름만 대고 끝내면 사용자가 두 버튼 앞에서 막힌다).
         *
         * 브라우저는 맥 아키텍처를 판별할 수 없다 — `navigator.platform` 은
         * Apple Silicon 에서도 `MacIntel` 을 돌려주고, 조사한 레퍼런스 12곳 중
         * 자동 판별하는 곳이 0이다. 그래서 이 문장이 **막힌 사람을 푸는 유일한
         * 장치**이고, 지우면 Intel 사용자가 열리지 않는 앱을 받는다.
         *
         * 판의 조잡함과 이 사실의 존재는 양자택일이 아니다 — 자리를 옮기면
         * 둘 다 만족한다. 결정하는 사람은 안 읽고, 막힌 사람은 찾아온다.
         */}
        <TrustFact label={t('archHelpTitle')} body={t('archHelpBody')} last />
      </div>
    </div>
  );
}

/**
 * 릴리스 정책 산문 — 콜로폰의 것이다 (fable 판정 2026-07-29: 정책 산문은
 * 결정 재료가 아니다). 검증 레일이 판 옆으로 올라가면서(2026-08-18) 이 두
 * 문장까지 따라 올라가면 레일이 다시 벽이 되므로, 산문만 각주 자리에 남는다.
 * 사실은 한 글자도 안 지웠다 — 문장 그대로 자리만 다르다.
 */
function ReleasePolicyNotes({ published }: { published: boolean }) {
  const t = useTranslations('download');

  return (
    <>
      <p className="mt-3 break-keep text-label leading-label text-[color:var(--color-text-quaternary)]">
        {published
          ? t('trustPolicyPublished', { tag: MACOS_RELEASE.tag })
          : /* 미게시 태그 주석(`PendingActions`)과 같은 이유 — 아직 안 나온
               빌드는 개발 중 버전으로 부른다. */
            t('trustPolicyPending', {
                tag: resolveDisplayReleaseTag({
                  published: false,
                  publishedTag: MACOS_RELEASE.tag,
                  releaseVersion: RELEASE_VERSION,
                }),
              })}
      </p>
      <p className="mt-2 break-keep text-label leading-label text-[color:var(--color-text-quaternary)]">
        {t('windowsPolicy')}
      </p>
    </>
  );
}

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
        'border-b border-[color:var(--color-divider)] py-2.5 first:pt-0',
        last && 'border-b-0 pb-0',
      )}
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <Check
          size={ICON_SIZE.sm}
          aria-hidden
          className="shrink-0 translate-y-0.5 text-[color:var(--color-indigo-accent)]"
        />
        <span className="min-w-0 text-body leading-body text-[color:var(--color-text-primary)]">
          {label}
        </span>
        {/* 증거는 라벨 바로 옆에 붙는다 — 960 컬럼에서 오른쪽 끝으로 밀면
            라벨과 증거 사이가 600px 떨어져 짝으로 읽히지 않는다. */}
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
      className="flex min-w-0 items-center gap-2 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-2.5 py-1.5"
    >
      <span className="shrink-0 font-mono text-caption leading-caption text-[color:var(--color-text-quaternary)]">
        {asset.fileName}
      </span>
      <span className="min-w-0 flex-1 truncate text-right font-mono text-label leading-label text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]">
        {asset.sha256}
      </span>
      <button
        type="button"
        onClick={() => void copy(asset.sha256)}
        aria-label={copyLabel}
        // coarse 포인터에서 히트만 44px 로 — 시각 높이(28px)는 그대로.
        className={controlClass({ shape: "chip", tone: "muted", className: "touch-hit-expand h-7 shrink-0 border-[color:var(--color-border-soft)] px-2 font-mono text-caption leading-caption hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]" })}
      >
        {copyState === 'copied' ? (
          <Check size={ICON_SIZE.sm} aria-hidden />
        ) : (
          <Clipboard size={ICON_SIZE.sm} aria-hidden />
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

// ─── 다른 환경 ───────────────────────────────────────────────────────────────

/**
 * 플랫폼 상태 — **판 안**이다 (소유자 판정 2026-07-29: *"이거는 하단이 아니라
 * 상단 다운로드 하는데 적어놔야지.. 그래야 바로 알"*).
 *
 * 예전에는 접힘 아래 별도 행이었다. 그런데 이 사실이 필요한 순간은 **버튼을
 * 보는 순간**이다 — 윈도우 사용자가 스크롤을 내려야 자기가 못 받는다는 걸
 * 아는 것은 늦다. 받는 자리에서 바로 말한다.
 */
function PlatformStatus() {
  const t = useTranslations('download');
  const installer = windowsAsset();

  if (installer) {
    const warningId = 'download-windows-unsigned-warning';
    return (
      <section
        data-testid="download-platform-windows"
        className="mt-5 min-w-0 border-t border-[color:var(--color-divider)] pt-5 [@media(min-width:64rem)_and_(max-height:56.25rem)]:mt-3 [@media(min-width:64rem)_and_(max-height:56.25rem)]:pt-3"
        aria-labelledby="download-windows-title"
      >
        <PlatformHeading
          id="download-windows-title"
          title={t('windowsPlatformTitle')}
          status={t('windowsUnsignedBadge')}
        />
        {/*
          * 무채색 캡션이다 — 채운 앰버 상자가 아니다 (2026-08-18 소유자:
          * *"어지러워"* / 디자인 처방). 이 절의 일은 「받게 하기」인데 앰버
          * 면이 절에서 유일한 유채색이라 눈이 경고에 먼저 갔고, 맥 방문자
          * 대부분에게는 해당조차 없는 사실이었다. 사실은 한 글자도 빼지 않고
          * 잉크만 뺀다 — 버튼보다 먼저 온다는 DOM 순서(경고를 읽고 받는다)는
          * 게이트가 고정한다(DownloadPage.test.tsx).
          *
          * `break-keep` + `break-words`: 앞은 「단어 안에서 끊지 마라」, 뒤는
          * 「그래도 한 낱말이 칸을 넘치면 그때는 쪼개라」 (2026-08-12 실측).
          */}
        <p
          id={warningId}
          role="note"
          data-testid="download-windows-unsigned-warning"
          className="mt-2.5 flex min-w-0 items-start gap-2 break-keep break-words text-label leading-label text-[color:var(--color-text-tertiary)]"
        >
          <ShieldAlert
            size={ICON_SIZE.sm}
            aria-hidden
            className="mt-px shrink-0 text-[color:var(--color-text-quaternary)]"
          />
          <span className="min-w-0 max-w-[var(--measure-prose)]">
            {t('windowsUnsignedWarning')}
          </span>
        </p>
        <div className="mt-2.5 flex min-w-0 flex-col items-stretch gap-2 sm:items-start">
          <a
            href={installer.downloadUrl}
            aria-describedby={warningId}
            data-testid="download-windows-x64"
            className={cn(
              buttonVariants({ variant: 'outline', size: 'lg' }),
              'min-h-11 w-full rounded-chip px-4 sm:w-auto sm:px-6',
            )}
          >
            <Download size={ICON_SIZE.md} aria-hidden />
            {t('windowsDownloadCta')}
            <AssetSize bytes={installer.sizeBytes} />
          </a>
        </div>
      </section>
    );
  }

  return (
    /*
     * **다른 플랫폼도 버튼 자리를 갖는다 — 비활성으로.** 종전에는 회색 산문 한 줄이라
     * "여기도 받을 게 있나" 를 훑는 눈에 잡히지 않았다(소유자: *"아이콘 버튼 형태로
     * 만들어두고 비활성화 시켜두는게 나을듯? 준비중이라고"*).
     *
     * 비활성 버튼은 **없는 것을 있는 것처럼 파는 게 아니다** — 눌리지 않고,
     * `aria-disabled` 와 문구가 함께 「준비중」을 말하고, 그 옆의 살아있는 버튼이 갈
     * 곳(진행 상황)을 준다. 이 저장소의 강등 계약(**왜** + **어디서**)을 버튼 두 개로
     * 옮긴 것이다. 「곧 됩니다」가 아니라 「아직 없습니다」로 쓰는 것도 그 계약이다.
     */
    <div
      data-testid="download-platform-windows"
      /*
       * `mt-1` — 버튼 두 개로 바꾸면서 판이 1512×850 에서 한 화면을 넘겼다(실측 19px →
       * 크기 조정 후 7px). 이 줄은 **받을 수 없는 플랫폼**의 강등 안내라 위 신뢰
       * 칩과의 간격이 주 CTA 사이 간격과 같을 이유가 없다. 850 창은 카운슬이 게이트로
       * 지키는 폭이고(설치 3단이 접히면 안 된다), 그 제약이 이 값을 정한다.
       */
      className="mt-5 min-w-0 border-t border-[color:var(--color-divider)] pt-5 [@media(min-width:64rem)_and_(max-height:56.25rem)]:mt-3 [@media(min-width:64rem)_and_(max-height:56.25rem)]:pt-3"
    >
      <PlatformHeading title={t('windowsPlatformTitle')} status={t('windowsPendingBadge')} />
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
        <span
          aria-disabled="true"
          data-testid="download-platform-windows-pending"
        /*
         * `sm`(h-8) — 기본 `md`(h-10)로 두 버튼을 얹었더니 1512×850 에서 판이 한 화면을
         * 넘겨 카운슬 게이트가 빨개졌다(설치 3단이 접히지 않는 것이 그 게이트의 일이다).
         * 이 줄은 **받을 수 없는 플랫폼**의 자리라 주 CTA 와 같은 무게일 이유가 없다.
         */
          className={cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            'touch-hit-expand rounded-chip cursor-not-allowed opacity-55',
          )}
        >
          <Download size={ICON_SIZE.md} aria-hidden />
        {/*
          * **문구는 「아직 없습니다」로 남는다.** 소유자 지시는 *"준비중이라고"* 였고
          * 「준비 중」으로 바꿨더니 게이트가 잡았다 — `DownloadPage.test.tsx` 가 영문
          * *"not out yet"* 을 단언한다. 그 단언이 옳다: 이 저장소는 「곧 됩니다」류를
          * 거짓말로 규정하고(`surfaces.md`), 「준비 중」은 시점을 암시한다.
          *
          * 그래서 **지시의 실체(버튼 형태 + 비활성)는 그대로 받고 문구만 정직한 쪽에
          * 둔다.** 비활성 버튼 자체가 이미 "준비 중"을 말한다 — 형태가 상태를 나르므로
          * 문구가 그것을 반복하며 약속까지 얹을 이유가 없다.
          */}
          <span className="break-keep">{t('platformStatus')}</span>
        </span>
        <a
          href={WINDOWS_STATUS.trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="download-platform-windows-track"
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'sm' }),
            'touch-hit-expand rounded-chip',
          )}
        >
          <ExternalLink size={ICON_SIZE.sm} aria-hidden />
          {t('windowsTrackCta')}
        </a>
      </div>
    </div>
  );
}

function PlatformHeading({
  id,
  title,
  status,
}: {
  id?: string;
  title: string;
  status: string;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
      <h2 id={id} className="text-title font-[var(--font-weight-strong)] leading-title text-[color:var(--color-text-primary)]">
        {title}
      </h2>
      <span className="text-label leading-label text-[color:var(--color-text-tertiary)]">
        {status}
      </span>
    </div>
  );
}
