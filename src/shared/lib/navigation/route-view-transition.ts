/**
 * Crossfades route changes (opacity only, kept under reduced motion). `ROUTE_CROSSFADE_CLASS` is on
 * the document element only while a transition runs. The hold is bounded (timeout, crossfade budget)
 * because a captured document is not hit-testable.
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
 * A skipped transition is not an error: a hidden document makes the browser reject `ready` and the
 * other promises, so handlers are attached to whichever promises the handle carries.
 */
function silenceSkippedTransition(handle: unknown): void {
  if (!handle || typeof handle !== 'object') return;
  const { ready, finished, updateCallbackDone } = handle as ViewTransitionHandle;
  for (const promise of [ready, finished, updateCallbackDone]) {
    if (typeof promise?.catch === 'function') promise.catch(() => undefined);
  }
}

/**
 * A crossfade that could not start is a delay, not motion: while it runs the document is not
 * hit-testable. The hold is bounded from route commit by one crossfade budget, read from
 * `--motion-base` so this file and the stylesheet cannot drift.
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
