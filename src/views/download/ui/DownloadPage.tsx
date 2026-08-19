'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { useFormatter, useTranslations } from 'next-intl';
import { resolveDisplayReleaseTag } from '../lib/pending-release-tag';
import { Link, usePathname } from '@/i18n/navigation';
import { shouldHideBottomTabBar } from '@/widgets/bottom-tab-bar';
import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/gateway-frame';
import { GatewayNav, GatewayReadingLinks } from '@/widgets/gateway-chrome';
import { DemoStage } from './DemoStage';
import { buttonVariants } from '@/shared/ui';
import { RELEASE_MIN_MACOS, RELEASE_VERSION } from '../lib/release-facts';
import {
  MACOS_RELEASE,
  formatAssetSize,
  isMacosReleasePublished,
  macosAssetFor,
  macosPublishedDate,
  windowsAsset,
} from '../lib/release-state';
import { StageMap, useStageGraph } from './StageMap';
import { GatewayFx } from './GatewayFx';
import { HeroObject } from './HeroObject';
import { AcpChatScene } from './AcpChatScene';
import { useInViewOnce } from '../lib/use-in-view-once';
import { useVisitorDesktopPlatform } from '../lib/visitor-platform';
import type { StageGraph } from '../lib/stage-graph';
import { buildEvidenceRailModel } from '../lib/evidence-rail';

/**
 * **이 페이지의 그리드는 한 벌이다** (2026-07-29 카운슬 평결 ③ — 리메이크에도
 * 그대로 산다).
 *
 * 정렬 원점 하나에서 시작해 `--page-max` 에서 멈춘다. 원소는 다섯이고 x 는
 * 하나다: GNB · 헤드라인 · 지도 절 · 캡션 · 푸터.
 *
 * ```
 * 원점 = max(--gateway-gutter, (뷰포트 − --page-max) / 2)   ← --gateway-origin
 * ```
 *
 * 소유자 지적(*"좌우가 같아야함"*)의 전말과 `mx-auto` 기각 사유는
 * `shared/lib/gateway-frame.ts` 와 `app/globals.css` 의 원점 독블록에 있다.
 * 이 파일이 하는 일은 하나다 — 모든 절의 내용을 `PAGE_GUTTER` + `PAGE_COLUMN`
 * 안에 앉히는 것. 게이트: `tests/e2e/download-gateway-grid.spec.ts` (원점을
 * 라이브로 읽고, 좌우 여백 동일 · 리사이즈 추종을 잰다).
 *
 * [은퇴 2026-08-18] 구 카메라 예약폭(`--topology-v2-safe-inset-left` 파생)은
 * 지도가 판 뒤 배경이던 시절의 산수다. 지도가 자기 절(증거)로 내려가면서 판과
 * 지도는 구조적으로 겹칠 수 없게 됐고, 파생(`computeGatewaySafeInset`)과 그
 * 소비처는 삭제됐다.
 *
 * [은퇴 2026-08-19] 설치 절(3단 · 판 · 검증 레일)이 통째로 사라지면서 판을
 * 잣대로 삼던 단언들도 같이 갔다 — 소유자: *"맨 마지막 이거는 없어도 될듯?
 * 어차피 맨 위에 다 있어서"*. 네 목적지는 히어로가 전부 진다.
 */

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
 * ## 네 절, 절마다 생각 하나 (소유자 확정 골격 — 2026-08-19 개정)
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
 *
 * ## [삭제 2026-08-19] ⑤ 설치·다운로드
 *
 * 소유자: *"맨 마지막 이거는 없어도 될듯? 어차피 맨 위에 다 있어서"*. 히어로가
 * 네 목적지(내 플랫폼 · Intel · Windows · 브라우저)를 전부 지므로 판은 같은
 * 결정을 한 번 더 물은 셈이었다. 함께 사라진 것: 설치 3단 · 다운로드 판 ·
 * 검증 레일 — 그리고 그 레일이 유일하게 지던 **정직성 사실 넷**(SHA-256
 * 체크섬 · Developer ID 서명 · 공증 · 「서버로 아무것도 안 보낸다」)은 이제
 * 이 페이지 어디에도 없다. 소유자가 그 대가를 명시적으로 받아들였다
 * (`docs/DECISIONS.md` 2026-08-19). 릴리스 정책 두 문장만 콜로폰에 남는다.
 *
 * 모션의 규율은 「정보 모션만」이다 (소유자: *"다운로드 페이지는 모션이
 * 중요함.. 보여지는게 최선인 만큼"*) — 첫 3초 안무(150/220 헤드라인 → 700
 * 리드 → 800 CTA → 950 사실층), 이후 전경 영구 정지. 효과층(전류장·그레인·
 * 커서 링)은 `--gateway-fx-*` 봉인 예외다(`GatewayFx` 독블록).
 */
