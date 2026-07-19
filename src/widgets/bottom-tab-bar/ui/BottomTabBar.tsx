'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { BarChart3, BookOpen, FolderKanban, GitBranch, Map as MapIcon } from 'lucide-react';
import { useLocalVault } from '@/features/docs-vault-local';
import { resolveActiveNavDestination, type AppNavDestinationId } from '@/shared/lib/nav-destination';
import { shouldHideBottomTabBar } from '../lib/is-tab-active';

interface TabItem {
  id: AppNavDestinationId;
  href: string;
  /** Translation key under `navRail.*` — same copy as the desktop rail so
   *  mobile and desktop read as one nav system, not two. */
  labelKey: AppNavDestinationId;
  icon: typeof MapIcon;
}

// 모바일 한정 하단 탭바 — 데스크톱 `AppNavRail` (lg+) 과 정확히 같은 5
// destination (feat/rail-rollout, 3-체계 → 1-체계 통합). active 판정도
// `resolveActiveNavDestination` 을 공유해 두 위젯이 절대 갈라지지 않는다.
const TABS: ReadonlyArray<TabItem> = [
  { id: 'map', href: '/topology/', labelKey: 'map', icon: MapIcon },
  { id: 'docs', href: '/docs/', labelKey: 'docs', icon: BookOpen },
  { id: 'builder', href: '/ontology/edit/', labelKey: 'builder', icon: GitBranch },
  { id: 'insights', href: '/ontology/insights/', labelKey: 'insights', icon: BarChart3 },
  { id: 'projects', href: '/projects/', labelKey: 'projects', icon: FolderKanban },
];

export function BottomTabBar() {
  const pathname = usePathname() ?? '/';
  const t = useTranslations('nav');
  const tRail = useTranslations('navRail');
  const vault = useLocalVault();

  if (shouldHideBottomTabBar(pathname, vault.status === 'loaded')) {
    return null;
  }

  const activeId = resolveActiveNavDestination(pathname);

  return (
    <nav
      data-tabbar="primary"
      data-tabbar-min-height-token="--topology-bottom-tab-min-height"
      data-tabbar-bottom-reserve-token="--topology-mobile-bottom-tab-reserve"
      data-tabbar-surface-token="--topology-bottom-tab-surface"
      data-tabbar-border-token="--topology-bottom-tab-border"
      aria-label={t('primaryAriaLabel')}
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-[color:var(--topology-bottom-tab-border)] bg-[color:var(--topology-bottom-tab-surface)] pb-[env(safe-area-inset-bottom)] shadow-[0_-16px_36px_var(--color-shadow-a35)] lg:hidden"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = activeId === tab.id;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            data-active={active ? 'true' : 'false'}
            className={
              active
                ? 'relative flex min-h-[var(--topology-bottom-tab-min-height)] flex-1 flex-col items-center justify-center gap-0.5 text-[color:var(--color-indigo-accent)] transition-colors duration-150 active:bg-[color:var(--color-indigo-a08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a50)] focus-visible:ring-inset'
                : 'relative flex min-h-[var(--topology-bottom-tab-min-height)] flex-1 flex-col items-center justify-center gap-0.5 text-[color:var(--color-text-quaternary)] transition-colors duration-150 active:bg-[color:var(--color-overlay-1)] active:text-[color:var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a50)] focus-visible:ring-inset'
            }
          >
            {active ? (
              <span
                aria-hidden
                className="absolute top-1 h-0.5 w-6 rounded-full bg-[color:var(--color-indigo-line-a90)] shadow-[0_0_12px_var(--color-indigo-a42)]"
                data-active-indicator="true"
              />
            ) : null}
            <span
              className={
                active
                  ? 'inline-flex h-6 w-6 items-center justify-center rounded-lg border border-[color:var(--color-indigo-a30)] bg-[color:var(--color-indigo-a10)] shadow-[0_0_0_1px_var(--color-indigo-line-a06)_inset]'
                  : 'inline-flex h-6 w-6 items-center justify-center rounded-lg border border-transparent transition-colors duration-150'
              }
              data-tab-icon-shell={active ? 'active' : 'idle'}
            >
              <Icon size={17} aria-hidden />
            </span>
            <span className="text-[10px] font-[var(--font-weight-signature)] leading-none">{tRail(tab.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
