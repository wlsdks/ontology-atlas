'use client';

import { useEffect, useRef, useState } from 'react';
import type { useDocsVaultAddress } from './use-docs-vault-url';
import type { useDocsVaultFolder } from './use-docs-vault-folder';
import type { useVaultManifest } from './use-vault-manifest';

export function useQuerySlugVerdict({
  address,
  vault,
  src,
}: {
  address: ReturnType<typeof useDocsVaultAddress>;
  vault: ReturnType<typeof useVaultManifest>;
  src: ReturnType<typeof useDocsVaultFolder>;
}) {
  const { replaceUrlState } = address;
  const { normalizedQuerySlug, docsBySlug } = vault;
  const { recentKey, vaultScopeSettled } = src;
  const [missingQuerySlug, setMissingQuerySlug] = useState<string | null>(null);
  /**
   * Slugs the app itself just renamed or deleted are not "missing"; `useSearchParams` still
   * holds the old slug after a `history.replaceState`.
   */
  const appTouchedSlugsRef = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (!normalizedQuerySlug || docsBySlug.size === 0) return;
    const touched = appTouchedSlugsRef.current;
    if (touched.size > 0 && !touched.has(normalizedQuerySlug)) {
      appTouchedSlugsRef.current = new Set();
    } else if (touched.has(normalizedQuerySlug)) {
      return;
    }
    if (docsBySlug.has(normalizedQuerySlug)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the verdict outlives the address it was read from
      setMissingQuerySlug((previousValue) => (previousValue === normalizedQuerySlug ? null : previousValue));
      return;
    }
    if (!vaultScopeSettled) return;
    setMissingQuerySlug((previousValue) => previousValue ?? normalizedQuerySlug);
  }, [normalizedQuerySlug, docsBySlug, vaultScopeSettled]);

  /** `?slug=` means something only inside one vault, so a vault switch clears it. */
  const vaultScope = recentKey;
  /**
   * A scope change before settling is boot, not a vault switch; clearing then would delete
   * a deeplink someone just handed over.
   */
  const vaultScopeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!vaultScopeSettled) return;
    const previous = vaultScopeRef.current;
    vaultScopeRef.current = vaultScope;
    if (previous === null || previous === vaultScope) return;
    setMissingQuerySlug(null);
    replaceUrlState({ slug: null });
  }, [vaultScope, vaultScopeSettled, replaceUrlState]);
  return { missingQuerySlug, vaultScope, appTouchedSlugsRef };
}
