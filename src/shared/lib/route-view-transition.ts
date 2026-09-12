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
 * `--motion-base` on the `--motion-ease` curve. Reduced motion keeps the
 * crossfade: an opacity-only change is the least-shaking equivalent the design
 * system asks for, not something to switch off.
 *
 * ⚠️ **What is captured is the pane, and only while a transition runs**
 * (2026-09-13). The crossfade used to capture the whole document and lift the nav
 * rail out of it under its own name. In WebKit — the installed app's engine — the
 * root group paints over every other group, so a named sibling spends the whole
 * transition underneath the departing screen's snapshot (the engine table is in
 * `app/globals.css`). `ROUTE_CROSSFADE_CLASS` is therefore put on the document
 * element for exactly as long as the transition lasts: the stylesheet uses it to
 * stop capturing the root and to name the shell's pane instead. Off a transition
 * the document carries no `view-transition-name` at all, so nothing here changes
 * paint or containment while the app is sitting still.
 *
 * ⚠️ **This was not what blanked the installed app, and the record used to say it
 * was** (corrected 2026-09-13). Inspection 122's B1 — *"every rail navigation
 * blanks the whole window, rail included"* — survived the change above, and the
 * reason is that a rail press in the installed app was never a route change at
 * all. `src-tauri/tauri.conf.json`'s `connect-src` refused the App Router's fetch
 * of the arriving route's own payload, so the router fell back to a **full document
 * load**: the blank was the app booting and restoring the folder again, which is
 * why it lasted 33-67 ms on a six-document folder and 100-300 ms on a
 * 104-document one. `scripts/lib/desktop-csp.mjs` carries that measurement and the
 * gates.
 *
 * With navigation restored to a route change, the crossfade **paints correctly on
 * WKWebView**. Measured on the installed app, change-driven frame burst at 1/120 s
 * over a rail band and a pane band: a Library crossing ran the transition for 231 ms
 * with its four `::view-transition` animations occupying the declared 180 ms, and
 * **every frame of it was painted** — rail ink 0.0243-0.0307, never 0. So the
 * crossfade is not engine-gated and no surface opts out of it; a browser without
 * the API still takes the direct path below, as it always has.
 *
 * **Why the promise resolves on the pathname, not on `router.push`.** The App
 * Router's push returns before the new tree is committed. The transition must
 * hold the old snapshot until the new screen is in the DOM, so the shell resolves
 * the pending transition in a layout effect keyed on the pathname — after commit,
 * before paint. A safety timeout resolves it regardless, so a navigation that
 * never changes the pathname (already there, or blocked) cannot freeze input
 * behind a held snapshot for more than a moment.
 *
 * ⚠️ **"For more than a moment" was not measured until 2026-09-12, and it was
 * wrong.** Resolving the update callback is not the end of the transition: the
 * animations run afterwards, and while any of them runs the captured document is
 * not painted and therefore not hit-tested — `elementFromPoint` answers `html` at
 * every point and a press lands on nothing. Arriving at the Library the hold ran to
 * 480-489 ms against a 180 ms declared crossfade, and a press at +300 ms missed the
 * door. So this file now owns a second bound — the crossfade budget below, armed
 * when the route commits — and `app/globals.css` no longer lets the browser's own
 * group animations outlive the crossfade it declares.
 *
 * Browsers without the API (or a build without `document`) navigate as before.
 */

/** Longest a transition may hold the old snapshot while waiting for the new route (ms). */
export const ROUTE_VIEW_TRANSITION_SETTLE_TIMEOUT_MS = 900;

type StartViewTransition = (update: () => Promise<void> | void) => unknown;

/**
 * The object `startViewTransition` hands back. Every field is optional because
 * this module also accepts the fakes the tests pass and older implementations
 * that return nothing.
 */
interface ViewTransitionHandle {
  ready?: Promise<unknown>;
  finished?: Promise<unknown>;
  updateCallbackDone?: Promise<unknown>;
  skipTransition?: () => void;
}

