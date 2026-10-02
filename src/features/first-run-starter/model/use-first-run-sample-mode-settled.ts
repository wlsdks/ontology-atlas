import { useLocalVault } from '@/entities/vault-session';
import { useDataSourceMode } from '@/entities/vault-session';

/**
 * Static sample mode after the vault restore attempt finished; shared by the SAMPLE badge, the
 * INDEX get-started module and the readout. `restoreAttempted` matters because
 * `useDataSourceMode` reports static while a previous handle restores from IndexedDB, which
 * would flash the badge for a returning user.
 */
export function useFirstRunSampleModeSettled(): boolean {
  const vault = useLocalVault();
  const mode = useDataSourceMode();
  /*
   * Someone who opened a folder even once is past trying the product, so no sample guidance.
   */
  const neverConnected = vault.recentVaults.length === 0;
  return vault.restoreAttempted && mode === 'static' && neverConnected && !vault.partialTotal;
}
