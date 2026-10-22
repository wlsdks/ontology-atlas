import type { Point } from "../types";

/** Three stable outward shelves; larger clusters keep the compact packing. */
export const FAN_CAPACITY = 15;
export const FAN_DOMAIN_LIMIT = 12;

export function clusterFanPoint(index: number, angle: number, pitch: number): Point {
  const shelf = index < 3 ? 0 : index < 8 ? 1 : 2;
  const first = shelf === 0 ? 0 : shelf === 1 ? 3 : 8;
  const slots = 3 + shelf * 2;
  const spread = Math.PI / 3 + shelf * Math.PI / 18;
  const phi = angle + ((index - first) / (slots - 1) * 2 - 1) * spread;
  const radius = (1.4 + shelf) * pitch;
  return { x: Math.cos(phi) * radius, y: Math.sin(phi) * radius };
}
