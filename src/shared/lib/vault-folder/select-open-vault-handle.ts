/**
 * `useLocalVault` sets `status: 'loading'` on every rescan; the handle is unchanged across a
 * reload of the same folder, so `'loading'` with a handle is the same folder mid-rescan.
 */
export function selectOpenVaultHandle<H>(status: string, handle: H | null | undefined): H | null {
  if (!handle) return null;
  return status === "loaded" || status === "loading" ? handle : null;
}
