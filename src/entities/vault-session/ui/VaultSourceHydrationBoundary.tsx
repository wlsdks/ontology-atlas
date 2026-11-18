'use client';

import type { ReactNode } from 'react';

import { useHydrated } from '@/shared/lib/render-timing/use-hydrated';
import { RouteLoadingFallback } from '@/shared/ui';
import { useStaticVaultStatus } from '../model/use-static-vault-source';

/**
 * Prevents build-time sample facts from becoming a destination's first DOM.
 *
 * Vault-backed routes are statically exported with a complete web sample. That is useful only
 * after the browser has established that no local vault owns the screen. Baking the sample view
 * itself into route HTML lets an installed app parse and paint Storefront before hydration can
 * read its restored local provider. A shell effect cannot undo pixels already parsed.
 *
 * These routes therefore export the existing neutral loading surface and reveal their content
 * after hydration. A vault-less web visitor receives the sample as soon as its chunk arrives, so
 * the same surface stays up until then and the content never opens empty; a restored app mounts the
 * component against its local manifest and never waits for, or loads, a sample. No new mode or
 * animation.
 */
export function VaultSourceHydrationBoundary({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const sample = useStaticVaultStatus();
  return hydrated && sample !== 'loading' ? children : <RouteLoadingFallback />;
}
