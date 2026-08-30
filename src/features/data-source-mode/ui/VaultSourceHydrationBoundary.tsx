'use client';

import type { ReactNode } from 'react';

import { useHydrated } from '@/shared/lib/use-hydrated';
import { RouteLoadingFallback } from '@/shared/ui';

/**
 * Prevents build-time sample facts from becoming a destination's first DOM.
 *
 * Vault-backed routes are statically exported with a complete web sample. That is useful only
 * after the browser has established that no local vault owns the screen. Baking the sample view
 * itself into route HTML lets an installed app parse and paint Storefront before hydration can
 * read its restored local provider. A shell effect cannot undo pixels already parsed.
 *
 * These routes therefore export the existing neutral loading surface and reveal their content
 * after hydration. A vault-less web visitor still receives the sample immediately afterward; a
 * restored app mounts the same component against its local manifest. No new mode or animation.
 */
export function VaultSourceHydrationBoundary({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  return hydrated ? children : <RouteLoadingFallback />;
}
