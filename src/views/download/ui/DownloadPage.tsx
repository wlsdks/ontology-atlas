'use client';

import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clipboard,
  Download,
  ExternalLink,
  Orbit,
} from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
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
  isMacosPrerelease,
  isMacosReleasePublished,
  macosAssetFor,
  macosPublishedDate,
  type DesktopArch,
} from '../lib/release-state';
import { DOGFOOD_CENSUS } from '../model/dogfood-census.generated';
import { StageMap } from './StageMap';

const GITHUB_REPOSITORY_URL = 'https://github.com/wlsdks/ontology-atlas';
/** 링크 텍스트는 주소 그대로 — 오픈소스에서 이 문자열은 라벨이 아니라 신원이다. */
const GITHUB_REPOSITORY_LABEL = 'github.com/wlsdks/ontology-atlas';

/**
 * `/download` — **지도가 곧 페이지다** (2026-07-28 소유자 확정, 백지 재설계).
 *
 * ## 이 화면의 일
 *
 * > 처음 온 사람이 **제품을 보고** "이걸 내 맥에 설치해도 되는가" 를 판단하고,
 * > 맞으면 자기 기기에 맞는 파일을 헤매지 않고 받는다.
 *
 * 앞의 두 판(#730 유틸리티 리메이크 · 같은 날 관문형 랜딩)이 공유한 전제는
 * "제품은 **설명**하고 파일은 **제시**한다" 였다. 그래서 둘 다 상자를 쌓았고,
 * 소유자 판정은 두 번 다 같았다 — *"수준이 왜이래"*, *"너무 비슷해서 별로"*.
 * 조사한 레퍼런스 8곳(Orca · Zed · Ghostty · OrbStack · Obsidian · Cursor ·
 * Tailscale · VS Code Insiders)도 전부 같은 문법이라, 그 문법 안에서 잘 만드는
 * 것으로는 **구분이 생기지 않는다**.
 *
 * 그래서 뼈대를 바꿨다: **제품이 배경이고 다운로드가 그 위에 뜬다.** 뒤에
 * 깔린 것은 목업도 일러스트도 아니라 이 저장소 vault 의 실제 그래프
 * (`VaultPortrait` — 96 개념 · 빌드 시점 결정적 좌표)다. 그래서 히어로의
 * 헤드라인이 배경을 **가리킬 수 있고**, "설치 없이 먼저 보기" 가 링크가 아니라
 * 지금 보고 있는 화면이 된다.
 *
 * ## 이 재설계가 걸고 있는 것
 *
 * 배경이 장식이면 이 페이지는 실패다 — 그래서 배경은 캡션의 숫자와 **같은
 * 출처**를 쓰고, 그 숫자가 틀리면 그림도 틀린다. 반증 조건: 방문자가 배경을
 * "예쁜 패턴" 으로 읽고 제품과 연결하지 못하면 뼈대를 다시 연다.
 *
 * ## 상자를 안 쓴다
 *
 * 위계는 여백 · 1px 괘선 · 타입 스케일이 만든다. 카드 보더는 위계를 못 정했다는
 * 자백이고, 같은 무게의 상자 나열이 앞선 두 판을 평범하게 만든 원인이다.
 * 이 페이지에서 보더를 가진 표면은 **다운로드 판 하나뿐**이며, 그건 지도 위에
 * 떠 있어야 해서 불투명 판이 필요하기 때문이다(반투명은 헌장 금지).
 */
export function DownloadPage() {
  const t = useTranslations('download');
  const tFooter = useTranslations('footer');
  const published = isMacosReleasePublished();
  // Apple Silicon 이 기본 제안 — 2020년 말 이후 팔린 맥은 거의 전부 그쪽이다.
  const primaryAsset = published ? macosAssetFor('aarch64') : null;

  return (
    <div className="flex min-h-full w-full flex-col">
      <GatewayNav />

      <main id="main" className="min-w-0 flex-1 bg-[color:var(--color-canvas)]">
        <PortraitStage published={published} primaryAsset={primaryAsset} />

        <div className="px-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-[max(var(--page-bottom-breath),env(safe-area-inset-bottom))] md:px-10">
          <div className="mx-auto w-full max-w-[var(--page-max)]">
            <div className="mx-auto w-full max-w-[var(--page-col-utility)]">
              <Pitch />
              <TwoUsers />
              <InstallTrack />
              <ElsewhereRows />

              <footer className="mt-[var(--section-gap)] border-t border-[color:var(--color-divider)] pt-4 text-label leading-label text-[color:var(--color-text-quaternary)]">
                <VerifyDetails published={published} primaryAsset={primaryAsset} />
                <p className="mt-3 max-w-[var(--measure-prose)] break-keep">{t('releaseGateNote')}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="font-mono uppercase tracking-[0.14em]">
                    {tFooter('license')}
                  </span>
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
        </div>
      </main>
    </div>
  );
}

