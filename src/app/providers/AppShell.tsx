"use client";

import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useDestinationShortcuts } from "@/shared/lib/keyboard/use-destination-shortcuts";
import { focusMapCanvasWhenReady } from "@/shared/lib/map-canvas/focus-map-canvas";
import { settleRouteViewTransition } from "@/shared/lib/navigation/route-view-transition";
import { installExternalLinkOpener } from "@/shared/lib/desktop-shell/tauri-external-link";
import { useToast } from "@/shared/ui";
import { WaitStage } from "@/shared/ui/status/wait-stage";
import { useTranslations } from "next-intl";
import {
  AppNavRail,
  NavRailShellProvider,
  useNavRailShellValue,
} from "@/widgets/app-nav-rail";
import { AppSettingsMenu } from "@/widgets/app-settings-menu";
import { useAtlasGitContext } from "@/widgets/atlas-git-panel";
import { useDataSourceMode, useLocalVault } from "@/entities/vault-session";
import { describeVaultShape } from "@/shared/lib/vault-folder/vault-shape";
import { destinationsForVaultShape, type DestinationId } from "@/shared/config/destinations";
import { applyGuideOverride } from "@/shared/lib/preferences/first-run-seen";
import { AppUpdateProvider, UpdateToast, useAppUpdateContext } from "@/features/app-update";
import { isDesktopShell } from "@/shared/lib/desktop-shell/desktop-shell";
import {
  isGatewaySurface,
  resolveActiveNavDestination,
  stripLocalePrefix,
} from "@/shared/lib/navigation/nav-destination";
import { useInstallNotice } from "@/features/acp-doctor";
import { VaultSwitchRailTile } from "@/features/vault-switch";
import { useSoleProjectHref } from "@/features/project-data-source";
import { RouteFocusManager } from "@/shared/ui/routing/route-focus-manager";
import { MapNavigationOverlay } from "./MapNavigationOverlay";
import { ShellKeyboardSurfaces } from "./ShellKeyboardSurfaces";
import { beginMapNavigation, cancelMapNavigation, useMapNavigationPending } from "@/shared/lib/navigation/map-navigation-pending";
import { useMapReadingContext } from "@/shared/lib/navigation/map-reading-context";
import { buildTopologyReturnHref } from "@/entities/knowledge-graph";
import { useHydrated } from "@/shared/lib/render-timing/use-hydrated";
import { LibraryRoundsProvider } from "@/views/library";

/**
 * Releases a route crossfade after commit and before paint, when the View Transitions API
 * wants the new state to exist (`shared/lib/navigation/route-view-transition.ts`).
 */
function RouteViewTransitionSettle() {
  const pathname = usePathname();
  useLayoutEffect(() => {
    settleRouteViewTransition();
  }, [pathname]);
  return null;
}

/**
 * The persistent SPA shell, mounted once in `app/[locale]/layout.tsx` so the rail keeps its
 * React identity and only the content area swaps between routes.
 *
 * The shell owns viewport height: an `h-dvh overflow-hidden` column where only the body slot
 * scrolls. A page root fills the slot with `h-full` / `min-h-full`; a page using the
 * classes `h-screen` or `min-h-screen` pushes whatever the shell puts below the body off screen.
 */
export function AppShell({ children }: { children: ReactNode }) {
  useGuideOverride();
  /*
   * A Tauri WebView does not open `target="_blank"`, so outbound links are intercepted once
   * here rather than per link, which covers links added later. It does not attach on the web.
   */
  useEffect(() => installExternalLinkOpener(), []);
  return (
    <NavRailShellProvider>
      {/*
        One update state machine for the toast and the settings check, or they disagree and
        the daily auto check runs twice. The settings sheet is inside the rail, so this
        provider sits outside it.
      */}
      <AppUpdateProvider>
        {/*
          The Library's rounds clock lives above every route, once: a second mount would
          tick twice and could open two adapters for one pass.
        */}
        <LibraryRoundsProvider>
          <RouteFocusManager />
          <RouteViewTransitionSettle />
          <ShellColumn>{children}</ShellColumn>
        </LibraryRoundsProvider>
      </AppUpdateProvider>
    </NavRailShellProvider>
  );
}

