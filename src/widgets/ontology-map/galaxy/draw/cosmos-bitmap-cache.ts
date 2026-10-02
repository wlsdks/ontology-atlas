import type { CosmosGalaxy } from "../layout/cosmos-layout";
import type { GalaxyGlow } from "./cosmos-paint";

const IMPOSTOR_SIZES = [512, 256, 128, 64] as const;

export const COSMOS_BITMAP_CAP_BYTES = 48 * 1024 * 1024;

const canvasBytes = (c: HTMLCanvasElement | null | undefined) => (c ? c.width * c.height * 4 : 0);

const glowKey = (g: string, size: number) => `glow:${g}:${size === 512 ? 512 : 256}`;
const impostorKey = (g: string, size: number) => `impostor:${g}:${size}`;
const coreKey = (size: number) => `core:${size}`;
const galaxyOfKey = (key: string) => (key.startsWith("core:") ? null : key.slice(key.indexOf(":") + 1, key.lastIndexOf(":")));

const galaxyKeys = new WeakMap<CosmosGalaxy, string>();

function mix(h: number, v: number): number {
  return Math.imul(h ^ v, 16777619) >>> 0;
}

function mixArray(h: number, a: Float32Array | Uint8Array): number {
  const words = a instanceof Float32Array ? new Uint32Array(a.buffer, a.byteOffset, a.length) : a;
  for (let i = 0; i < words.length; i += 1) h = mix(h, words[i]!);
  return h;
}

export function galaxyKey(g: CosmosGalaxy): string {
  const hit = galaxyKeys.get(g);
  if (hit) return hit;
  let h = 2166136261;
  for (const v of [g.radius, g.extent, g.tilt, g.angle, g.pitch, g.axisRatio, g.arms, g.spin]) h = mix(h, Math.round(v * 1e6) | 0);
  for (const a of [g.starU, g.starV, g.starKind, g.starMagnitude]) h = mixArray(h, a);
  const key = `${g.id}#${g.shape}#${g.starIds.length}#${h.toString(36)}`;
  galaxyKeys.set(g, key);
  return key;
}

type Value = GalaxyGlow | HTMLCanvasElement | null;

interface Entry {
  value: Value;
  bytes: number;
  used: number;
}

export class CosmosBitmapCache {
  private readonly entries = new Map<string, Entry>();
  private readonly drawn = new Set<string>();
  private total = 0;
  private tick = 0;
  readonly textWidth = new Map<string, number>();

  constructor(private readonly cap = COSMOS_BITMAP_CAP_BYTES) {}

  glow(g: string, size: number): GalaxyGlow | null | undefined {
    return this.read(glowKey(g, size)) as GalaxyGlow | null | undefined;
  }

  setGlow(g: string, size: number, glow: GalaxyGlow | null): void {
    this.write(glowKey(g, size), glow, glow ? canvasBytes(glow.base) + canvasBytes(glow.wisps) : 0);
  }

  impostor(g: string, size: number): HTMLCanvasElement | null | undefined {
    return this.read(impostorKey(g, size)) as HTMLCanvasElement | null | undefined;
  }

  setImpostor(g: string, size: number, c: HTMLCanvasElement | null): void {
    this.write(impostorKey(g, size), c, canvasBytes(c));
  }

  anyImpostor(g: string): HTMLCanvasElement | null | undefined {
    for (const s of IMPOSTOR_SIZES) {
      const other = this.impostor(g, s);
      if (other) return other;
    }
    return undefined;
  }

  core(size: number): HTMLCanvasElement | null | undefined {
    return this.read(coreKey(size)) as HTMLCanvasElement | null | undefined;
  }

  setCore(size: number, c: HTMLCanvasElement | null): void {
    this.write(coreKey(size), c, canvasBytes(c));
  }

  markDrawn(key: string, _frame: number): boolean {
    const entry = this.entries.get(key);
    if (entry) entry.used = ++this.tick;
    if (this.drawn.has(key)) return false;
    this.drawn.add(key);
    return true;
  }

  bytes(): number {
    return this.total;
  }

  retain(galaxies: ReadonlySet<string>): void {
    for (const key of [...this.entries.keys()]) {
      const g = galaxyOfKey(key);
      if (g !== null && !galaxies.has(g)) this.remove(key);
    }
  }

  clear(): void {
    for (const key of [...this.entries.keys()]) this.remove(key);
    this.drawn.clear();
  }

  private read(key: string): Value | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    entry.used = ++this.tick;
    return entry.value;
  }

  private write(key: string, value: Value, bytes: number): void {
    this.remove(key);
    this.entries.set(key, { value, bytes, used: ++this.tick });
    this.total += bytes;
    this.evict();
  }

  private remove(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.total -= entry.bytes;
    this.entries.delete(key);
    this.drawn.delete(key);
  }

  private evict(): void {
    while (this.total > this.cap) {
      let oldest: string | null = null;
      let oldestUsed = Infinity;
      for (const [key, entry] of this.entries) {
        if (entry.bytes > 0 && entry.used < oldestUsed) {
          oldest = key;
          oldestUsed = entry.used;
        }
      }
      if (oldest === null) return;
      this.remove(oldest);
    }
  }
}