// ─── GNB ────────────────────────────────────────────────────────────────────

/**
 * 관문 표면의 전역 내비 (2026-07-28 소유자 확정). 이 라우트는 좌측 레일을
 * 쓰지 않으므로(`isGatewayRoute`) "여기가 어디이고 어디로 갈 수 있나" 는 이
 * 상단 바가 진다.
 *
 * 지도 무대 **위에** 뜨므로 배경이 투명하면 안 된다 — 불투명 캔버스색으로
 * 깔고 아래 보더로 무대와 경계를 긋는다.
 *
 * ⚠️ **높이는 워크벤치 크롬 규격을 따르지 않는다** (소유자 판정 2026-07-28:
 * *"세로 길이가 너무 좁고"*). `--chrome-tile-size`(36px)는 지도 위에 떠서 화면을
 * 최대한 양보해야 하는 **도구 막대**의 치수다. 관문의 상단 바는 도구가 아니라
 * 이 사이트의 얼굴이라, 같은 값을 쓰면 랜딩이 아니라 앱 크롬처럼 읽힌다.
 * 그래서 스케일 고정 계약(`design.md`)을 어기는 것이 아니라 **다른 계약을
 * 적용하는 것**이다 — 크롬 필/타일 36px 규격은 여기 해당 없음.
 */
function GatewayNav() {
  const t = useTranslations('download');

  return (
    <nav
      data-testid="download-gnb"
      className="sticky top-0 z-30 w-full shrink-0 border-b border-[color:var(--color-divider)] bg-[color:var(--color-canvas)] px-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] md:px-10"
    >
      {/* `flex-wrap` 을 뺀 이유: 좁은 폭에서 줄바꿈이 일어나면 관문의 얼굴이
          97px 짜리 두 줄이 되어 무대를 먹는다(실측 390px). 대신 접히는 것은
          **빵부스러기**다 — 이 라우트가 어디인지는 좁은 화면에서도 제목이
          말하고, 로고와 돌아가기는 어느 폭에서도 남아야 한다. */}
      <div className="mx-auto flex min-h-14 w-full max-w-[var(--page-max)] items-center gap-3 py-2.5 md:min-h-16 md:py-3">
        <Link
          href="/"
          className="touch-hit-expand inline-flex items-center gap-2 transition-colors hover:text-[color:var(--color-text-primary)]"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] text-[color:var(--color-indigo-accent)]">
            <Orbit size={12} />
          </span>
          <span className="text-body leading-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
            Ontology Atlas
          </span>
        </Link>
        <span aria-hidden className="hidden text-body text-[color:var(--color-text-quaternary)] sm:inline">
          /
        </span>
        <span
          aria-current="page"
          className="hidden text-body leading-body text-[color:var(--color-text-tertiary)] sm:inline"
        >
          {t('downloadSectionLabel')}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-3">
          <Link
            href="/"
            className="touch-hit-expand inline-flex items-center gap-1.5 whitespace-nowrap text-body leading-body text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
          >
            <ArrowLeft size={14} aria-hidden />
            {t('back')}
          </Link>
          <LocaleSwitch />
        </span>
      </div>
    </nav>
  );
}

// ─── 무대 — 지도 위의 다운로드 ───────────────────────────────────────────────

/**
 * 히어로 전체가 하나의 무대다. 지도는 `absolute inset-0` 으로 무대를 가득
 * 채우고, 판은 그 위에 **왼쪽으로 붙어** 뜬다 — 오른쪽 절반의 지도가 판에
 * 가리지 않고 그대로 보여야 배경이 증거 노릇을 한다. 가운데 정렬이면 판이
 * 그래프의 중심(project 노드)을 정확히 덮어 버린다.
 *
 * 높이는 `min-h` 로만 잡는다. 내용이 그보다 커지면(좁은 폭·긴 번역문) 무대가
 * 늘어나야지 판이 잘리면 안 된다.
 */