/**
 * **A skipped transition is not an error here** (installed app, 2026-09-04).
 *
 * When the document is hidden the browser refuses to run the transition and
 * *rejects* `ready` (and, depending on when it is skipped, `finished` and
 * `updateCallbackDone`). Nothing awaited them, so the WebView logged
 * `webview unhandledrejection: View transition was skipped because document
 * visibility state is hidden.` on an ordinary background navigation.
 *
 * The navigation itself already happened inside the update callback, so there
 * is nothing to recover: the only correct response is to stop the rejection
 * from escaping. Handlers are attached to whichever promises the handle
 * actually carries.
 */
function silenceSkippedTransition(handle: unknown): void {
  if (!handle || typeof handle !== 'object') return;
  const { ready, finished, updateCallbackDone } = handle as ViewTransitionHandle;
  for (const promise of [ready, finished, updateCallbackDone]) {
    if (typeof promise?.catch === 'function') promise.catch(() => undefined);
  }
}

/**
 * **A crossfade that could not start is a delay, not motion** (measured 2026-09-12).
 *
 * While a view transition runs, the captured document is not painted, and an unpainted
 * document is not hit-testable: `document.elementFromPoint` answers `html` at every
 * point and a press lands on nothing. So the length of the transition is the length of
 * time the arriving screen refuses input.
 *
 * `app/globals.css` declares one 180 ms crossfade and (since the same day) removes the
 * UA group animations that used to outlive it. What it cannot control is *when* the
 * browser gets to start that crossfade: the animations begin on the first frame after
 * the new route commits, so a route whose first render costs 200 ms pays that 200 ms
 * **and then** the whole 180 ms fade. Measured across six rail crossings on the static
 * export at 1512x901:
 *
 * | arriving at | committed | animations started | finished |
 * |---|---|---|---|
 * | Agents / MCP / History | 20-43 ms | 39-56 ms | 278-301 ms |
 * | Library | 22-24 ms | 229-239 ms | 480-489 ms |
 *
 * A press at +300 ms landed on `HTML` rather than on the Library's own door.
 *
 * So the hold is bounded from the moment the route commits — the one moment this module
 * is told about. One crossfade's worth of time later, either the fade has begun (and
 * will end on its own, on the duration somebody chose) or it never will, and the
 * transition is skipped. Nothing that can play is cut: on the three routes above the
 * fade starts at 39-56 ms, long inside the bound, and is untouched. What ends is the
 * hold that had no picture in it.
 *
 * The budget is read from `--motion-base` so this file and the stylesheet cannot drift;
 * a document that cannot answer falls back to the same number the stylesheet ships.
 */
export const ROUTE_VIEW_TRANSITION_CROSSFADE_FALLBACK_MS = 180;

export function readCrossfadeBudgetMs(
  read: (() => string) | null = typeof document === "undefined"
    ? null
    : () => getComputedStyle(document.documentElement).getPropertyValue("--motion-base"),
): number {
  if (!read) return ROUTE_VIEW_TRANSITION_CROSSFADE_FALLBACK_MS;
  const raw = read().trim();
  const seconds = /^([\d.]+)s$/.exec(raw);
  if (seconds) return Number(seconds[1]) * 1000;
  const milliseconds = /^([\d.]+)ms$/.exec(raw);
  if (milliseconds) return Number(milliseconds[1]);
  return ROUTE_VIEW_TRANSITION_CROSSFADE_FALLBACK_MS;
}

/** True when at least one of the transition's own animations has a start time. */
function crossfadeHasBegun(animations: readonly { startTime: number | null; pseudo: string | null }[]): boolean {
  return animations.some((animation) => animation.pseudo !== null && animation.startTime !== null);
}

function transitionAnimations(): readonly { startTime: number | null; pseudo: string | null }[] {
  if (typeof document === "undefined" || typeof document.getAnimations !== "function") return [];
  return document.getAnimations().map((animation) => {
    const pseudo = (animation.effect as unknown as { pseudoElement?: string | null } | null)?.pseudoElement ?? null;
    return {
      startTime: animation.startTime === null ? null : Number(animation.startTime),
      pseudo: pseudo && pseudo.startsWith("::view-transition") ? pseudo : null,
    };
  });
}

let pendingSettle: (() => void) | null = null;
/** The bound armed for the transition now running, so a second click replaces it. */
let pendingBound: (() => void) | null = null;

