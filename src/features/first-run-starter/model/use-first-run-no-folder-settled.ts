import { useLocalVault } from '@/entities/vault-session';
import { useDataSourceMode } from '@/entities/vault-session';

/** `restoreAttempted` matters because `useDataSourceMode` reports static while a previous handle restores from IndexedDB, which would flash the badge for a returning user. */
export function useFirstRunSampleModeSettled(): boolean {
  const vault = useLocalVault();
  const mode = useDataSourceMode();
  const neverConnected = vault.recentVaults.length === 0;
  return vault.restoreAttempted && mode === 'static' && neverConnected && !vault.partialTotal;
}

export function useFirstRunSampleModeKnown(): boolean {
  const vault = useLocalVault();
  return vault.restoreAttempted || vault.recentVaults.length > 0;
}
