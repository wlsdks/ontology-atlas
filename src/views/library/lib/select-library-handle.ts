import type { useLocalVault } from "@/entities/vault-session";

type LocalVaultStatus = ReturnType<typeof useLocalVault>["status"];

/**
 * The folder the Library reads and the agent dock is bound to.
 *
 * A reload keeps the handle. `useLocalVault` sets `status: 'loading'` on every rescan,
 * including the one the Library itself triggers by appending `wiki/_log.md` after a
 * Compile or Check-the-wiki turn. Measured in the installed app on 2026-09-06: gating on
 * `'loaded'` alone nulled the handle for that rescan, which unmounted the dock, ended the
 * agent process two seconds after the log line was written, and left the conversation on
 * "Connecting" with the report gone. The handle does not change across a reload of the
 * same folder, so `'loading'` with a handle is the same folder mid-rescan, not no folder.
 */
export function selectLibraryHandle(
  status: LocalVaultStatus,
  handle: FileSystemDirectoryHandle | null | undefined,
): FileSystemDirectoryHandle | null {
  if (!handle) return null;
  return status === "loaded" || status === "loading" ? handle : null;
}
