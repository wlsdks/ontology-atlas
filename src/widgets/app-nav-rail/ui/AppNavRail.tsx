"use client";

import { useSyncExternalStore } from "react";
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
  GitFork,
  // Aliased: a bare `History` can resolve to the DOM History constructor under some HMR states.
  History as HistoryIcon,
  Library,
  Map as MapIcon,
  Newspaper,
  NotebookPen,
} from "lucide-react";
import { DESTINATION_HREF } from "@/shared/config/destinations";
import { cn } from "@/shared/lib/cn";
import { useSlidingIndicator } from "@/shared/motion/use-sliding-indicator";
import { signalNavigationIntent } from "@/shared/lib/navigation/navigation-intent";
import { beginMapNavigation, cancelMapNavigation, useMapNavigationPending } from "@/shared/lib/navigation/map-navigation-pending";
import { navigateWithViewTransition } from "@/shared/lib/navigation/route-view-transition";
import {
  buildRouteFocusHref,
  rememberRouteFocusIntent,
} from "@/shared/ui/routing/route-focus-manager";
import { resolveActiveNavRailItem, type AppNavRailItemId } from "../lib/resolve-active-item";
import { shouldShowGetAppTile } from "@/shared/lib/navigation/show-get-app-tile";
import { isTauriVaultRuntime } from "@/shared/lib/vault-folder/native-vault/tauri-vault-runtime";

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
  settingsSlot?: ReactNode;
  hidden?: boolean;
  contextHrefs?: NavRailContextHrefs | null;
  gitDirtyCount?: number;
  agentsNoticeCount?: number;
  /**
   * Runs that belong to a destination, at most one entry per destination: a ring while one runs,
   * a count once they finished and nobody has read them.
   */
  workRuns?: readonly RailWorkRun[];
  visibleDestinations?: ReadonlySet<AppNavRailItemId> | null;
  className?: string;
}

const NO_WORK_RUNS: readonly RailWorkRun[] = [];

export type RailWorkRun =
  /** `fraction` (0–1) where the run counts against a known total; without it the arc turns. */
  | { destination: AppNavRailItemId; state: "running"; fraction?: number }
  | { destination: AppNavRailItemId; state: "waiting"; finished: number }
  | { destination: AppNavRailItemId; state: "finished"; count: number };

interface RailDestination {
  id: AppNavRailItemId;
  href: string;
  label: string;
  Icon: ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
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
  // (`shared/lib/navigation/navigation-intent.ts`).
  signalNavigationIntent();
  rememberRouteFocusIntent(pathname);
  return true;
}