/**
 * 히어로의 다운로드 CTA 는 **320px 에서 접힌다**.
 *
 * `buttonVariants` 는 `whitespace-nowrap` 이라 라벨이 길면 버튼이 컨테이너를
 * 뚫는다. 그 자체는 옳은 기본값이다 — 버튼 글자가 아무 데서나 접히면 컨트롤로
 * 안 읽힌다. 문제는 **가장 좁은 폭에서 여유가 0 이었다는 것**이다: 실측
 * (320px · en · macOS 폰트)에서 「Download Windows x64 beta + unsigned」가
 * 폭 296px, 넘침 **정확히 0** 이었다. 0 은 통과가 아니라 **다음 한 픽셀을
 * 기다리는 상태**다 — 리눅스 CI 의 폰트 스택에서 같은 라벨이 9px 넘쳤고
 * 게이트가 빨개졌다(2026-08-19).
 *
 * 고칠 수 있는 길은 셋이었고 둘은 기각했다. ① 라벨 줄이기 — 「x64」나 「beta」를
 * 빼면 받는 파일이 무엇인지 흐려진다. ② 좁은 폭에서 「unsigned」 감추기 —
 * 서명이 없다는 사실은 방문자가 **누르기 전에** 알아야 하는 것이라
 * (`surfaces.md` 의 정직한 강등 계약) 폭이 좁다고 지울 수 없다. 남은 것이
 * ③ **접기**다: 320px 에서 두 줄이 되는 버튼은 흠이 아니고, `sm:` 부터는
 * 원래대로 한 줄이다.
 *
 * `text-left` 가 같이 필요하다 — 접힌 두 줄이 가운데 정렬이면 아이콘과 글자의
 * 왼끝이 어긋나 라벨이 두 조각으로 읽힌다.
 */
