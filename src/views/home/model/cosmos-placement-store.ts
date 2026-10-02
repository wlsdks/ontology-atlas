import type { CosmosPlacementRecord } from "@/widgets/ontology-map";

const PLACEMENT_PREFIX = "atlas.map.cosmos.v1:";

export function readCosmosPlacement(vaultIdentity: string): CosmosPlacementRecord | null {
  try {
    const raw = window.localStorage.getItem(PLACEMENT_PREFIX + vaultIdentity);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CosmosPlacementRecord;
    return parsed && parsed.version === 1 && parsed.centres ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCosmosPlacement(vaultIdentity: string, record: CosmosPlacementRecord): void {
  try {
    const next = JSON.stringify(record);
    if (window.localStorage.getItem(PLACEMENT_PREFIX + vaultIdentity) !== next) {
      window.localStorage.setItem(PLACEMENT_PREFIX + vaultIdentity, next);
    }
  } catch {
  }
}
