import { IMPOSTOR_EXTENT } from "./draw/cosmos-paint";
import type { CosmosGalaxy, CosmosLayout } from "./layout/cosmos-layout";
import type { CosmosCamera, CosmosRoom, GalaxyPose } from "./cosmos-types";

export function galaxyMatrix(g: CosmosGalaxy, pose: GalaxyPose, camera: CosmosCamera, room: CosmosRoom, theta = pose.theta) {
  const k = camera.scale;
  const ca = Math.cos(g.angle);
  const sa = Math.sin(g.angle);
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const t = g.tilt;
  return {
    a: k * (ca * ct - t * sa * st),
    b: k * (sa * ct + t * ca * st),
    c: k * (-ca * st - t * sa * ct),
    d: k * (-sa * st + t * ca * ct),
    e: room.x + room.width / 2 + (pose.x - camera.x) * k,
    f: room.y + room.height / 2 + (pose.y - camera.y) * k,
  };
}

export function worldToScreen(camera: CosmosCamera, room: CosmosRoom, x: number, y: number): { x: number; y: number } {
  return { x: room.x + room.width / 2 + (x - camera.x) * camera.scale, y: room.y + room.height / 2 + (y - camera.y) * camera.scale };
}

export function screenToWorld(camera: CosmosCamera, room: CosmosRoom, x: number, y: number): { x: number; y: number } {
  return { x: camera.x + (x - room.x - room.width / 2) / camera.scale, y: camera.y + (y - room.y - room.height / 2) / camera.scale };
}

export function liveBandRadius(dpr: number): number {
  return 512 / (2 * dpr * IMPOSTOR_EXTENT);
}

export function overviewCamera(bounds: CosmosLayout["bounds"], room: CosmosRoom): { camera: CosmosCamera; overviewScale: number } {
  const scale = Math.min(room.width / (bounds.maxX - bounds.minX), (room.height - 36) / (bounds.maxY - bounds.minY)) * 0.97;
  return {
    camera: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 + 14 / Math.max(1e-6, scale), scale },
    overviewScale: scale,
  };
}

export function galaxyFitScale(galaxy: Pick<CosmosGalaxy, "extent">, room: CosmosRoom): number {
  return Math.min(room.width, room.height) / (galaxy.extent * 2 * 1.12);
}
