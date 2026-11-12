const SEED_QUANTUM = 1024;
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** A stable unit value in [0, 1) per id, quantised to 1/1024 so float rounding cannot drift a seed. */
export function seedUnit(id: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return (hash % SEED_QUANTUM) / SEED_QUANTUM;
}

export function seedAngle(id: string): number {
  return seedUnit(id) * Math.PI * 2;
}

export function byId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
