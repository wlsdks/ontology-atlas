import type { HexPlacementRecord } from "@/widgets/ontology-map";

/**
 * Keyed by the exact vault identity (`useVaultIdentityScope`) so no two folders share a board.
 * View state, never meaning: losing the key only lays the board out afresh, deterministically.
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
    // A private window or a full store: the board still draws, unremembered.
  }
}
