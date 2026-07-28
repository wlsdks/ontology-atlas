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
import { RELEASE_MIN_MACOS, RELEASE_VERSION, buildDmgName } from '../lib/release-facts';
import {
  ARCH_ORDER,
  MACOS_RELEASE,
  WINDOWS_STATUS,
  formatAssetSize,
  isMacosReleasePublished,
  macosAssetFor,
  macosPublishedDate,
  type DesktopArch,
} from '../lib/release-state';
import { StageMap, useStageGraph } from './StageMap';

const GITHUB_REPOSITORY_URL = 'https://github.com/wlsdks/ontology-atlas';
/** 링크 텍스트는 주소 그대로 — 오픈소스에서 이 문자열은 라벨이 아니라 신원이다. */
const GITHUB_REPOSITORY_LABEL = 'github.com/wlsdks/ontology-atlas';

/**
 * **이 페이지의 그리드는 한 벌이다** (2026-07-29 카운슬 평결 ③).
 *
 * 홈통 하나(24px / md+ 40px)에서 시작해 `--page-max` 에서 멈춘다. `mx-auto` 는
 * 없다 — 무대의 판이 왼쪽에 붙는 설계인데 바깥 래퍼만 재중앙정렬하면 폭마다
 * 다른 x 가 나온다(실측 2026-07-29: 1920 에서 판 x=160·판 오른끝 640 인데
 * 카메라가 예약한 인셋은 544 라 **+96 어긋남**, 2560 에서 **+416**. 게다가
 * 바닥 절은 `--page-col-utility` 로 또 한 번 중앙정렬돼 x=480 — 판 160 과
 * 아무것도 정렬되지 않았다).
 *
 * 이제 GNB 로고 · 헤드라인 · 판 · 캡션 · 바닥 띠가 **모든 폭에서 같은 x** 에
 * 선다. 게이트: `tests/e2e/download-gateway-grid.spec.ts`.
 */
const PAGE_GUTTER =
  'px-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] md:px-10';
/** 홈통 안쪽의 단 하나뿐인 컬럼 — 왼쪽 고정, `--page-max` 에서 정지. */
const PAGE_COLUMN = 'w-full max-w-[var(--page-max)]';
/** 무대의 말 기둥과 판이 공유하는 폭. 카메라 인셋(544 = 40 + 480 + 24)의 짝. */
const STAGE_COLUMN = 'w-full max-w-[30rem]';

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
 * 깔린 것은 목업도 일러스트도 아니라 이 저장소 vault 를 **실제 지도 엔진**
 * (`StageMap` → `TopologyMapV2`)으로 그린 것이다 — `/` 가 쓰는 그 엔진이라
 * 끌면 밀리고 노드를 누르면 초점이 잡힌다. 그래서 히어로의
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
 * **카드/패널급 컨테이너** 보더는 다운로드 판 하나뿐이며, 그건 지도 위에 떠
 * 있어야 해서 불투명 판이 필요하기 때문이다(반투명은 헌장 금지). 칩·구분선·
 * 코드박스 같은 컴팩트 마크는 별개다 — 구 주석이 "보더 전면 금지" 로 읽혀
 * 실제 구현(신뢰 칩·체크섬 행·검증 코드박스)과 어긋났다(체계석 지적).
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

      <main id="main" className="flex min-w-0 flex-1 flex-col bg-[color:var(--color-canvas)]">
        <PortraitStage published={published} primaryAsset={primaryAsset} />

        {/*
         * **바닥 띠** — 절이 아니라 한 벌의 꼬리다 (2026-07-29 평결 ③).
         *
         * 예전엔 설치 3단이 자기 괘선(`border-t pt-10`)과 64px 여백을 가진
         * **절**이었고, 그 아래 푸터가 또 괘선을 그었다. 관문 한 장에 절이 셋
         * (무대·설치·검증)이면 위계가 아니라 목록이다. 무대의 아래 보더가 이미
         * "여기서부터는 부록" 을 말하므로 설치 줄은 자기 괘선을 반납한다 —
         * 남는 괘선은 푸터의 것 하나다.
         */}
        <div
          className={cn(
            PAGE_GUTTER,
            'shrink-0 pt-6 pb-[max(var(--page-bottom-breath),env(safe-area-inset-bottom))]',
          )}
        >
          <div className={PAGE_COLUMN}>
            <InstallTrack />

            <footer className="mt-5 border-t border-[color:var(--color-divider)] pt-4 text-label leading-label text-[color:var(--color-text-quaternary)]">
              <VerifyDetails published={published} primaryAsset={primaryAsset} />
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
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
      className={cn(
        PAGE_GUTTER,
        'sticky top-0 z-30 w-full shrink-0 border-b border-[color:var(--color-divider)] bg-[color:var(--color-canvas)]',
      )}
    >
      {/* `flex-wrap` 을 뺀 이유: 좁은 폭에서 줄바꿈이 일어나면 관문의 얼굴이
          97px 짜리 두 줄이 되어 무대를 먹는다(실측 390px). 대신 접히는 것은
          **빵부스러기**다 — 이 라우트가 어디인지는 좁은 화면에서도 제목이
          말하고, 로고와 돌아가기는 어느 폭에서도 남아야 한다. */}
      <div
        className={cn(
          PAGE_COLUMN,
          'flex min-h-14 items-center gap-3 py-2.5 md:min-h-16 md:py-3',
        )}
      >
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
 * ## 높이 — 고정 바닥이 아니라 남는 자리 전부
 *
 * 구 `lg:min-h-[min(46rem,88vh)]` 는 두 상수(736px · 88%)를 곱해 놓고 실제
 * 창 높이와는 무관하게 굴었다. 그래서 1512×850(실제로 가장 흔한 창)에서
 * 무대 736 + GNB 65 + 바닥 절 320 = 1121 로 **270px 이 접혔고**, 그 접힌
 * 부분이 하필 "설치 3단" 이었다.
 *
 * 이제는 셸이 준 높이에서 GNB 와 바닥 띠를 뺀 나머지를 무대가 **전부** 갖는다
 * (`lg:flex-1`). 바닥(`lg:min-h-[34rem]`)만 남겨 아주 낮은 창에서 무대가
 * 찌그러지지 않게 한다. 내용이 그보다 커지면(좁은 폭·긴 번역문) 무대가 늘어나야지
 * 판이 잘리면 안 된다.
 */
