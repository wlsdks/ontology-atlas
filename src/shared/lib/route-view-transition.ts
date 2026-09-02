/**
 * **Route changes crossfade instead of cutting** (2026-09-02).
 *
 * Measured on the static build with a real display recording, 30 fps frames,
 * whole-window pixel diff per frame: a rail click reached the new screen within
 * 33–100 ms, and then **84–99 % of the whole change landed in one frame**
 * (Architecture 84 %, Projects 96 %, Agents 99 %). Every other surface in the
 * app eases (panels, sheets, the map's own transitions), so the one place where
 * the entire screen changed was the one place with no motion at all.
 *
 * The browser's View Transitions API does the work: `document.startViewTransition`
 * snapshots the old screen, the navigation updates the DOM, and the two are
 * crossfaded by the compositor. `app/globals.css` sets the crossfade to
 * `--motion-base` on the `--motion-ease` curve and keeps the nav rail out of the
 * crossfade (its active indicator already slides on its own transition, and a
 * rail that fades under a sliding indicator reads as two events). Reduced motion
 * keeps the crossfade: an opacity-only change is the least-shaking equivalent the
 * design system asks for, not something to switch off.
 *
 * **Why the promise resolves on the pathname, not on `router.push`.** The App
 * Router's push returns before the new tree is committed. The transition must
 * hold the old snapshot until the new screen is in the DOM, so the shell resolves
 * the pending transition in a layout effect keyed on the pathname — after commit,
 * before paint. A safety timeout resolves it regardless, so a navigation that
 * never changes the pathname (already there, or blocked) cannot freeze input
 * behind a held snapshot for more than a moment.
 *
 * Browsers without the API (or a build without `document`) navigate as before.
 */

/** Longest a transition may hold the old snapshot while waiting for the new route (ms). */
export const ROUTE_VIEW_TRANSITION_SETTLE_TIMEOUT_MS = 900;

type StartViewTransition = (update: () => Promise<void> | void) => unknown;

let pendingSettle: (() => void) | null = null;

function viewTransitionApi(): StartViewTransition | null {
  if (typeof document === "undefined") return null;
  const candidate = (document as unknown as { startViewTransition?: unknown }).startViewTransition;
  return typeof candidate === "function" ? (candidate as StartViewTransition).bind(document) : null;
}

/**
 * Run `navigate` inside a view transition when the browser offers one; call it
 * directly otherwise. `navigate` must trigger a client-side route change.
 */
export function navigateWithViewTransition(
  navigate: () => void,
  options?: { startViewTransition?: StartViewTransition | null; timeoutMs?: number; setTimeoutFn?: typeof setTimeout },
): "transition" | "direct" {
  const start = options?.startViewTransition === undefined ? viewTransitionApi() : options.startViewTransition;
  if (!start) {
    navigate();
    return "direct";
  }
  const timeoutMs = options?.timeoutMs ?? ROUTE_VIEW_TRANSITION_SETTLE_TIMEOUT_MS;
  const schedule = options?.setTimeoutFn ?? setTimeout;
  // A transition already waiting is released first — two clicks in a row must
  // not chain two held snapshots.
  pendingSettle?.();
  start(
    () =>
      new Promise<void>((resolve) => {
        let done = false;
        const settle = () => {
          if (done) return;
          done = true;
          if (pendingSettle === settle) pendingSettle = null;
          resolve();
        };
        pendingSettle = settle;
        schedule(settle, timeoutMs);
        navigate();
      }),
  );
  return "transition";
}

/** Called by the shell once the new route has committed: releases the held snapshot. */
export function settleRouteViewTransition(): void {
  pendingSettle?.();
}

/** Test-only: whether a transition is currently holding the old snapshot. */
export function hasPendingRouteViewTransition(): boolean {
  return pendingSettle !== null;
}
