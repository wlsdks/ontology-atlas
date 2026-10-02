import type { GalaxyGlow } from "./cosmos-paint";

const IMPOSTOR_SIZES = [512, 256, 128, 64] as const;

export const COSMOS_BITMAP_CAP_BYTES = 48 * 1024 * 1024;

const canvasBytes = (c: HTMLCanvasElement | null | undefined) => (c ? c.width * c.height * 4 : 0);

const glowKey = (i: number, size: number) => `glow:${i}:${size === 512 ? 512 : 256}`;
const impostorKey = (i: number, size: number) => `impostor:${i}:${size}`;
const coreKey = (size: number) => `core:${size}`;

interface Entry {
  value: GalaxyGlow | HTMLCanvasElement | null;
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

  glow(i: number, size: number): GalaxyGlow | null | undefined {
    return this.read(glowKey(i, size)) as GalaxyGlow | null | undefined;
  }

  setGlow(i: number, size: number, g: GalaxyGlow | null): void {
    this.write(glowKey(i, size), g, g ? canvasBytes(g.base) + canvasBytes(g.wisps) : 0);
  }

  impostor(i: number, size: number): HTMLCanvasElement | null | undefined {
    return this.read(impostorKey(i, size)) as HTMLCanvasElement | null | undefined;
  }

  setImpostor(i: number, size: number, c: HTMLCanvasElement | null): void {
    this.write(impostorKey(i, size), c, canvasBytes(c));
  }

  anyImpostor(i: number): HTMLCanvasElement | null | undefined {
    for (const s of IMPOSTOR_SIZES) {
      const other = this.impostor(i, s);
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

  clear(): void {
    this.entries.clear();
    this.drawn.clear();
    this.total = 0;
  }

  private read(key: string): GalaxyGlow | HTMLCanvasElement | null | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    entry.used = ++this.tick;
    return entry.value;
  }

  private write(key: string, value: GalaxyGlow | HTMLCanvasElement | null, bytes: number): void {
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