const HERO_CTA_WRAP = 'min-w-0 whitespace-normal text-left sm:whitespace-nowrap';

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

        {/*
         * **바닥 띠** — 콜로폰. 읽을거리 링크 · 릴리스 정책 두 문장 ·
         * 라이선스만 산다 (검증 목록은 2026-08-19 설치 절과 함께 사라졌다).
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
   * 라벨 옆 `미서명` 표식이 같은 일을 한다. [2026-08-19] 자세한 경고 전문과
   * 체크섬을 지던 설치 절은 삭제됐다 — 이제 이 신뢰줄이 그 사실의 **유일한**
   * 자리이므로, 여기서 문구를 줄이면 사실이 사라진다.
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
              /* 채운 CTA — 실파일 직링크. 설치 절이 삭제된 2026-08-19 부터
                 이 페이지의 **유일한** 주 다운로드다. 파일은 방문자의 플랫폼을
                 따른다 — Windows 방문자가 「Apple Silicon용 받기」만 보던 것이
                 이 분기가 고친 결함이다. */
              <a
                href={heroWindowsPrimary ? windowsInstaller!.downloadUrl : primaryAsset.downloadUrl}
                data-testid="gateway-hero-cta"
                className={cn(buttonVariants({ size: 'lg' }), 'rounded-chip px-6', HERO_CTA_WRAP)}
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
                className={cn(buttonVariants({ size: 'lg' }), 'rounded-chip px-6', HERO_CTA_WRAP)}
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
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'rounded-chip px-4 sm:px-6', HERO_CTA_WRAP)}
            >
              {t('heroDemoCta')}
            </a>
          </div>

          {published && primaryAsset ? (
            /* 둘째 줄 — 승자가 아닌 목적지 전부, 한 단 아래(`md`, h-10 vs h-11).
               크기 표기는 주 CTA 만 갖는다 — 결정 재료는 승자의 것이다.
               Windows 의 「미서명」 표식만은 여기서도 뗄 수 없다 — 서명 상태는
               받기 전에 알아야 하는 사실이라서다.

               `<sm` 의 `px-3` 은 취향이 아니라 산술이다(2026-08-19 실측). 320px
               en 에서 「Download Windows x64 beta + unsigned」 버튼이 화면을 8px
               뚫었고, `gateway-fx-stage` 가 `overflow-hidden` 이라 **스크롤바도
               안 생긴 채 그냥 잘렸다**. 좌우 4px 씩 반납하면 정확히 들어간다.
               넷을 **같이** 내리는 이유: 나란히 선 출구들의 여백이 서로 달라지는
               것이 이 저장소가 이미 한 번 잡은 결함이다(2026-08-08 눌린 여백).
               게이트: `download-gateway-grid.spec.ts` 의 320px 넘침 시험. */
            <div
              data-testid="gateway-hero-alt-row"
              className={cn(rise('gateway-t800'), 'mt-2.5 flex flex-wrap items-center gap-2.5')}
            >
              {heroWindowsPrimary ? (
                <a
                  href={primaryAsset.downloadUrl}
                  data-testid="gateway-hero-macos-aarch64"
                  className={cn(buttonVariants({ variant: 'outline', size: 'md' }), 'touch-hit-expand rounded-chip px-3 sm:px-4', HERO_CTA_WRAP)}
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
                  className={cn(buttonVariants({ variant: 'outline', size: 'md' }), 'touch-hit-expand rounded-chip px-3 sm:px-4', HERO_CTA_WRAP)}
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
                className={cn(buttonVariants({ variant: 'outline', size: 'md' }), 'touch-hit-expand rounded-chip px-3 sm:px-4', HERO_CTA_WRAP)}
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
      className={cn(buttonVariants({ variant: 'outline', size: 'md' }), 'touch-hit-expand rounded-chip px-3 sm:px-4', HERO_CTA_WRAP)}
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
 * 이유는 계기 스트립과 같다 — 한글은 mono 폴백으로 서체가 섞인다.
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

        {/* 장면 폭은 시연 절과 같은 토큰(`--gateway-stage-max`) — 「이만큼이
            무대다」를 페이지가 한 번만 말한다. ≤1920 에서는 종전 48rem 그대로,
            넓은 폭에서만 비례로 자란다(근거는 토큰 독블록). */}
        <div
          data-testid="gateway-agent-scene"
          className={cn(
            'gateway-rise gateway-rise-d3',
            inView && 'is-in',
            'mt-9 max-w-[var(--gateway-stage-max)]',
          )}
        >
          <AcpChatScene />
        </div>
        <p
          className={cn(
            'gateway-rise gateway-rise-d3',
            inView && 'is-in',
            'mt-5 max-w-[var(--gateway-stage-max)] break-keep text-body-lg leading-body-lg text-[color:var(--color-text-tertiary)]',
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

/**
 * 버튼에 붙는 파일 크기 — **`<sm` 에서는 안 붙는다** (2026-07-29 평결 ④).
 *
 * `buttonVariants` 는 `whitespace-nowrap` 이라 라벨이 길면 버튼이 컨테이너를
 * 뚫는다. 실측(320px): 주 CTA 콘텐츠 폭 261px vs 그 자리의 실질 폭 216px →
 * 가로 오버플로. 스크롤바도 안 생기고 **그냥 잘렸다**.
 *
 * 잘라낸 것이 크기인 이유: 320px 폰에서는 macOS DMG 를 설치할 수 없다. 크기는
 * **설치를 결정하는 사람의 사실**이고 그 사람은 데스크톱에 있다.
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
 * 릴리스 정책 산문 — 콜로폰의 것이다 (fable 판정 2026-07-29: 정책 산문은
 * 결정 재료가 아니다). 설치 절과 검증 레일이 삭제된 2026-08-19 이후, 이 두
 * 문장이 페이지에 남은 **유일한** 릴리스 정책 사실이다.
 */
function ReleasePolicyNotes({ published }: { published: boolean }) {
  const t = useTranslations('download');

  return (
    <>
      <p className="mt-3 break-keep text-label leading-label text-[color:var(--color-text-quaternary)]">
        {published
          ? t('trustPolicyPublished', { tag: MACOS_RELEASE.tag })
          : /* 아직 안 나온 빌드는 개발 중 버전으로 부른다 — `MACOS_RELEASE.tag`
               는 미게시 상태에서 정의상 낡은 값이다. */
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
