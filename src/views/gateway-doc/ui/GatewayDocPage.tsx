'use client';

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { GatewayNav, GatewayReadingLinks } from '@/widgets/gateway-chrome';
import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/gateway-frame';
import { GITHUB_REPO_URL } from '@/shared/config/social-links';
import { ChevronRight } from 'lucide-react';
import { GithubMark } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import {
  extractEntries,
  normalizeHeadingKey,
  readVaultDoc,
  trimToRecentSections,
  type DocEntry,
} from '../lib/vault-doc';
import { GUIDE_ENTRY_PAGE, GUIDE_PAGES, type GuidePage } from '../model/guide-pages';
import { Link } from '@/i18n/navigation';
import { controlClass } from '@/shared/ui/control-class';

/**
 * 관문의 **읽을거리 한 장** — `/guide` 와 `/changelog` 가 같은 이 뷰를 쓴다.
 *
 * ## 이 화면의 일
 *
 * 받기 전에 판단하려는 사람이 읽는 자리다. 관문 자체는 5초 안에 신뢰를 버는
 * 것이 일이라 문장이 짧고, 그 이상을 원하는 사람이 갈 곳이 여기까지 없었다
 * (원장 2026-07-28 「이 페이지는 자기가 뭔지 말한 적이 없다」의 남은 절반).
 *
 * ## 왜 「블로그처럼」이 산문에 맞는 결정인가
 *
 * 지도·문서함·공방은 **작업 표면**이라 밀도가 높고 크롬이 많다. 이 화면은
 * 반대로 **읽는 표면**이다. 그래서 셋을 바꾼다:
 *
 * 1. **한 줄에 65~75자** — `--measure-prose`. 워크벤치의 전폭 컬럼은 산문에서
 *    눈이 다음 줄 첫 글자를 못 찾게 만든다.
 * 2. **본문 행간 `leading-prose`** — 사람이 쓴 글의 짝이다(`design.md`
 *    「행간도 크기의 짝이다」). UI 텍스트의 촘촘한 행간은 문단에서 답답하다.
 * 3. **절 사이 여백을 크게** — 스캔이 아니라 순서대로 읽는 글이라 리듬이
 *    목차 대신 위계를 진다.
 *
 * 채색은 그대로 무채색 + 단일 인디고다. 「블로그처럼 예쁘게」가 새 색이나
 * 그라디언트를 여는 뜻은 아니다 — 헌장은 이 표면에도 그대로 적용된다.
 */
export interface GatewayDocPageProps {
  /** 볼트 슬러그 — `GUIDE` · `CHANGELOG`. */
  slug: string;
  /** 화면 제목. 볼트 문서의 `# H1` 대신 이걸 쓴다(번역되어야 하므로). */
  title: string;
  /**
   * 제목 아래 한 줄. **없으면 안 그린다.**
   *
   * 가이드의 부제는 가이드 **전체**를 소개하는 문장이라 매 장에 되풀이하면
   * 각 장의 제목과 경쟁하는 잉크가 된다 — 차례의 첫 장에서만 준다.
   */
  lead?: string;
  /**
   * `## ` 절을 몇 개까지 그릴지. 안 주면 전문.
   *
   * CHANGELOG 처럼 계속 자라는 문서에만 준다 — 가이드는 통째로 읽는 글이라
   * 자르면 안 된다.
   */
  recentSectionLimit?: number;
  /** 원문 파일의 저장소 내 경로 — 잘렸을 때 "나머지는 여기" 로 쓴다. */
  sourcePath: string;
  /**
   * 왼쪽 차례를 그릴지 — 가이드처럼 **여러 장이 한 벌**인 문서만 true.
   *
   * 변경 내역은 한 장짜리라 차례가 없다. 항목이 하나뿐인 목록은 길잡이가 아니라
   * 잉크다.
   */
  sidebar?: boolean;
  /** 차례에서 지금 어느 장인지 — `sidebar` 가 true 일 때만 쓴다. */
  activeSegment?: string;
  /**
   * 왼쪽에 **이 문서의 `## ` 항목 목록**을 그릴지 (변경 내역용).
   *
   * 가이드의 `sidebar` 와 다른 물건이다: 저쪽은 **여러 문서**의 차례이고 이쪽은
   * **한 문서 안**의 항목이라 링크가 라우트가 아니라 앵커다. 둘을 한 플래그로
   * 묶으면 "차례" 라는 말이 두 가지를 가리키게 된다.
   */
  entryNav?: boolean;
}