function PortraitStage({
  published,
  primaryAsset,
}: {
  published: boolean;
  primaryAsset: ReturnType<typeof macosAssetFor>;
}) {
  const t = useTranslations('download');
  const census = DOGFOOD_CENSUS;

  return (
    <section
      data-testid="download-stage"
      className="relative isolate flex min-h-[38rem] w-full flex-col overflow-hidden border-b border-[color:var(--color-divider)] lg:min-h-[42rem]"
    >
      <StageMap />

      <div className="relative flex min-w-0 flex-1 items-center px-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] py-12 md:px-10">
        <div className="mx-auto w-full max-w-[var(--page-max)]">
          <DownloadPlate published={published} primaryAsset={primaryAsset} />
        </div>
      </div>

      {/* 지도의 자기 캡션 — 무대 바닥. 배경이 무엇인지 말하지 않으면 그건
          증거가 아니라 벽지다.

          ⚠️ **정상 흐름**이다(absolute 아님). 절대 배치로 바닥에 붙였더니
          390px 에서 판이 길어지면서 캡션과 11px 겹쳤다(실측 2026-07-28) —
          겹침은 결함이고, 폭마다 판 높이가 달라지는 표면에서 절대 배치는
          그 결함을 폭의 함수로 만든다. 흐름에 두면 어느 폭에서도 겹칠 수 없다.

          [download-honesty] 이 숫자는 이 저장소 `docs/ontology` 의 frontmatter
          노드 합이다. 앱에서 자기 폴더를 열면 다른 정의(런타임 파생 그래프)로
          다른 숫자가 나온다. */}
      <p
        data-testid="download-portrait-caption"
        className="relative shrink-0 px-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-4 md:px-10"
      >
        <span className="mx-auto flex w-full max-w-[var(--page-max)] flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-caption leading-caption text-[color:var(--color-text-quaternary)]">
          <span className="uppercase tracking-[0.18em]">docs/ontology</span>
          <span aria-hidden>·</span>
          <span
            data-token="engraved-numeral"
            className="text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
          >
            {t('portraitCensus', {
              concepts: census.concepts,
              relations: census.relations,
            })}
          </span>
          <span aria-hidden>·</span>
          <span className="min-w-0 break-keep">{t('portraitScope')}</span>
        </span>
      </p>
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
 */
function DownloadPlate({
  published,
  primaryAsset,
}: {
  published: boolean;
  primaryAsset: ReturnType<typeof macosAssetFor>;
}) {
  const t = useTranslations('download');

  return (
    <div
      data-testid="download-plate"
      className="w-full max-w-[36rem] rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-6 shadow-[var(--shadow-elevation-2)] md:p-7"
    >
      <p className="font-mono text-caption uppercase leading-caption tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
        {t('eyebrow')}
      </p>
      {/* 헤드라인이 **배경을 가리킨다** — 이 문장이 성립하려면 뒤에 실제 지도가
          있어야 하고, 그래서 배경은 지울 수 없는 구성 요소가 된다. */}
      <h1 className="mt-2 text-display leading-display-tight font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]">
        {t('stageTitle')}
      </h1>
      <p className="mt-3 break-keep text-body leading-body text-[color:var(--color-text-secondary)]">
        {t('stageLead')}
      </p>

      <div className="mt-5 min-w-0">
        {published && primaryAsset ? (
          <PublishedActions primaryAsset={primaryAsset} />
        ) : (
          <PendingActions />
        )}
      </div>
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
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
        <a
          href={primaryAsset.downloadUrl}
          data-testid="download-primary-cta"
          className={cn(buttonVariants({ size: 'lg' }), 'rounded-chip')}
        >
          <Download size={16} aria-hidden />
          {t('primaryCtaPublished', { size: formatAssetSize(primaryAsset.sizeBytes) })}
        </a>
        {/* 채운 인디고는 화면당 하나 — Intel 은 막히면 안 되므로 같은 자리에
            두되 무게만 낮춘다. */}
        {intel ? (
          <a
            href={intel.downloadUrl}
            data-testid="download-macos-x64"
            className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'rounded-chip')}
          >
            <Download size={15} aria-hidden />
            {t('archIntelCta')}
            <span className="font-mono text-label leading-label text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]">
              {formatAssetSize(intel.sizeBytes)}
            </span>
          </a>
        ) : null}
      </div>

      <ReleaseFactLine />
      <TrustChips />
      <ArchHelp />
      <ChannelNote />
      <PlateFooterLinks />
    </div>
  );
}

