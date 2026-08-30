'use client';

import {
  resolveStaticVaultSource,
  type StaticVaultSource,
} from '@/entities/docs-vault';
import { useSampleSource } from './use-sample-source';

/**
 * The bundled vault to show **right now** in static mode (manifest plus content, as a pair).
 *
 * Screen code importing `vaultManifest` / `vaultContent` directly silently ignores the
 * user's "see an example business" choice — measured 2026-07-26, nine surfaces did (the
 * project list, detail bodies, the docs surface, the search palette, the document drawer,
 * and more). So the entry point is consolidated into this one hook. Full background:
 * `entities/docs-vault/lib/static-vault-source.ts`.
 *
 * In local mode the caller simply discards this value — the user's vault wins, and no branch
 * happens here (deciding the mode is each caller's responsibility; this hook answers only
 * "if static, which vault?").
 */
export function useStaticVaultSource(): StaticVaultSource {
  const [sampleSource] = useSampleSource();
  return resolveStaticVaultSource(sampleSource);
}
