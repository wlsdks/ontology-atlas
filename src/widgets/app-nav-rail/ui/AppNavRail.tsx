"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  ComponentType,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  Blocks,
  Bot,
  CalendarClock,
  Download,
  FolderKanban,
  // Aliased: a bare `History` can resolve to the DOM History constructor under some HMR states.
  History as HistoryIcon,
  Library,
  LineChart,
  Map as MapIcon,
} from "lucide-react";
import { DESTINATION_HREF } from "@/shared/config/destinations";
import { cn } from "@/shared/lib/cn";
import { signalNavigationIntent } from "@/shared/lib/navigation-intent";
import { beginMapNavigation, cancelMapNavigation, useMapNavigationPending } from "@/shared/lib/map-navigation-pending";
import { navigateWithViewTransition } from "@/shared/lib/route-view-transition";
import {
  buildRouteFocusHref,
  rememberRouteFocusIntent,
} from "@/shared/ui/route-focus-manager";
import { resolveActiveNavRailItem, type AppNavRailItemId } from "../lib/resolve-active-item";
import { shouldShowGetAppTile } from "@/shared/lib/show-get-app-tile";
import { isTauriVaultRuntime } from "@/shared/lib/tauri-vault-fs";

/** The runtime never changes after load, so subscribing is a formality — a no-op. */
const subscribeToRuntime = () => () => {};
/** Prerender has no window, so the answer is **unknown** — never assume `false` (web). */
const getServerRuntimeSnapshot = (): boolean | null => null;
import type { NavRailContextHrefs } from "../model/shell-slot-context";
import { controlClass } from '@/shared/ui/control-class';

export interface AppNavRailProps {
  /**
   * The open folder's identity; the rail carries it because it is the only chrome that survives
   * route changes.
   */
  vaultSlot?: ReactNode;
  /** The settings trigger in the rail's bottom slot; AppShell supplies the default. */
  settingsSlot?: ReactNode;
  /** Hides the rail with CSS instead of unmounting, to keep its DOM identity across routes. */
  hidden?: boolean;
  /** Per-item href overrides from context (docs vault only); other items keep their static href. */
  contextHrefs?: NavRailContextHrefs | null;
  /** Uncommitted change count for the Git destination; the badge disappears at zero. */
  gitDirtyCount?: number;
  /** Tools that finished installing while the user was elsewhere; terminal states only. */
  agentsNoticeCount?: number;
  /** Destinations this folder earns (`destinationsForVaultShape`); `null` draws all. */
  visibleDestinations?: ReadonlySet<AppNavRailItemId> | null;
  className?: string;
}

interface RailDestination {
  id: AppNavRailItemId;
  href: string;
  label: string;
  Icon: ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
  /** Count badge at the top right; disappears at 0 instead of greying out. */
  badgeCount?: number;
}

function rememberRailRouteFocus(
  event: ReactMouseEvent<HTMLAnchorElement>,
  pathname: string,
): boolean {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return false;
  }
  // Only a click that navigates signals, so a surface with a permanent loop can yield frames
  // (`shared/lib/navigation-intent.ts`).
  signalNavigationIntent();
  rememberRouteFocusIntent(pathname);
  return true;
}

/**
 * The 64px left nav rail (`docs/prototypes/chrome-rail-combined.html`): global destinations plus
 * the settings tile, shown from `lg`; below it `BottomTabBar` takes over.
 */
