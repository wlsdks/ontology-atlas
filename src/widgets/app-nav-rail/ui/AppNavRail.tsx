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
import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  BarChart3,
  Blocks,
  Bot,
  Download,
  BookOpen,
  FolderKanban,
  // `History as HistoryIcon` — under certain HMR/bundle states the bare `History`
  // identifier resolves to the global DOM History constructor and crashes the screen
  // with "Illegal constructor". The alias cannot collide with that global.
  History as HistoryIcon,
  Map as MapIcon,
} from "lucide-react";
import { DESTINATION_HREF } from "@/shared/config/destinations";
import { cn } from "@/shared/lib/cn";
import { signalNavigationIntent } from "@/shared/lib/navigation-intent";
import { BrandMark } from "@/shared/ui";
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
  /** The settings trigger (`AppSettingsMenu` rail-tile and the like) — the slot at
   *  the rail's bottom. The persistent shell's `AppShell` supplies the default
   *  trigger, and a page overrides it only by registering its own slot through
   *  `useNavRailShellValue()`. */
  settingsSlot?: ReactNode;
  /** When true the rail is hidden with CSS rather than unmounted (an immersive
   *  fullscreen surface). Keeping the rail in the layout preserves its DOM identity,
   *  which is the point of the persistent-shell promotion, so this prop exists
   *  instead of conditional rendering. */
  hidden?: boolean;
  /** A context override that swaps a rail item's href for one based on "what you were
   *  just looking at" (currently the docs vault only). Only the named keys replace
   *  their default href; every other item, and any unnamed key, keeps its static href.
   *  `AppShell` passes through what it read from `useNavRailShellValue()`. */
  contextHrefs?: NavRailContextHrefs | null;
  /**
   * The Git destination's uncommitted change count. `AppShell` reads the same
   * changeset as the Git workbench and passes only the count, preserving the
   * widget boundary. At zero the ambient badge disappears.
   */
  gitDirtyCount?: number;
  /**
   * How many tools finished installing while the user was on another screen. It
   * counts **terminal states only** — progress is not drawn here, because this is a
   * place seen out of the corner of the eye.
   */
  agentsNoticeCount?: number;
  /** Whether the connection sheet is currently open — the truth source for the tile's `aria-expanded` (global launcher `wantOpen`). */
  className?: string;
}

interface RailDestination {
  id: AppNavRailItemId;
  href: string;
  label: string;
  Icon: ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
  /**
   * The count badge at the top right (uncommitted changes). At `0`/`undefined` it
   * **disappears** rather than greying out. It is an ambient signal from off screen,
   * so it does not enter the attention hierarchy.
   */
  badgeCount?: number;
}

function rememberRailRouteFocus(
  event: ReactMouseEvent<HTMLAnchorElement>,
  pathname: string,
) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  // By here the click is confirmed to «go through» (the guards above filtered out new
  // tabs, modifier keys and cancellation). Signal so a surface with a permanent loop,
  // like the map, can yield its frame budget — measured rationale in
  // `shared/lib/navigation-intent.ts`.
  signalNavigationIntent();
  rememberRouteFocusIntent(pathname);
}

/**
 * The 64px left nav rail (feat/chrome-system,
 * `docs/prototypes/chrome-rail-combined.html`, final owner approval) — permanent
 * chrome owning the global destinations (map · docs vault · studio · insights ·
 * projects · trail) plus the agent status and settings tiles at the bottom. #375
 * mounted it on the topology (HomePage) only, and feat/rail-rollout (#377) extended
 * it to every other page (docs vault, studio, insights, project list/detail/edit,
 * download), consolidating three navigation systems (the `OperationsNav` top tabs,
 * `BottomTabBar` and this rail) into one — the old top tabs (`OperationsNav`) and
 * subtabs (`OntologySubNav`) were retired.
 *
 * The book/network utility tiles and the right rail's settings gear were absorbed
 * here (HeroCollapsed keeps only its pill, and the right vertical rail holds the
 * three map-only tiles). The rail is narrow (`--app-nav-rail-width`), so the settings
 * sheet body opens through a portal, and detailed state such as
 * `AgentActivityChip` lives in the contextual map controls that need it.
 *
 * It is shown from the `lg` breakpoint (≥1024px); below that `BottomTabBar` takes over.
 */
