"use client";

import { memo, useEffect, useMemo, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import { useDestinationShortcuts } from "@/shared/lib/keyboard/use-destination-shortcuts";
import { focusMapCanvasWhenReady } from "@/shared/lib/map-canvas/focus-map-canvas";
import { navigateWithViewTransition } from "@/shared/lib/navigation/route-view-transition";
import { PaneNavigationContext, type PaneNavigation } from "@/shared/lib/navigation/pane-link";
import { FolderOpen } from "lucide-react";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { Button, useToast } from "@/shared/ui";
import { WaitStage } from "@/shared/ui/status/wait-stage";
import { useLocale, useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/locales";
import { useWorkbenchCatalog } from "@/i18n/workbench-catalog";
import {
  AppNavRail,
  NavRailShellProvider,
  useNavRailShellValue,
  type RailWorkRun,
} from "@/widgets/app-nav-rail";
import { AppSettingsMenu } from "@/widgets/app-settings-menu";
import { useAtlasGitContext } from "@/widgets/atlas-git-panel";
import { useArrivingManifest, useDataSourceMode, useLocalVault, useVaultSessionIdentityScope } from "@/entities/vault-session";
import {
  isRunActive,
  isScheduledActive,
  isTurnActive,
  libraryRingRun,
  useMeaningProgress,
  useWorkRunSnapshot,
  workCardHoldsSeat,
  WorkRunSeat,
} from "@/features/work-run";
import { getTauriVaultRootPath } from "@/shared/lib/vault-folder/native-vault/tauri-vault-runtime";
import { describeVaultShape } from "@/shared/lib/vault-folder/vault-shape";
import { destinationsForVaultShape, FOLDER_OPTIONAL_DESTINATIONS } from "@/shared/config/destinations";
import { AppUpdateProvider, UpdateToast, useAppUpdateContext } from "@/features/app-update";
import { isDesktopShell } from "@/shared/lib/desktop-shell/desktop-shell";
import {
  isGatewaySurface,
  resolveActiveNavDestination,
  stripLocalePrefix,
} from "@/shared/lib/navigation/nav-destination";
import { useInstallNotice } from "@/features/acp-doctor";
import { VaultSwitchRailTile } from "@/features/vault-switch";
import { useProjectsDoorHref } from "@/features/project-data-source";
import { ShellFrame, useShellSetup } from "./ShellFrame";
import { MapNavigationOverlay } from "./MapNavigationOverlay";
import { MeaningRunSeat } from "./MeaningRunSeat";
import { ShellKeyboardSurfaces } from "./ShellKeyboardSurfaces";
import { beginMapNavigation, cancelMapNavigation, useMapNavigationPending } from "@/shared/lib/navigation/map-navigation-pending";
import { useMapReadingContext } from "@/shared/lib/navigation/map-reading-context";
import { buildTopologyReturnHref } from "@/entities/knowledge-graph";
import { useHydrated } from "@/shared/lib/render-timing/use-hydrated";
import { LibraryFolderMirror, LibraryRoundsProvider } from "@/views/library";
import { clearPlanningReturn, getPlanningReturn, getPlanningReturnServer, subscribePlanningReturn } from "@/shared/lib/planning/navigation";

export function AppShell({ children }: { children: ReactNode }) {
  useShellSetup();
  return (
    <NavRailShellProvider>
      {/*
        One updater wiring for the notice and the settings check: its timers are the automatic
        checks, so a second mount would tick twice. The settings sheet is inside the rail, so
        this provider sits outside it.
      */}
      <AppUpdateProvider>
        {/*
          The Library's rounds clock lives above every route, once: a second mount would
          tick twice and could open two adapters for one pass.
        */}
        <LibraryRoundsProvider>
          <LibraryFolderMirror />
          <ShellColumn>{children}</ShellColumn>
        </LibraryRoundsProvider>
      </AppUpdateProvider>
    </NavRailShellProvider>
  );
}

function ShellColumn({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const mapPending = useMapNavigationPending();
  const busy = mapPending !== null;
  const paneNavigation = useMemo<PaneNavigation>(() => ({
    pathname,
    crossfadeTo: (href, { replace, scroll, locale }) => {
      cancelMapNavigation();
      navigateWithViewTransition(() => (replace ? router.replace(href, { scroll, locale }) : router.push(href, { scroll, locale })));
    },
  }), [pathname, router]);

  return (
    <ShellFrame
      rail={<AppNavRailSlot />}
      overlay={<MapNavigationOverlay />}
      busy={busy}
      slotClassName={stripLocalePrefix(pathname).replace(/\/+$/, "") === "/planning" ? "max-lg:mb-[var(--topology-mobile-bottom-tab-reserve)]" : ""}
      footer={
        /* Owned by the shell so every screen surfaces an update and a long run. Outside a desktop
           shell neither exists, so there is no branch here to drift from them. */
        <>
          <MeaningRunSeat />
          <WorkRunSeat />
          <AppUpdateSurface />
        </>
      }
    >
      <PaneNavigationContext.Provider value={paneNavigation}>
        <PlanningReturnBar />
        <VaultRouteIdentityBoundary pathname={pathname}>
          {children}
        </VaultRouteIdentityBoundary>
      </PaneNavigationContext.Provider>
    </ShellFrame>
  );
}

function PlanningReturnBar() {
  const pending = useSyncExternalStore(subscribePlanningReturn, getPlanningReturn, getPlanningReturnServer);
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const t = useTranslations("planning");
  if (!pending || resolveActiveNavDestination(pathname) === "planning") return null;
  return <div className="border-b border-[color:var(--color-border-soft)] px-4 py-2"><Button variant="ghost" onClick={() => { clearPlanningReturn(); router.push("/planning/"); }}>{t("backPlanning")}</Button></div>;
}

function isLocaleRoot(pathname: string): boolean {
  const localPath = stripLocalePrefix(pathname);
  return localPath === "/";
}

/**
 * In the installed app a selected local vault always wins over the bundled sample: a folder
 * load or switch shows the opening pane until `load()` publishes the new manifest (on the map,
 * until a concept arrives), and a same-vault refresh keeps its pixels.
 *
 * A route change is deliberately not a case: a neutral pane there replaces the departing screen
 * React would keep, and leaves blank frames. `local-vault-route-identity.spec.ts` proves the
 * identity; `rail-stays-painted.spec.ts` keeps the neutral pane off route changes.
 */
function VaultRouteIdentityBoundary({
  pathname,
  children,
}: {
  pathname: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const vault = useLocalVault();
  const hydrated = useHydrated();
  const desktop = hydrated && isDesktopShell();
  const destination = resolveActiveNavDestination(pathname);
  const workbenchDestination = !isLocaleRoot(pathname) && destination !== null;
  const arriving = useArrivingManifest();
  const mapHasArrived = destination === "map" && arriving !== null && describeVaultShape(arriving.docs).map;
  const localReady = vault.status === "loaded" || vault.isReloadingSameVault === true || mapHasArrived;
  const localLoadPending =
    desktop &&
    (vault.status === "opening" || vault.status === "loading") &&
    !localReady;
  const sourceOnlyDestination = destination !== null && FOLDER_OPTIONAL_DESTINATIONS.has(destination);
  // Resolve the remembered folder before exposing controls that a restore would replace.
  const sourceRestorePending = desktop && sourceOnlyDestination && !localReady && !vault.restoreAttempted;
  const desktopWithoutVault = desktop && workbenchDestination && !sourceOnlyDestination && !vault.manifest && !vault.partialTotal;

  useEffect(() => {
    if (!desktopWithoutVault || !vault.restoreAttempted) return;
    router.replace("/");
  }, [desktopWithoutVault, router, vault.restoreAttempted]);

  if (localLoadPending || sourceRestorePending) {
    return (
      <VaultOpeningPane
        name={vault.status === "loading" ? (vault.handle?.name ?? null) : null}
        reserveRail={!vault.manifest && !vault.partialTotal}
        map={destination === "map" && !lastReadFoundNoConcept(vault)}
      />
    );
  }
  if (desktopWithoutVault) {
    return (
      <div
        data-testid="vault-route-identity-pending"
        aria-busy="true"
        className="min-h-full bg-[color:var(--color-canvas)]"
      />
    );
  }

  return children;
}

function lastReadFoundNoConcept(vault: ReturnType<typeof useLocalVault>): boolean {
  if (vault.status !== "loading" || !vault.handle) return false;
  const rootPath = getTauriVaultRootPath(vault.handle);
  const record = rootPath ? vault.recentVaults.find((entry) => entry.desktopRootPath === rootPath) : undefined;
  return record?.conceptCount === 0 && (record.docCount ?? 0) > 0;
}

/**
 * A folder that is opening says so, and names it once the read has started.
 *
 * The previous folder is not kept on screen, so it is never drawn as if it were the new one.
 * It enters on `RouteLoadingFallback`'s 400ms anti-flash delay (`route-loading-in`), and it is
 * not `<main>`, so `RouteFocusManager` does not send focus into a pane about to be replaced.
 */
function VaultOpeningPane({ name, reserveRail, map }: { name: string | null; reserveRail: boolean; map: boolean }) {
  const t = useTranslations("vaultSwitch");
  const tMapEntry = useTranslations("mapEntry");
  return (
    <div
      data-testid="vault-route-identity-pending"
      aria-busy="true"
      className="flex min-h-full flex-1 bg-[color:var(--color-canvas)]"
    >
      {reserveRail ? (
        <div
          aria-hidden
          data-testid="vault-opening-rail-reserve"
          className="hidden w-[var(--app-nav-rail-width)] shrink-0 border-r border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] lg:block"
        />
      ) : null}
      <div className="relative min-w-0 flex-1">
        {map ? (
          <WaitStage mark="orbit" title={tMapEntry("mapComing")} detail={tMapEntry("loadingDetail")} delayed />
        ) : (
          <WaitStage mark="mascot" title={name ? t("openingNamed", { name }) : t("openingUnnamed")} delayed />
        )}
      </div>
    </div>
  );
}

function AppNavRailSlot() {
  const { settingsSlot, hidden, contextHrefs } = useNavRailShellValue();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const dataSourceMode = useDataSourceMode();
  const vault = useLocalVault();
  const readingContext = useMapReadingContext(vault.handle);
  const mapReturnHref = resolveActiveNavDestination(pathname) !== "map" && readingContext.selectedId
    ? buildTopologyReturnHref(readingContext.selectedId)
    : undefined;
  /*
   * The Projects door opens the selected project when there is one. The rail, its shortcut and the
   * mobile tab bar all read this hook, or they disagree about where one destination leads.
   */
  const projectsDoorHref = useProjectsDoorHref();

  // Gateway routes hide the rail with `lg:hidden`, not an unmount, decided during render so it never
  // paints for a frame. `isGatewaySurface` is shared with `RootEntryPage`. `useHydrated()` forces a
  // re-render because hydration does not correct a `lg:hidden` baked in prerender.
  const hydrated = useHydrated();
  /* `/` on the web holds a subset of the catalog until a folder arrives (`WorkbenchMessagesProvider`);
     the rail stays the gateway's until the rest is here, as `RootEntryPage` does. */
  const catalogReady = useWorkbenchCatalog(useLocale() as AppLocale) !== null;
  const desktopWithoutVault = hydrated && isDesktopShell() && !vault.manifest && !vault.partialTotal;
  const gateway = isGatewaySurface(pathname, {
    hasVault: Boolean(vault.manifest || vault.partialTotal) && catalogReady,
    desktop: hydrated && isDesktopShell(),
    vaultKnown: vault.restoreAttempted,
  });

  const atAgents = resolveActiveNavDestination(pathname) === "agents";
  const installNotice = useInstallNotice(atAgents);
  const { rail: workRuns, meaningRunId } = useRailWorkRuns();

  const visibleDestinations = useMemo(
    () => destinationsForVaultShape(vault.manifest ? describeVaultShape(vault.manifest.docs) : null),
    [vault.manifest],
  );
  // The badge reads the Git workbench's changeset, or the rail and destination could disagree.
  const { changeset: gitChangeset } = useAtlasGitContext({ demand: false });
  const gitDirtyCount = gitChangeset.touchedNodeIds.size;

  const toast = useToast();
  const tShortcutRows = useTranslations("searchWidgets.shortcuts.rows");

  useDestinationShortcuts({
    navigate: (href, id) => {
      if (id === "map" && resolveActiveNavDestination(pathname) !== "map") {
        beginMapNavigation(() => router.push(href), pathname + window.location.search, true);
        return;
      }
      cancelMapNavigation();
      if (id === "map" || resolveActiveNavDestination(pathname) === id) router.push(href);
      else navigateWithViewTransition(() => router.push(href));
      /* The canvas needs focus before arrow keys walk it (`shared/lib/map-canvas/focus-map-canvas.ts`). */
      if (id === "map") focusMapCanvasWhenReady();
    },
    onBlockedByOverlay: () => {
      toast.show(tShortcutRows("navBlockedByOverlay"), "info");
    },
    disabled: gateway,
    hrefOverrides: { docs: contextHrefs?.docs, map: mapReturnHref },
    visible: desktopWithoutVault ? FOLDER_OPTIONAL_DESTINATIONS : visibleDestinations,
  });

  // The shell fills the utility tier by default so no page can forget it; git is a
  // destination, not a tile here.
  const utilityTier =
    settingsSlot ?? <AppSettingsMenu mode={dataSourceMode} triggerVariant="rail-tile" />;
  const sourceOnlyDestination = FOLDER_OPTIONAL_DESTINATIONS.has(resolveActiveNavDestination(pathname)!);
  const sourceOnly = desktopWithoutVault && sourceOnlyDestination;
  const shownDestinations = sourceOnly ? FOLDER_OPTIONAL_DESTINATIONS : visibleDestinations;
  const railHidden = hidden || gateway || (desktopWithoutVault && !sourceOnlyDestination);

  return (
    <>
      <WorkRunRail
        meaningRunId={meaningRunId}
        vaultSlot={desktopWithoutVault ? <NoVaultRailEntry /> : <VaultSwitchRailTile />}
        settingsSlot={utilityTier}
        hidden={railHidden}
        contextHrefs={
          { ...contextHrefs, map: mapReturnHref, ...(projectsDoorHref ? { projects: projectsDoorHref } : {}), ...(sourceOnly ? { agents: "/agents/?tab=models&returnTo=changes" } : {}) }
        }
        gitDirtyCount={gitDirtyCount}
        agentsNoticeCount={installNotice.count}
        workRuns={workRuns}
        visibleDestinations={shownDestinations}
      />
      {/*
        `?` and ⌘K follow the rail, for the reason the `G` keys do above: the keys the shortcut
        sheet teaches on every screen are answered wherever the rail stands, and nowhere it does
        not. Screens that answer a key themselves claim it (`ShellKeyboardSurfaces`).
      */}
      <ShellKeyboardSurfaces disabled={railHidden} />
    </>
  );
}

/** Changes only when a run's phase or card does; the meaning run's fraction joins in `WorkRunRail`. */
function useRailWorkRuns(): { rail: RailWorkRun[]; meaningRunId: number | null } {
  const snapshot = useWorkRunSnapshot();
  const folder = useVaultSessionIdentityScope();
  return useMemo(() => {
    const rail: RailWorkRun[] = [];
    const ring = libraryRingRun(snapshot, folder);
    let scheduledRunning = false;
    let scheduledUnseen = 0;
    let libraryWaiting = false;
    let libraryUnseen = 0;
    for (const entry of snapshot.runs.values()) {
      if (entry.run.folder !== folder) continue;
      if (entry.kind === "check") {
        if (!isRunActive(entry.run) && entry.run.unseen) libraryUnseen += 1;
      } else if (entry.kind === "turn") {
        if (entry.run.phase === "asking") libraryWaiting = true;
        else if (!isTurnActive(entry.run) && entry.run.unseen) libraryUnseen += 1;
      } else if (entry.kind === "scheduled") {
        if (isScheduledActive(entry.run)) scheduledRunning = true;
        else if (entry.run.unseen) scheduledUnseen += 1;
      }
    }
    if (libraryWaiting) rail.push({ destination: "library", state: "waiting", finished: libraryUnseen });
    else if (ring) rail.push({ destination: "library", state: "running" });
    else if (libraryUnseen > 0) rail.push({ destination: "library", state: "finished", count: libraryUnseen });
    if (scheduledRunning) rail.push({ destination: "automations", state: "running" });
    else if (scheduledUnseen > 0) rail.push({ destination: "automations", state: "finished", count: scheduledUnseen });
    return { rail, meaningRunId: ring?.kind === "meaning" && !libraryWaiting ? ring.run.id : null };
  }, [folder, snapshot]);
}

const RailView = memo(AppNavRail);

/** The ring's fraction in thousandths: finer than a pixel of its arc, coarse enough to skip a redraw. */
const RING_STEPS = 1_000;

/**
 * The rail with the meaning run's fraction on its ring. The figures reach this leaf alone, at most
 * four times a second, so the shell and the slot above never redraw on a count.
 */
function WorkRunRail({ workRuns, meaningRunId, ...props }: ComponentProps<typeof AppNavRail> & { meaningRunId: number | null }) {
  const progress = useMeaningProgress();
  const measured = meaningRunId !== null && progress?.runId === meaningRunId ? progress.fraction : null;
  const fraction = measured === null ? null : Math.round(measured * RING_STEPS) / RING_STEPS;
  const rail = useMemo(
    () => (fraction === null
      ? workRuns
      : workRuns?.map((run) => (run.destination === "library" && run.state === "running" ? { ...run, fraction } : run))),
    [workRuns, fraction],
  );
  return <RailView {...props} workRuns={rail} />;
}

/**
 * Reads the shared update state machine from `AppUpdateProvider`; see the comment there. A run's
 * card holds the seat first, and the update takes it once that card closes.
 */
function AppUpdateSurface() {
  const update = useAppUpdateContext();
  const workCardShown = workCardHoldsSeat(useWorkRunSnapshot());
  if (!update) return null;
  return (
    <UpdateToast
      phase={update.phase}
      hidden={update.noticeHidden || workCardShown}
      onInstall={update.install}
      onRestart={update.restart}
      onDismiss={update.dismiss}
      onHide={update.hide}
      onReturnFocus={focusSettingsTrigger}
    />
  );
}

function focusSettingsTrigger() {
  const triggers = document.querySelectorAll<HTMLElement>('[data-testid="app-settings-trigger"]');
  [...triggers].find((trigger) => trigger.getClientRects().length > 0)?.focus();
}

function NoVaultRailEntry() {
  const t = useTranslations("vaultSwitch");
  return <Link href="/" data-testid="vault-open-rail-tile" aria-label={t("choose.title")}
    className={controlClass({ shape: 'card', hoverSurface: 'lift', hoverInk: 'strong', className: 'group mb-2 w-full flex-col gap-1 border-0 px-0 py-1' })}>
    <span className="flex h-[var(--app-nav-rail-tile-height)] w-[var(--app-nav-rail-tile-width)] items-center justify-center rounded-card border border-[color:var(--color-divider)] text-[color:var(--color-text-secondary)] group-hover:text-[color:var(--color-text-primary)]">
      <FolderOpen size={ICON_SIZE.md} aria-hidden />
    </span>
    <span className="w-full truncate text-center text-[length:var(--app-nav-rail-label-size)] leading-caption text-[color:var(--color-text-secondary)]">{t("choose.openAction")}</span>
  </Link>;
}
