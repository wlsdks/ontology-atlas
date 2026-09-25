import type { HexPlacementRecord } from "@/widgets/ontology-map";

/**
 * Where a folder's hex board placement is kept, keyed by the exact vault identity
 * (`useVaultIdentityScope`), so two folders — or the two bundled samples — never share a
 * board. It is view state, like the map's other preferences, never meaning: the vault's
 * Markdown stays the one canonical store, and losing this key only means the next board is
 * laid out afresh (in the same deterministic order).
 */
const PLACEMENT_PREFIX = "atlas.map.hex-board.v1:";

export function readHexPlacement(vaultIdentity: string): HexPlacementRecord | null {
  try {
    const raw = window.localStorage.getItem(PLACEMENT_PREFIX + vaultIdentity);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HexPlacementRecord;
    return parsed && parsed.version === 1 && parsed.seeds && parsed.cells ? parsed : null;
  } catch {
    return null;
  }
}

export function writeHexPlacement(vaultIdentity: string, record: HexPlacementRecord): void {
  try {
    const next = JSON.stringify(record);
    if (window.localStorage.getItem(PLACEMENT_PREFIX + vaultIdentity) !== next) {
      window.localStorage.setItem(PLACEMENT_PREFIX + vaultIdentity, next);
    }
  } catch {
    // A private window or a full store: the board still draws, it just is not remembered.
  }
}
