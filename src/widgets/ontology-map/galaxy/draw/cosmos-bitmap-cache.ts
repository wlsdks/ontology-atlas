import type { GalaxyGlow } from "./cosmos-paint";

const IMPOSTOR_SIZES = [512, 256, 128, 64] as const;

const canvasBytes = (c: HTMLCanvasElement | null | undefined) => (c ? c.width * c.height * 4 : 0);

export class CosmosBitmapCache {
  private readonly glows = new Map<number, GalaxyGlow | null>();
  private readonly impostors = new Map<string, HTMLCanvasElement | null>();
  private readonly cores = new Map<number, HTMLCanvasElement | null>();
  private readonly drawn = new Set<string>();
  readonly textWidth = new Map<string, number>();

  glow(i: number, size: number): GalaxyGlow | null | undefined {
    return this.glows.get(i * 2 + (size === 512 ? 1 : 0));
  }

  setGlow(i: number, size: number, g: GalaxyGlow | null): void {
    this.glows.set(i * 2 + (size === 512 ? 1 : 0), g);
  }

  impostor(i: number, size: number): HTMLCanvasElement | null | undefined {
    return this.impostors.get(`${i}:${size}`);
  }

  setImpostor(i: number, size: number, c: HTMLCanvasElement | null): void {
    this.impostors.set(`${i}:${size}`, c);
  }

  anyImpostor(i: number): HTMLCanvasElement | null | undefined {
    for (const s of IMPOSTOR_SIZES) {
      const other = this.impostors.get(`${i}:${s}`);
      if (other) return other;
    }
    return undefined;
  }

  core(size: number): HTMLCanvasElement | null | undefined {
    return this.cores.get(size);
  }

  setCore(size: number, c: HTMLCanvasElement | null): void {
    this.cores.set(size, c);
  }

  markDrawn(key: string, _frame: number): boolean {
    if (this.drawn.has(key)) return false;
    this.drawn.add(key);
    return true;
  }

  bytes(): number {
    let total = 0;
    for (const g of this.glows.values()) total += g ? canvasBytes(g.base) + canvasBytes(g.wisps) : 0;
    for (const c of this.impostors.values()) total += canvasBytes(c);
    for (const c of this.cores.values()) total += canvasBytes(c);
    return total;
  }

  clear(): void {
    this.glows.clear();
    this.impostors.clear();
    this.cores.clear();
    this.drawn.clear();
  }
}
