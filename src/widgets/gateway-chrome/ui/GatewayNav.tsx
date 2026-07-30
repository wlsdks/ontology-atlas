'use client';

import { ArrowLeft, Orbit } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { LocaleSwitch } from '@/features/locale-switch';
import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/gateway-frame';
import { stripLocalePrefix } from '@/shared/lib/nav-destination';
import { xProfileUrl } from '@/shared/config/social-links';
import { XMark } from '@/shared/ui';

/**
 * 관문 표면들이 공유하는 상단 크롬.
 *
 * **네 주소에 산다** — `/`(웹 방문자의 얼굴) · `/download`(설치 딥링크) ·
 * `/guide` · `/changelog`. 같은 크롬이지만 두 조각이 주소에 따라 달라진다:
 * 루트에서는 ① 빵부스러기의 현재 마디를 지우고(그 주소가 아니다) ②
 * 「지도로 돌아가기」를 지운다 — 여기로 온 사람은 지도에서 온 게 아니고,
 * 지도로 가는 길은 판 안의 「설치 없이 브라우저에서 써보기」가 이미 낸다.
 * 같은 일을 하는 링크를 크롬과 판에 둘 다 두면 둘 중 하나가 죽은 약속이 된다.
 */
export function GatewayNav() {
  const t = useTranslations('download');
  const tNav = useTranslations('gatewayNav');
  const path = stripLocalePrefix(usePathname() ?? '/');
  const atRoot = path === '/';

  /**
   * 현재 마디의 이름. 루트면 없다(빵부스러기를 안 그린다).
   *
   * ⚠️ 라벨을 여기서 정하는 이유: 각 페이지가 자기 이름을 크롬에 주입하면
   * 같은 이름이 두 곳에 살고 한쪽만 바뀐다. 주소가 진실원이다.
   */
  const crumb = atRoot
    ? null
    : path.startsWith('/guide')
      ? tNav('guide')
      : path.startsWith('/changelog')
        ? tNav('changelog')
        : t('downloadSectionLabel');

  const xHref = xProfileUrl();

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
          **빵부스러기와 절 링크**다 — 이 라우트가 어디인지는 좁은 화면에서도
          제목이 말하고, 로고와 언어 전환은 어느 폭에서도 남아야 한다. */}
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
        {crumb ? (
          <>
            <span aria-hidden className="hidden text-body text-[color:var(--color-text-quaternary)] sm:inline">
              /
            </span>
            <span
              aria-current="page"
              className="hidden text-body leading-body text-[color:var(--color-text-tertiary)] sm:inline"
            >
              {crumb}
            </span>
          </>
        ) : null}

        {/* 이 그룹의 **오른끝**이 곧 원점의 거울이다 — `vw − 원점` 에서 멈춰야
            상단 바가 아래 밴드와 같은 프레임 안에 산다. 소유자 지적
            *"공백이 길고 왜이러지?"* 가 정확히 이 끝과 화면 끝 사이였다
            (실측 1920: 256px · 2560: 864px). 게이트가 이 testid 로 잰다. */}
        <span
          data-testid="download-gnb-actions"
          className="ml-auto flex shrink-0 items-center gap-3"
        >
          {/* 읽을거리 둘. `<sm` 에서 접는다 — 좁은 폭의 첫 화면은 헤드라인과
              받기 버튼의 것이고, 이 둘은 스크롤하면 푸터에서 다시 만난다. */}
          <span className="hidden items-center gap-3 sm:flex">
            <GatewayNavLink href="/guide" active={path.startsWith('/guide')}>
              {tNav('guide')}
            </GatewayNavLink>
            <GatewayNavLink href="/changelog" active={path.startsWith('/changelog')}>
              {tNav('changelog')}
            </GatewayNavLink>
          </span>

          {/*
           * X — 자리는 있고 목적지는 아직 없다(`X_HANDLE` 이 비었다).
           *
           * 비활성으로 그리는 것이 링크로 그리는 것보다 정직하다: 누를 수
           * 있어 보이는데 아무 데도 안 가는 것이 「죽은 CTA」이고, 이건
           * 누를 수 없어 보이며 `title` 이 왜인지 말한다. 핸들을 채우면
           * 이 분기가 저절로 링크 쪽으로 넘어간다.
           */}
          {xHref ? (
            <a
              href={xHref}
              target="_blank"
              rel="noreferrer noopener"
              data-testid="gateway-x-link"
              aria-label={tNav('xLabel')}
              className="touch-hit-expand inline-flex items-center text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
            >
              <XMark size={14} aria-hidden />
            </a>
          ) : (
            /* ⚠️ **`opacity-50` 을 뺀 것이 이 자리의 수정이다** (2026-07-30).
               그전엔 quaternary(4.76:1)에 투명도 0.5 가 겹쳐 실효 대비가 WCAG
               비텍스트 기준(1.4.11, 3:1) 아래로 내려갔다 — 소유자 관측
               *"잘 안보이고"*. 비활성은 **흐림이 아니라 형태**로 말한다:
               테두리 없음 + `cursor-not-allowed` + `aria-disabled` + 툴팁. */
            <span
              data-testid="gateway-x-placeholder"
              aria-disabled="true"
              title={tNav('xPending')}
              className="inline-flex h-8 cursor-not-allowed items-center rounded-chip px-2 text-[color:var(--color-text-quaternary)]"
            >
              <XMark size={15} aria-hidden />
              <span className="sr-only">{tNav('xPending')}</span>
            </span>
          )}

          {/*
           * ⚠️ **`/` 가 아니라 `/topology` 다.** 라벨이 「지도로 돌아가기」라고
           * 말하는데 `/` 는 2026-07-29 소유자 결정으로 **마케팅 페이지**가 된다
           * (원장: 「root-first-open」 뒤집기). 그때 `/` 로 보내면 사용자는 지도가
           * 아니라 방금 떠난 소개 화면으로 되돌아온다.
           *
           * 전환 전에는 두 주소가 같은 화면이라 이 결함이 보이지 않았다 — 그래서
           * `tests/contract/map-destination-route.contract.test.ts` 가 라벨과
           * 목적지를 함께 본다.
           */}
          {atRoot ? null : (
            <Link
              href="/topology"
              data-testid="download-back-to-map"
              className="touch-hit-expand inline-flex items-center gap-1.5 whitespace-nowrap text-body leading-body text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
            >
              <ArrowLeft size={14} aria-hidden />
              {t('back')}
            </Link>
          )}
          <LocaleSwitch />
        </span>
      </div>
    </nav>
  );
}

