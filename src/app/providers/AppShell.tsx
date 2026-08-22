"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useDestinationShortcuts } from "@/shared/lib/use-destination-shortcuts";
import { focusMapCanvasWhenReady } from "@/shared/lib/focus-map-canvas";
import { installExternalLinkOpener } from "@/shared/lib/tauri-external-link";
import { useToast } from "@/shared/ui";
import { useTranslations } from "next-intl";
import {
  AppNavRail,
  NavRailShellProvider,
  useNavRailShellValue,
} from "@/widgets/app-nav-rail";
import { AppSettingsMenu } from "@/widgets/app-settings-menu";
import { useAtlasGitContext } from "@/widgets/atlas-git-panel";
import { useDataSourceMode } from "@/features/data-source-mode";
import {
  DestinationGuide,
  GuideReplayProvider,
  applyGuideOverride,
} from "@/features/guided-tour";
import { AppUpdateProvider, UpdateToast, useAppUpdateContext } from "@/features/app-update";
import { useLocalVault } from "@/features/docs-vault-local";
import { isDesktopShell } from "@/shared/lib/desktop-shell";
import { isGatewaySurface, resolveActiveNavDestination } from "@/shared/lib/nav-destination";
import { DESTINATION_HREF } from "@/shared/config/destinations";
import { useInstallNotice } from "@/features/acp-doctor/model/use-install-notice";
import { RouteFocusManager } from "@/shared/ui/route-focus-manager";
import { useHydrated } from "@/shared/lib/use-hydrated";

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
            <RouteFocusManager />
            <ShellColumn>{children}</ShellColumn>
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

  // Which screens get a destination guide. The map is excluded because it owns its
  // own eight-step journey, and projects gets one **only on the list** — the rail
  // lights the same destination for `/project/<slug>`, but the guide's copy
  // ("they stand as cards") does not describe that screen.
  const guideDestination =
    !surface || surface === "map"
      ? null
      : surface === "projects" && !resolveIsProjectListPath(pathname)
        ? null
        : surface;

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
        <div
          data-testid="app-shell-body-slot"
          className="flex min-w-0 flex-1 flex-col overflow-y-auto [&>*]:shrink-0"
        >
          {children}
        </div>
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

/** Is this the project **list** screen? `/project/<slug>` detail and edit are not. */
function resolveIsProjectListPath(pathname: string): boolean {
  return pathname.replace(/^\/(?:en|ko)(?=\/|$)/, "").startsWith("/projects");
}

function AppNavRailSlot() {
  const { settingsSlot, hidden, contextHrefs } = useNavRailShellValue();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const dataSourceMode = useDataSourceMode();
  const vault = useLocalVault();

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
  const gateway = isGatewaySurface(pathname, {
    hasVault: Boolean(vault.manifest),
    desktop: hydrated && isDesktopShell(),
    vaultKnown: vault.restoreAttempted,
  });

  // Connected: go to the activity digest (insights). Not connected or stale: go to the
  // agents destination — see the comment on that branch.
  const onAgentTileActivate = useCallback(
    (connected: boolean) => {
      if (connected) {
        router.push("/ontology/insights/");
        return;
      }
      /*
       * ⚠️ **Not connected means going to the destination** (2026-08-21, ledger 90).
       *
       * This used to open the connect sheet on the map, moving to the topology first
       * if you were elsewhere. That made **three** places doing one job: the sheet,
       * the settings pane, and (now) the destination. Attaching an agent has one address.
       */
      router.push(DESTINATION_HREF.agents);
    },
    [router],
  );

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
  // The badge count reads **the same hook** as the destination — if the two values
  // diverge you get the trust-breaking case where the list is empty but a number
  // remains. It is based on the session changeset, so it works on both web and desktop.
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
  });

  // Git was promoted to a destination on 2026-07-25 and this utility tile was absorbed.
  // Two entrances (tile plus destination) reproduce the same confusion the tier drift
  // caused. The uncommitted-change count moved to the destination icon's warning badge.
  const utilityTier =
    settingsSlot ?? <AppSettingsMenu mode={dataSourceMode} triggerVariant="rail-tile" />;

  return (
    <AppNavRail
      settingsSlot={utilityTier}
      hidden={hidden || gateway}
      contextHrefs={contextHrefs}
      gitDirtyCount={gitDirtyCount}
      agentsNoticeCount={installNotice.count}
      onAgentTileActivate={onAgentTileActivate}
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
