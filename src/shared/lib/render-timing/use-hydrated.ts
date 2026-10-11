'use client';

import { useSyncExternalStore } from 'react';

/**
 * Has hydration finished — for correcting prerendered HTML with facts only the
 * browser knows.
 *
 * **Why it is needed** (measured 2026-08-01). This app is a static export, so at
 * prerender there is no `window` and every browser-only signal — `isTauri()`,
 * `localStorage`, viewport — freezes as "no". When such a value lands in a class
 * or attribute it is baked into the HTML, and **React hydration does not repair
 * attribute mismatches**: the server's attribute stays in the DOM even when the
 * first client render produces a different value. The render function is right
 * and the screen is wrong.
 *
 * The real failure: the left rail was **entirely missing in the installed macOS
 * app**. The shell hides it via
 * `isGatewaySurface(pathname, { desktop: isDesktopShell(), … })`, prerender had
 * `desktop=false`, `/` was judged a gateway, and `lg:hidden` was baked in. The
 * app always opens `/` from that HTML, so the rail was hidden permanently. On the
 * web the same judgement happened to be correct (a visitor with no vault *is* on
 * the gateway) so nobody saw it, and reaching the same route by client
 * navigation worked — that path really re-renders.
 *
 * **Why `useSyncExternalStore` and not `useEffect` + `useState`.** All of them
 * produce one re-render, but this hook tells React explicitly that the server and
 * client snapshots differ. The effect version fakes "mounted" as state, which
 * lint reads as unnecessary and the next person deletes — and here that
 * re-render is part of correctness.
 *
 * **How to use it.** Treat `false` as "knowing only what the server knows": leave
 * browser-only signals unknown until hydration, and make the unknown default the
 * less harmful one. In the failure above the default is "hidden", so desktop gets
 * its rail one frame late; defaulting to "visible" would flash a rail on the web
 * gateway, which `AppShell` has already rejected.
 */
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