/**
 * 관문 크롬의 읽을거리 링크 — **칩으로 그린다**.
 *
 * ## 왜 맨 글자가 아닌가 (2026-07-30, 소유자: *"버튼도 아니고 잘 안보이고"*)
 *
 * 대비는 원래도 문제가 아니었다 — 실측 **6.13:1** 로 본문 기준을 넉넉히 넘는다.
 * 문제는 **같은 줄의 이웃**이었다: EN/KO 로케일 전환은 32×32 칩인데 이 둘만
 * 맨 글자(32×20 · 46×20, 배경도 테두리도 없음)라, 나란히 놓이면 하나는 컨트롤로
 * 다른 하나는 라벨로 읽힌다. **어포던스는 절대값이 아니라 이웃과의 관계다.**
 *
 * 그래서 색을 올리는 대신 **형태를 맞췄다**. 배경 + 테두리 + 같은 높이를 주면
 * 셋이 한 종류의 물건으로 읽힌다.
 *
 * ## 활성 상태는 색이 아니라 면으로 구분한다
 *
 * 현재 페이지는 채워진 면(`--color-elevated`)을 갖고, 나머지는 비어 있다가
 * 호버에서 그 면을 얻는다. 무채색 안에서 「지금 여기」를 말하는 방법이라
 * 새 색을 열지 않는다(`design.md` — 채색은 인디고 하나).
 */
function GatewayNavLink({
  href,
  active,
  children,
}: {
  href: '/guide' | '/changelog';
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      data-testid={`gateway-nav-${href.slice(1)}`}
      aria-current={active ? 'page' : undefined}
      className={cn(
        // ⚠️ `touch-hit-expand` 는 **칩이 되면서 더 필요해졌다.** 맨 글자였을
        // 때부터 달려 있던 것을 칩으로 바꾸며 떨어뜨렸고, 터치 계약이 32px 높이를
        // 잡았다(coarse 포인터 44px). 보이는 상자는 그대로 두고 히트 영역만
        // 의사요소로 넓히므로 이 줄의 레이아웃은 1px 도 안 바뀐다.
        'touch-hit-expand inline-flex h-8 items-center whitespace-nowrap rounded-chip border px-2.5',
        'text-body leading-body transition-colors',
        // ⚠️ **쉴 때부터 테두리를 준다.** 처음엔 비활성을 `border-transparent`
        // 로 두고 호버에서만 칩이 나타나게 했는데, 그러면 소유자가 짚은 상태
        // (*"버튼도 아니고"*)가 **평상시 화면에서 그대로**다 — 호버는 이미
        // 컨트롤이라고 믿은 사람만 발견한다. 어포던스는 손이 오기 전에 있어야 한다.
        active
          ? 'border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] text-[color:var(--color-text-primary)]'
          : 'border-[color:var(--color-border-strong)] text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-elevated)] hover:text-[color:var(--color-text-primary)]',
      )}
    >
      {children}
    </Link>
  );
}
