"use client";

import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useDestinationShortcuts } from "@/shared/lib/use-destination-shortcuts";
import { focusMapCanvasWhenReady } from "@/shared/lib/focus-map-canvas";
import { settleRouteViewTransition } from "@/shared/lib/route-view-transition";
import { installExternalLinkOpener } from "@/shared/lib/tauri-external-link";
import { installNativeEscapeBridge } from "@/shared/lib/tauri-native-escape";
import { useToast } from "@/shared/ui";
import { BrandWaitingMark } from "@/shared/ui/brand-waiting-mark";
import { useTranslations } from "next-intl";
import {
  AppNavRail,
  NavRailShellProvider,
  useNavRailShellValue,
} from "@/widgets/app-nav-rail";
import { AppSettingsMenu } from "@/widgets/app-settings-menu";
import { useAtlasGitContext } from "@/widgets/atlas-git-panel";
import { useDataSourceMode, useLocalVault } from "@/entities/vault-session";
import { describeVaultShape } from "@/shared/lib/vault-shape";
import { destinationsForVaultShape } from "@/shared/config/destinations";
import {
  DestinationGuide,
  GuideReplayProvider,
  applyGuideOverride,
} from "@/features/guided-tour";
import { AppUpdateProvider, UpdateToast, useAppUpdateContext } from "@/features/app-update";
import { isDesktopShell } from "@/shared/lib/desktop-shell";
import {
  isGatewaySurface,
  resolveActiveNavDestination,
  resolveGuideDestination,
} from "@/shared/lib/nav-destination";
import { useInstallNotice } from "@/features/acp-doctor";
import { VaultSwitchRailTile } from "@/features/vault-switch";
import { useSoleProjectHref } from "@/features/project-data-source";
import { RouteFocusManager } from "@/shared/ui/route-focus-manager";
import { MapNavigationOverlay } from "./MapNavigationOverlay";
import { beginMapNavigation, cancelMapNavigation, useMapNavigationPending } from "@/shared/lib/map-navigation-pending";
import { useHydrated } from "@/shared/lib/use-hydrated";
import { LibraryRoundsProvider } from "@/views/library";

/**
 * The persistent SPA shell. The nav rail lives here, in
 * `app/[locale]/layout.tsx`, rather than being mounted by each of the eight
 * pages. Navigation was already a client-side RSC transition, but unmounting and
 * remounting the whole page tree rebuilt the rail's DOM every time (injected data
 * attributes vanished after a move), which read as "flickering and reloading".
 * At layout level only the content area swaps and the rail keeps its React identity.
 *
 * **Height contract (revised 2026-07-26 — the earlier "the shell does not force
 * height" is retired).** Pages used to claim viewport height on their own root
 * (`h-screen` / `min-h-screen`) while the shell was a transparent pass-through.
 * That model breaks the moment the shell puts anything below the body: a page
 * claiming 100vh makes the shell column `100vh + that`, pushing the lower surface
 * off screen (measured: 0 visible pixels).
 *
 * So **the shell owns viewport height**: it holds an `h-dvh overflow-hidden`
 * column and only the body slot scrolls. A page root just fills the slot with
 * `h-full` / `min-h-full` and never needs to know what the shell puts below it —
 * structure a page has to remember is what causes drift. `h-screen` /
 * `min-h-screen` on a new page is a defect.
 */
/**
 * Releases a route crossfade the moment the new route has committed — a layout
 * effect keyed on the pathname runs after commit and before paint, which is the
 * exact moment the View Transitions API wants the "new" state to exist
 * (`shared/lib/route-view-transition.ts`).
 */
function RouteViewTransitionSettle() {
  const pathname = usePathname();
  useLayoutEffect(() => {
    settleRouteViewTransition();
  }, [pathname]);
  return null;
}

