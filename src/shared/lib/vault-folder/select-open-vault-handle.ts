/**
 * The folder a screen reads while the vault is open — including mid-rescan.
 *
 * `useLocalVault` sets `status: 'loading'` on every rescan, including the ones an agent's
 * write or the app's own log line cause. Gating a handle on `'loaded'` alone nulls it for
 * that moment: the Library did, and its agent dock unmounted and killed the conversation
 * (installed app, 2026-09-06); the MCP page did, and its connector list re-read from nothing
 * on every rescan. The handle does not change across a reload of the same folder, so
 * `'loading'` with a handle is the same folder mid-rescan, not no folder.
 */
export function selectOpenVaultHandle<H>(status: string, handle: H | null | undefined): H | null {
  if (!handle) return null;
  return status === "loaded" || status === "loading" ? handle : null;
}
