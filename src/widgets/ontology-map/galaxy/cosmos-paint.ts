import { armPoint, STAR_KIND_CAPABILITY, STAR_KIND_ELEMENT, STAR_KIND_NUCLEUS, type CosmosGalaxy } from "./cosmos-layout";
import { hash01 } from "./cosmos-morphology";

export interface CosmosInks {
  project: string;
  domain: string;
  capability: string;
  element: string;
  accent: string;
  bgNear: string;
  bgFar: string;
  filament: string;
  filamentHead: string;
  filamentDim: string;
  labelProject: string;
  labelDomain: string;
  labelCapability: string;
  labelElement: string;
  labelMeta: string;
  select: string;
}

const TAU = Math.PI * 2;

function parseHex(ink: string): [number, number, number] {
  const v = Number.parseInt(ink.replace("#", "").slice(0, 6), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function mixHex(a: string, b: string, t: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  const c = x.map((v, i) => Math.round(v + (y[i]! - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function rgba(ink: string, alpha: number, heat = 0): string {
  const [r, g, b] = parseHex(ink);
  const h = (v: number) => Math.round(v + (255 - v) * heat);
  return `rgba(${h(r)},${h(g)},${h(b)},${alpha})`;
}

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  return ctx ? { canvas, ctx } : null;
}

const sprites = new Map<string, HTMLCanvasElement>();

export function starSprite(ink: string): HTMLCanvasElement | null {
  const cached = sprites.get(ink);
  if (cached) return cached;
  const made = makeCanvas(48);
  if (!made) return null;
  const g = made.ctx.createRadialGradient(24, 24, 0, 24, 24, 24);
  g.addColorStop(0, rgba(ink, 1, 0.9));
  g.addColorStop(0.12, rgba(ink, 1, 0.6));
  g.addColorStop(0.3, rgba(ink, 0.55, 0.15));
  g.addColorStop(0.55, rgba(ink, 0.14));
  g.addColorStop(1, rgba(ink, 0));
  made.ctx.fillStyle = g;
  made.ctx.fillRect(0, 0, 48, 48);
  sprites.set(ink, made.canvas);
  return made.canvas;
}

export const IMPOSTOR_EXTENT = 1.32;

function glowBlob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ink: string, alpha: number, squash = 1): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, squash);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, rgba(ink, alpha));
  g.addColorStop(0.35, rgba(ink, alpha * 0.5));
  g.addColorStop(0.7, rgba(ink, alpha * 0.12));
  g.addColorStop(1, rgba(ink, 0));
  ctx.fillStyle = g;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
}

export interface GalaxyGlow {
  base: HTMLCanvasElement;
  wisps: HTMLCanvasElement;
}

export function glowSizeFor(screenExtentPx: number, dpr: number): number {
  return screenExtentPx * 2 * dpr > 700 ? 512 : 256;
}

export function buildGalaxyGlow(galaxy: CosmosGalaxy, inks: CosmosInks, size = 256): GalaxyGlow | null {
  const base = makeCanvas(size);
  const wisps = makeCanvas(size);
  if (!base || !wisps) return null;
  const half = size / 2;
  const k = half / (galaxy.radius * IMPOSTOR_EXTENT);
  let seed = Math.floor(hash01(galaxy.id, "glow-seed") * 4294967295) >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (const c of [base.ctx, wisps.ctx]) c.globalCompositeOperation = "lighter";
  const R = galaxy.radius * k;
  glowBlob(base.ctx, half, half, R * 1.15, inks.accent, 0.05, galaxy.axisRatio);
  glowBlob(base.ctx, half, half, R * 0.62, inks.capability, 0.07, galaxy.axisRatio);
  glowBlob(base.ctx, half, half, R * (galaxy.shape === "elliptical" ? 0.55 : 0.3), inks.domain, 0.3, galaxy.axisRatio);
  glowBlob(base.ctx, half, half, R * 0.11, mixHex(inks.domain, "#ffffff", 0.6), 0.55);
  if (galaxy.shape === "spiral") {
    const phase = hash01(galaxy.id, "arm-phase") * TAU;
    for (let arm = 0; arm < galaxy.arms; arm += 1) {
      for (let i = 0; i < 70; i += 1) {
        const t = i / 69;
        const p = armPoint(galaxy, arm, t, phase);
        const spread = galaxy.radius * (0.03 + 0.07 * t);
        const x = half + (p.u + (random() + random() - 1) * spread) * k;
        const y = half + (p.v + (random() + random() - 1) * spread) * k;
        const ink = mixHex(inks.capability, inks.element, Math.min(1, t * 1.4));
        const layer = random() < 0.55 ? base.ctx : wisps.ctx;
        glowBlob(layer, x, y, spread * k * (1.3 + random()), ink, (0.05 + random() * 0.05) * (1 - 0.5 * t));
      }
    }
  } else if (galaxy.shape === "elliptical") {
    for (let i = 0; i < 4; i += 1) {
      glowBlob(i % 2 ? wisps.ctx : base.ctx, half, half, R * (0.35 + i * 0.2), mixHex(inks.domain, inks.capability, i / 3), i === 0 ? 0.18 : 0.08, galaxy.axisRatio);
    }
  } else {
    for (let clump = 0; clump < 3; clump += 1) {
      const ca = hash01(`${galaxy.id}#${clump}`, "clump-angle") * TAU;
      const cr = galaxy.radius * 0.45 * Math.sqrt(hash01(`${galaxy.id}#${clump}`, "clump-radius"));
      for (let i = 0; i < 8; i += 1) {
        const x = half + (Math.cos(ca) * cr + (random() - 0.5) * galaxy.radius * 0.5) * k;
        const y = half + (Math.sin(ca) * cr + (random() - 0.5) * galaxy.radius * 0.5) * k;
        glowBlob(i % 2 ? wisps.ctx : base.ctx, x, y, R * (0.16 + random() * 0.18), mixHex(inks.capability, inks.element, random()), 0.07);
      }
    }
  }
  return { base: blurAwayGradientDither(base.canvas, size), wisps: blurAwayGradientDither(wisps.canvas, size) };
}

function blurAwayGradientDither(source: HTMLCanvasElement, size: number): HTMLCanvasElement {
  const out = makeCanvas(size);
  if (!out) return source;
  out.ctx.filter = `blur(${Math.max(1, size / 256)}px)`;
  out.ctx.drawImage(source, 0, 0);
  out.ctx.filter = "none";
  return out.canvas;
}

export function impostorSizeFor(screenExtentPx: number, dpr: number): number {
  const need = screenExtentPx * 2 * dpr;
  if (need <= 64) return 64;
  if (need <= 128) return 128;
  if (need <= 256) return 256;
  return 512;
}

export function buildStarImpostor(galaxy: CosmosGalaxy, size: number, inks: CosmosInks): HTMLCanvasElement | null {
  const made = makeCanvas(size);
  if (!made) return null;
  const { ctx } = made;
  const half = size / 2;
  const k = half / (galaxy.radius * IMPOSTOR_EXTENT);
  ctx.globalCompositeOperation = "lighter";
  const inkFor = (kind: number) =>
    kind === STAR_KIND_NUCLEUS ? inks.domain : kind === STAR_KIND_CAPABILITY ? inks.capability : inks.element;
  const pixel = size / 512;
  for (let i = 0; i < galaxy.starIds.length; i += 1) {
    const kind = galaxy.starKind[i]!;
    const m = galaxy.starMagnitude[i]!;
    const x = half + galaxy.starU[i]! * k;
    const y = half + galaxy.starV[i]! * k;
    const base = kind === STAR_KIND_NUCLEUS ? 9 : kind === STAR_KIND_CAPABILITY ? 4.2 : 2.4;
    const r = Math.max(0.9, (base + 2.5 * m) * pixel * 2.2);
    const sprite = starSprite(inkFor(kind));
    if (!sprite) continue;
    ctx.globalAlpha = kind === STAR_KIND_ELEMENT ? 0.55 + 0.45 * m : 0.85 + 0.15 * m;
    ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
  return made.canvas;
}

export function buildDeepField(inks: CosmosInks): HTMLCanvasElement | null {
  const made = makeCanvas(512);
  if (!made) return null;
  const { ctx } = made;
  let seed = 0x2f6b9a1d;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 260; i += 1) {
    const x = random() * 512;
    const y = random() * 512;
    const a = 0.08 + random() ** 3 * 0.32;
    ctx.fillStyle = rgba(random() < 0.7 ? inks.element : inks.domain, a);
    const s = random() < 0.92 ? 1 : 1.6;
    ctx.fillRect(x, y, s, s);
  }
  return made.canvas;
}

export function filamentGeometry(
  a: { x: number; y: number; radius: number },
  b: { x: number; y: number; radius: number },
  bowShare = 0.15,
): { x1: number; y1: number; cx: number; cy: number; x2: number; y2: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const x1 = a.x + ux * a.radius * 0.92;
  const y1 = a.y + uy * a.radius * 0.92;
  const x2 = b.x - ux * b.radius * 0.92;
  const y2 = b.y - uy * b.radius * 0.92;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  let px = -uy;
  let py = ux;
  if (px * mx + py * my < 0) {
    px = -px;
    py = -py;
  }
  const bow = Math.hypot(x2 - x1, y2 - y1) * bowShare;
  return { x1, y1, cx: mx + px * bow, cy: my + py * bow, x2, y2 };
}

export function filamentWidth(count: number): number {
  return Math.min(2.4, 0.5 + 0.35 * Math.log2(1 + count));
}
