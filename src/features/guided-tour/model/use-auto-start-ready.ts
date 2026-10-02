'use client';

import { useDataSourceMode } from '@/entities/vault-session';
import { useLocalVault } from '@/entities/vault-session';

/**
 * Whether the first-visit tour may be raised: once settled either way, on the sample (restore
 * attempted, static) or on a loaded folder. Not while the mode is in transition, or the card
 * lands on a blank screen. Sample-only steps drop out through `computeVisibleSteps`.
 */
export function useGuidedTourAutoStartReady(): boolean {
  const vault = useLocalVault();
  const mode = useDataSourceMode();
  if (vault.partialManifest) return false;
  if (mode === 'local') return vault.status === 'loaded';
  return vault.restoreAttempted;
}
