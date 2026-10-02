import { useMemo } from "react";
import type { CosmosPlacementRecord, CosmosPlacementStore } from "@/widgets/ontology-map";
import { clearCosmosPlacement, readCosmosPlacement, writeCosmosPlacement } from "./cosmos-placement-store";

function createCosmosPlacement(vaultKey: string): CosmosPlacementStore {
  let loaded = false;
  let record: CosmosPlacementRecord | null = null;
  return {
    current() {
      if (!loaded) {
        loaded = true;
        record = typeof window === "undefined" ? null : readCosmosPlacement(vaultKey);
      }
      return record;
    },
    write(next) {
      loaded = true;
      if (writeCosmosPlacement(vaultKey, next)) {
        record = next;
        return;
      }
      this.clear();
    },
    clear() {
      loaded = true;
      record = null;
      clearCosmosPlacement(vaultKey);
    },
  };
}

export function useCosmosPlacement(vaultKey: string): CosmosPlacementStore {
  return useMemo(() => createCosmosPlacement(vaultKey), [vaultKey]);
}
