'use client';

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { GatewayNav } from '@/widgets/gateway-chrome';
import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/gateway-frame';
import { GITHUB_REPO_URL } from '@/shared/config/social-links';
import { GithubMark } from '@/shared/ui';
import { readVaultDoc, trimToRecentSections } from '../lib/vault-doc';
import { GUIDE_PAGES } from '../model/guide-pages';
import { Link } from '@/i18n/navigation';

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
}

export function GatewayDocPage({
  slug,
  title,
  lead,
  recentSectionLimit,
  sourcePath,
  sidebar = false,
  activeSegment,
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
      <main className={cn(PAGE_GUTTER, 'w-full flex-1 pt-10 pb-20 md:pt-16')}>
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
              sidebar ? 'lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12' : 'flex flex-col items-center',
            )}
          >
            {sidebar ? <GuideSidebar activeSegment={activeSegment} /> : null}
            <div className={cn('flex min-w-0 flex-col', sidebar ? 'items-start' : 'items-center')}>
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
              className="text-hero-lg leading-hero-lg font-semibold text-[color:var(--color-text-primary)]"
            >
              {title}
            </h1>
            {lead ? (
              <p className="mt-3 text-body-lg leading-prose text-[color:var(--color-text-tertiary)]">
                {lead}
              </p>
            ) : null}
          </header>

          <article
            data-testid="gateway-doc-body"
            className="mt-10 w-full max-w-[var(--measure-prose)]"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={PROSE_COMPONENTS}>
              {body}
            </ReactMarkdown>
          </article>

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
                className="mt-3 inline-flex items-center gap-2 text-body leading-body text-[color:var(--color-text-secondary)] underline underline-offset-2 decoration-[color:var(--color-indigo-line-a32)] transition-colors hover:decoration-[color:var(--color-indigo-accent)]"
              >
                <GithubMark size={13} aria-hidden />
                {t('readFullSource')}
              </a>
            </aside>
          ) : null}
            </div>
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
const PROSE_COMPONENTS: Components = {
  h2: ({ children, ...rest }) => (
    <h2
      className="mt-12 mb-3 text-title leading-title font-semibold text-[color:var(--color-text-primary)]"
      {...rest}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...rest }) => (
    <h3
      className="mt-8 mb-2 text-body-lg leading-body-lg font-semibold text-[color:var(--color-text-primary)]"
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
    <strong className="font-semibold text-[color:var(--color-text-primary)]" {...rest}>
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
          className="rounded-sm bg-[color:var(--color-indigo-line-a06)] px-1 py-0.5 font-mono text-label text-[color:var(--color-indigo-pale-a95)] md:text-body"
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
      className="my-6 overflow-x-auto rounded-md border border-[color:var(--color-overlay-2)] bg-[color:var(--color-surface-deep-a80)] p-4 font-mono text-label leading-body text-[color:var(--color-indigo-pale-a92)] md:text-body"
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
      className="border-b border-[color:var(--color-divider)] px-2 py-2 text-left font-medium text-[color:var(--color-text-primary)]"
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
  a: ({ href, children, ...rest }) => {
    const external = /^https?:\/\//.test(href ?? '');
    return (
      <a
        href={href}
        {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
        className="text-[color:var(--color-indigo-line-a90)] underline underline-offset-2 decoration-[color:var(--color-indigo-line-a32)] transition-colors hover:decoration-[color:var(--color-indigo-accent)]"
        {...rest}
      >
        {children}
      </a>
    );
  },
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
function GuideSidebar({ activeSegment }: { activeSegment?: string }) {
  const t = useTranslations('gatewayNav');
  return (
    <nav
      aria-label={t('guideNavLabel')}
      data-testid="guide-sidebar"
      className="hidden lg:block"
    >
      <div className="sticky top-24">
        <p className="mb-3 px-2.5 text-label leading-label font-medium tracking-wide text-[color:var(--color-text-quaternary)] uppercase">
          {t('onThisGuide')}
        </p>
        <ul className="flex flex-col gap-0.5">
          {GUIDE_PAGES.map((page) => {
            const active = page.segment === activeSegment;
            return (
              <li key={page.segment}>
                <Link
                  href={`/guide/${page.segment}`}
                  aria-current={active ? 'page' : undefined}
                  data-testid={`guide-nav-${page.segment}`}
                  className={cn(
                    'block rounded-chip px-2.5 py-1.5 text-body leading-body transition-colors',
                    active
                      ? 'bg-[color:var(--color-elevated)] text-[color:var(--color-text-primary)]'
                      : 'text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-elevated)] hover:text-[color:var(--color-text-primary)]',
                  )}
                >
                  {t(`guidePages.${page.titleKey}`)}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
