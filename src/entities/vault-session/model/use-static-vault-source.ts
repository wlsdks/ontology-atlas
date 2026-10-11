'use client';

import {
  resolveStaticVaultSource,
  type StaticVaultSource,
} from '@/entities/docs-vault';
import { useSampleSource } from './use-sample-source';

/**
 * Screen code must use this hook, not `vaultManifest` / `vaultContent`, or it ignores the sample.
 * In local mode callers discard the value. See `entities/docs-vault/lib/static-vault-source.ts`.
 */
export function useStaticVaultSource(): StaticVaultSource {
  const [sampleSource] = useSampleSource();
  return resolveStaticVaultSource(sampleSource);
}