function PortraitStage({
  published,
  primaryAsset,
}: {
  published: boolean;
  primaryAsset: ReturnType<typeof macosAssetFor>;
}) {
  const t = useTranslations('download');
  const graph = useStageGraph();

  return (
    <section
      data-testid="download-stage"
      className="relative isolate flex w-full flex-col overflow-hidden border-b border-[color:var(--color-divider)] lg:min-h-[34rem] lg:flex-1"
    >
      {/*
       * 지도의 자리가 폭에 따라 **바뀐다** (위계석 P6, 2026-07-28 실측).
       *
       * `lg+` — 무대 전체를 덮는 배경. 판이 그 위에 뜬다.
       * `<lg` — 판 **위**의 띠. 배경으로 두면 판이 무대의 68.7% 를 덮어서
       *   화면에 남는 지도가 오른쪽 끝에 반쯤 잘린 클러스터 칩 하나뿐이었다.
       *   그 위에서 리드가 "뒤에 보이는 지도는…" 이라고 말했다 — **없는 것을
       *   가리키는 헤드라인은 죽은 CTA 와 같은 등급의 결함**이다.
       *
       * 리드 문구도 같이 고쳤다: "뒤에 보이는" 을 뺐다. 방위를 말하면 두 배치
       * 중 하나에서 반드시 틀리므로, 어느 쪽에서도 참인 "이 지도는" 으로 쓴다.
       */}
      <div className="relative h-[17rem] w-full shrink-0 border-b border-[color:var(--color-divider)] lg:absolute lg:inset-0 lg:h-auto lg:border-b-0">
        <StageMap graph={graph} />
      </div>

      {/* 지도의 자기 캡션 — **지도 바로 뒤**에 온다.

          ⚠️ DOM 순서가 지도 다음인 이유: `<lg` 에서 지도는 흐름 안의 띠이고
          판이 그 아래 오는데, 캡션을 무대 맨 끝에 두면 지도를 설명하는 줄이
          판을 건너뛰어 **600px 아래 고아**가 된다(실측 390px). 데스크톱에서는
          지도가 절대 배치(흐름 밖)라 흐름은 판 하나뿐이므로, `lg:order-last`
          로 캡션을 판 아래 바닥에 돌려놓는다 — 두 폭 모두에서 캡션이 자기가
          설명하는 것 옆에 붙는다. 배경이 무엇인지 말하지 않으면 그건
          증거가 아니라 벽지다.

          ⚠️ **정상 흐름**이다(absolute 아님). 절대 배치로 바닥에 붙였더니
          390px 에서 판이 길어지면서 캡션과 11px 겹쳤다(실측 2026-07-28) —
          겹침은 결함이고, 폭마다 판 높이가 달라지는 표면에서 절대 배치는
          그 결함을 폭의 함수로 만든다. 흐름에 두면 어느 폭에서도 겹칠 수 없다.

          [download-honesty] 이 숫자는 **바로 옆에 그려진 그래프 자신**이다
          (2026-07-29 평결 ①). 예전엔 빌드 스크립트가 센 frontmatter 파일 수(96)를
          적었는데, 지도가 그리는 것은 그 파일들에서 **파생된** 그래프(287 노드)라
          한 화면에 정의가 둘이었다. 허브 각인이 `379` 를 말하고 그 옆 캡션이
          `96` 을 말하던 4배 모순의 뿌리가 이것이다 — 재귀 버그는 그 위에 얹힌
          두 번째 층이었을 뿐이다. 앱에서 자기 폴더를 열면 자기 그래프의 숫자가
          같은 규칙으로 나온다(그래서 뒷절이 "내 숫자가 보여요" 다). */}
      <p
        data-testid="download-portrait-caption"
        className={cn(
          PAGE_GUTTER,
          'pointer-events-none relative shrink-0 pt-3 pb-4 lg:order-last lg:pt-0',
        )}
      >
        <span
          className={cn(
            PAGE_COLUMN,
            'flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-caption leading-caption text-[color:var(--color-text-quaternary)]',
          )}
        >
          <span className="uppercase tracking-[0.18em]">docs/ontology</span>
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
          {/* 「만질 수 있음」의 **보이는** 지시자 (2026-07-28 모션석 처방 +
              소유자 재보고 *"드래그도 되고 그랬으면 좋겠는데"* — 캡션의
              흐린 절로는 여전히 안 읽혔다. 그래서 다른 절보다 한 단 밝게
              두고 문구도 명령형으로 짧게 만든다).
              그전까지 촉각 신호 셋이 전부 정지 프레임에서 안 보였다 —
              `cursor: grab` 은 포인터가 이미 거기 있어야 발동하고,
              `aria-label` 은 스크린리더 전용이고, 클러스터 힌트는 sr-only 다.
              왼쪽 판을 보고 있는 방문자는 영영 모른다. 새 크롬을 만들지 않고
              이미 있는 캡션 줄에 절을 하나 더한다(화살표·아이콘 없음). */}
          <span className="min-w-0 break-keep text-[color:var(--color-text-tertiary)]">
            {t('portraitHint')}
          </span>
          <span aria-hidden>·</span>
          <span className="min-w-0 break-keep">{t('portraitScope')}</span>
        </span>
      </p>
      {/*
       * ⚠️ `pointer-events-none` 이 **이 무대의 드래그를 살리는 유일한 줄**이다.
       *
       * 이 래퍼는 판을 컬럼 안에 앉히려고 둔 투명 상자인데, 무대 **전폭**을
       * 덮는다. 배경이 없어 눈에는 안 보이지만 포인터는 전부 여기서 멈춘다 —
       * 실측(2026-07-29, `elementFromPoint`): 무대의 55% · 70% · 85% 지점 전부
       * 캔버스가 아니라 이 div 가 잡혔다. 소유자가 *"클릭해서 움직이는것도
       * 안되고 그냥 화면에 고정된 상태"* 라고 한 것이 정확히 이것이고,
       * **드래그는 처음부터 한 번도 가능한 적이 없었다.**
       *
       * 내가 앞서 "드래그 작동 확인" 이라고 보고한 것은 캔버스 엘리먼트에
       * 이벤트를 **직접 디스패치**해 핸들러만 확인한 것이었다 — 히트 테스트를
       * 건너뛰었으므로 통과할 수밖에 없었다. 사람이 쓰는 경로를 안 잰 검증이다.
       */}
      <div
        className={cn(
          PAGE_GUTTER,
          // `lg` 에서 여백을 더 주지 않는다: 무대가 `flex-1` 이라 넉넉한 창에서는
          // 컬럼이 어차피 수직 중앙에 앉고, 패딩이 실제로 무는 것은 **짧은 창**
          // 뿐이다 — 거기서 이 40px 두 겹이 곧 스크롤이다(실측 1512×850: py-12
          // 이면 5px 초과).
          'pointer-events-none relative flex min-w-0 flex-1 items-center py-10',
        )}
      >
        <div className={PAGE_COLUMN}>
          {/* 말 기둥과 판은 **같은 컬럼**이다 — 둘의 왼쪽 모서리도 오른쪽
              모서리도 같은 선에 선다(40 / 520). 그 520 이 곧 카메라가 예약한
              인셋 544 의 짝이다. `pointer-events-auto` 는 이 컬럼에만 — 바깥
              래퍼가 무대 전폭을 덮는 투명 상자라 그대로 두면 드래그를 삼킨다
              (2026-07-29 실측 전과: `elementFromPoint` 로만 잡히는 결함). */}
          <div className={cn(STAGE_COLUMN, 'pointer-events-auto')}>
            <StageWordmark />
            <DownloadPlate published={published} primaryAsset={primaryAsset} />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * **말 기둥** — 판 밖, 지도 위 (2026-07-29 카운슬 평결 ③).
 *
 * 예전엔 헤드라인·리드가 다운로드 판 **안**에 살았다. 그러면 카드 하나가 두
 * 가지 일을 한다: 제품을 파는 일과 파일을 건네는 일. 둘의 무게가 같아지면
 * 카드는 "무엇을 결정하는 자리인지" 를 말하지 못하고, 실제로 그 판은 530px 로
 * 자라 무대의 72% 를 덮었다.
 *
 * 이제 파는 말은 캔버스 위에 직접 서고, 판은 거래만 담는다. 헤드라인이
 * **배경을 가리킬 수 있는 것**도 이 배치라야 참이다 — 카드 안에서 배경을
 * 가리키면 그건 카드 이야기지 화면 이야기가 아니다.
 *
 * 말 기둥의 리듬은 8 / 16 / 32 다: eyebrow→H1 은 한 덩어리라 가장 가깝고,
 * H1→리드는 한 호흡, 리드→판은 **말에서 거래로 넘어가는 유일한 경계**라 그
 * 두 배다.
 */
function StageWordmark() {
  const t = useTranslations('download');

  return (
    <div className="min-w-0">
      <p className="font-mono text-caption uppercase leading-caption tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
        {t('eyebrow')}
      </p>
      {/* 헤드라인이 **배경을 가리킨다** — 이 문장이 성립하려면 뒤에 실제 지도가
          있어야 하고, 그래서 배경은 지울 수 없는 구성 요소가 된다. */}
      <h1 className="mt-2 whitespace-pre-line text-display leading-display-tight font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)] md:text-hero-lg md:leading-hero-lg md:tracking-[var(--tracking-hero)]">
        {t('stageTitle')}
      </h1>
      <p className="mt-4 break-keep text-body leading-body text-[color:var(--color-text-tertiary)]">
        {t('stageLead')}
      </p>
    </div>
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
 * 괘선+출구. 파는 말은 위 `StageWordmark` 가 가졌다.
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
      className="mt-8 min-w-0 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-4 shadow-[var(--shadow-elevation-2)] sm:p-6 md:p-7"
    >
      {published && primaryAsset ? (
        <PublishedActions primaryAsset={primaryAsset} />
      ) : (
        <PendingActions />
      )}
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
          className={cn(buttonVariants({ size: 'lg' }), 'rounded-chip px-4 sm:px-6')}
        >
          <Download size={16} aria-hidden />
          {t('primaryCtaPublished')}
          <AssetSize bytes={primaryAsset.sizeBytes} onFill />
        </a>
        {/* 채운 인디고는 화면당 하나 — Intel 은 막히면 안 되므로 같은 자리에
            두되 무게만 낮춘다. */}
        {intel ? (
          <a
            href={intel.downloadUrl}
            data-testid="download-macos-x64"
            className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'rounded-chip px-4 sm:px-6')}
          >
            <Download size={15} aria-hidden />
            {t('archIntelCta')}
            <AssetSize bytes={intel.sizeBytes} />
          </a>
        ) : null}
      </div>

      <ReleaseFactLine />
      <TrustChips />
      <PlatformStatus />
      <PlateFooterLinks />
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
        // 합성 대비가 3.45:1 로 떨어졌다(11px 텍스트, 실측 2026-07-29) — 라벨
        // 자신이 4.42:1 인 표면이라 여기서 한 단만 낮춰도 바로 밑으로 뚫린다.
        // 크기와 라벨을 가르는 것은 이미 mono 페이스와 간격이 한다.
        onFill
          ? 'text-[color:var(--color-text-primary)]'
          : 'text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]',
      )}
    >
      {formatAssetSize(bytes)}
    </span>
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
    <div className="mt-5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-[color:var(--color-divider)] pt-3.5">
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
          className={cn(buttonVariants({ size: 'lg' }), 'rounded-chip px-4 sm:px-6')}
        >
          {t('webCta')}
        </Link>
        <MacosDownloadLink
          data-testid="download-primary-cta"
          className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'rounded-chip px-4 sm:px-6')}
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

      <p className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-label leading-label text-[color:var(--color-text-quaternary)]">
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
function ReleaseFactLine() {
  const t = useTranslations('download');
  const format = useFormatter();
  const publishedAt = macosPublishedDate();

  return (
    <p
      data-testid="download-release-facts"
      className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-label leading-label text-[color:var(--color-text-quaternary)]"
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
        className="touch-hit-expand inline-flex items-baseline gap-1.5 transition-colors hover:text-[color:var(--color-text-secondary)]"
      >
        <ExternalLink size={11} aria-hidden className="shrink-0 self-center" />
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
      className="mt-5 flex min-w-0 items-baseline gap-2 break-keep text-label leading-label text-[color:var(--color-text-tertiary)]"
    >
      <Check
        size={12}
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
    { i: '01', label: t('step1Title') },
    { i: '02', label: t('step2Title') },
    { i: '03', label: t('step3Title') },
  ];

  return (
    <section data-testid="download-install" aria-label={t('installTitle')}>
      <ol className="grid grid-cols-1 gap-x-10 gap-y-2 sm:grid-cols-3">
        {steps.map((step) => (
          <li key={step.i} className="flex min-w-0 items-baseline gap-3">
            <span className="shrink-0 font-mono text-label leading-label text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]">
              {step.i}
            </span>
            <span className="min-w-0 break-keep text-label leading-label text-[color:var(--color-text-secondary)]">
              {step.label}
            </span>
          </li>
        ))}
      </ol>
    </section>
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

        <p className="mt-3 break-keep text-label leading-label text-[color:var(--color-text-quaternary)]">
          {published
            ? t('trustPolicyPublished', { tag: MACOS_RELEASE.tag })
            : /* 위 미게시 주석과 같은 이유 — 아직 안 나온 빌드는 개발 중 버전으로 부른다. */
              t('trustPolicyPending', { tag: `v${RELEASE_VERSION}` })}
        </p>
        {/* 판에서 내려온 정책 절 — "같은 기준을 통과할 때 올립니다" 는 결정
            재료가 아니라 정책 산문이라 여기 산다(fable 판정 2026-07-29).
            판에는 결정 사실 둘만 남는다: 없다 · 어디서 추적하나. */}
        <p className="mt-2 break-keep text-label leading-label text-[color:var(--color-text-quaternary)]">
          {t('windowsPolicy')}
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
 * 플랫폼 상태 — **판 안**이다 (소유자 판정 2026-07-29: *"이거는 하단이 아니라
 * 상단 다운로드 하는데 적어놔야지.. 그래야 바로 알"*).
 *
 * 예전에는 접힘 아래 별도 행이었다. 그런데 이 사실이 필요한 순간은 **버튼을
 * 보는 순간**이다 — 윈도우 사용자가 스크롤을 내려야 자기가 못 받는다는 걸
 * 아는 것은 늦다. 받는 자리에서 바로 말한다.
 */
function PlatformStatus() {
  const t = useTranslations('download');

  return (
    <p
      data-testid="download-platform-windows"
      className="mt-2.5 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-label leading-label text-[color:var(--color-text-quaternary)]"
    >
      <span className="break-keep">{t('platformStatus')}</span>
      <a
        href={WINDOWS_STATUS.trackingUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="touch-hit-expand inline-flex items-center gap-1 transition-colors hover:text-[color:var(--color-text-secondary)]"
      >
        <ExternalLink size={11} aria-hidden />
        {t('windowsTrackCta')}
      </a>
    </p>
  );
}
