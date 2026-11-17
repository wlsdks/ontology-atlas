"use client";

import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";
import { settleRouteViewTransition } from "@/shared/lib/navigation/route-view-transition";
import { installExternalLinkOpener } from "@/shared/lib/desktop-shell/tauri-external-link";
import { applyGuideOverride } from "@/shared/lib/preferences/first-run-seen";
import { RouteFocusManager } from "@/shared/ui/routing/route-focus-manager";
import { installStandInFocusHandoff } from "@/shared/ui/routing/stand-in-focus-handoff";

installStandInFocusHandoff();

/**
 * The viewport frame both shells draw: the workbench `AppShell` and the gateway's `GatewayShell`.
 * One component, so a gateway page scrolls in the same body slot, with the same route focus and
 * crossfade, as it did when the workbench shell carried it.
 *
 * The frame owns viewport height: an `h-dvh overflow-hidden` column where only the body slot
 * scrolls. A page root fills the slot with `h-full` / `min-h-full`; a page using the classes
 * `h-screen` or `min-h-screen` pushes whatever the shell puts below the body off screen.
 */
export function ShellFrame({
  rail,
  overlay,
  footer,
  busy = false,
  slotClassName = "",
  children,
}: {
  rail?: ReactNode;
  overlay?: ReactNode;
  footer?: ReactNode;
  /** A map navigation is pending: the departing pane takes no input and is hidden from readers. */
  busy?: boolean;
  slotClassName?: string;
  children: ReactNode;
}) {
  return (
    <>
      <RouteFocusManager />
      <RouteViewTransitionSettle />
      {/* `relative` makes the frame the containing block for `absolute` descendants such as
          `sr-only`; otherwise they position against the viewport and extend the document scroll
          range (gate: document-scroll-lock.spec.ts). */}
      <div className="relative flex h-dvh w-full flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1">
          {rail}
          {/* The body slot is a scroll container and must not shrink its child: a page root's
              `min-h-full` overrides the flex item's automatic minimum, so without `shrink-0` the
              page box shrinks to the viewport and its bottom padding leaves no gap at the end of
              the scroll. Declared once here so no page has to remember it. */}
          {/* The test id names this slot because `.overflow-y-auto` also matches the rail's `<nav>`. */}
          {/*
            The route crossfade captures the frame around the pane (`app/styles/base-motion.css`),
            named only during a transition, so it is not a stacking context or containing block for
            pages' fixed surfaces otherwise. The rail is outside it and keeps taking presses.
          */}
          <div data-app-shell-pane-frame="" className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div
              data-testid="app-shell-body-slot"
              data-app-shell-pane=""
              inert={busy}
              aria-busy={busy}
              aria-hidden={busy ? true : undefined}
              className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto [&>*]:shrink-0 ${slotClassName}`}
            >
              {children}
            </div>
          </div>
          {overlay}
        </div>
        {footer}
      </div>
    </>
  );
}

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

/** Called first by each shell, above its providers, so it runs before anything they render. */
export function useShellSetup(): void {
  useGuideOverride();
  /*
   * A Tauri WebView does not open `target="_blank"`, so outbound links are intercepted once
   * here rather than per link, which covers links added later. It does not attach on the web.
   */
  useEffect(() => installExternalLinkOpener(), []);
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
