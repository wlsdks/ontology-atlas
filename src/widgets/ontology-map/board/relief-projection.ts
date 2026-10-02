import { easeOutCubic, TIER_ASSEMBLE_TOTAL_MS, TIER_DELAY_MS, TIER_RISE_MS } from "../morph/tier-assembly";

export const RELIEF_PITCH_REST = 0.75;
export const RELIEF_PITCH_MAX = 0.9;
const HEIGHT_FLOOR = 0.12;
const HEIGHT_SPAN = 0.98;
const HEIGHT_CAP = 1.1;

export function reliefHeightPx(d: number, dMax: number, R: number): number {
  const share = dMax > 0 ? Math.log2(1 + Math.max(0, d)) / Math.log2(1 + dMax) : 0;
  return R * Math.min(HEIGHT_CAP, HEIGHT_FLOOR + HEIGHT_SPAN * share);
}

export interface ReliefView {
  pitch: number;
  pivotY: number;
}

export function projectReliefPoint(x: number, y: number, h: number, view: ReliefView): { x: number; y: number } {
  return { x, y: view.pivotY + (y - view.pivotY) * Math.cos(view.pitch) - h * Math.sin(view.pitch) };
}

export function groundInverseY(py: number, pose: ReliefView, cam: { R: number; oy: number }): number {
  return ((py - pose.pivotY) / Math.cos(pose.pitch) + pose.pivotY - cam.oy) / cam.R;
}

type RiseKind = "project" | "domain" | "capability";

export function reliefRiseDelayMs(kind: RiseKind, ring: number, ringMin: number, ringMax: number): number {
  if (kind !== "capability") return TIER_DELAY_MS[kind];
  const span = TIER_DELAY_MS.element - TIER_DELAY_MS.capability;
  const share = ringMax > ringMin ? (ring - ringMin) / (ringMax - ringMin) : 0;
  return TIER_DELAY_MS.capability + span * Math.min(1, Math.max(0, share));
}

export function reliefRiseAt(clockMs: number, delayMs: number): number {
  return easeOutCubic((clockMs - delayMs) / TIER_RISE_MS);
}

export function reliefRisePitchAt(clockMs: number, from: number, to: number): number {
  return from + (to - from) * easeOutCubic(clockMs / TIER_ASSEMBLE_TOTAL_MS);
}

export const RELIEF_RISE_TOTAL_MS = TIER_ASSEMBLE_TOTAL_MS;