export function AppShell({ children }: { children: ReactNode }) {
  useGuideOverride();
  /*
   * **Every outbound link in the app is revived from this one place** (2026-08-20).
   *
   * A Tauri WebView does not open `target="_blank"`, so links like "↗ install
   * instructions" were dead **with no sign of it** — and that was the only next
   * step we offered someone with no tooling at all.
   *
   * Not fixed per link: outbound links are spread across 10 files, and fixing them
   * one by one means missing the eleventh. Intercepting once in the shell covers
   * links added later too. On the web it does not attach at all (the browser
   * already opens them).
   */
  useEffect(() => installExternalLinkOpener(), []);
  /*
   * **Escape reaches the page under every input source** (2026-09-25). The Korean input source
   * can keep a plain Escape from the WebView, and then no sheet, palette or dialog closes from
   * the keyboard. The native side signals each press and this bridge stands in for a key-down
   * the WebView never sent — once, and never for a press it did send. Like the link opener, it
   * attaches nothing on the web.
   */
  useEffect(() => installNativeEscapeBridge(), []);
  return (
    <NavRailShellProvider>
      <GuideReplayProvider>
          {/*
            The update state machine lives **here, once** (2026-08-20). It has two
            consumers — the bottom-right toast and "check for updates" in settings.
            If each called the hook there would be two state machines, settings and
            the toast would disagree, and the once-a-day auto check would run twice.
            The settings sheet is inside the rail, so this provider must sit outside it.
          */}
          <AppUpdateProvider>
            {/*
              The Library's clock lives here, once, above every route (2026-09-17): a round
              registered on the Rounds tab keeps running while the person is on the map, and
              a second mount would tick twice and could open two adapters for one pass.
            */}
            <LibraryRoundsProvider>
              <RouteFocusManager />
              <RouteViewTransitionSettle />
              <ShellColumn>{children}</ShellColumn>
            </LibraryRoundsProvider>
          </AppUpdateProvider>
      </GuideReplayProvider>
    </NavRailShellProvider>
  );
}

/**
 * Applies `?guides=off|reset` **before children render** (for audit sessions).
 *
 * Lazy state initialization rather than an effect: guide surfaces read
 * localStorage in their own state initializers and effects, and React runs parent
 * render → child render → child effects → parent effects. A `useEffect` here is
 * **already too late** — the guide appears for one frame and disappears, and that
 * frame is exactly what a motion audit measures. An initializer runs during the
 * parent's *render*, ahead of the children.
 *
 * Side effects during render are normally avoided, but this write is idempotent
 * (same key, same value) and gives the same result under StrictMode double render.
 */
function useGuideOverride(): void {
  useState(() => {
    if (typeof window === "undefined") return null;
    return applyGuideOverride(window.location.search);
  });
}

/**
 * The shell body — rail, scrolling body slot, and destination guides.
 *
 * The in-app terminal dock used to live at the bottom; the owner removed it on
 * 2026-07-26, since anyone running an agent opens their own terminal and the one
 * advantage the app offered (appearing beside the map in the same folder) was
 * already provided by the vault watcher regardless of where the process runs.
 */