export function AppNavRail({
  settingsSlot,
  hidden,
  contextHrefs,
  gitDirtyCount = 0,
  agentsNoticeCount = 0,
  className,
}: AppNavRailProps) {
  const t = useTranslations("navRail");
  const pathname = usePathname() ?? "/";
  /**
   * 「Get the app」 (get the app) — the only download prompt, drawn **on the web only**.
   * How that is decided, and why it happens after mount, is in
   * `../lib/show-get-app-tile`.
   */
  // Why it is read through `useSyncExternalStore`: the server snapshot can be
  // **`null` (not known yet)**, so the prerendered HTML never asserts "web". That is
  // what stops the app from loading that HTML and then flickering the tile away at
  // hydration.
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

  /**
   * Where the active indicator sits — decided by **measuring** the active tile.
   *
   * It is not computed from index × row height: row height depends on the rail's size
   * tokens and the label's line count, so a hard-coded constant silently diverges the
   * day a token changes. The screen then looks like "the indicator is slightly off the
   * tile", which is exactly the kind of thing a person does not reliably catch by eye.
   *
   * It attaches through a **callback ref** — called the moment the node attaches, so
   * ordering problems cannot arise in principle (on 2026-07-28 the studio's clamp fell
   * into that trap with `[]` deps).
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

  // Re-measure whenever the active destination changes. The transition is enabled only
  // after the first placement — sliding in on the first paint would read as an entrance
  // rather than a movement.
  useLayoutEffect(() => {
    measureIndicator();
  }, [activeId, measureIndicator]);

  useEffect(() => {
    if (!indicator || indicatorReady) return;
    const raf = requestAnimationFrame(() => setIndicatorReady(true));
    return () => cancelAnimationFrame(raf);
  }, [indicator, indicatorReady]);

  // The addresses have one source of truth, `shared/config/destinations` — keyboard
  // navigation and the shortcut sheet must read the same table, so it moved outside
  // this component (with two copies the routes diverge). Labels and icons belong to
  // the screen and stay here.
  const destinations: RailDestination[] = [
    { id: "map", href: DESTINATION_HREF.map, label: t("map"), Icon: MapIcon },
    { id: "architecture", href: DESTINATION_HREF.architecture, label: t("architecture"), Icon: Blocks },
    { id: "docs", href: contextHrefs?.docs ?? DESTINATION_HREF.docs, label: t("docs"), Icon: BookOpen },
    { id: "insights", href: DESTINATION_HREF.insights, label: t("insights"), Icon: BarChart3 },
    { id: "projects", href: DESTINATION_HREF.projects, label: t("projects"), Icon: FolderKanban },
    // Agents — a new destination on 2026-08-20 (ledger 90). The install and connect
    // screens were pulled out of the settings sheet to here.
    //
    // Why the icon is `Bot` (measured from the workbench position): the candidate
    // `SquareTerminal` is "a square with a mark in it" at 20px on the rail and its
    // silhouette collides with `FolderKanban` (projects). `Bot` is the only outline in
    // this list with «a head and ears».
    {
      id: "agents",
      href: DESTINATION_HREF.agents,
      label: t("agents"),
      Icon: Bot,
      // A badge stands here when an install finished while the user was on another
      // screen — **terminal states only**, no progress (a place seen out of the corner
      // of the eye cannot be read if it changes every second).
      badgeCount: agentsNoticeCount,
    },
    // Owner correction, 2026-08-26: Architecture is additive. Git keeps its
    // primary destination, current-route marker, and uncommitted-change badge.
    { id: "git", href: DESTINATION_HREF.git, label: t("git"), Icon: HistoryIcon, badgeCount: gitDirtyCount },
  ];

  return (
    <aside
      aria-label={t("ariaLabel")}
      data-testid="app-nav-rail"
      data-hidden={hidden ? "true" : "false"}
      className={cn(
        "hidden w-[var(--app-nav-rail-width)] shrink-0 flex-col items-center border-r border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] py-3 lg:flex",
        hidden && "lg:hidden",
        className,
      )}
    >
      <Link
        href={buildRouteFocusHref("/topology/")}
        onClick={(event) => rememberRailRouteFocus(event, "/topology/")}
        title="Ontology Atlas"
        aria-label="Ontology Atlas"
        translate="no"
        className="group mb-3.5 flex shrink-0 flex-col items-center gap-1"
      >
        <span className="flex h-[var(--app-nav-rail-logo-size)] w-[var(--app-nav-rail-logo-size)] items-center justify-center text-[color:var(--color-indigo-accent)] transition-colors group-hover:text-[color:var(--color-indigo-hover)]">
          <BrandMark
            size={20}
            detail="compact"
            className="h-[var(--app-nav-rail-logo-icon-size)] w-[var(--app-nav-rail-logo-icon-size)]"
          />
        </span>
        {/* H6 — the permanent wordmark. Ultra-small "Atlas" text under the hexagon puts
            a brand signature on the globally shared rail. The caption ramp step paired
            with a quaternary tone and tracking-caption (the code's discipline).
            aria-hidden — avoids being read twice alongside the Link's aria-label
            "Ontology Atlas". */}
        <span
          aria-hidden="true"
          translate="no"
          className="text-caption font-[var(--font-weight-signature)] tracking-[var(--tracking-caption)] text-[color:var(--color-text-quaternary)] transition-colors group-hover:text-[color:var(--color-text-tertiary)]"
        >
          Atlas
        </span>
      </Link>

      {/*
        The rail's ownership is the same however the destination count, window height
        or UI scale changes. Only the destinations pane scrolls (without `min-h-0` a
        flex child does not shrink), scrolling does not leak to the parent
        (`overscroll-contain`), and the utility tier **never shrinks** (`shrink-0`).
        The cap itself is held by a contract
        (`destination-shortcuts.contract.test.ts`).
      */}
      <nav
        aria-label={t("ariaLabel")}
        className="flex w-full min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain"
      >
        <ul ref={attachDestinationList} className="relative flex w-full flex-col gap-0.5">
          {/*
            The active marker is **one element that moves** (motion audit, 2026-07-28).

            Two tiles used to kill and light their own colour — by Gestalt common fate,
            two markers that disappear and reappear are perceived as "two things",
            while one marker that moves is perceived as "**the same thing went
            there**". The rail's vertical order is this app's only spatial model, and
            the indicator's direction and distance carry **information** on that model:
            where you came from and where you went. Turning it off loses that
            information, so it is not decoration.

            Not one bit of content moves (a route change is only a fast cross-fade). So
            the attention budget goes to what the user asked for, and the chrome moves
            a single point.
          */}
          <span
            aria-hidden
            data-testid="app-nav-rail-active-indicator"
            data-placed={indicator ? "true" : "false"}
            className={cn(
              // Horizontal centring is done by **one inline transform**. Tailwind v4's
              // movement utilities use the **standard `translate` property** rather
              // than `transform`, so giving `-translate-x-1/2` as a class and
              // `transform: translate(-50%, …)` inline applies **both and shifts
              // twice** (measured: 19px left of the tile, clipped outside the rail).
              "pointer-events-none absolute left-1/2 z-0 rounded-card bg-[color:var(--color-indigo-a14)] shadow-[inset_0_0_0_1px_var(--color-indigo-line-a22)]",
              // The first placement is not a transition — sliding in from 0 on the
              // first paint makes it an "entrance" rather than a "movement", and that
              // is motion the user did not ask for (the same lesson `use-row-disclosure`
              // learned).
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
            const surfacePath = href.split(/[?#]/, 1)[0] || "/";
            return (
              <li key={id}>
                <Link
                  href={buildRouteFocusHref(href)}
                  onClick={(event) => rememberRailRouteFocus(event, surfacePath)}
                  /* No `title` — the label is **already visible** right under the icon.
                     A native tooltip covers that label with a grey box drawn by the OS,
                     so neither its tokens nor its motion are ours. The icon-only bottom
                     utility tiles still carry `title`; there it is the only name.
                     (Owner report 2026-08-01: that box was caught in a demo video.) */
                  aria-current={isActive ? "page" : undefined}
                  data-testid={`app-nav-rail-item-${id}`}
                  data-active={isActive ? "true" : "false"}
                  /* 2026-08-05: with no focus ring, arriving by keyboard drew the **OS
                     accent colour** — outside the charter's "neutrals plus one indigo".
                     The bottom utility tiles in this same file already had this ring,
                     so the siblings had diverged. `rounded-card` matches the shape of
                     the box the ring wraps (including the label) to the icon tile, and
                     the box's dimensions do not change by a pixel because of
                     `ring-inset`. */
                  /* ⚠️ `border-0` — this position borrows `card` only for **the focus ring's geometry** (radius and ring box), exactly as the comment above says. But the #961 migration also brought along the 1px hairline the card shape carries, and the hand-written classes before the migration had no border — the owner caught it on the real thing (2026-08-08: "Why does this area have a border now?" — why does this area have a border now?). The visible tile is drawn by the inner span below. Gate: desktop-shell-rail.spec.ts. */
                  className={controlClass({ shape: "card", className: "group relative w-full flex-col gap-1 border-0 px-0 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)]" })}
                >
                  <span
                    className={cn(
                      "relative flex h-[var(--app-nav-rail-tile-height)] w-[var(--app-nav-rail-tile-width)] items-center justify-center rounded-card transition-colors",
                      // This tile does not draw the active surface — the single
                      // indicator above moves in and lays it down. What remains here is
                      // **colour**, and colour is confirmation rather than movement, so
                      // it rides the fast ramp (the default).
                      isActive
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
                      // Signal tone warning — only the `--color-status-warning` alpha
                      // ramp is used. "There are unrecorded changes" is neither an error
                      // nor a completion but an unresolved state calling for attention,
                      // which is warning's definition (an extension of the distinction
                      // GitStatusTile already shipped, not a new exception). Three
                      // digits break the tile geometry, so it caps at `9+`.
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
                      // The size comes from the rail's size token (multiplied by the UI
                      // zoom factor) and the leading **explicitly** names the ramp's
                      // pair — an arbitrary-length reference carries only the size and
                      // cannot bring the companion leading. While it was missing, this
                      // rendered at an inherited 1.5 (14.25px) (measured 2026-07-28).
                      "text-[length:var(--app-nav-rail-label-size)] leading-caption",
                      isActive
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

      {/* Bottom utility tier — only settings and web-only app download. The agent owns connection, conversation, and status checks through the single destination above. */}
      <div
        data-testid="app-nav-rail-utility-tier"
        className="mt-auto flex w-full shrink-0 flex-col items-center gap-1 pt-2"
      >
        {/*
          The one position that exists on the web only. Why a single tile in the chrome
          rather than a banner planted on every surface is written in
          `../lib/show-get-app-tile` — the rail's utility tier is in the same place on
          every destination, so one element is already "many places".

          The destination is `/download`. The visitor's OS is not guessed here — that
          screen already separates the macOS file from "Windows coming" honestly.
          Deciding the OS in the rail turns a wrong guess into a **dead-end CTA**, which
          this repository forbids by name.
        */}
        {showGetApp ? (
          <Link
            href="/download/"
            title={t("getAppTitle")}
            aria-label={t("getApp")}
            data-testid="app-nav-rail-get-app"
            className={controlClass({ shape: "card", tone: "muted", className: "group relative h-[var(--app-nav-rail-tile-height)] w-[var(--app-nav-rail-tile-width)] justify-center border-0 transition-[color,background-color,transform] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] active:translate-y-px active:bg-[color:var(--color-overlay-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset" })}
          >
            <Download
              aria-hidden
              className="h-[var(--app-nav-rail-utility-icon-size)] w-[var(--app-nav-rail-utility-icon-size)]"
            />
          </Link>
        ) : null}
        {settingsSlot}
      </div>
    </aside>
  );
}
