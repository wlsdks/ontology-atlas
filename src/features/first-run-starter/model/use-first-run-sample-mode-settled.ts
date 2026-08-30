import { useLocalVault } from '@/entities/vault-session';
import { useDataSourceMode } from '@/entities/vault-session';

/**
 * "We are in static (sample) mode and the vault restore attempt has already
 * finished" — the brand pill's SAMPLE badge, the INDEX's get-started module, and the
 * bottom-right instrument readout all share this one verdict (a single source; three
 * surfaces computing it separately risks drift).
 *
 * Why `restoreAttempted` must be checked with it: `useDataSourceMode` treats
 * anything with `vault.status !== 'loaded'` as 'static' — including the brief window
 * (a frame or two after mount) while a previous vault handle restores
 * asynchronously from IndexedDB. Without this gate, a returning user sees the SAMPLE
 * badge and the get-started module flash and vanish (owner report — "don't make me press it every time I come in").
 */
export function useFirstRunSampleModeSettled(): boolean {
  const vault = useLocalVault();
  const mode = useDataSourceMode();
  /*
   * **Someone who has opened a folder even once is not shown the sample guidance**
   * (2026-08-02, owner: "Haven't they already connected? If they connected even once this
   * sample should not appear; the sample is for someone trying it out who has never
   * connected at all).
   *
   * The old verdict was only **is a vault open right now** (`mode === 'static'`). So
   * someone who had connected a folder previously saw **exactly the first-time
   * visitor's screen** whenever they were static — the storefront / this-app's-code
   * tabs included.
   *
   * `recentVaults` (the list of recently opened folders) already knows this. If it is
   * not empty, that person is past the stage of trying the product out.
   *
   * The `restoreAttempted` comment above fixed **the flicker**; this line fixes **who
   * it is for** — the same function was wrong twice, so both are kept.
   */
  const neverConnected = vault.recentVaults.length === 0;
  return vault.restoreAttempted && mode === 'static' && neverConnected;
}
