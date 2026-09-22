import { galaxyNebulaMotion, type GalaxyMeteorPhase } from "../model/galaxy";
import { GALAXY_ARM_COUNT, GALAXY_VERTICAL_FLATTEN, galaxySpiralPoint } from "../model/galaxy-layout";

export interface GalaxyNebulaState {
  /** The real project core and the layout's arm radius, projected to CSS pixels. */
  centerX: number;
  centerY: number;
  radius: number;
  alpha: number;
  warmInk: string;
  coolInk: string;
  accentInk: string;
  elapsedMs: number;
  reducedMotion: boolean;
}

const NEBULA_TEXTURE_SIZE = 1200;
const NEBULA_ARM_SCALE = 0.38;
interface GalaxyNebulaTextures {
  /** Fixed spatial reference: disc, particulate field, and project-core light. */
  base: HTMLCanvasElement;
  /** Transparent inner-arm gas, free to drift inside the fixed disc. */
  innerWisps: HTMLCanvasElement;
  /** Transparent outer-arm gas on a slower counter-phase. */
  outerWisps: HTMLCanvasElement;
}

const nebulaTextures = new Map<string, GalaxyNebulaTextures>();

function createTexture(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const canvas = document.createElement("canvas");
  canvas.width = NEBULA_TEXTURE_SIZE;
  canvas.height = NEBULA_TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");
  return ctx ? { canvas, ctx } : null;
}

/** A seeded optical texture: atmosphere has no graph ids, hits, or relation data. */
function buildNebulaTexture(warmInk: string, coolInk: string, accentInk: string): GalaxyNebulaTextures | null {
  const key = `${warmInk}:${coolInk}:${accentInk}`;
  const cached = nebulaTextures.get(key);
  if (cached) return cached;
  const baseTexture = createTexture();
  const innerTexture = createTexture();
  const outerTexture = createTexture();
  if (!baseTexture || !innerTexture || !outerTexture) return null;
  const baseCtx = baseTexture.ctx;
  let seed = 0x4f52494f;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const rgb = (ink: string) => {
    const value = Number.parseInt(ink.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  };
  const warm = rgb(warmInk), cool = rgb(coolInk), accent = rgb(accentInk);
  const rgba = (color: number[], alpha: number) =>
    `rgba(${color.map(Math.round).join(",")},${alpha})`;
  const blend = (a: number[], b: number[], amount: number) =>
    a.map((value, index) => value + (b[index] - value) * amount);
  const half = NEBULA_TEXTURE_SIZE / 2;
  const armRadius = NEBULA_TEXTURE_SIZE * NEBULA_ARM_SCALE;
  const glow = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: number[], alpha: number, flatten = 1) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, flatten);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    gradient.addColorStop(0, rgba(color, alpha));
    gradient.addColorStop(0.28, rgba(color, alpha * 0.56));
    gradient.addColorStop(0.65, rgba(color, alpha * 0.13));
    gradient.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    ctx.restore();
  };

  baseCtx.globalCompositeOperation = "lighter";
  innerTexture.ctx.globalCompositeOperation = "lighter";
  outerTexture.ctx.globalCompositeOperation = "lighter";
  // A diffuse disc makes depth perceptible without a containing edge or orbit.
  glow(baseCtx, half, half, armRadius * 1.2, accent, 0.08, GALAXY_VERTICAL_FLATTEN);
  for (let arm = 0; arm < GALAXY_ARM_COUNT; arm += 1) {
    for (let index = 0; index < 180; index += 1) {
      const t = 0.035 + (index / 179) * 0.945;
      const point = galaxySpiralPoint(t, arm, armRadius);
      const width = armRadius * (0.025 + t * 0.075);
      const scatterX = (random() + random() - 1) * width;
      const scatterY = (random() + random() - 1) * width * GALAXY_VERTICAL_FLATTEN;
      const color = blend(warm, arm % 2 === 0 ? cool : accent, Math.min(1, t * 2));
      const envelope = Math.sin(Math.PI * t) ** 0.7;
      const wispCtx = t < 0.56 ? innerTexture.ctx : outerTexture.ctx;
      glow(wispCtx, half + point.x + scatterX, half + point.y + scatterY,
        width * (0.9 + random() * 1.1), color,
        (0.04 + random() * 0.045) * envelope, GALAXY_VERTICAL_FLATTEN);
    }
  }
  // Fine particulate light breaks up the cloud. These subpixel grains cannot be
  // mistaken for the larger, labelled and interactive ontology star cores.
  for (let index = 0; index < 9000; index += 1) {
    const t = Math.sqrt(random());
    const arm = Math.floor(random() * GALAXY_ARM_COUNT);
    const point = galaxySpiralPoint(t, arm, armRadius);
    const spread = armRadius * (0.012 + t * 0.07);
    const x = half + point.x + (random() + random() + random() - 1.5) * spread;
    const y = half + point.y + (random() + random() + random() - 1.5) * spread * GALAXY_VERTICAL_FLATTEN;
    const energy = (0.07 + random() ** 4 * 0.34) * Math.sin(Math.PI * t) ** 0.45;
    // The anchored third holds the spiral; the other grains ride the cached gas
    // layers, making depth visible without another canvas pass or moving a hit target.
    const grainCtx = index % 3 === 0 ? baseCtx : t < 0.56 ? innerTexture.ctx : outerTexture.ctx;
    grainCtx.fillStyle = rgba(blend(warm, cool, Math.min(1, t * 1.7)), energy);
    const size = 0.4 + random() * 0.85;
    grainCtx.fillRect(x, y, size, size);
  }
  // The luminous bulge belongs to the actual project core. Its footprint is
  // painted light only; it never adds a selectable pseudo-concept.
  glow(baseCtx, half, half, armRadius * 0.36, warm, 0.22, GALAXY_VERTICAL_FLATTEN);
  glow(baseCtx, half, half, armRadius * 0.13, blend(warm, [255, 255, 255], 0.55), 0.32, GALAXY_VERTICAL_FLATTEN);
  if (nebulaTextures.size >= 2) {
    const oldest = nebulaTextures.keys().next().value;
    if (oldest !== undefined) nebulaTextures.delete(oldest);
  }
  const textures = {
    base: baseTexture.canvas,
    innerWisps: innerTexture.canvas,
    outerWisps: outerTexture.canvas,
  };
  nebulaTextures.set(key, textures);
  return textures;
}

