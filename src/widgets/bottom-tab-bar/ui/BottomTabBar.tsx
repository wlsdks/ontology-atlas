'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { Blocks, Download, FolderKanban, Library, LineChart, Map as MapIcon } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { useLocalVault } from '@/entities/vault-session';
import { useSoleProjectHref } from '@/features/project-data-source';
import { describeVaultShape } from '@/shared/lib/vault-shape';
import { resolveActiveNavDestination, type AppNavDestinationId } from '@/shared/lib/nav-destination';
import {
  DESTINATION_HREF,
  MOBILE_DESTINATION_IDS,
  WIKI_ONLY_MOBILE_DESTINATION_IDS,
  destinationsForVaultShape,
  type MobileDestinationId,
} from '@/shared/config/destinations';
import { shouldHideBottomTabBar } from '../lib/is-tab-active';
import { shouldShowGetAppTile } from '@/shared/lib/show-get-app-tile';
import { isTauriVaultRuntime } from '@/shared/lib/tauri-vault-fs';

/** The runtime never changes after load, so subscribing is a formality. */
const subscribeToRuntime = () => () => {};
/** Prerender has no window, so the answer is **unknown** — never assume `false` (web). */
const getServerRuntimeSnapshot = (): boolean | null => null;

interface TabItem {
  id: AppNavDestinationId;
  href: string;
  /** Translation key under `navRail.*` — same copy as the desktop rail so
   *  mobile and desktop read as one nav system, not two. */
  labelKey: AppNavDestinationId;
  icon: typeof MapIcon;
}

// Mobile tab bar below lg; it shares `resolveActiveNavDestination` with the desktop rail so the two
// cannot disagree.
const TABS: ReadonlyArray<TabItem> = [
  ...MOBILE_DESTINATION_IDS.map((id) => ({
    id,
    href: DESTINATION_HREF[id],
    labelKey: id,
    icon: ({
      map: MapIcon,
      architecture: Blocks,
      library: Library,
      // `LineChart`, not `BarChart3` (see `AppNavRail.tsx`).
      insights: LineChart,
      projects: FolderKanban,
    } satisfies Record<MobileDestinationId, typeof MapIcon>)[id],
  })),
];
/** A wiki without a map: the Library is the one tab worth the slot (`destinationsForVaultShape`). */
const WIKI_ONLY_TABS: ReadonlyArray<TabItem> = WIKI_ONLY_MOBILE_DESTINATION_IDS.map((id) => ({
  id,
  href: DESTINATION_HREF[id],
  labelKey: id,
  icon: Library,
}));

export function BottomTabBar() {
  const pathname = usePathname() ?? '/';
  /* The same single-project target as the desktop rail. */
  const soleProjectHref = useSoleProjectHref();
  const t = useTranslations('nav');
  const tRail = useTranslations('navRail');
  const vault = useLocalVault();

  /**
   * Web-only download utility below lg, outside `TABS`. The hook sits above the early return to
   * keep hook order stable.
   */
  const desktopRuntime = useSyncExternalStore(
    subscribeToRuntime,
    isTauriVaultRuntime,
    getServerRuntimeSnapshot,
  );
  const showGetApp = shouldShowGetAppTile({
    mounted: desktopRuntime !== null,
    isDesktopApp: desktopRuntime === true,
  });

  if (shouldHideBottomTabBar(pathname, vault.status === 'loaded')) {
    return null;
  }

  const activeId = resolveActiveNavDestination(pathname);
  const visible = destinationsForVaultShape(vault.manifest ? describeVaultShape(vault.manifest.docs) : null);
  const mapTabs = TABS.filter((tab) => visible.has(tab.id));
  const shapeTabs = mapTabs.length > 0 ? mapTabs : WIKI_ONLY_TABS;
  const tabs = soleProjectHref
    ? shapeTabs.map((tab) => (tab.id === 'projects' ? { ...tab, href: soleProjectHref } : tab))
    : shapeTabs;


  return (
    <nav
      data-tabbar="primary"
      data-tabbar-min-height-token="--topology-bottom-tab-min-height"
      data-tabbar-bottom-reserve-token="--topology-mobile-bottom-tab-reserve"
      data-tabbar-surface-token="--topology-bottom-tab-surface"
      data-tabbar-border-token="--topology-bottom-tab-border"
      aria-label={t('primaryAriaLabel')}
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-[color:var(--topology-bottom-tab-border)] bg-[color:var(--topology-bottom-tab-surface)] pb-[env(safe-area-inset-bottom)] shadow-[var(--shadow-elevation-dock-bottom)] lg:hidden"
    >
      {tabs.map((tab) => {
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
                ? 'relative flex min-h-[var(--topology-bottom-tab-min-height)] flex-1 flex-col items-center justify-center gap-0.5 text-[color:var(--color-indigo-text-soft)] transition-colors active:bg-[color:var(--color-indigo-a08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a50)] focus-visible:ring-inset'
                : 'relative flex min-h-[var(--topology-bottom-tab-min-height)] flex-1 flex-col items-center justify-center gap-0.5 text-[color:var(--color-text-quaternary)] transition-colors active:bg-[color:var(--color-overlay-1)] active:text-[color:var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a50)] focus-visible:ring-inset'
            }
          >
            {active ? (
              <span
                aria-hidden
                // No glow: the indigo line alone clears 3:1 against the track.
                className="absolute top-1 h-0.5 w-6 rounded-full bg-[color:var(--color-indigo-line-a90)]"
                data-active-indicator="true"
              />
            ) : null}
            <span
              className={
                active
                  ? 'inline-flex h-6 w-6 items-center justify-center rounded-card border border-[color:var(--color-indigo-a30)] bg-[color:var(--color-indigo-a10)] shadow-[0_0_0_1px_var(--color-indigo-line-a06)_inset]'
                  : 'inline-flex h-6 w-6 items-center justify-center rounded-card border border-transparent transition-colors'
              }
              data-tab-icon-shell={active ? 'active' : 'idle'}
            >
              <Icon size={ICON_SIZE.lg} aria-hidden />
            </span>
            <span className="text-caption font-[var(--font-weight-signature)] leading-display-tight">{tRail(tab.labelKey)}</span>
          </Link>
        );
      })}

      {/* Web-only utility slot; reuses the sibling tabs' touch-target classes. */}
      {showGetApp ? (
        <Link
          href="/download/"
          title={tRail('getAppTitle')}
          data-testid="bottom-tab-get-app"
          className="relative flex min-h-[var(--topology-bottom-tab-min-height)] flex-1 flex-col items-center justify-center gap-0.5 text-[color:var(--color-text-quaternary)] transition-colors active:bg-[color:var(--color-overlay-1)] active:text-[color:var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a50)] focus-visible:ring-inset"
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-card border border-transparent transition-colors">
            <Download size={ICON_SIZE.lg} aria-hidden />
          </span>
          <span className="text-caption font-[var(--font-weight-signature)] leading-display-tight">
            {tRail('getApp')}
          </span>
        </Link>
      ) : null}
    </nav>
  );
}
