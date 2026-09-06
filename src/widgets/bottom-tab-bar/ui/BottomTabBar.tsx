'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { BarChart3, Blocks, BookOpen, Download, FolderKanban, Library, Map as MapIcon } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { useLocalVault } from '@/entities/vault-session';
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

// Mobile-only bottom tab bar — it keeps the five reading/planning destinations
// from the desktop `AppNavRail` (lg+). Agents remains a desktop destination and
// an in-context map action below lg; architecture must stay here because a route
// whose selected destination disappears from the mobile shell has no location
// marker at all. Active state still comes from the same
// `resolveActiveNavDestination`, so the two widgets cannot disagree.
const TABS: ReadonlyArray<TabItem> = [
  ...MOBILE_DESTINATION_IDS.map((id) => ({
    id,
    href: DESTINATION_HREF[id],
    labelKey: id,
    icon: ({
      map: MapIcon,
      architecture: Blocks,
      docs: BookOpen,
      insights: BarChart3,
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
  const t = useTranslations('nav');
  const tRail = useTranslations('navRail');
  const vault = useLocalVault();

  /**
   * "Get the app" — the only download path on web below `lg`.
   *
   * Measured 2026-07-28: the rail is `lg:flex`, so the number of `/download`
   * links visible at 390 and 768 was **zero** — mobile and tablet web visitors
   * had no route to the download at all. The owner gave it the web-only utility slot.
   *
   * It is a **utility, not a destination**, so it lives outside the `TABS`
   * array and never touches `resolveActiveNavDestination`. `/download` hides
   * the tab bar (`shouldHideBottomTabBar`), so an active state for this item
   * cannot occur in the first place.
   *
   * **The hook sits above the early return.** The bar returns `null` on some
   * routes, and below the return the hook order would differ between renders.
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
  const tabs = mapTabs.length > 0 ? mapTabs : WIKI_ONLY_TABS;


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
                // No glow — the indigo line alone clears 3:1 against the track.
                // The former `0 0 12px` indigo halo was exactly the "glow-like
                // boxShadow 0 0 ring" the charter forbids by name, but its value
                // contained `var(`, which put it outside the shadow lint's reach.
                // The same PR narrowed that rule to catch coloured halos.
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

      {/*
        Sixth visible slot on the web — a utility, not a destination, so it stays outside
        the `TABS` array and the active decision is untouched. It reuses the
        sibling tabs' touch-target classes (`--topology-bottom-tab-min-height`
        plus the coarse-pointer contract): shrinking it because it is "only" a
        utility would make it the hardest item to hit below `lg`.
      */}
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