/**
 * 판의 바닥 줄 — **받기 다음에 갈 수 있는 두 곳** (소유자 지시 2026-07-28:
 * *"다운로드, 웹 이동 하단에 깃허브 주소 이런 느낌으로 가자"*).
 *
 * 위의 버튼과 무게를 나눈다: 받는 것이 이 판의 일이고, 이 줄은 **안 받기로 한
 * 사람의 출구**다. 그래서 버튼이 아니라 글자다.
 *
 * 저장소 주소를 URL 그대로 쓰는 이유: 오픈소스에서 그 문자열은 링크가 아니라
 * **신원**이다. "소스 코드 보기" 라는 라벨은 어디로 가는지 감추지만
 * `github.com/wlsdks/ontology-atlas` 는 누가 만들었고 무엇을 볼 수 있는지를
 * 클릭 전에 말한다.
 */
function PlateFooterLinks() {
  const t = useTranslations('download');

  return (
    <div className="mt-4 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-[color:var(--color-divider)] pt-3.5">
      <Link
        href="/"
        data-testid="download-web-cta"
        className="touch-hit-expand inline-flex items-center text-label leading-label text-[color:var(--color-indigo-accent)] transition-colors hover:text-[color:var(--color-text-primary)]"
      >
        {t('webCta')}
      </Link>
      <span aria-hidden className="text-label text-[color:var(--color-text-quaternary)]">
        ·
      </span>
      <a
        href={GITHUB_REPOSITORY_URL}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="download-repo-link"
        className="touch-hit-expand inline-flex min-w-0 items-center gap-1.5 font-mono text-label leading-label text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
      >
        <ExternalLink size={12} aria-hidden className="shrink-0" />
        <span className="truncate">{GITHUB_REPOSITORY_LABEL}</span>
      </a>
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
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
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
        {t('macosPendingBody', { tag: `v${RELEASE_VERSION}` })}
      </p>

      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-caption leading-caption text-[color:var(--color-text-quaternary)]">
        <span>
          {RELEASE_MIN_MACOS}
          {t('factMinOsSuffix')}
        </span>
        <Dot />
        <span>DMG</span>
      </p>
    </div>
  );
}

/**
 * 버튼 바로 아래 한 줄 — 조사한 레퍼런스 8곳이 **전부** 여기에 두는 것이다
 * (Zed 는 버전 + 날짜 + 체인지로그, Ghostty 는 버전 + 릴리스 노트, OrbStack ·
 * Tailscale 은 최소 OS 를 버튼에 붙인다). 날짜가 버전과 짝인 이유: `v1.0.0`
 * 만으로는 이게 지난주 빌드인지 재작년 빌드인지 알 수 없다.
 */
function ReleaseFactLine() {
  const t = useTranslations('download');
  const format = useFormatter();
  const publishedAt = macosPublishedDate();

  return (
    <p
      data-testid="download-release-facts"
      className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-caption leading-caption text-[color:var(--color-text-quaternary)]"
    >
      <span>
        {RELEASE_MIN_MACOS}
        {t('factMinOsSuffix')}
      </span>
      <Dot />
      <span>DMG</span>
      <Dot />
      <span className="text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]">
        {MACOS_RELEASE.tag}
      </span>
      {publishedAt ? (
        <>
          <Dot />
          <span className="text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]">
            {format.dateTime(publishedAt, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              // 릴리스 시각의 진실원은 GitHub 이고 그쪽은 UTC 다. 방문자
              // 로컬 존으로 옮기면 같은 릴리스가 나라마다 하루씩 다른 날짜로
              // 보이고, 서버 렌더와 클라이언트 렌더가 어긋난다(테스트 환경이
              // `timeZone` 미지정을 경고하는 이유가 그것이다).
              timeZone: 'UTC',
            })}
          </span>
        </>
      ) : null}
      <Dot />
      <a
        href={MACOS_RELEASE.releaseUrl}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="download-release-notes-link"
        className="touch-hit-expand inline-flex items-center gap-1 transition-colors hover:text-[color:var(--color-text-secondary)]"
      >
        <ExternalLink size={11} aria-hidden />
        {t('releaseNotesLink')}
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
    <ul
      data-testid="download-trust-chips"
      className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5"
    >
      {[t('chipSigned'), t('chipChecksum'), t('chipPrivacy')].map((label) => (
        <li
          key={label}
          className="inline-flex items-center gap-1.5 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] px-2.5 py-1 text-label leading-label text-[color:var(--color-text-secondary)]"
        >
          <Check size={12} aria-hidden className="text-[color:var(--color-indigo-accent)]" />
          {label}
        </li>
      ))}
    </ul>
  );
}

