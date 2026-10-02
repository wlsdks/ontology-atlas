import { ownLinkCount } from "./links";
import type { Box, DialAttention, DialItem, DialModel, DialScene, DialTokens, Point } from "./types";

export interface DialCamera {
  scale: number;
  viewportWidth: number;
  viewportHeight: number;
  toScreen(x: number, y: number): Point;
}

export interface DialResolution {
  entered: string | null;
  resolved: boolean;
  endpointSlide: number;
}

export interface DialDisclosure extends DialResolution {
  pitchPx: number;
  capAlpha: number;
  plateAlpha: number;
  elementsAlpha: number;
  orphanAlpha: number;
  elementAlphaFor(item: DialItem): number;
}

export const RESOLVE_SLIDE_PX = 12;
const CAPS_DRAWN_ALPHA = 0.5;

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

interface ScaleRamps {
  scale: number;
  pitchPx: number;
  capAlpha: number;
  plateAlpha: number;
  elementsAlpha: number;
  orphanAlpha: number;
  elementAlphaFor(item: DialItem): number;
}

const rampCache = new WeakMap<DialScene, ScaleRamps>();
const ownLinkCache = new WeakMap<DialModel, Map<string, number>>();

function rampsOf(scene: DialScene, scale: number, tokens: DialTokens): ScaleRamps {
  const hit = rampCache.get(scene);
  if (hit && hit.scale === scale) return hit;
  const pitchPx = tokens.pitch * scale;
  const capAlpha = smoothstep(tokens.capOnFrom, tokens.capOnFull, pitchPx);
  const after = smoothstep(tokens.elementsAfterCapFrom, tokens.elementsAfterCapFull, pitchPx);
  const elementsAlpha = capAlpha * after;
  const ramps: ScaleRamps = {
    scale,
    pitchPx,
    capAlpha,
    plateAlpha: 1 - smoothstep(tokens.capOnFrom, tokens.capOnFrom + 2, pitchPx),
    elementsAlpha,
    orphanAlpha: smoothstep(tokens.elementOnFrom, tokens.elementOnFull, scene.orphans.pitch * scale) * after,
    elementAlphaFor: (item) => (elementsAlpha > 0 ? smoothstep(tokens.elementOnFrom, tokens.elementOnFull, item.elementPitch * scale) * elementsAlpha : 0),
  };
  rampCache.set(scene, ramps);
  return ramps;
}

function ownLinks(model: DialModel, domainId: string): number {
  let byDomain = ownLinkCache.get(model);
  if (!byDomain) ownLinkCache.set(model, (byDomain = new Map()));
  let n = byDomain.get(domainId);
  if (n === undefined) byDomain.set(domainId, (n = ownLinkCount(model, domainId)));
  return n;
}

function enteredOf(scene: DialScene, camera: DialCamera, free: Box, attention: DialAttention, capsDrawn: boolean): string | null {
  const W = camera.viewportWidth;
  const H = camera.viewportHeight;
  const fc = { x: (free.minX + free.maxX) / 2, y: (free.minY + free.maxY) / 2 };
  let best: string | null = null;
  let bestD = Infinity;
  for (const c of scene.clusters) {
    const p = camera.toScreen(c.chip.x, c.chip.y);
    const fr = c.footprint * camera.scale;
    if (p.x + fr < 0 || p.x - fr > W || p.y + fr < 0 || p.y - fr > H) continue;
    if (c.domainId === attention.domainId) return c.domainId;
    if (!capsDrawn) continue;
    const d = Math.hypot(p.x - fc.x, p.y - fc.y);
    if (d < bestD || (d === bestD && best !== null && c.domainId < best)) {
      best = c.domainId;
      bestD = d;
    }
  }
  return best;
}

export function resolveDialDisclosure(
  model: DialModel,
  scene: DialScene,
  camera: DialCamera,
  freeRect: Box,
  attention: DialAttention,
  tokens: DialTokens,
): DialDisclosure {
  const ramps = rampsOf(scene, camera.scale, tokens);
  const entered = enteredOf(scene, camera, freeRect, attention, ramps.capAlpha > CAPS_DRAWN_ALPHA);
  const resolved = entered !== null && ramps.pitchPx >= tokens.resolve && ownLinks(model, entered) <= tokens.resolveBudget;
  return {
    pitchPx: ramps.pitchPx,
    capAlpha: ramps.capAlpha,
    plateAlpha: ramps.plateAlpha,
    elementsAlpha: ramps.elementsAlpha,
    orphanAlpha: ramps.orphanAlpha,
    elementAlphaFor: ramps.elementAlphaFor,
    entered,
    resolved,
    endpointSlide: resolved ? Math.min(1, Math.max(0, (ramps.pitchPx - tokens.resolve) / RESOLVE_SLIDE_PX)) : 0,
  };
}
