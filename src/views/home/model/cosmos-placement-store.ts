import type { CosmosPlacementRecord } from "@/widgets/ontology-map";

const PLACEMENT_PREFIX = "atlas.map.cosmos.v1:";
const MAX_RECORD_BYTES = 256 * 1024;

const isPair = (value: unknown): boolean =>
  Array.isArray(value) && value.length === 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);

function isPlacementRecord(value: unknown): value is CosmosPlacementRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as { version?: unknown; centres?: unknown };
  if (record.version !== 1 || !record.centres || typeof record.centres !== "object" || Array.isArray(record.centres)) return false;
  return Object.values(record.centres).every(isPair);
}

export function readCosmosPlacement(vaultIdentity: string): CosmosPlacementRecord | null {
  try {
    const raw = window.localStorage.getItem(PLACEMENT_PREFIX + vaultIdentity);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPlacementRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCosmosPlacement(vaultIdentity: string, record: CosmosPlacementRecord): boolean {
  if (!isPlacementRecord(record)) return false;
  try {
    const next = JSON.stringify(record);
    if (next.length > MAX_RECORD_BYTES) return false;
    if (window.localStorage.getItem(PLACEMENT_PREFIX + vaultIdentity) !== next) {
      window.localStorage.setItem(PLACEMENT_PREFIX + vaultIdentity, next);
    }
    return true;
  } catch {
    return false;
  }
}

export function clearCosmosPlacement(vaultIdentity: string): void {
  try {
    window.localStorage.removeItem(PLACEMENT_PREFIX + vaultIdentity);
  } catch {
    return;
  }
}
