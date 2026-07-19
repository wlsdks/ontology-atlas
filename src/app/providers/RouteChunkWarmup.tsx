'use client';

import { useEffect } from 'react';

/**
 * Idle-time module warmup for the two heaviest per-route chunks reachable
 * from the nav rail (`src/widgets/app-nav-rail`) — `/ontology/edit`'s xyflow
 * canvas and `/docs`'s Sigma folder-topology mini map.
 *
 * Next.js's default viewport `<Link>` prefetch already fetches both routes'
 * JS bytes over the network as soon as the rail link scrolls into view
 * (measured via Resource Timing during perf/nav-100ms profiling — ~4.9MB
 * across all 5 rail destinations lands within ~300ms of any page load).
 * What network prefetch does NOT do is execute/register the
 * `next/dynamic()`-wrapped component's module ahead of time — that only
 * happens when the user actually navigates and the lazy component suspends
 * on its own `import()`. Calling the *same* `import()` specifier here during
 * a browser idle slot resolves from the already-network-cached chunk and
 * populates the module registry, so the real navigation's `next/dynamic`
 * call resolves from cache instead of awaiting a fresh module evaluation —
 * shaving the "first paint of the real canvas after the loading skeleton"
 * step off the click-to-settled critical path.
 *
 * Both target modules only construct their heavy objects (ReactFlow /
 * Sigma WebGL context) inside a `useEffect` on actual mount — importing them
 * here only loads class/function definitions into memory, it does not
 * create a canvas, WebGL context, or touch the DOM.
 *
 * Mounted once in `app/[locale]/layout.tsx`. That root layout persists
 * across client-side route changes (App Router only remounts the changed
 * segment), so this warmup runs once per session, not once per navigation.
 */
export function RouteChunkWarmup() {
  useEffect(() => {
    const win = window as typeof window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number },
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const warm = () => {
      // Perf-only: failures (offline, blocked chunk, etc.) must never
      // surface as an unhandled rejection or break the current page.
      import('@/views/ontology-edit/ui/OntologyEditCanvas').catch(() => {});
      import('@/widgets/docs-vault/ui/DocsVaultFolderTopology').catch(() => {});
    };

    if (typeof win.requestIdleCallback === 'function') {
      const handle = win.requestIdleCallback(warm, { timeout: 2000 });
      return () => win.cancelIdleCallback?.(handle);
    }
    // Safari has no requestIdleCallback — fall back to a short deferred
    // timer so this still stays off the initial-paint critical path.
    const timer = window.setTimeout(warm, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