function drawNebulaLayer(
  ctx: CanvasRenderingContext2D,
  texture: HTMLCanvasElement,
  centerX: number,
  centerY: number,
  size: number,
  rotation: number,
): void {
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(rotation);
  ctx.drawImage(texture, -size / 2, -size / 2, size, size);
  ctx.restore();
}

/** Three cached blits per frame; the fixed disc anchors two gently flowing wisp layers. */
export function drawGalaxyNebula(ctx: CanvasRenderingContext2D, state: GalaxyNebulaState): void {
  if (state.alpha <= 0.01 || state.radius <= 0) return;
  const texture = buildNebulaTexture(state.warmInk, state.coolInk, state.accentInk);
  if (!texture) return;
  const size = state.radius / NEBULA_ARM_SCALE;
  const motion = galaxyNebulaMotion(state.elapsedMs, state.reducedMotion);
  ctx.save();
  ctx.globalAlpha *= state.alpha * motion.luminance;
  ctx.globalCompositeOperation = "lighter";
  drawNebulaLayer(ctx, texture.base, state.centerX, state.centerY, size, 0);
  drawNebulaLayer(ctx, texture.innerWisps, state.centerX, state.centerY, size, motion.innerRotation);
  drawNebulaLayer(ctx, texture.outerWisps, state.centerX, state.centerY, size, motion.outerRotation);
  ctx.restore();
}


/** Procedural Galaxy atmosphere, painted behind every real graph mark. */
export function drawGalaxyMeteor(
  ctx: CanvasRenderingContext2D,
  phase: GalaxyMeteorPhase | null,
  viewportWidth: number,
  viewportHeight: number,
  ink: string,
  alpha: number,
): void {
  if (!phase || alpha <= 0.01 || viewportWidth <= 0 || viewportHeight <= 0) return;
  const startX = viewportWidth * phase.startX;
  const endX = startX + viewportWidth * phase.deltaX;
  const startY = viewportHeight * phase.startY;
  const endY = startY + viewportHeight * phase.deltaY;
  const headX = startX + (endX - startX) * phase.progress;
  const headY = startY + (endY - startY) * phase.progress;
  const dx = endX - startX;
  const dy = endY - startY;
  const envelope = Math.sin(Math.PI * phase.progress);
  const trailFraction = phase.trailFraction;
  const segments = 18;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineCap = "round";
  for (let index = segments; index >= 1; index -= 1) {
    const outer = index / segments;
    const inner = (index - 1) / segments;
    ctx.globalAlpha = alpha * envelope * (1 - outer) ** 1.7;
    ctx.lineWidth = Math.max(0.3, 2.4 * (1 - outer));
    ctx.beginPath();
    ctx.moveTo(headX - dx * trailFraction * outer, headY - dy * trailFraction * outer);
    ctx.lineTo(headX - dx * trailFraction * inner, headY - dy * trailFraction * inner);
    ctx.stroke();
  }
  ctx.globalAlpha = alpha * envelope;
  ctx.shadowColor = ink;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(headX, headY, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