export function GatewayDocPage({
  slug,
  title,
  lead,
  recentSectionLimit,
  sourcePath,
  sidebar = false,
  activeSegment,
  entryNav = false,
}: GatewayDocPageProps) {
  const t = useTranslations('gatewayNav');

  const { body, omittedSections } = useMemo(() => {
    const raw = readVaultDoc(slug);
    if (raw === null) return { body: '', omittedSections: 0 };
    /*
     * 볼트 문서의 첫 `# H1` 은 지운다 — 화면 제목이 이미 그 자리를 쓰고,
     * 번역된 제목과 원문 제목이 나란히 서면 같은 것이 두 번 나온다.
     */
    const withoutH1 = raw.replace(/^#\s+.*(\r?\n)+/, '');
    return recentSectionLimit
      ? trimToRecentSections(withoutH1, recentSectionLimit)
      : { body: withoutH1, omittedSections: 0 };
  }, [slug, recentSectionLimit]);

  /**
   * 항목 목록과 본문 제목의 id 는 **같은 함수**가 낸다 — 두 곳이 각자 만들면
   * 규칙이 조금만 달라도 앵커가 조용히 아무 데도 안 간다.
   */
  const entries = useMemo(() => (entryNav ? extractEntries(body) : []), [entryNav, body]);
  const headingIds = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of entries) {
      const key = normalizeHeadingKey(entry.heading);
      if (!map.has(key)) map.set(key, entry.id);
    }
    return map;
  }, [entries]);

  const components = useMemo(
    () => (entryNav ? proseComponentsWithAnchors(headingIds) : PROSE_COMPONENTS),
    [entryNav, headingIds],
  );

  return (
    <div className="flex min-h-full w-full flex-col bg-[color:var(--color-canvas)]">
      <GatewayNav />

      {/*
       * **읽는 페이지는 산문 기둥을 가운데 세운다** (2026-07-31, 소유자:
       * *"왼쪽에 다 몰려있고"*).
       *
       * ⚠️ 처음엔 관문의 「모든 원소가 같은 x」(2026-07-29 평결 ③)를 그대로
       * 적용해 원점(200)에 왼쪽 정렬했다. **그 규칙을 사정거리 밖에 쓴 것이다.**
       * 그 평결이 존재하는 이유는 랜딩의 **오른쪽에 지도가 있고** 판이 그 앞을
       * 가리면 안 되기 때문인데, 이 페이지의 오른쪽에는 아무것도 없다. 규칙만
       * 남고 이유가 사라진 자리에서 같은 규칙은 1920 기준 **1053px 을 비운
       * 한쪽 쏠린 페이지**를 만든다.
       *
       * ⚠️⚠️ `mx-auto` 는 한때 **기각된 패턴**이다(평결 ③ 재확인). 그때의 기각
       * 사유는 "중앙정렬이 나빠서" 가 아니라 **원점이 둘이 되기 때문**이었다 —
       * 래퍼는 뷰포트를 보고 중앙에 서는데 지도 카메라의 예약폭은 토큰을 보고
       * 서서, 넓은 화면에서 둘이 어긋났다. **이 페이지에는 카메라가 없다.**
       * 경쟁할 두 번째 소비자가 없으므로 그 사유가 성립하지 않는다. 다음
       * 감사자가 `mx-auto` 만 보고 "부활했다" 고 읽지 않도록 여기 적어 둔다.
       *
       * 크롬(상단 바)은 그대로 원점을 쓴다 — 그건 모든 관문 표면이 공유하는
       * 프레임이고, 로고가 페이지마다 다른 x 에 서면 그게 더 나쁘다.
       */}
      <main
        className={cn(
          PAGE_GUTTER,
          'w-full flex-1 pt-10 md:pt-16',
          /*
           * 하단 예약고 — `<lg` 에는 탭바가 있고 이 페이지는 스크롤되는 문서다.
           * 종전 `pb-20`(80px)로도 넘치지 않았던 것은 마지막 잉크가 본문 끝이라
           * 우연히 들어맞았기 때문이고, 읽을거리 줄을 아래에 놓자 **여유 23px**
           * 로 탭바에 가렸다(`scroll-end-gap` 390×844 가 잡았다).
           *
           * 조건 없는 기본값 + `lg:` 덮어쓰기로 쓴다 — `max-lg:` 변형은 다른
           * 변형보다 스타일시트에 먼저 나올 수 있어 조용히 진다(`design.md`
           * 「CSS 순서 함정」).
           */
          'pb-[calc(var(--topology-mobile-bottom-tab-reserve)+var(--page-bottom-breath))] lg:pb-20',
        )}
      >
        <div className={cn(PAGE_COLUMN, 'mx-auto')}>
          {/*
           * 차례가 있을 때만 두 열이 된다. 없으면 한 열을 가운데 세운다.
           *
           * ⚠️ 차례는 `lg` 미만에서 **접는다**. 좁은 폭에서 사이드바를 남기면
           * 산문 기둥이 목록에게 폭을 빼앗겨, 정작 읽으러 온 것이 못 읽을 폭이
           * 된다. 접힌 자리는 크롬의 「가이드」 칩이 대신한다 — 목록이 없어도
           * 가이드로 돌아올 길은 남는다.
           */}
          <div
            className={cn(
              sidebar || entryNav
                ? 'lg:grid lg:grid-cols-[15rem_minmax(0,1fr)_15rem] lg:gap-12'
                : 'flex flex-col items-center',
            )}
          >
            {sidebar ? <GuideSidebar activeSegment={activeSegment} /> : null}
            {entryNav ? <EntrySidebar entries={entries} /> : null}
            <div className="flex min-w-0 flex-col items-center">
          <header className="w-full max-w-[var(--measure-prose)]">
            <h1
              data-testid="gateway-doc-title"
              /*
               * 램프 최상단(`--text-hero-lg` 34px)을 쓴다 — 관문 헤드라인과 같은
               * 단이다. 이 페이지들도 관문 표면이고 이 줄이 그 페이지의 헤드라인이라
               * 같은 자리에 서는 것이 맞다. 새 스텝은 만들지 않았다(램프 밖 크기는
               * `cn.ts` 의 `TYPE_RAMP_STEPS` 등록 없이는 조용히 드롭된다).
               *
               * 행간은 그 크기의 **짝**(`--leading-hero-lg` 38px). 앞서 쓰던
               * `leading-display-tight`(1.06)는 이름·수치용이라 23px 에 24.4px 를
               * 물려 페이지 제목으로는 답답했다.
               */
              className="text-hero-lg leading-hero-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
            >
              {title}
            </h1>
            {lead ? (
              <p className="mt-3 text-body-lg leading-prose text-[color:var(--color-text-tertiary)]">
                {lead}
              </p>
            ) : null}
          </header>

          {sidebar ? <GuideChapterPicker activeSegment={activeSegment} /> : null}

          <article
            data-testid="gateway-doc-body"
            className="mt-10 w-full max-w-[var(--measure-prose)]"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
              {body}
            </ReactMarkdown>
          </article>

          {/*
           * 좁은 폭에서 크롬이 접은 읽을거리 둘 — 여기가 그 자리다. 이 두
           * 라우트에는 푸터가 없어서, 종전에는 가이드 안에서 변경 내역으로
           * (그 반대로도) 갈 길이 390 에서 0개였다.
           */}
          {/*
           * 장 끝의 이전/다음 — 순서 있는 13장인데 본문이 끝나는 자리에 다음
           * 장으로 가는 길이 0개였다(2026-08-13 실측: 다 읽은 사람이 왼쪽
           * 차례로 되돌아가 방금 읽은 장을 스스로 찾아야 했다). 순서의 정본은
           * `GUIDE_PAGES` 하나다. 변경 내역(sidebar 없음)은 장이 아니라서 없다.
           */}
          {sidebar ? <GuidePager activeSegment={activeSegment} /> : null}

          <GatewayReadingLinks className="mt-12 w-full max-w-[var(--measure-prose)]" />

          {/*
           * 잘렸으면 **몇 개를 감췄는지와 어디서 읽는지**를 함께 말한다.
           * 조용한 절단은 "이게 전부" 라고 말하는 것과 같다.
           */}
          {omittedSections > 0 ? (
            <aside
              data-testid="gateway-doc-truncated"
              className="mt-12 w-full max-w-[var(--measure-prose)] rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-4"
            >
              <p className="text-body leading-body text-[color:var(--color-text-tertiary)]">
                {t('truncatedNote', { count: omittedSections })}
              </p>
              <a
                href={`${GITHUB_REPO_URL}/blob/main/${sourcePath}`}
                target="_blank"
                rel="noreferrer noopener"
                className={controlClass({ shape: "link", tone: "secondary", className: "mt-3 gap-2 text-body leading-body underline underline-offset-2 decoration-[color:var(--color-indigo-line-a32)] hover:decoration-[color:var(--color-indigo-accent)]" })}
              >
                <GithubMark size={13} aria-hidden />
                {t('readFullSource')}
              </a>
            </aside>
          ) : null}
            </div>
            {/*
             * **오른쪽의 빈 열** — 사이드바와 같은 폭(15rem).
             *
             * 이게 없으면 본문 열이 사이드바 오른쪽 전부를 차지하고, 그 안에서
             * 가운데 정렬해도 **화면 기준으로는 오른쪽으로 밀린다**. 반대로
             * 왼쪽 정렬하면 소유자가 두 번 짚은 그 쏠림이 된다(1894 실측:
             * 본문 480–1150, 오른쪽 744px 이 빔).
             *
             * 같은 폭의 자리를 오른쪽에도 예약하면 가운데 열이 페이지 컬럼의
             * 정중앙에 서고, 페이지 컬럼 자체가 `mx-auto` 라 결과적으로 **화면
             * 정중앙**이 된다. 사이드바는 그 글의 왼쪽 여백에 떠 있는 모양이
             * 되는데, 차례의 일이 길잡이지 본문과 폭을 겨루는 것이 아니라
             * 그쪽이 맞다.
             *
             * `aria-hidden` 도 `role` 도 주지 않는다 — 내용이 없는 그리드 칸이라
             * 접근성 트리에 애초에 아무것도 안 올린다.
             */}
            {sidebar || entryNav ? <div className="hidden lg:block" /> : null}
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * 산문용 컴포넌트 맵.
 *
 * 문서함 뷰어(`widgets/docs-vault`)와 **일부러 공유하지 않는다** — 그쪽은
 * 검색 하이라이트 · 위키링크 · 볼트 내부 앵커 같은 작업 표면의 장치를 달고
 * 있고, 그 장치들이 이 표면에서는 전부 죽은 무게다. 같은 램프 토큰을 쓰므로
 * 시각적 결은 이미 한 벌이다.
 */
/** 가이드 장으로 실재하는 세그먼트 — 슬러그와 라우트를 가르는 기준. */
const GUIDE_SEGMENTS = new Set(GUIDE_PAGES.map((page) => page.segment));

/**
 * 산문 속 링크의 `href` 를 **이 로케일의 실제 주소**로 푼다.
 *
 * 마크다운 원본은 로케일을 모른다 — 한 벌이 `/ko` 와 `/en` 을 함께 서빙하므로
 * 원본에 `/ko/…` 를 박으면 영어 독자가 한국어로 끌려간다. 그래서 로케일을
 * 붙이는 일은 **화면의 몫**이다.
 *
 * ⚠️ **가이드 본문의 내부 링크는 가이드 장만 가리킨다.** 볼트 문서로 보내는
 * 링크를 여기서 `?slug=` 로 풀어 봤다가 되돌렸다: 볼트를 안 고른 웹 방문자가
 * 보는 것은 **샘플 볼트(112개)** 이고, 가이드가 가리키던 문서는 도그푸드
 * 볼트(153개)에만 있다. 그 주소는 **200 을 주면서 아무것도 안 여는** 조용한
 * 막다른 길이 된다 — 404 보다 알아채기 어렵다. 볼트 문서는 GitHub 로 보낸다.
 * 그 규율은 `tests/contract/guide-inbody-links.contract.test.ts` 가 지킨다.
 */
function resolveProseHref(href: string, locale: string): string {
  if (!href.startsWith('/')) return href;
  const path = href.split('?')[0];
  const segment = /^\/guide\/([^/]+)\/?$/.exec(path)?.[1];
  if (segment && GUIDE_SEGMENTS.has(segment)) return `/${locale}/guide/${segment}`;
  // 가이드 장이 아닌 루트 절대 링크는 위 계약이 막는다. 그래도 새어 들어오면
  // 로케일만 붙여 «그 로케일 안에서» 404 가 나게 둔다 — 로케일을 잃은 404 는
  // 영어 화면으로 떨어져서 어느 쪽 여정이 깨졌는지조차 안 보였다.
  return `/${locale}${path}`;
}

/**
 * 본문 링크 — **루트 절대 링크는 볼트 슬러그이고, 여기서 라우트로 푼다.**
 *
 * ## 왜 (2026-08-07 사용성 감사)
 *
 * 종전에는 `href` 를 그대로 `<a>` 에 실었다. 가이드 본문은 마크다운이고 거기
 * 적힌 내부 링크는 `[지도 읽는 법](/guide/reading-the-map)` 처럼 **로케일
 * 접두사가 없다** — 마크다운 한 벌이 `/ko` 와 `/en` 을 함께 서빙하므로 원본에
 * 로케일을 박을 수도 없다. 그래서 눌리는 주소가 `/guide/…` 가 되고, 그런
 * 라우트는 없다.
 *
 * 실측: 가이드 13장의 본문 내부 링크 **34개 전부가 404** 였다(대상 11종,
 * `/ko`·`/en` 양쪽, dev·정적 export 양쪽). 착지 화면은 한국어 여정인데 영어
 * 404 이고 주 버튼이 「Find by project search」라 볼트 없는 첫 방문자에게는
 * 쓸 수 없는 탈출구였다.
 *
 * **왜 눈에 안 띄었나**: 같은 화면의 왼쪽 차례(`GuideSidebar`)는 처음부터
 * `Link` 를 썼다. 로케일이 붙는 링크와 안 붙는 링크가 한 화면에 공존했고,
 * 사람이 주로 누르는 쪽이 멀쩡한 쪽이었다.
 *
 * ## 왜 `Link` 가 아니라 `<a>` + `useLocale()` 인가
 *
 * 처음엔 여기서 `Link` 를 쓰려 했는데 게이트 셋이 한꺼번에 막았다 — 앵커 채택
 * 래칫(값 층을 안 지난 손 앵커 0 → 1) · 태그 내역(`Link 17 → 18`) ·
 * `prose-link` 사용처(6 → 5). 이 저장소의 규율은 **「글 속의 링크는 컨트롤이
 * 아니라 글이다」**(`design.md` · `prose-link.contract`)이고, 그 계약들은 산문
 * 링크가 `.prose-link` 를 단 `<a>` 이기를 요구한다. 그래서 태그는 그대로 두고
 * **주소만** 로케일로 푼다.
 *
 * `docs:links` 는 이 부류를 원리적으로 못 본다 — 그 검사는 문서가 가리키는
 * **대상이 실재하는가**를 보되 그 대상을 **볼트 슬러그**로 푼다(그래서
 * `/ONTOLOGY-QUALITY` 도 통과했다). 라우트를 열어 보지는 않는다. 그 층은
 * `tests/contract/guide-inbody-links.contract.test.ts`(원본의 목적지)와
 * `tests/e2e/guide-inbody-links.spec.ts`(실제로 200 인가)가 나눠 맡는다.
 */
function ProseLink({ href, children, ...rest }: React.ComponentPropsWithoutRef<'a'>) {
  const locale = useLocale();
  const target = href ?? '';
  const external = /^https?:\/\//.test(target);
  return (
    <a
      href={external ? href : resolveProseHref(target, locale)}
      {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
      className="prose-link text-[color:var(--color-indigo-line-a90)] transition-colors hover:decoration-[color:var(--color-indigo-accent)]"
      {...rest}
    >
      {children}
    </a>
  );
}

const PROSE_COMPONENTS: Components = {
  h2: ({ children, ...rest }) => (
    <h2
      className="mt-12 mb-3 text-title leading-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
      {...rest}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...rest }) => (
    <h3
      className="mt-8 mb-2 text-body-lg leading-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
      {...rest}
    >
      {children}
    </h3>
  ),
  p: ({ children, ...rest }) => (
    <p
      className="my-4 text-body-lg leading-prose text-[color:var(--color-text-secondary)]"
      {...rest}
    >
      {children}
    </p>
  ),
  ul: ({ children, ...rest }) => (
    <ul
      className="my-4 list-disc pl-6 text-body-lg leading-prose text-[color:var(--color-text-secondary)] marker:text-[color:var(--color-text-quaternary)]"
      {...rest}
    >
      {children}
    </ul>
  ),
  ol: ({ children, ...rest }) => (
    <ol
      className="my-4 list-decimal pl-6 text-body-lg leading-prose text-[color:var(--color-text-secondary)] marker:text-[color:var(--color-text-quaternary)]"
      {...rest}
    >
      {children}
    </ol>
  ),
  li: ({ children, ...rest }) => (
    <li className="my-1.5" {...rest}>
      {children}
    </li>
  ),
  strong: ({ children, ...rest }) => (
    <strong className="font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]" {...rest}>
      {children}
    </strong>
  ),
  blockquote: ({ children, ...rest }) => (
    <blockquote
      className="my-6 border-l-2 border-[color:var(--color-indigo-line-a35)] pl-4 text-body-lg leading-prose text-[color:var(--color-text-tertiary)]"
      {...rest}
    >
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-12 border-t border-[color:var(--color-divider)]" />,
  code: ({ className, children, ...rest }) => {
    const isBlock = /language-/.test(className ?? '');
    if (!isBlock) {
      return (
        <code
          className="rounded-micro bg-[color:var(--color-indigo-line-a06)] px-1 py-0.5 font-mono text-label text-[color:var(--color-indigo-pale-a95)] md:text-body"
          {...rest}
        >
          {children}
        </code>
      );
    }
    return (
      <code className={`${className} font-mono text-label md:text-body`} {...rest}>
        {children}
      </code>
    );
  },
  pre: ({ children, ...rest }) => (
    <pre
      className="my-6 overflow-x-auto rounded-chip border border-[color:var(--color-overlay-2)] bg-[color:var(--color-surface-deep-a80)] p-4 font-mono text-label leading-body text-[color:var(--color-indigo-pale-a92)] md:text-body"
      {...rest}
    >
      {children}
    </pre>
  ),
  // 넓은 표는 페이지 본문이 아니라 **자기 상자 안에서** 가로 스크롤한다 —
  // 본문이 가로로 흐르면 그 폭이 모든 문단의 줄 길이를 망친다.
  table: ({ children, ...rest }) => (
    <div className="my-6 overflow-x-auto">
      <table
        className="w-full border-collapse text-body leading-body text-[color:var(--color-text-secondary)]"
        {...rest}
      >
        {children}
      </table>
    </div>
  ),
  th: ({ children, ...rest }) => (
    <th
      className="border-b border-[color:var(--color-divider)] px-2 py-2 text-left font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
      {...rest}
    >
      {children}
    </th>
  ),
  td: ({ children, ...rest }) => (
    <td className="border-b border-[color:var(--color-overlay-1)] px-2 py-2 align-top" {...rest}>
      {children}
    </td>
  ),
  /** 본문 링크 — 정의와 사연은 `ProseLink`. */
  a: ProseLink,
};

/**
 * 가이드의 왼쪽 차례.
 *
 * ## 왜 `sticky` 인가
 *
 * 가이드는 스크롤하며 읽는 글인데, 차례가 같이 스크롤돼 사라지면 "다음 장으로"
 * 가려는 사람이 위로 되돌아가야 한다. 목록의 일이 **길잡이**라면 길이 보이는
 * 동안 계속 보여야 한다.
 *
 * ## 현재 장은 색이 아니라 면으로
 *
 * 크롬의 읽을거리 칩과 같은 문법이다 — 채워진 면 + 강한 텍스트. 무채색 안에서
 * 「지금 여기」를 말하는 방법이라 새 색을 열지 않는다.
 */
/**
 * 가이드 장 목록 — **한 벌만 있고 두 폭이 나눠 쓴다.**
 *
 * `lg` 이상은 왼쪽 차례(`GuideSidebar`)가, 그 아래는 제목 밑의 펼침
 * (`GuideChapterPicker`)이 이 함수를 부른다. 목록을 두 번 적으면 장을 더할 때
 * 한쪽만 늘어난다.
 */
function GuideChapterList({ activeSegment }: { activeSegment?: string }) {
  const t = useTranslations('gatewayNav');
  return (
    <ul className="flex flex-col gap-0.5">
      {GUIDE_PAGES.map((page) => {
        const active = page.segment === activeSegment;
        return (
          <li key={page.segment}>
            <Link
              href={`/guide/${page.segment}`}
              aria-current={active ? 'page' : undefined}
              data-testid={`guide-nav-${page.segment}`}
              className={controlClass({
                shape: 'row',
                size: 'sm',
                tone: active ? 'default' : 'muted',
                className: cn(
                  'block leading-body',
                  active
                    ? 'bg-[color:var(--color-elevated)]'
                    : 'hover:bg-[color:var(--color-elevated)] hover:text-[color:var(--color-text-primary)]',
                ),
              })}
            >
              {t(`guidePages.${page.titleKey}`)}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 장 끝 이전/다음. 화살표 글자는 쓰지 않는다 — 방향은 「이전 장/다음 장」
 * 아이브로우와 정렬(왼쪽/오른쪽)이 이미 말하고, 라벨 끝 화살표는 헌장이
 * 장식으로 판정한다(`label-decoration` 게이트).
 */
function GuidePager({ activeSegment }: { activeSegment?: string }) {
  const t = useTranslations('gatewayNav');
  const segment = activeSegment ?? GUIDE_ENTRY_PAGE.segment;
  const index = GUIDE_PAGES.findIndex((page) => page.segment === segment);
  if (index === -1) return null;
  const prev = GUIDE_PAGES[index - 1] ?? null;
  const next = GUIDE_PAGES[index + 1] ?? null;
  if (!prev && !next) return null;
  return (
    <nav
      aria-label={t('guidePagerLabel')}
      data-testid="guide-pager"
      className="mt-12 flex w-full max-w-[var(--measure-prose)] items-stretch gap-3 border-t border-[color:var(--color-divider)] pt-4"
    >
      {prev ? (
        <GuidePagerLink page={prev} eyebrow={t('guidePrev')} edge="start" testId="guide-pager-prev" />
      ) : (
        <span aria-hidden className="flex-1" />
      )}
      {next ? (
        <GuidePagerLink page={next} eyebrow={t('guideNext')} edge="end" testId="guide-pager-next" />
      ) : (
        <span aria-hidden className="flex-1" />
      )}
    </nav>
  );
}

function GuidePagerLink({
  page,
  eyebrow,
  edge,
  testId,
}: {
  page: GuidePage;
  eyebrow: string;
  edge: 'start' | 'end';
  testId: string;
}) {
  const t = useTranslations('gatewayNav');
  return (
    <Link
      href={`/guide/${page.segment}`}
      data-testid={testId}
      className={controlClass({
        shape: 'card',
        className: cn(
          'flex-1 flex-col gap-1 rounded-card border-[color:var(--color-border-soft)] px-4 py-3 hover:border-[color:var(--color-indigo-a46)] hover:bg-[color:var(--color-indigo-a06)]',
          edge === 'end' ? 'items-end text-right' : 'items-start text-left',
        ),
      })}
    >
      <span className="text-label text-[color:var(--color-text-quaternary)]">{eyebrow}</span>
      <span className="text-body-lg text-[color:var(--color-text-primary)] [word-break:keep-all]">
        {t(`guidePages.${page.titleKey}`)}
      </span>
    </Link>
  );
}

function GuideSidebar({ activeSegment }: { activeSegment?: string }) {
  const t = useTranslations('gatewayNav');
  return (
    <nav
      aria-label={t('guideNavLabel')}
      data-testid="guide-sidebar"
      className="hidden lg:block"
    >
      <div className="sticky top-24">
        <p className="mb-3 px-2.5 text-label leading-label font-[var(--font-weight-signature)] tracking-wide text-[color:var(--color-text-quaternary)] uppercase">
          {t('onThisGuide')}
        </p>
        <GuideChapterList activeSegment={activeSegment} />
      </div>
    </nav>
  );
}

/**
 * `lg` 미만의 차례 — 제목 바로 밑의 펼침.
 *
 * ## 왜 필요한가 (2026-08-07 실측)
 *
 * 종전에는 이 폭에서 차례가 **어디에도 없었다.** 코드 주석 둘이 대체를
 * 약속했는데 **둘 다 사실이 아니었다**:
 *
 * | 적혀 있던 말 | 실제 |
 * |---|---|
 * | *"접힌 자리는 크롬의 「가이드」 칩이 대신한다"* | 그 칩도 `<sm` 에서 접힌다 — 390 에서 0개 |
 * | *"이 둘은 스크롤하면 푸터에서 다시 만난다"* | 관문 푸터는 어느 폭에서도 링크 0개 |
 *
 * 게다가 `/guide` 는 색인이 아니라 **1장을 그린다** — 칩을 눌러 돌아가도 거기
 * 목록이 없다. 결과: 768·390 에서 보이는 가이드 장 링크가 **1개 · 0개**였고,
 * 폰으로 링크를 받아 한 장을 연 사람에게 13장은 **서로 못 가는 13개의 막다른
 * 길**이었다. 그 안에 「에이전트 연결」과 「CLI」가 있으므로 막힌 것은 읽을거리가
 * 아니라 **에이전트를 붙이는 경로**다.
 *
 * ## 왜 펼침(`<details>`)인가
 *
 * 좁은 폭에서 목록을 펼쳐 두면 산문 기둥이 목록에게 폭이 아니라 **첫 화면**을
 * 빼앗긴다 — 읽으러 온 사람이 목차부터 스크롤해야 한다. 닫힌 펼침은 한 줄이고,
 * 그 한 줄이 **지금 몇 장 중 어디인지**까지 말한다. 여는 표시(chevron)는 장식
 * 화살표 금지의 예외다(`design.md`: 펼쳐진 상태를 나타내는 것은 정보다).
 */
function GuideChapterPicker({ activeSegment }: { activeSegment?: string }) {
  const t = useTranslations('gatewayNav');
  const index = GUIDE_PAGES.findIndex((page) => page.segment === activeSegment);
  const current = index >= 0 ? GUIDE_PAGES[index] : GUIDE_PAGES[0];
  return (
    <details
      data-testid="guide-chapter-picker"
      className="group mt-6 w-full max-w-[var(--measure-prose)] rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] lg:hidden"
    >
      <summary
        data-testid="guide-chapter-picker-summary"
        className="flex min-h-11 list-none items-center gap-2 px-3 py-2 text-body leading-body text-[color:var(--color-text-secondary)] [&::-webkit-details-marker]:hidden"
      >
        <ChevronRight
          size={ICON_SIZE.sm}
          aria-hidden
          className="shrink-0 transition-transform group-open:rotate-90"
        />
        <span className="font-mono text-label uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
          {t('onThisGuide')}
        </span>
        <span className="min-w-0 truncate text-[color:var(--color-text-primary)]">
          {t(`guidePages.${current.titleKey}`)}
        </span>
        <span className="ms-auto shrink-0 font-mono text-label tabular-nums text-[color:var(--color-text-quaternary)]">
          {`${Math.max(index, 0) + 1}/${GUIDE_PAGES.length}`}
        </span>
      </summary>
      <nav aria-label={t('guideNavLabel')} className="border-t border-[color:var(--color-divider)] p-2">
        <GuideChapterList activeSegment={activeSegment} />
      </nav>
    </details>
  );
}

/**
 * 변경 내역의 왼쪽 항목 목록 — 날짜가 앞에 서고 제목이 따라온다.
 *
 * ## 왜 라우트가 아니라 앵커인가
 *
 * 가이드는 여섯 장이 각자 다른 글이라 주소가 따로 있는 게 맞다. 변경 내역은
 * **한 흐름**이라 위아래로 이어 읽는 것이 정상이고, 항목마다 주소를 파면
 * "그 다음에 뭐가 있었지" 를 보려고 매번 페이지를 새로 여는 꼴이 된다.
 * 목록은 **건너뛰기**를 위한 것이지 분할을 위한 것이 아니다.
 *
 * ## 왜 링크가 `<a href="#…">` 인가
 *
 * 앵커는 브라우저가 이미 잘한다 — 뒤로가기가 되돌리고, 주소를 복사하면 그 항목을
 * 가리키고, JS 없이도 동작한다. 스크롤을 손으로 옮기면 이 셋을 전부 다시 만들어야
 * 한다.
 */
function EntrySidebar({ entries }: { entries: DocEntry[] }) {
  const t = useTranslations('gatewayNav');
  if (entries.length === 0) return null;
  return (
    <nav aria-label={t('entryNavLabel')} data-testid="entry-sidebar" className="hidden lg:block">
      <div className="sticky top-24 max-h-[calc(100svh-9rem)] overflow-y-auto pr-1">
        <p className="mb-3 px-2.5 text-label leading-label font-[var(--font-weight-signature)] tracking-wide text-[color:var(--color-text-quaternary)] uppercase">
          {t('entryNavLabel')}
        </p>
        <ul className="flex flex-col gap-0.5">
          {entries.map((entry) => (
            <li key={entry.id}>
              <a
                href={`#${entry.id}`}
                data-testid={`entry-nav-${entry.id}`}
                className={controlClass({ shape: "row", size: "sm", className: "block hover:bg-[color:var(--color-elevated)]" })}
              >
                {entry.date ? (
                  <span className="block font-mono text-label leading-label text-[color:var(--color-text-quaternary)]">
                    {entry.date}
                  </span>
                ) : null}
                {/*
                 * 제목은 두 줄에서 자른다 — 이 저장소의 변경 내역 제목은 한 문장에
                 * 가깝게 길어서, 안 자르면 항목 하나가 목록의 절반을 먹는다.
                 * 전체 문장은 눌러서 도착한 자리에 있다.
                 */}
                <span className="line-clamp-2 text-body leading-body text-[color:var(--color-text-tertiary)]">
                  {entry.title}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

/**
 * 산문 컴포넌트 맵 + **`h2` 에 앵커 id**.
 *
 * 목록이 가리킬 자리를 본문이 갖고 있어야 한다. id 는 목록과 같은 함수가 낸
 * 것을 그대로 받는다 — 여기서 다시 계산하면 그 순간 두 번째 진실원이 된다.
 *
 * `scroll-mt` 는 sticky 크롬(상단 바) 높이만큼 — 없으면 앵커로 도착한 제목이
 * 바 뒤에 숨어 "안 움직였나" 로 읽힌다.
 */
function proseComponentsWithAnchors(headingIds: Map<string, string>): Components {
  return {
    ...PROSE_COMPONENTS,
    h2: ({ children, ...rest }) => (
      <h2
        id={headingIds.get(normalizeHeadingKey(flattenText(children)))}
        className="mt-12 mb-3 scroll-mt-24 text-title leading-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
        {...rest}
      >
        {children}
      </h2>
    ),
  };
}

/** ReactMarkdown 이 넘기는 children 에서 순수 텍스트만 이어 붙인다 (id 매칭용). */
function flattenText(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return flattenText((node as { props?: { children?: React.ReactNode } }).props?.children);
  }
  return '';
}
