import type { DialMemory, FlatRingMemoryStore } from "@/widgets/ontology-map";

const MEMORY_PREFIX = "atlas.map.flat-rings.v1:";
const MAX_RECORD_BYTES = 256 * 1024;

interface FlatRingRecord {
  version: 1;
  order: string[];
  radiusByStep: [number, number][];
  angleById: Record<string, [number, number]>;
  itemOrder: Record<string, string[]>;
}

const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every((v) => typeof v === "string");
const isPair = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length === 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);
const isRecordOf = <T,>(value: unknown, check: (v: unknown) => v is T): value is Record<string, T> =>
  !!value && typeof value === "object" && !Array.isArray(value) && Object.values(value).every(check);

function isFlatRingRecord(value: unknown): value is FlatRingRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as Partial<FlatRingRecord>;
  return r.version === 1
    && isStrings(r.order)
    && Array.isArray(r.radiusByStep) && r.radiusByStep.every(isPair)
    && isRecordOf(r.angleById, isPair)
    && isRecordOf(r.itemOrder, isStrings);
}

function toRecord(memory: DialMemory): FlatRingRecord {
  return {
    version: 1,
    order: [...memory.order],
    radiusByStep: [...memory.radiusByStep],
    angleById: Object.fromEntries([...memory.angleById].map(([id, at]) => [id, [at.step, at.angle]])),
    itemOrder: Object.fromEntries(memory.itemOrder),
  };
}

function fromRecord(record: FlatRingRecord): DialMemory {
  return {
    order: record.order,
    radiusByStep: new Map(record.radiusByStep),
    angleById: new Map(Object.entries(record.angleById).map(([id, [step, angle]]) => [id, { step, angle }])),
    itemOrder: new Map(Object.entries(record.itemOrder)),
  };
}

export function readFlatRingMemory(vaultIdentity: string): DialMemory | null {
  try {
    const raw = window.localStorage.getItem(MEMORY_PREFIX + vaultIdentity);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isFlatRingRecord(parsed) ? fromRecord(parsed) : null;
  } catch {
    return null;
  }
}

export function writeFlatRingMemory(vaultIdentity: string, memory: DialMemory): void {
  try {
    const next = JSON.stringify(toRecord(memory));
    if (next.length > MAX_RECORD_BYTES) return;
    if (window.localStorage.getItem(MEMORY_PREFIX + vaultIdentity) !== next) {
      window.localStorage.setItem(MEMORY_PREFIX + vaultIdentity, next);
    }
  } catch {
    return;
  }
}

export function flatRingMemorySlot(vaultIdentity: string): FlatRingMemoryStore {
  let loaded = false;
  let memory: DialMemory | null = null;
  return {
    current() {
      if (!loaded) {
        loaded = true;
        memory = typeof window === "undefined" ? null : readFlatRingMemory(vaultIdentity);
      }
      return memory;
    },
    write(next) {
      loaded = true;
      memory = next;
      writeFlatRingMemory(vaultIdentity, next);
    },
  };
}
