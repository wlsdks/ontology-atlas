import { useMemo } from "react";
import type { DialMemory, FlatRingMemoryStore } from "@/widgets/ontology-map";
import { readFlatRingMemory, writeFlatRingMemory } from "./flat-ring-memory-store";

class FlatRingMemorySlot implements FlatRingMemoryStore {
  private readonly vaultIdentity: string;
  private loaded = false;
  private memory: DialMemory | null = null;

  constructor(vaultIdentity: string) {
    this.vaultIdentity = vaultIdentity;
  }

  current(): DialMemory | null {
    if (!this.loaded) {
      this.loaded = true;
      this.memory = typeof window === "undefined" ? null : readFlatRingMemory(this.vaultIdentity);
    }
    return this.memory;
  }

  write(next: DialMemory): void {
    this.loaded = true;
    this.memory = next;
    writeFlatRingMemory(this.vaultIdentity, next);
  }
}

export function useFlatRingMemory(vaultIdentity: string): FlatRingMemoryStore {
  return useMemo(() => new FlatRingMemorySlot(vaultIdentity), [vaultIdentity]);
}
