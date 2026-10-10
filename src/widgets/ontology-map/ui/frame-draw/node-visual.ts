import type { NodeEgoState } from "../../model/focus-state";
import { resolveFreshnessVisual } from "../../model/freshness";
import type { DomeViewKind } from "../../model/dome-view";
import { hexToRgb, mixRgbHex } from "../../render/dome-light";
import { lerpColorHex } from "../../render/grid";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import type { WorldNode } from "../topology-world";

export const nodeVisualCache: (NodeVisual | undefined)[] = new Array(16);

let nodeVisualCacheTokens: OntologyMapTokens | null = null;

let nodeVisualCacheReducedMotion: boolean | null = null;

export function resetNodeVisualCacheFor(tokens: OntologyMapTokens, reducedMotion: boolean): void {
  if (nodeVisualCacheTokens !== tokens || nodeVisualCacheReducedMotion !== reducedMotion) {
    nodeVisualCache.fill(undefined);
    nodeVisualCacheTokens = tokens;
    nodeVisualCacheReducedMotion = reducedMotion;
  }
}

export const neuralPaletteCache = new WeakMap<NodeVisual, {
  ramp: number; ink: string; fill: string; stroke: string;
}>();

export const KIND_CACHE_INDEX: Record<WorldNode["kind"], number> = { project: 0, domain: 1, capability: 2, element: 3 };

export const LIT_KIND_STRENGTH: Readonly<Record<DomeViewKind, number>> = {
  project: 1,
  domain: 1,
  capability: 0.9,
  element: 0.7,
};

const litBodyCache = new Map<string, {
  fill: string; stroke: string;
}>();

const WHITE_RGB = [255, 255, 255] as const;

export function litBodyInk(
  fill: string,
  stroke: string,
  rgb: readonly [number, number, number],
  state: "current" | "stale",
  ramp: number): {
    fill: string;
    stroke: string;
  } {
  const q = Math.round(Math.min(1, Math.max(0, ramp)) * 20) / 20;
  const key = `${fill}|${stroke}|${rgb[0]},${rgb[1]},${rgb[2]}|${state}|${q}`;
  const hit = litBodyCache.get(key);
  if (hit)
    return hit;
  const base = hexToRgbOrNull(fill) ?? [20, 20, 26];
  const rim = hexToRgbOrNull(stroke) ?? base;
  const core = state === "current" ? hexToRgbOrNull(mixRgbHex(rgb, WHITE_RGB, 0.18)) ?? rgb : rgb;
  const t = (state === "current" ? 0.94 : 0.38) * q;
  const out = {
    fill: mixRgbHex(base, core, t),
    stroke: mixRgbHex(rim, state === "current" ? (hexToRgbOrNull(mixRgbHex(rgb, WHITE_RGB, 0.35)) ?? rgb) : rgb, (state === "current" ? 0.9 : 0.5) * q),
  };
  if (litBodyCache.size > 512)
    litBodyCache.clear();
  litBodyCache.set(key, out);
  return out;
}

function hexToRgbOrNull(hex: string): readonly [
  number,
  number,
  number
] | null {
  return hexToRgb(hex);
}

const LINE_WIDTH_BY_KIND: Record<WorldNode["kind"], number> = {
  project: 1.5,
  domain: 1.6,
  capability: 1.3,
  element: 1,
};

function tierFill(kind: WorldNode["kind"], tokens: OntologyMapTokens): string {
  if (kind === "project")
    return tokens.nodeFillProject;
  if (kind === "domain")
    return tokens.nodeFillDomain;
  if (kind === "capability")
    return tokens.nodeFillCapability;
  return tokens.nodeFillElement;
}

function tierStroke(kind: WorldNode["kind"], tokens: OntologyMapTokens): string {
  if (kind === "project")
    return tokens.nodeStrokeProject;
  if (kind === "domain")
    return tokens.nodeStrokeDomain;
  if (kind === "capability")
    return tokens.nodeStrokeCapability;
  return tokens.nodeStrokeElement;
}