/**
 * The class that makes the stylesheet capture the pane instead of the document.
 *
 * It is added before `startViewTransition` — the browser reads the old state inside that
 * call, so a class added afterwards would name nothing — and removed once the transition
 * has finished, however it ended. A skipped transition settles `finished` too, so the
 * class is never left behind; the counter below is what keeps a second navigation from
 * having the first one's cleanup strip the name out from under it.
 */
/** Paired with `html.route-crossfade` in `app/globals.css`; not exported, so the name lives
 *  in exactly two places and `pnpm knip` does not carry an unused export. */
const ROUTE_CROSSFADE_CLASS = "route-crossfade";

let crossfadeGeneration = 0;

function beginCrossfadeCapture(): number {
  if (typeof document === "undefined") return 0;
  crossfadeGeneration += 1;
  document.documentElement.classList.add(ROUTE_CROSSFADE_CLASS);
  return crossfadeGeneration;
}

function endCrossfadeCapture(generation: number): void {
  if (typeof document === "undefined") return;
  if (generation !== crossfadeGeneration) return;
  document.documentElement.classList.remove(ROUTE_CROSSFADE_CLASS);
}

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
  options?: {
    startViewTransition?: StartViewTransition | null;
    timeoutMs?: number;
    setTimeoutFn?: typeof setTimeout;
    /** The crossfade's own budget; defaults to `--motion-base`. */
    crossfadeMs?: number;
    /** The transition's animations, for tests with no compositor. */
    animations?: () => readonly { startTime: number | null; pseudo: string | null }[];
  },
): "transition" | "direct" {
  const start = options?.startViewTransition === undefined ? viewTransitionApi() : options.startViewTransition;
  if (!start) {
    navigate();
    return "direct";
  }
  const timeoutMs = options?.timeoutMs ?? ROUTE_VIEW_TRANSITION_SETTLE_TIMEOUT_MS;
  const schedule = options?.setTimeoutFn ?? setTimeout;
  const crossfadeMs = options?.crossfadeMs ?? readCrossfadeBudgetMs();
  const animations = options?.animations ?? transitionAnimations;
  // A transition already waiting is released first — two clicks in a row must
  // not chain two held snapshots.
  pendingSettle?.();
  pendingBound = null;
  const generation = beginCrossfadeCapture();
  const handle = start(
    () =>
      new Promise<void>((resolve) => {
        let done = false;
        const settle = () => {
          if (done) return;
          done = true;
          if (pendingSettle === settle) pendingSettle = null;
          resolve();
          // The route has committed, so the crossfade's budget starts here.
          const bound = () => {
            if (pendingBound !== bound) return;
            pendingBound = null;
            if (crossfadeHasBegun(animations())) return;
            handle.skipTransition?.();
          };
          pendingBound = bound;
          schedule(bound, crossfadeMs);
        };
        pendingSettle = settle;
        schedule(settle, timeoutMs);
        navigate();
      }),
  ) as ViewTransitionHandle;
  silenceSkippedTransition(handle);
  releaseCaptureWhenSettled(handle, generation);
  return "transition";
}

/**
 * Puts the document back to capturing nothing once the transition is over.
 *
 * `finished` settles on a skipped transition as well as a completed one, and a handle that
 * carries neither (an older implementation, or a test's fake) is released immediately —
 * leaving the class on would keep a `view-transition-name` on the pane for the rest of the
 * session, which is a containing block the pane does not otherwise have.
 */
function releaseCaptureWhenSettled(handle: ViewTransitionHandle | null, generation: number): void {
  const settled = handle?.finished ?? handle?.updateCallbackDone;
  if (typeof settled?.then !== "function") {
    endCrossfadeCapture(generation);
    return;
  }
  settled.then(
    () => endCrossfadeCapture(generation),
    () => endCrossfadeCapture(generation),
  );
}

/** Called by the shell once the new route has committed: releases the held snapshot. */
export function settleRouteViewTransition(): void {
  pendingSettle?.();
}

/** Test-only: whether a crossfade budget is armed for the running transition. */
export function hasPendingRouteViewTransitionBound(): boolean {
  return pendingBound !== null;
}

/** Test-only: whether a transition is currently holding the old snapshot. */
export function hasPendingRouteViewTransition(): boolean {
  return pendingSettle !== null;
}