export function AppNavRail({
  contextHrefs,
  vaultSlot,
  settingsSlot,
  hidden,
  gitDirtyCount = 0,
  agentsNoticeCount = 0,
  workRuns = NO_WORK_RUNS,
  visibleDestinations = null,
  className,
}: AppNavRailProps) {
  const t = useTranslations("navRail");
  const tWork = useTranslations("workCard");
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  /** The web-only download tile; the decision lives in `@/shared/lib/navigation/show-get-app-tile`. */
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

  const { containerRef, itemRef, indicatorStyle, placed, animated } = useSlidingIndicator(
    shownActiveId,
    "surface-y",
  );

  // Addresses come from `shared/config/destinations` so keyboard navigation and the shortcut sheet
  // share them.
  const allDestinations: RailDestination[] = [
    { id: "map", href: contextHrefs?.map ?? DESTINATION_HREF.map, label: t("map"), Icon: MapIcon },
    { id: "architecture", href: DESTINATION_HREF.architecture, label: t("architecture"), Icon: Blocks },
    { id: "library", href: contextHrefs?.docs ?? DESTINATION_HREF.library, label: t("library"), Icon: Library },
    { id: "planning", href: DESTINATION_HREF.planning, label: t("planning"), Icon: NotebookPen },
    { id: "automations", href: DESTINATION_HREF.automations, label: t("automations"), Icon: CalendarClock },
    { id: "projects", href: contextHrefs?.projects ?? DESTINATION_HREF.projects, label: t("projects"), Icon: FolderKanban },
    // `Bot`, not `SquareTerminal`, which collides with `FolderKanban` at 20px.
    {
      id: "agents",
      href: DESTINATION_HREF.agents,
      label: t("agents"),
      Icon: Bot,
      badgeCount: agentsNoticeCount,
    },
    { id: "changes", href: DESTINATION_HREF.changes, label: t("changes"), Icon: Newspaper },
    { id: "git", href: DESTINATION_HREF.git, label: t("git"), Icon: HistoryIcon, badgeCount: gitDirtyCount },
    { id: "workStatus", href: DESTINATION_HREF.workStatus, label: t("workStatus"), Icon: GitFork },
  ];
  const destinations = allDestinations.filter(
    (destination) => !visibleDestinations || visibleDestinations.has(destination.id),
  );

  return (
    <aside
      aria-label={t("ariaLabel")}
      data-testid="app-nav-rail"
      // A wall the toaster centres inside rather than across (`src/shared/ui/toast/toast-walls.ts`).
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
        <ul ref={containerRef} className="relative flex w-full flex-col gap-0.5">
          <span
            aria-hidden
            data-testid="app-nav-rail-active-indicator"
            data-selection-indicator="surface-y"
            data-placed={placed ? "true" : "false"}
            data-animated={animated ? "true" : "false"}
            className="motion-indicator z-0 rounded-card bg-[color:var(--color-indigo-a14)] shadow-[inset_0_0_0_1px_var(--color-indigo-line-a22)]"
            style={indicatorStyle ?? { opacity: 0 }}
          />
          {destinations.map(({ id, href, label, Icon, badgeCount: ownBadge }) => {
            const isActive = activeId === id;
            const run = workRuns.find((candidate) => candidate.destination === id) ?? null;
            const badgeCount = run?.state === "finished" ? run.count : ownBadge;
            const runName = run?.state === "running"
              ? run.fraction === undefined
                ? tWork("railRunning", { destination: label })
                : tWork("railRunningPercent", { destination: label, percent: Math.floor(run.fraction * 100) })
              : run?.state === "waiting"
                ? run.finished > 0
                  ? tWork("railWaitingAndFinished", { destination: label, count: run.finished })
                  : tWork("railWaiting", { destination: label })
                : run?.state === "finished"
                  ? tWork("railFinished", { destination: label, count: run.count })
                  : undefined;
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
                      navigateWithViewTransition(target, () => router.push(target));
                    }
                  }}
                  /*
                   * No `title`: the label is visible under the icon and a native tooltip would
                   * cover it.
                   */
                  aria-current={isActive ? "page" : undefined}
                  aria-label={runName}
                  data-testid={`app-nav-rail-item-${id}`}
                  data-work-run={run?.state}
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
                  className={controlClass({ shape: "card", className: "group relative w-full flex-col gap-1 border-0 px-0 py-1 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)]" })}
                >
                  <span
                    ref={itemRef(id)}
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
                    {run?.state === "running" || run?.state === "waiting" ? (
                      <RunRing
                        id={id}
                        fraction={run.state === "running" ? run.fraction : undefined}
                        still={run.state === "waiting"}
                      />
                    ) : null}
                    {run?.state === "waiting" ? (
                      <span
                        data-testid={`app-nav-rail-waiting-${id}`}
                        className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border border-[color:var(--color-amber-source-a30)] bg-[color:var(--color-status-warning)]"
                      />
                    ) : badgeCount ? (
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
                        : "text-[color:var(--color-text-tertiary)]",
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
         * CTA (@/shared/lib/navigation/show-get-app-tile).
         */}
        {showGetApp ? (
          <Link
            href="/download/"
            title={t("getAppTitle")}
            aria-label={t("getApp")}
            data-testid="app-nav-rail-get-app"
            className={controlClass({ shape: "card", tone: "muted", className: "group relative min-h-0 p-0 h-[var(--app-nav-rail-tile-height)] w-[var(--app-nav-rail-tile-width)] justify-center border-0 transition-[color,background-color,translate] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] active:translate-y-px motion-reduce:translate-none active:bg-[color:var(--color-overlay-3)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset" })}
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

/**
 * A ring around the icon while the destination's run works; it unmounts the moment it ends. With
 * a counted fraction it is an arc from twelve o'clock that eases to each new value; without one, a
 * quarter arc turns. A run waiting on a person holds the arc where it is and goes on from there
 * once answered.
 */
function RunRing({ id, fraction, still = false }: { id: AppNavRailItemId; fraction?: number; still?: boolean }) {
  const counted = fraction !== undefined;
  return (
    <svg
      aria-hidden
      data-testid={`app-nav-rail-ring-${id}`}
      data-ring-fraction={counted ? fraction.toFixed(4) : undefined}
      data-still={still || undefined}
      viewBox="0 0 32 32"
      fill="none"
      className="pointer-events-none absolute left-1/2 top-1/2 size-8 -translate-x-1/2 -translate-y-1/2 overflow-visible"
    >
      <circle cx={16} cy={16} r={14} strokeWidth={1.5} stroke="var(--color-indigo-accent-a12)" />
      <circle
        cx={16}
        cy={16}
        r={14}
        strokeWidth={1.5}
        stroke="var(--color-indigo-accent)"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={counted ? "1 1" : "0.25 0.75"}
        strokeDashoffset={counted ? 1 - Math.min(1, Math.max(0, fraction)) : undefined}
        transform="rotate(-90 16 16)"
        // Values arrive four times a second; each eases into the next from where it is drawn.
        className={counted
          ? "transition-[stroke-dashoffset] duration-[var(--motion-slow)] ease-[var(--motion-ease)]"
          : cn("motion-work-spin", still && "[animation-play-state:paused]")}
      />
      {counted ? (
        <>
          {/* A light keeps circling the track, so a slow count still reads as running. */}
          <circle
            cx={16}
            cy={16}
            r={14}
            strokeWidth={1.5}
            stroke="var(--color-indigo-pale-a82)"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="0.05 0.95"
            className={cn("motion-run-orbit", still && "[animation-play-state:paused]")}
          />
          <g data-testid={`app-nav-rail-ring-head-${id}`} className="motion-run-head" style={{ transform: `rotate(${Math.min(1, Math.max(0, fraction)) * 360}deg)` }}>
            <circle cx={16} cy={2} r={3.5} fill="var(--color-indigo-accent-a32)" />
            <circle cx={16} cy={2} r={1.75} fill="var(--color-indigo-pale-a95)" />
          </g>
        </>
      ) : null}
    </svg>
  );
}
