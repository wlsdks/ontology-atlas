/**
 * The vault path a packet prints: the real one when known, otherwise an instruction to fill in.
 * Never a relative path, which silently means "wherever the agent happens to be".
 */
export function vaultPathForPacket(vaultName: string, vaultPath?: string | null): string {
  return vaultPath ?? `<absolute path to your ${vaultName} folder>`;
}