/**
 * 정식이 아니라 **후보**라는 사실.
 *
 * 이 줄이 없으면 페이지는 둘 중 하나를 한다 — 후보를 정식처럼 내걸거나(거짓),
 * 서명된 파일이 있는데도 "아직 없습니다" 라고 하거나(구 동작, 역시 거짓).
 * 셋째 길은 그냥 말하는 것이다. 어조가 경고가 아니라 사실이라 amber 를 쓰지
 * 않는다 — 헌장의 amber 는 허브 · 레일 마크 · kind 톤 셋뿐이고 「후보 빌드」는
 * 그중 어느 것도 아니다.
 */
function ChannelNote() {
  const t = useTranslations('download');
  if (!isMacosPrerelease()) return null;

  return (
    <p
      data-testid="download-channel-note"
      className="mt-3 max-w-[var(--measure-prose)] break-keep border-l-2 border-[color:var(--color-border-strong)] pl-3 text-label leading-label text-[color:var(--color-text-tertiary)]"
    >
      <span className="text-[color:var(--color-text-secondary)]">{t('channelPrereleaseTitle')}</span>{' '}
      {t('channelPrereleaseBody')}
    </p>
  );
}

/**
 * 대부분의 방문자는 자기 맥이 Apple Silicon 인지 Intel 인지 모른다. 여기서
 * 막히면 페이지가 실패한 것이다.
 *
 * **브라우저가 대신 골라 줄 수는 없다.** `navigator.platform` 은 Apple Silicon
 * 에서도 `MacIntel` 을 돌려주고, deprecated 이며, Rosetta 아래서는 더 섞인다.
 * 조사한 레퍼런스 중 맥 아키텍처를 자동 판별하는 곳이 **한 곳도 없다** —
 * OrbStack · Cursor · Zed 전부 두 갈래 병렬이다. 추측해서 한쪽만 내밀면
 * 틀렸을 때 사용자가 열리지 않는 앱을 받고 이유를 모른다.
 *
 * 접이식인 이유: 이미 아는 사람(다수)에게 3행 문단은 매번 지나쳐야 하는 벽이고,
 * 모르는 사람에게는 한 번의 클릭이다. 요약 줄이 질문 형태라 닫혀 있을 때도
 * 여는 값이 읽힌다.
 */
function ArchHelp() {
  const t = useTranslations('download');

  return (
    <details data-testid="download-arch-help" className="group mt-3 min-w-0">
      <summary className="touch-hit-expand inline-flex cursor-pointer list-none items-center gap-1.5 text-label leading-label text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)] [&::-webkit-details-marker]:hidden">
        <ChevronRight
          size={13}
          aria-hidden
          className="shrink-0 transition-transform group-open:rotate-90"
        />
        {t('archHelpTitle')}
      </summary>
      <p className="mt-1.5 max-w-[var(--measure-prose)] break-keep pl-[1.15rem] text-label leading-label text-[color:var(--color-text-tertiary)]">
        {t('archHelpBody')}
      </p>
    </details>
  );
}

// ─── 파는 자리 ───────────────────────────────────────────────────────────────

/**
 * **이 페이지는 서비스를 판다** (소유자 판정 2026-07-28: *"이런 내용 설명이
 * 다운로드에 왜 필요해.. 이 페이지는 서비스를 홍보해야지?"*).
 *
 * 직전 판은 접힘 아래가 「설치 3단계」 + 「받아도 되는 이유」(서명·공증·체크섬·
 * `shasum` 명령)였다. 그건 **이미 사기로 마음먹은 사람을 위한 설치 안내서**의
 * 목차이지, 아직 이 물건이 뭔지도 모르는 사람에게 할 말이 아니다. 방문자가
 * 다운로드 페이지에서 세 번째로 읽는 문장이 `stapler validate 통과` 이면
 * 그 페이지는 자기가 무엇을 파는지 말한 적이 없는 것이다.
 *
 * 검증 사실은 **삭제하지 않았다** — 주장은 판 안의 칩 3개가, 증명은 푸터의
 * 접이식이 진다. 지우면 이 제품이 남보다 더 주는 것(레퍼런스 8곳 중 체크섬을
 * 내는 곳 0)을 스스로 버리는 것이고, 벽으로 세우면 파는 자리를 잡아먹는다.
 */
