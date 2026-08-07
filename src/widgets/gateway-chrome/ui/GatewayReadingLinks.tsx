'use client';

import { useTranslations } from 'next-intl';

import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/shared/lib/cn';
import { stripLocalePrefix } from '@/shared/lib/nav-destination';
import { controlClass } from '@/shared/ui/control-class';

/**
 * 읽을거리 둘(`/guide` · `/changelog`)로 가는 길 — **크롬이 접는 폭에서만.**
 *
 * ## 왜 생겼나 (2026-08-07 실측)
 *
 * `GatewayNav` 는 이 둘을 `<sm` 에서 접는다. 그 판단 자체는 옳다 — 좁은 폭의
 * 첫 화면은 헤드라인과 받기 버튼의 것이다. 문제는 **접힌 뒤에 갈 곳이 없었다**
 * 는 것이다. 코드 주석은 *"스크롤하면 푸터에서 다시 만난다"* 고 적어 뒀는데,
 * 관문 푸터는 라이선스·스택 문자열뿐이고 **어느 폭에서도 링크가 0개**였다.
 * 가이드·변경 내역 라우트에는 푸터 자체가 없다.
 *
 * 실측(정적 export · 390×844): 관문에서 보이는 가이드 링크 **0개** · 변경 내역
 * **0개**, 그것을 여는 메뉴도 **0개**. 둘 다 DOM 에는 있고 그려지지만 않는다 —
 * 화면에 없는 것과 같고, 이 저장소의 이름으로는 **막다른 CTA** 의 이웃이다.
 *
 * ## 왜 `sm:hidden` 인가
 *
 * 그 위에서는 크롬이 이미 낸다. 같은 일을 하는 링크를 크롬과 판에 둘 다 두면
 * 둘 중 하나가 죽은 약속이 된다 — `GatewayNav` 머리말이 「지도로 돌아가기」를
 * 지울 때 쓴 것과 같은 판단이고, 여기서도 그대로 따른다.
 *
 * 지금 보고 있는 쪽은 링크로 두되 `aria-current` 를 단다. 빼 버리면 폭에 따라
 * 줄에 든 항목 수가 달라져서, 「하나뿐인가 둘인가」를 매번 다시 읽어야 한다.
 */
export function GatewayReadingLinks({ className }: { className?: string }) {
  const t = useTranslations('gatewayNav');
  const path = stripLocalePrefix(usePathname() ?? '/');
  const items = [
    { href: '/guide', label: t('guide'), testId: 'gateway-footer-guide' },
    { href: '/changelog', label: t('changelog'), testId: 'gateway-footer-changelog' },
  ] as const;

  return (
    <div
      data-testid="gateway-footer-reading"
      className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 sm:hidden', className)}
    >
      {items.map((item) => {
        const active = path.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            data-testid={item.testId}
            aria-current={active ? 'page' : undefined}
            className={controlClass({
              shape: 'link',
              tone: active ? 'default' : 'secondary',
            })}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