function ShellColumn({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const surface = resolveActiveNavDestination(pathname);
  /*
   * **The MCP tab keeps its own guide** (2026-09-20). MCP folded into `/agents` as a tab, and
   * `/mcp` became a redirect — so `resolveActiveNavDestination` answers "agents" for both tabs
   * and the "mcp" guide, whose two pages describe exactly this tab, could never appear. The
   * rail's active marker must still read "agents" here (MCP has no tile), so the tab is read
   * from the address for the guide alone rather than by changing that resolution.
   */
  const mapPending = useMapNavigationPending();

  /*
   * Which screens get a destination guide. The map is excluded because it owns its own
   * eight-step journey, and projects gets one **only on the list** — the rail lights the same
   * destination for `/project/<slug>`, but the guide's copy ("they stand as cards") does not
   * describe that screen.
   *
   * ⚠️ **`tab` is null here, and the shell may not make it anything else** (2026-09-20).
   *
   * The MCP tab still shows the Agents guide rather than its own, and the fix is not to read
   * the query from this component. `useSearchParams` makes its caller bail out of
   * prerendering; `next.config.ts` keeps `output: 'export'`, so every route is prerendered;
   * and the layout renders this shell **above** each page's `Suspense`. Calling it here failed
   * `pnpm build` on `/en/agents` **and** on `/en/ontology/edit` — a redirect page the change
   * never touched — and took five Playwright shards red behind one broken artifact.
   *
   * Isolating the call in a leaf behind a boundary of its own does fix the build, and was
   * rejected for a second reason: `route-blank-fallback.contract.test.ts` requires every
   * `Suspense` under `app/` or `src/` to name one of three approved fallbacks and forbids an
   * empty one, because a route boundary with nothing to show ships a deployed `index.html`
   * with an empty body. That gate reads raw file text, so it cannot tell a route boundary from
   * a leaf overlay — and weakening it to pass a first-visit card would trade a severe failure
   * for a small one. (It also matches this comment if the forbidden spelling is written out,
   * which is why it is described here rather than quoted.)
   *
   * So the MCP guide waits for a mechanism that does not read the address in the shell — the
   * tab is already known inside the page, under a boundary that exists. `resolveGuideDestination`
   * keeps the rule and its unit tests for when that arrives.
   */
  const guideDestination = resolveGuideDestination({ surface, pathname, tab: null });

  return (
    // **The shell owns the viewport.** The alternative — a `--app-viewport-h` token
    // for each page to consume — was rejected: that is structure a page has to
    // remember, and it invites the same drift that left the rail's utility tier at
    // 1/2/3 tiles depending on the screen. With the shell holding `h-dvh` and
    // confining the body to a scroll area, no page has to know anything.
    //
    // `relative` is the other half of that ownership (2026-08-08): with a `static`
    // shell, an `absolute` element with no positioned ancestor (`sr-only` above all)
    // positions against **the viewport**, and `overflow-hidden` cannot clip an
    // element whose containing block it is not — so that element **extends the
    // document scroll range**. Two `sr-only` elements inside expanded content on the
    // gateway stretched the document by 1108px, so scrolling to the end showed a
    // blank screen (measured at 600×900). Gate: document-scroll-lock.spec.ts.
    <div className="relative flex h-dvh w-full flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1">
        <AppNavRailSlot />
        {/* The body slot is **a scroll container**, so it must not compress its own
            child — the child variant below is that contract. A page root uses
            `min-h-full` to fill the slot, and that explicit min-height overrides a
            flex item's automatic minimum size (its content height). So once content
            grew past the viewport, flex **shrank** the page box down to viewport
            height, the content spilled out as visible overflow, and the page's bottom
            padding sat at the floor of the shrunken box — leaving no gap at the end of
            the scroll (measured at 1512×950: projects list content 1368 / box 950 /
            end gap 0px; download 2334 / 950 / 0px; project detail and insights the same).
            Prescribing `shrink-0` per page invites drift — the next screen forgets it.
            The shell owns the scroll container, so it declares this once. Children are
            still free to grow (`grow` unchanged), so vertically centred short content
            and `h-full` pages are unaffected. */}
        {/*
          Why there is a `data-testid`: the contract that measures this slot used to
          grab the **first** `.overflow-y-auto`, and when the rail became eight
          destinations on 2026-08-20 and gained scroll, that selector grabbed **the
          rail's `<nav>`**. The check went red rather than green, which was lucky —
          had it been wrong the other way it would have silently measured the wrong
          element. Naming the target makes that class of failure impossible.
        */}
        {/*
          `data-app-shell-pane` is what the route crossfade captures (`app/globals.css`).
          It is an attribute rather than a class because the stylesheet only names it while
          a transition is running: off a transition this box carries no
          `view-transition-name`, so it is not a stacking context or a containing block for
          the fixed-position surfaces pages put inside it. The rail and everything else the
          shell owns are deliberately **not** captured — they stay part of the live document
          so they keep painting and keep taking presses while the pane fades.
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

      {/* First-visit guide per destination (2026-07-26). The shell owns it because
          hand-mounting it on every page means nobody notices when one is missing.
          The `key` remounts it per destination so the previous screen's card does not
          linger mid-navigation. The map passes `null` — its eight-step journey has
          canvas node anchors and interactive clicks, so HomePage keeps owning it. */}
      <DestinationGuide key={guideDestination ?? "none"} destination={guideDestination} />

      {/* Update notifications are owned by the shell (2026-07-27). Mounting them per
          page means some screens never surface an update, and whoever mostly uses
          those screens stays on an old version forever. Outside a desktop shell the
          hook does nothing on its own, so there is no branch here — a condition in two
          places lets one drift. */}
      <AppUpdateSurface />


    </div>
  );
}

/** Is this the locale root that owns the installed app's first-run/restore branch? */
function isLocaleRoot(pathname: string): boolean {
  const localPath = pathname.replace(/^\/(?:en|ko)(?=\/|$)/, "") || "/";
  return localPath === "/";
}

/**
 * Keeps one vault identity on screen while a folder loads.
 *
 * The static export contains a complete bundled sample so a vault-less web visitor has a useful
 * first paint. In the installed app, however, Next can briefly commit that prerendered destination
 * while the newly mounted client page is still reading the already-restored local provider. The
 * owner caught the result at 30fps: Storefront Insights/Projects/Architecture appeared, then the
 * selected Atlas vault replaced it; Docs also carried the sample `domains/order` slug into local.
 *
 * A selected local vault always wins. A genuine folder load/switch stays neutral until `load()`
 * atomically publishes the new manifest; a same-vault refresh keeps its current pixels through
 * `isReloadingSameVault`; and a workbench destination reached with no vault at all goes home.
 *
 * ⚠️ **A route change is no longer one of the cases** (2026-09-13). It used to be: the boundary
 * committed one neutral pane on every route change and released it from a microtask, so the
 * destination would mount against the restored manifest rather than against its own prerendered
 * HTML. What that actually bought was a blank screen with no upper bound. React already keeps the
 * *departing* screen on the glass until the arriving route can render — a route change is a
 * transition — but a committed neutral pane replaces that screen with nothing, and then the
 * arriving route's first render suspends against it. Traced on the dev server: `pend` went false
 * within 16 ms of the commit and the pane stayed on the glass for **four more frames** while the
 * destination's render retried. `queueMicrotask`, a synchronous setState in the layout effect and
 * `flushSync` from a microtask were each measured and each left those frames, because what holds
 * the pane is the arriving route, not the release. On the installed app this is the body half of
 * inspection 122's B1 — body ink 0.0000 at +0.15 s, +0.30 s and +0.47 s, because the route
 * crossfade captured the blank pane as the arriving screen.
 *
 * Removing it restores React's own answer: the pane keeps the screen it has until the destination
 * has one to put there. The identity guarantee is unchanged and is still proved frame by frame, on
 * the static export, by `local-vault-route-identity.spec.ts` — the bundled sample reaches no frame
 * of any rail crossing. `rail-stays-painted.spec.ts` is what keeps the neutral pane from coming
 * back to a route change.
 *
 * ⚠️ **Why the arm existed at all, finally measured** (2026-09-13). "Next can briefly commit that
 * prerendered destination" was true, and the reason was not React scheduling: `connect-src`
 * refused the App Router's fetch of the arriving route's payload, so **every rail press was a full
 * document load** and what the owner caught at 30 fps was the app's own pre-hydration HTML — the
 * bundled sample on a workbench destination, and on History a rail carrying every destination, the
 * *browser* copy and a download button inside the installed app. The arm was covering for that.
 * The cause is fixed in `src-tauri/tauri.conf.json` and gated in `scripts/lib/desktop-csp.mjs`;
 * measured on the installed app afterwards, a rail crossing changes the shell exactly once — rail
 * items 4 → 4, no neutral pane, no download marker, the probe's own document counter unmoved.
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
  const localReady = vault.status === "loaded" || vault.isReloadingSameVault === true;
  const localLoadPending =
    desktop &&
    (vault.status === "opening" || vault.status === "loading") &&
    !localReady;
  const desktopWithoutVault = desktop && workbenchDestination && !vault.manifest;

  useEffect(() => {
    if (!desktopWithoutVault || !vault.restoreAttempted) return;
    router.replace("/");
  }, [desktopWithoutVault, router, vault.restoreAttempted]);

  if (localLoadPending) {
    return <VaultOpeningPane name={vault.status === "loading" ? (vault.handle?.name ?? null) : null} />;
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
 * **A folder that is opening says so, and says which one.**
 *
 * This pane used to be an empty canvas-coloured `div`: switching folders at 1512x949 left the
 * whole workbench blank for 3.6 s with no copy, no mark and no folder name, and first run's
 * "Open my folder" showed the same nothing (inspection, 2026-09-25, `f-back-400.png`,
 * `e-1512-opening-150.png`). Blank reads as broken.
 *
 * The previous folder is deliberately **not** kept on screen: `isReloadingSameVault` is false
 * while switching so the old folder is never drawn as if it were the new one. What the pane can
 * say honestly is what is happening - opening - and, once the read has started, the folder's
 * name. While the picker is still up there is no chosen folder yet, so it names none.
 *
 * It enters on the same 400ms anti-flash delay as `RouteLoadingFallback` (`route-loading-in`),
 * so a fast switch does not flash a caption; it is not `<main>`, so `RouteFocusManager` does not
 * send focus into a pane that is about to be replaced.
 */
function VaultOpeningPane({ name }: { name: string | null }) {
  const t = useTranslations("vaultSwitch");
  return (
    <div
      data-testid="vault-route-identity-pending"
      aria-busy="true"
      className="flex min-h-full flex-1 items-center justify-center bg-[color:var(--color-canvas)] p-6"
    >
      <div
        role="status"
        className="route-loading-in flex flex-col items-center gap-3 text-label text-[color:var(--color-text-quaternary)]"
      >
        <BrandWaitingMark active initialVisibility="visible" />
        <p data-testid="vault-opening-caption" className="max-w-[min(32rem,80vw)] truncate">
          {name ? t("openingNamed", { name }) : t("openingUnnamed")}
        </p>
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
  /*
   * With exactly one project in the folder, the Projects door opens it. The rail, its keyboard
   * shortcut and the mobile tab bar all read this one hook, because a rail and a tab bar that
   * disagree about where the same destination leads are two navigations rather than one.
   */
  const soleProjectHref = useSoleProjectHref();

  // Gateway routes do not use the workbench chrome (the left rail) — owner decision,
  // 2026-07-28. The `hidden` prop is `lg:hidden` rather than an unmount, so the
  // persistent shell's DOM identity contract holds and only the layout drops it.
  //
  // **Why the shell decides**: with pages calling `setHidden(true)` instead,
  // ① the rail would paint for one frame and vanish, and ② the next gateway surface
  // built would forget the call. A path check finishes during render.
  // `/` is a gateway (the face) **only for a web visitor** — for someone with a vault
  // open, and inside the installed app, it stays the work entry point, so the verdict
  // takes visitor context. The single source is `isGatewaySurface` (`RootEntryPage`
  // calls the same function).
  // ⚠️ `isDesktopShell()` is **a fact only the browser knows**. The static prerender
  // has no `window`, so it is always false, and once that value is baked into the HTML
  // as `lg:hidden` **hydration does not correct the attribute** — the render function
  // is right while the screen stays wrong. Since the installed app opens `/` from that
  // HTML, the left rail disappeared permanently (measured 2026-08-01: reaching the same
  // address by client navigation worked fine). `useHydrated()` guarantees one re-render
  // after hydration.
  const hydrated = useHydrated();
  const desktopWithoutVault = hydrated && isDesktopShell() && !vault.manifest;
  const gateway = isGatewaySurface(pathname, {
    hasVault: Boolean(vault.manifest),
    desktop: hydrated && isDesktopShell(),
    vaultKnown: vault.restoreAttempted,
  });

  /*
   * If an install finished while you were on another screen, the rail says so. It
   * counts **terminal states only** (no progress), and it clears once you visit that
   * screen — the same grammar as the git badge.
   */
  const installNotice = useInstallNotice(
    resolveActiveNavDestination(pathname) === "agents",
  );

  // The rail's bottom utility tier is filled by the shell by default. Pages used to
  // register `useNavRailSettingsSlot(<AppSettingsMenu triggerVariant="rail-tile" />)`
  // by hand, and one page forgot, leaving that screen with a single icon at the bottom
  // (measured 2026-07-25: map 3, docs/insights/projects 2, that page 1). Structure a
  // page has to remember is the source of drift, so the default moves up to the shell
  // and a page overrides only when it needs a special slot.
  // The badge count reads the same session changeset as the Git workbench. If the
  // two diverged, the rail could claim changes while the destination showed none.
  /* The rail and the keys read the same verdict: what this folder's files say it holds. */
  const visibleDestinations = useMemo(
    () => destinationsForVaultShape(vault.manifest ? describeVaultShape(vault.manifest.docs) : null),
    [vault.manifest],
  );
  const { changeset: gitChangeset } = useAtlasGitContext();
  const gitDirtyCount = gitChangeset.touchedNodeIds.size;

  const toast = useToast();
  const tShortcutRows = useTranslations("searchWidgets.shortcuts.rows");

  /**
   * Destination shortcuts (`G` then one key) are wired **in the same place as the rail**.
   *
   * The destinations the rail draws and the ones the keyboard reaches must not diverge,
   * and the cheapest way to prevent that is for both to read the same `contextHrefs` and
   * the same `gateway` verdict. On a gateway screen there is no rail, so there are no
   * keys either — a feature with no on-screen entrance but a keyboard binding is
   * undiscoverable.
   */
  useDestinationShortcuts({
    navigate: (href, id) => {
      if (id === "map" && resolveActiveNavDestination(pathname) !== "map") {
        beginMapNavigation(() => router.push(href), pathname + window.location.search, true);
        return;
      }
      cancelMapNavigation();
      router.push(href);
      /*
       * The map is **not done once you arrive** — the canvas needs focus before arrow
       * keys can walk it. Measured: reaching that canvas by keyboard took **30 Tab
       * presses** (the reasoning is in `shared/lib/focus-map-canvas.ts`). Rather than
       * inventing a shortcut, the existing `G M` takes on this job.
       */
      if (id === "map") focusMapCanvasWhenReady();
    },
    /*
     * **Say so when a blocking overlay prevents the move.** Without this, one screen
     * was a keyboard trap: arriving there raised a "what would you like to do?" dialog,
     * after which every navigation shortcut silently did nothing (caught in the
     * 2026-08-10 full review).
     */
    onBlockedByOverlay: () => {
      toast.show(tShortcutRows("navBlockedByOverlay"), "info");
    },
    disabled: gateway,
    hrefOverrides: contextHrefs?.docs ? { docs: contextHrefs.docs } : undefined,
    visible: visibleDestinations,
  });

  // Git was promoted to a destination on 2026-07-25 and this utility tile was absorbed.
  // Two entrances (tile plus destination) reproduce the same confusion the tier drift
  // caused. The uncommitted-change count moved to the destination icon's warning badge.
  const utilityTier =
    settingsSlot ?? <AppSettingsMenu mode={dataSourceMode} triggerVariant="rail-tile" />;

  return (
    <AppNavRail
      /*
       * Registered by the shell rather than by each page, for the reason the tile exists:
       * the folder's name must not depend on which destination is open. A page-level
       * registration would leave it missing from exactly the destinations a wiki-only
       * vault has (`library`, `agents`, `mcp`, `git`), which is the state the report came
       * from.
       */
      vaultSlot={<VaultSwitchRailTile />}
      settingsSlot={utilityTier}
      hidden={hidden || gateway || desktopWithoutVault}
      contextHrefs={
        soleProjectHref ? { ...contextHrefs, projects: soleProjectHref } : contextHrefs
      }
      gitDirtyCount={gitDirtyCount}
      agentsNoticeCount={installNotice.count}
      visibleDestinations={visibleDestinations}
    />
  );
}

/**
 * The toast only **reads** the shared state machine. Why the hook is not called again
 * here is in the provider comment above.
 */
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