const phaseCache = new Map<string, number>();

export function phaseForId(id: string): number {
  const cached = phaseCache.get(id);
  if (cached !== undefined)
    return cached;
  let hash = 0;
  for (let i = 0; i < id.length; i += 1)
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const phase = ((Math.abs(hash) % 1000) / 1000) * Math.PI * 2;
  phaseCache.set(id, phase);
  return phase;
}

export interface NodeVisual {
  fill: string;
  stroke: string;
  dash: readonly number[];
  lineWidth: number;
  breatheEnabled: boolean;
}

export function resolveNodeVisual(node: WorldNode, colorEgoState: NodeEgoState, emphasis: number, colorFocusedNodeId: string | null, isEmphasizedNeighbor: boolean, tokens: OntologyMapTokens, reducedMotion: boolean, focusRamp: number): NodeVisual {
  const freshness = resolveFreshnessVisual({ fresh: node.fresh, stale: node.stale, hub: node.isHub }, reducedMotion);
  const lineWidth = LINE_WIDTH_BY_KIND[node.kind];
  const dash = freshness.dash;
  let normalFill: string;
  let normalStroke: string;
  let normalBreathe = freshness.breatheEnabled;
  if (freshness.useStaleFillStroke) {
    normalFill = tokens.nodeFillStale;
    normalStroke = tokens.nodeStrokeStale;
    normalBreathe = false;
  }
  else if (node.kind === "project") {
    normalFill = tierFill(node.kind, tokens);
    normalStroke = tokens.amberHub;
  }
  else {
    normalFill = tierFill(node.kind, tokens);
    let stroke = tierStroke(node.kind, tokens);
    if (freshness.strokeIndigoLerp > 0)
      stroke = lerpColorHex(stroke, tokens.indigo, freshness.strokeIndigoLerp);
    if (!colorFocusedNodeId && emphasis > 0.02)
      stroke = lerpColorHex(stroke, tokens.indigo, Math.min(1, emphasis));
    normalStroke = stroke;
  }
  const ramp = Math.min(1, Math.max(0, focusRamp));
  if (ramp <= 0.001) {
    return { fill: normalFill, stroke: normalStroke, dash, lineWidth, breatheEnabled: normalBreathe };
  }
  let focusedFill: string;
  let focusedStroke: string;
  let focusedBreathe = normalBreathe;
  if (colorEgoState === "dim") {
    focusedFill = tokens.nodeFillDim;
    focusedStroke = tokens.nodeStrokeDim;
    focusedBreathe = false;
  }
  else if (freshness.useStaleFillStroke) {
    focusedFill = tokens.nodeFillStale;
    focusedStroke = tokens.nodeStrokeStale;
    focusedBreathe = false;
  }
  else if (node.kind === "project") {
    focusedFill = tierFill(node.kind, tokens);
    focusedStroke = tokens.amberHub;
  }
  else {
    focusedFill = tierFill(node.kind, tokens);
    let stroke = tierStroke(node.kind, tokens);
    if (freshness.strokeIndigoLerp > 0)
      stroke = lerpColorHex(stroke, tokens.indigo, freshness.strokeIndigoLerp);
    if (colorEgoState === "neighbor")
      stroke = lerpColorHex(stroke, tokens.indigo, 0.5);
    if (isEmphasizedNeighbor && emphasis > 0.02)
      stroke = lerpColorHex(stroke, tokens.indigoBright, Math.min(1, emphasis));
    if (colorEgoState === "center")
      stroke = tokens.indigoBright;
    focusedStroke = stroke;
  }
  return {
    fill: lerpColorHex(normalFill, focusedFill, ramp),
    stroke: lerpColorHex(normalStroke, focusedStroke, ramp),
    dash,
    lineWidth,
    breatheEnabled: ramp > 0.5 ? focusedBreathe : normalBreathe,
  };
}