function Pitch() {
  const t = useTranslations('download');

  return (
    <section data-testid="download-pitch" className="pt-[var(--section-gap)]">
      <h2 className="max-w-[var(--measure-prose)] break-keep text-display leading-display font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]">
        {t('pitchTitle')}
      </h2>
      <p className="mt-3 max-w-[var(--measure-prose)] break-keep text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
        {t('pitchBody')}
      </p>
    </section>
  );
}

/**
 * 이 제품의 한 줄 정체성 — *agent-native, human-sovereign* — 을 화면으로
 * 만든 자리. 같은 폴더 하나를 사람과 에이전트가 **동시에 1급으로** 읽고 쓴다는
 * 주장은 조사한 레퍼런스 어디에도 없고, 그래서 여기가 이 페이지에서 유일하게
 * 남이 베낄 수 없는 문단이다.
 *
 * 두 열의 무게는 같다 — 한쪽을 부속으로 그리면 그 순간 "사람용 도구에 AI 붙임"
 * 또는 "AI 도구인데 사람도 봄" 이 되어 주장이 무너진다. 아래 합류 줄이
 * 그 둘을 다시 한 폴더로 묶는다.
 */
function TwoUsers() {
  const t = useTranslations('download');

  return (
    <section
      data-testid="download-two-users"
      className="mt-[var(--section-gap)] border-t border-[color:var(--color-divider)] pt-[var(--section-gap)]"
    >
      <h2 className="text-title leading-title font-semibold text-[color:var(--color-text-primary)]">
        {t('twoUsersTitle')}
      </h2>

      <div className="mt-5 grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2">
        <AudienceColumn
          eyebrow={t('humanEyebrow')}
          title={t('humanTitle')}
          body={t('humanBody')}
          facts={[t('humanFact1'), t('humanFact2')]}
        />
        <AudienceColumn
          eyebrow={t('agentEyebrow')}
          title={t('agentTitle')}
          body={t('agentBody')}
          facts={[
            t('agentFact1', { tools: MCP_TOOL_COUNT }),
            t('agentFact2', { commands: CLI_COMMAND_COUNT }),
          ]}
        />
      </div>

      <p className="mt-6 max-w-[var(--measure-prose)] break-keep border-l-2 border-[color:var(--color-indigo-a50)] pl-3 text-body leading-body text-[color:var(--color-text-secondary)]">
        {t('twoUsersJoin')}
      </p>
    </section>
  );
}

