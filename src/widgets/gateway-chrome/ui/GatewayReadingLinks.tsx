'use client';

import { useTranslations } from 'next-intl';

import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/shared/lib/cn';
import { stripLocalePrefix } from '@/shared/lib/nav-destination';
import { controlClass } from '@/shared/ui/control-class';

/**
 * The route to `/guide` and `/changelog` below `sm`, where `GatewayNav` collapses them and nothing
 * else offers them. `sm:hidden` because above it the chrome does; the current page keeps its link
 * with `aria-current` so the row count stays stable.
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
              // The only route to these pages on a phone, so `touch-hit-expand` raises the hit box
              // to `--touch-target-min`; the 16px gap keeps the widened boxes apart.
              className: 'touch-hit-expand',
            })}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
