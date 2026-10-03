import { useMemo } from "react";
import type { CosmosPlacementRecord, CosmosPlacementStore } from "@/widgets/ontology-map";
import { clearCosmosPlacement, readCosmosPlacement, writeCosmosPlacement } from "./cosmos-placement-store";

class CosmosPlacementSlot implements CosmosPlacementStore {
  private readonly vaultKey: string;
  private loaded = false;
  private record: CosmosPlacementRecord | null = null;

  constructor(vaultKey: string) {
    this.vaultKey = vaultKey;
  }

  current(): CosmosPlacementRecord | null {
    if (!this.loaded) {
      this.loaded = true;
      this.record = typeof window === "undefined" ? null : readCosmosPlacement(this.vaultKey);
    }
    return this.record;
  }

  write(next: CosmosPlacementRecord): void {
    this.loaded = true;
    if (writeCosmosPlacement(this.vaultKey, next)) {
      this.record = next;
      return;
    }
    this.clear();
  }

  clear(): void {
    this.loaded = true;
    this.record = null;
    clearCosmosPlacement(this.vaultKey);
  }
}

export function useCosmosPlacement(vaultKey: string): CosmosPlacementStore {
  return useMemo(() => new CosmosPlacementSlot(vaultKey), [vaultKey]);
}
