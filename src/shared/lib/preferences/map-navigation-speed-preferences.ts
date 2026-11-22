import { useCallback, useSyncExternalStore } from "react";
import { notifyPreferenceChange, subscribeToPreferenceChange } from "./preference-storage/preference-change-event";

export const MAP_SPEEDS = [0.5, 0.75, 1, 1.5, 2] as const;

export type MapSpeed = (typeof MAP_SPEEDS)[number];

export const DEFAULT_MAP_SPEED: MapSpeed = 1;

export interface MapNavigationSpeed {
  drag: MapSpeed;
  zoom: MapSpeed;
}

export const DEFAULT_MAP_NAVIGATION_SPEED: MapNavigationSpeed = {
  drag: DEFAULT_MAP_SPEED,
  zoom: DEFAULT_MAP_SPEED,
};

const MAP_DRAG_SPEED_KEY = "atlas.appearance.map-drag-speed";
const MAP_ZOOM_SPEED_KEY = "atlas.appearance.map-zoom-speed";

export function resolveMapSpeed(saved: string | null): MapSpeed {
  if (saved === null || saved.trim() === "") return DEFAULT_MAP_SPEED;
  const value = Number(saved);
  return MAP_SPEEDS.find((speed) => speed === value) ?? DEFAULT_MAP_SPEED;
}

function readMapSpeed(key: string): MapSpeed {
  if (typeof window === "undefined") return DEFAULT_MAP_SPEED;
  try {
    return resolveMapSpeed(window.localStorage.getItem(key));
  } catch {
    return DEFAULT_MAP_SPEED;
  }
}

function storeMapSpeed(key: string, value: MapSpeed): boolean {
  try {
    window.localStorage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}

function writeMapSpeed(key: string, value: MapSpeed): void {
  if (typeof window === "undefined") return;
  storeMapSpeed(key, value);
  notifyPreferenceChange();
}

export function writeMapDragSpeed(value: MapSpeed): void {
  writeMapSpeed(MAP_DRAG_SPEED_KEY, value);
}

export function writeMapZoomSpeed(value: MapSpeed): void {
  writeMapSpeed(MAP_ZOOM_SPEED_KEY, value);
}

export function useMapDragSpeed(): MapSpeed {
  const getSnapshot = useCallback(() => readMapSpeed(MAP_DRAG_SPEED_KEY), []);
  const getServerSnapshot = useCallback(() => DEFAULT_MAP_SPEED, []);
  return useSyncExternalStore(subscribeToPreferenceChange, getSnapshot, getServerSnapshot);
}

export function useMapZoomSpeed(): MapSpeed {
  const getSnapshot = useCallback(() => readMapSpeed(MAP_ZOOM_SPEED_KEY), []);
  const getServerSnapshot = useCallback(() => DEFAULT_MAP_SPEED, []);
  return useSyncExternalStore(subscribeToPreferenceChange, getSnapshot, getServerSnapshot);
}