export function AppNavRail({
  contextHrefs,
  vaultSlot,
  settingsSlot,
  hidden,
  gitDirtyCount = 0,
  agentsNoticeCount = 0,
  visibleDestinations = null,
  className,
}: AppNavRailProps) {
  const t = useTranslations("navRail");
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  /** The web-only download tile; the decision lives in `@/shared/lib/show-get-app-tile`. */
  // The server snapshot is `null` (unknown), so prerendered HTML never asserts web and the tile
  // does not flicker at hydration.
  const desktopRuntime = useSyncExternalStore(
    subscribeToRuntime,
    isTauriVaultRuntime,
    getServerRuntimeSnapshot,
  );
  const showGetApp = shouldShowGetAppTile({
    mounted: desktopRuntime !== null,
    isDesktopApp: desktopRuntime === true,
  });

  const activeId = resolveActiveNavRailItem(pathname);
  const mapEntryPending = useMapNavigationPending() !== null;
  const shownActiveId: AppNavRailItemId | null = mapEntryPending ? "map" : activeId;

  /**
   * The active indicator position is measured from the active tile through a callback ref, not
   * computed from row height.
   */
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null);
  const [indicatorReady, setIndicatorReady] = useState(false);
  const listRef = useRef<HTMLUListElement | null>(null);
  const listObserverRef = useRef<ResizeObserver | null>(null);

  const measureIndicator = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const activeTile = list.querySelector<HTMLElement>('[data-active="true"] > span');
    if (!activeTile) {
      setIndicator(null);
      return;
    }
    const listBox = list.getBoundingClientRect();
    const tileBox = activeTile.getBoundingClientRect();
    setIndicator({ top: tileBox.top - listBox.top, height: tileBox.height });
  }, []);

  const attachDestinationList = useCallback(
    (el: HTMLUListElement | null) => {
      listRef.current = el;
      listObserverRef.current?.disconnect();
      listObserverRef.current = null;
      if (!el) return;
      measureIndicator();
      const observer = new ResizeObserver(() => measureIndicator());
      observer.observe(el);
      listObserverRef.current = observer;
    },
    [measureIndicator],
  );

  useEffect(() => () => listObserverRef.current?.disconnect(), []);

  useLayoutEffect(() => {
    measureIndicator();
  }, [shownActiveId, measureIndicator]);

  useEffect(() => {
    if (!indicator || indicatorReady) return;
    const raf = requestAnimationFrame(() => setIndicatorReady(true));
    return () => cancelAnimationFrame(raf);
  }, [indicator, indicatorReady]);

  // Addresses come from `shared/config/destinations` so keyboard navigation and the shortcut sheet
  // share them.
  const allDestinations: RailDestination[] = [
    { id: "map", href: DESTINATION_HREF.map, label: t("map"), Icon: MapIcon },
    { id: "architecture", href: DESTINATION_HREF.architecture, label: t("architecture"), Icon: Blocks },
    { id: "library", href: contextHrefs?.docs ?? DESTINATION_HREF.library, label: t("library"), Icon: Library },
    { id: "automations", href: DESTINATION_HREF.automations, label: t("automations"), Icon: CalendarClock },
    /* `LineChart`, not `BarChart3`: a bar chart shares the Library icon's silhouette at 20px. */
    { id: "insights", href: DESTINATION_HREF.insights, label: t("insights"), Icon: LineChart },
    { id: "projects", href: contextHrefs?.projects ?? DESTINATION_HREF.projects, label: t("projects"), Icon: FolderKanban },
    // `Bot`, not `SquareTerminal`, which collides with `FolderKanban` at 20px.
    {
      id: "agents",
      href: DESTINATION_HREF.agents,
      label: t("agents"),
      Icon: Bot,
      // Badge only for terminal install states; peripheral chrome shows no progress.
      badgeCount: agentsNoticeCount,
    },
    { id: "git", href: DESTINATION_HREF.git, label: t("git"), Icon: HistoryIcon, badgeCount: gitDirtyCount },
  ];
  const destinations = allDestinations.filter(
    (destination) => !visibleDestinations || visibleDestinations.has(destination.id),
  );

  return (
    <aside
      aria-label={t("ariaLabel")}
      data-testid="app-nav-rail"
      // A wall the toaster centres inside rather than across (`src/shared/ui/toast-walls.ts`).
      data-toast-wall="left"
      data-hidden={hidden ? "true" : "false"}
      className={cn(
        /*
         * Not named for the view transition: in WebKit the root group paints over named groups and
         * blanked the rail; the crossfade captures only the pane.
         */
        "hidden w-[var(--app-nav-rail-width)] shrink-0 flex-col items-center border-r border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] py-3 lg:flex",
        hidden && "lg:hidden",
        className,
      )}
    >
      {/*
       * Only the destinations pane scrolls; the utility tier never shrinks
       * (cap: `destination-shortcuts.contract.test.ts`).
       */}
      {/*
       * The vault tile sits outside the scrolling pane so it never scrolls away at the 1040x720
       * floor.
       */}
      {vaultSlot}
      <nav
        aria-label={t("ariaLabel")}
        className="flex w-full min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain"
      >
        <ul ref={attachDestinationList} className="relative flex w-full flex-col gap-0.5">
          {/* One moving active marker, so a route change reads as the same thing moving. */}
          <span
            aria-hidden
            data-testid="app-nav-rail-active-indicator"
            data-placed={indicator ? "true" : "false"}
            className={cn(
              // One inline transform: Tailwind v4 `translate` utilities plus an inline transform
              // would shift twice.
              "pointer-events-none absolute left-1/2 z-0 rounded-card bg-[color:var(--color-indigo-a14)] shadow-[inset_0_0_0_1px_var(--color-indigo-line-a22)]",
              // No transition on the first placement, so it does not read as an entrance.
              indicatorReady && "transition-[transform,height] duration-[var(--motion-base)] ease-[var(--motion-ease)] motion-reduce:transition-none",
            )}
            style={
              indicator
                ? {
                    width: "var(--app-nav-rail-tile-width)",
                    height: indicator.height,
                    top: 0,
                    transform: `translate(-50%, ${indicator.top}px)`,
                    opacity: 1,
                  }
                : { opacity: 0, height: 0, top: 0 }
            }
          />
          {destinations.map(({ id, href, label, Icon, badgeCount }) => {
            const isActive = activeId === id;
            const isShownActive = shownActiveId === id;
            const surfacePath = href.split(/[?#]/, 1)[0] || "/";
            return (
              <li key={id}>
                <Link
                  href={buildRouteFocusHref(href)}
                  onClick={(event) => {
                    if (!rememberRailRouteFocus(event, surfacePath)) return;
                    // The anchor keeps its href for new tabs, modifier clicks and the keyboard.
                    event.preventDefault();
                    const target = buildRouteFocusHref(href);
                    if (id === "map" && !isActive) {
                      beginMapNavigation(() => router.push(target), pathname + window.location.search);
                    } else {
                      cancelMapNavigation();
                      navigateWithViewTransition(() => router.push(target));
                    }
                  }}
                  /*
                   * No `title`: the label is visible under the icon and a native tooltip would
                   * cover it.
                   */
                  aria-current={isActive ? "page" : undefined}
                  data-testid={`app-nav-rail-item-${id}`}
                  data-active={isShownActive ? "true" : "false"}
                  /*
                   * Focus ring so keyboard focus never draws the OS accent colour; ring-inset keeps
                   * the box size.
                   */
                  /*
                   * `py-1`: nine tiles fit the 616px pane at the 1040x720 window floor
                   * (`destination-shortcuts.contract.test.ts`).
                   */
                  /*
                   * `border-0`: this borrows `card` only for the focus ring geometry, not its
                   * hairline.
                   */
                  className={controlClass({ shape: "card", className: "group relative w-full flex-col gap-1 border-0 px-0 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)]" })}
                >
                  <span
                    className={cn(
                      "relative flex h-[var(--app-nav-rail-tile-height)] w-[var(--app-nav-rail-tile-width)] items-center justify-center rounded-card transition-colors",
                      isShownActive
                        ? "z-[1] text-[color:var(--color-indigo-accent)]"
                        : "text-[color:var(--color-text-tertiary)] group-hover:bg-[color:var(--color-overlay-2)] group-hover:text-[color:var(--color-text-primary)]",
                    )}
                  >
                    <Icon
                      size={18}
                      aria-hidden
                      className="h-[var(--app-nav-rail-icon-size)] w-[var(--app-nav-rail-icon-size)]"
                    />
                    {badgeCount ? (
                      // Warning tone for unrecorded changes; caps at `9+` to keep the tile
                      // geometry.
                      <span
                        data-testid={`app-nav-rail-badge-${id}`}
                        className="absolute -right-1 -top-0.5 grid h-[15px] min-w-[15px] place-items-center rounded-full border border-[color:var(--color-amber-source-a30)] bg-[color:var(--color-amber-source-a14)] px-[3px] text-caption font-[var(--font-weight-strong)] leading-display-tight tabular-nums text-[color:var(--color-status-warning)]"
                      >
                        {badgeCount > 9 ? "9+" : badgeCount}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      // Leading named explicitly: an arbitrary-length size does not bring its ramp
                      // leading.
                      "text-[length:var(--app-nav-rail-label-size)] leading-caption",
                      isShownActive
                        ? "font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
                        : "text-[color:var(--color-text-quaternary)]",
                    )}
                  >
                    {label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div
        data-testid="app-nav-rail-utility-tier"
        className="mt-auto flex w-full shrink-0 flex-col items-center gap-1 pt-2"
      >
        {/*
         * Web-only download tile; the OS is not guessed because a wrong guess is a dead-end
         * CTA (@/shared/lib/show-get-app-tile).
         */}
        {showGetApp ? (
          <Link
            href="/download/"
            title={t("getAppTitle")}
            aria-label={t("getApp")}
            data-testid="app-nav-rail-get-app"
            className={controlClass({ shape: "card", tone: "muted", className: "group relative min-h-0 p-0 h-[var(--app-nav-rail-tile-height)] w-[var(--app-nav-rail-tile-width)] justify-center border-0 transition-[color,background-color,transform] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] active:translate-y-px active:bg-[color:var(--color-overlay-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset" })}
          >
            {/*
             * `min-h-0 p-0`: the card shape's own padding would override the rail tile geometry.
             */}
            <Download
              aria-hidden
              className="h-[var(--app-nav-rail-utility-icon-size)] w-[var(--app-nav-rail-utility-icon-size)] shrink-0"
            />
          </Link>
        ) : null}
        {settingsSlot}
      </div>
    </aside>
  );
}