/**
 * Applies `?guides=off|reset` before children render, for audit sessions.
 *
 * A state initializer, not an effect: guide surfaces read localStorage in their own
 * initializers, and a parent effect runs after them, so the guide would flash for one frame.
 * The write is idempotent, so a StrictMode double render is harmless.
 */
function useGuideOverride(): void {
  useState(() => {
    if (typeof window === "undefined") return null;
    return applyGuideOverride(window.location.search);
  });
}

function ShellColumn({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const mapPending = useMapNavigationPending();

  return (
    // The shell owns the viewport (see `AppShell`). `relative` makes it the containing block
    // for `absolute` descendants such as `sr-only`; otherwise they position against the
    // viewport and extend the document scroll range (gate: document-scroll-lock.spec.ts).
    <div className="relative flex h-dvh w-full flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1">
        <AppNavRailSlot />
        {/* The body slot is a scroll container and must not shrink its child: a page
            root's `min-h-full` overrides the flex item's automatic minimum, so without `shrink-0`
            the page box shrinks to the viewport and its bottom padding leaves no gap at the
            end of the scroll. Declared once here so no page has to remember it. */}
        {/* The test id names this slot because `.overflow-y-auto` also matches the rail's `<nav>`. */}
        {/*
          The route crossfade captures `data-app-shell-pane` (`app/globals.css`). An
          attribute, named only during a transition, so the box is not a stacking context or
          containing block for pages' fixed surfaces otherwise. The rail is not captured, so it
          keeps painting and taking presses while the pane fades.
        */}
        <div
          data-testid="app-shell-body-slot"
          data-app-shell-pane=""
          inert={mapPending !== null}
          aria-busy={mapPending !== null}
          aria-hidden={mapPending !== null ? true : undefined}
          className="flex min-w-0 flex-1 flex-col overflow-y-auto [&>*]:shrink-0"
        >
          <VaultRouteIdentityBoundary pathname={pathname}>
            {children}
          </VaultRouteIdentityBoundary>
        </div>
        <MapNavigationOverlay />
      </div>

      {/* Owned by the shell so every screen surfaces an update. Outside a desktop shell the
          hook does nothing, so there is no branch here to drift from it. */}
      <AppUpdateSurface />

    </div>
  );
}

/** Is this the locale root that owns the installed app's first-run/restore branch? */
function isLocaleRoot(pathname: string): boolean {
  const localPath = stripLocalePrefix(pathname);
  return localPath === "/";
}

/**
 * Keeps one vault identity on screen while a folder loads.
 *
 * In the installed app a selected local vault always wins over the bundled sample: a folder
 * load or switch shows the opening pane until `load()` publishes the new manifest, a same-vault
 * refresh keeps its pixels through `isReloadingSameVault`, and a workbench destination with no
 * vault goes home.
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
  const workbenchDestination =
    !isLocaleRoot(pathname) && resolveActiveNavDestination(pathname) !== null;
  const localReady =
    vault.status === "loaded" ||
    vault.isReloadingSameVault === true ||
    (resolveActiveNavDestination(pathname) === "map" && vault.partialTotal > 0);
  const localLoadPending =
    desktop &&
    (vault.status === "opening" || vault.status === "loading") &&
    !localReady;
  const destination = resolveActiveNavDestination(pathname);
  const sourceOnlyDestination = destination === "changes" || destination === "agents";
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
        map={resolveActiveNavDestination(pathname) === "map"}
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
   * With exactly one project, the Projects door opens it. The rail, its shortcut and the mobile
   * tab bar all read this hook, or they disagree about where one destination leads.
   */
  const soleProjectHref = useSoleProjectHref();

  // Gateway routes hide the rail with `lg:hidden`, not an unmount, decided during render so it never
  // paints for a frame. `isGatewaySurface` is shared with `RootEntryPage`. `useHydrated()` forces a
  // re-render because hydration does not correct a `lg:hidden` baked in prerender.
  const hydrated = useHydrated();
  const desktopWithoutVault = hydrated && isDesktopShell() && !vault.manifest && !vault.partialTotal;
  const gateway = isGatewaySurface(pathname, {
    hasVault: Boolean(vault.manifest || vault.partialTotal),
    desktop: hydrated && isDesktopShell(),
    vaultKnown: vault.restoreAttempted,
  });

  const atAgents = resolveActiveNavDestination(pathname) === "agents";
  const installNotice = useInstallNotice(atAgents);

  const visibleDestinations = useMemo(
    () => destinationsForVaultShape(vault.manifest ? describeVaultShape(vault.manifest.docs) : null),
    [vault.manifest],
  );
  // The badge reads the Git workbench's changeset, or the rail and destination could disagree.
  const { changeset: gitChangeset } = useAtlasGitContext();
  const gitDirtyCount = gitChangeset.touchedNodeIds.size;

  const toast = useToast();
  const tShortcutRows = useTranslations("searchWidgets.shortcuts.rows");

  /**
   * Destination shortcuts read the rail's `contextHrefs` and `gateway` state, so keys never reach a
   * destination the rail does not draw.
   */
  useDestinationShortcuts({
    navigate: (href, id) => {
      if (id === "map" && resolveActiveNavDestination(pathname) !== "map") {
        beginMapNavigation(() => router.push(href), pathname + window.location.search, true);
        return;
      }
      cancelMapNavigation();
      router.push(href);
      /* The canvas needs focus before arrow keys walk it (`shared/lib/map-canvas/focus-map-canvas.ts`). */
      if (id === "map") focusMapCanvasWhenReady();
    },
    /* Say so when a blocking overlay stops the move, or the shortcut silently does nothing. */
    onBlockedByOverlay: () => {
      toast.show(tShortcutRows("navBlockedByOverlay"), "info");
    },
    disabled: gateway,
    hrefOverrides: { docs: contextHrefs?.docs, map: mapReturnHref },
    visible: desktopWithoutVault ? new Set<DestinationId>(["changes", "agents"]) : visibleDestinations,
  });

  // The shell fills the utility tier by default so no page can forget it; git is a
  // destination, not a tile here.
  const utilityTier =
    settingsSlot ?? <AppSettingsMenu mode={dataSourceMode} triggerVariant="rail-tile" />;
  const sourceOnlyDestination = ["changes", "agents"].includes(resolveActiveNavDestination(pathname) ?? "");
  const sourceOnly = desktopWithoutVault && sourceOnlyDestination;
  const shownDestinations = sourceOnly ? new Set<DestinationId>(["changes", "agents"]) : visibleDestinations;
  const railHidden = hidden || gateway || (desktopWithoutVault && !sourceOnlyDestination);

  return (
    <>
      <AppNavRail
        /*
         * Registered by the shell so the folder name shows on every destination, including the
         * ones a wiki-only vault has.
         */
        vaultSlot={<VaultSwitchRailTile />}
        settingsSlot={utilityTier}
        hidden={railHidden}
        contextHrefs={
          { ...contextHrefs, map: mapReturnHref, ...(soleProjectHref ? { projects: soleProjectHref } : {}), ...(sourceOnly ? { agents: "/agents/?tab=models&returnTo=changes" } : {}) }
        }
        gitDirtyCount={gitDirtyCount}
        agentsNoticeCount={installNotice.count}
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

/** Reads the shared update state machine from `AppUpdateProvider`; see the comment there. */
function AppUpdateSurface() {
  const update = useAppUpdateContext();
  if (!update) return null;
  return (
    <UpdateToast
      phase={update.phase}
      onInstall={update.install}
      onRestart={update.restart}
      onDismiss={update.dismiss}
    />
  );
}