function AudienceColumn({
  eyebrow,
  title,
  body,
  facts,
}: {
  eyebrow: string;
  title: string;
  body: string;
  facts: readonly string[];
}) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-caption uppercase leading-caption tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
        {eyebrow}
      </p>
      <h3 className="mt-1.5 text-body-lg leading-body-lg font-semibold text-[color:var(--color-text-primary)]">
        {title}
      </h3>
      <p className="mt-1.5 break-keep text-body leading-body text-[color:var(--color-text-tertiary)]">
        {body}
      </p>
      <ul className="mt-3">
        {facts.map((fact) => (
          <li
            key={fact}
            className="flex min-w-0 items-baseline gap-2.5 border-t border-[color:var(--color-divider)] py-2 text-label leading-label text-[color:var(--color-text-secondary)]"
          >
            <Check
              size={12}
              aria-hidden
              className="shrink-0 translate-y-0.5 text-[color:var(--color-indigo-accent)]"
            />
            <span className="min-w-0 break-keep">{fact}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── 설치 트랙 ───────────────────────────────────────────────────────────────

/**
 * 상자가 아니라 **트랙**이다. 세 단계는 순서가 있는 한 벌이므로, 나란한 카드
 * 셋(= 동시에 고르는 선택지처럼 읽힌다)이 아니라 왼쪽 괘선 하나를 공유하는
 * 세로 흐름으로 그린다.
 */
function InstallTrack() {
  const t = useTranslations('download');

  return (
    <section
      aria-labelledby="download-install-heading"
      data-testid="download-install"
      className="pt-[var(--section-gap)]"
    >
      <h2
        id="download-install-heading"
        className="text-title leading-title font-semibold text-[color:var(--color-text-primary)]"
      >
        {t('installTitle')}
      </h2>

      <ol className="mt-4 border-l border-[color:var(--color-divider)]">
        <InstallStep index="01" title={t('step1Title')} body={t('step1Body')} />
        <InstallStep index="02" title={t('step2Title')} body={t('step2Body')} />
        <InstallStep
          index="03"
          title={t('step3Title')}
          body={t('step3Body', { tools: MCP_TOOL_COUNT, commands: CLI_COMMAND_COUNT })}
        />
      </ol>

      {/* 설치한 사람에게 이 페이지는 마지막 방문이어야 한다. */}
      <p className="mt-4 break-keep text-label leading-label text-[color:var(--color-text-quaternary)]">
        {t('updateNote')}
      </p>
    </section>
  );
}

function InstallStep({ index, title, body }: { index: string; title: string; body: string }) {
  return (
    <li className="flex min-w-0 gap-4 pb-5 pl-5 last:pb-0">
      <span className="shrink-0 font-mono text-label leading-body tracking-[0.1em] text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]">
        {index}
      </span>
      <div className="min-w-0">
        <h3 className="text-body leading-body font-semibold text-[color:var(--color-text-primary)]">
          {title}
        </h3>
        {/* 두 줄 자리를 예약한다 — 반복 세트의 치수는 설계 결정이지 글자 수의
            부산물이 아니다. */}
        <p className="mt-1 min-h-[calc(var(--leading-label)*2)] max-w-[var(--measure-prose)] break-keep text-label leading-label text-[color:var(--color-text-tertiary)]">
          {body}
        </p>
      </div>
    </li>
  );
}

// ─── 검증 — 푸터의 접이식 ─────────────────────────────────────────────────────

/**
 * 벽이 아니라 **각주**다. 소유자 판정("이 페이지는 서비스를 홍보해야지")에
 * 따라 본문에서 내려왔지만 삭제하지는 않았다 — 서명·공증·체크섬은 이 제품이
 * 레퍼런스 8곳 중 유일하게 페이지에 내는 사실이라, 확인하러 온 사람에게는
 * 여전히 여기 있어야 한다. 닫힌 기본값 + 요약 한 줄이 그 둘을 다 만족한다.
 */

function VerifyDetails({
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
    <details data-testid="download-trust" className="group min-w-0">
      <summary className="touch-hit-expand inline-flex cursor-pointer list-none items-center gap-1.5 text-label leading-label text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)] [&::-webkit-details-marker]:hidden">
        <ChevronRight
          size={13}
          aria-hidden
          className="shrink-0 transition-transform group-open:rotate-90"
        />
        {t('trustHeading')}
      </summary>

      <div className="mt-3">
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
        <TrustFact label={t('proofPrivacy')} body={t('trustPrivacyNote')} last />

        <p className="mt-3 break-keep text-label leading-label text-[color:var(--color-text-quaternary)]">
          {published
            ? t('trustPolicyPublished', { tag: MACOS_RELEASE.tag })
            : /* 위 미게시 주석과 같은 이유 — 아직 안 나온 빌드는 개발 중 버전으로 부른다. */
              t('trustPolicyPending', { tag: `v${RELEASE_VERSION}` })}
        </p>
      </div>
    </details>
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
          size={13}
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
        className="touch-hit-expand inline-flex h-7 shrink-0 items-center gap-1.5 rounded-chip border border-[color:var(--color-border-soft)] px-2 font-mono text-caption leading-caption text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
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

// ─── 다른 환경 ───────────────────────────────────────────────────────────────

/**
 * Windows 방문자는 침묵당하지 않는다. 다만 macOS 와 같은 무게를 주면 "두
 * 플랫폼이 대등하게 있다" 로 읽히므로 한 행으로 낮춘다.
 */
function ElsewhereRows() {
  const t = useTranslations('download');

  return (
    <section className="mt-[var(--section-gap)] border-t border-[color:var(--color-divider)] pt-[var(--section-gap)]">
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
    </section>
  );
}
