import { useLocalVault } from '@/entities/vault-session';
import { useDataSourceMode } from '@/entities/vault-session';

/** `restoreAttempted` matters because `useDataSourceMode` reports no folder while a previous handle restores from IndexedDB, which would flash the first-run card for a returning user. */
export function useFirstRunNoFolderSettled(): boolean {
  const vault = useLocalVault();
  const mode = useDataSourceMode();
  const neverConnected = vault.recentVaults.length === 0;
  return vault.restoreAttempted && mode === 'no-folder' && neverConnected && !vault.partialTotal;
}

export function useFirstRunRestoreKnown(): boolean {
  const vault = useLocalVault();
  return vault.restoreAttempted || vault.recentVaults.length > 0;
}
