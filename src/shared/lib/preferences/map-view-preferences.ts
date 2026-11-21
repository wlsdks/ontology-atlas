import { useCallback, useSyncExternalStore } from "react";
import type { MapLayoutView } from "../map-canvas/map-layout-morph-store";
import { readOnOff, writeOnOff } from "./on-off-preference";
import { notifyPreferenceChange, subscribeToPreferenceChange } from "./preference-change-event";

const VIEW_3D_KEY = "atlas.appearance.view3d";

const DEFAULT_VIEW_3D = false;

function readView3d(): boolean {
  return readOnOff(VIEW_3D_KEY, DEFAULT_VIEW_3D);
}

export function useView3d(): boolean {
  const getSnapshot = useCallback(() => readView3d(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_VIEW_3D, []);
  return useSyncExternalStore(subscribeToPreferenceChange, getSnapshot, getServerSnapshot);
}

const STRUCTURE_KEY = "atlas.appearance.structure";
const RETIRED_VIEW_KEY = "atlas.appearance.galaxy";
const RETIRED_TERRITORIES_KEY = "atlas.appearance.territories";

function readDomainStructure(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const current = window.localStorage.getItem(STRUCTURE_KEY);
    return current === null ? window.localStorage.getItem(RETIRED_VIEW_KEY) === "on" : current === "on";
  } catch { return false; }
}

export function useDomainStructure(): boolean {
  return useSyncExternalStore(subscribeToPreferenceChange, readDomainStructure, () => false);
}

const HEX_BOARD_KEY = "atlas.appearance.hex-board";

const DEFAULT_HEX_BOARD = false;

function readHexBoard(): boolean {
  return readOnOff(HEX_BOARD_KEY, DEFAULT_HEX_BOARD);
}

export function useHexBoard(): boolean {
  const getSnapshot = useCallback(() => readHexBoard(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_HEX_BOARD, []);
  return useSyncExternalStore(subscribeToPreferenceChange, getSnapshot, getServerSnapshot);
}

export function useFlatMapView(): boolean {
  return useMapView() === "flat";
}

/** The picker's view from its stored flags; 3D and Neural win over the flat-plane views. */
export function useMapView(): MapLayoutView {
  const view3d = useView3d();
  const neural = useSyncExternalStore(subscribeToPreferenceChange, readNeuralArrangement, () => false);
  const structure = useDomainStructure();
  const hexBoard = useHexBoard();
  return view3d ? (neural ? "neural" : "3d") : hexBoard ? "hex" : structure ? "structure" : "flat";
}

const HEX_RELIEF_KEY = "atlas.appearance.hex-relief";

const DEFAULT_HEX_RELIEF = false;

export function readHexRelief(): boolean {
  return readOnOff(HEX_RELIEF_KEY, DEFAULT_HEX_RELIEF);
}

export function writeHexRelief(value: boolean): void {
  writeOnOff(HEX_RELIEF_KEY, value);
}

export function useHexRelief(): boolean {
  const getSnapshot = useCallback(() => readHexRelief(), []);
  const getServerSnapshot = useCallback(() => DEFAULT_HEX_RELIEF, []);
  return useSyncExternalStore(subscribeToPreferenceChange, getSnapshot, getServerSnapshot);
}

export type MapArrangement = "strata" | "coupling";

export const DEFAULT_MAP_ARRANGEMENT: MapArrangement = "strata";

/**
 * With the 3D flag on, `coupling` here opens Neural, the value older builds stored for it; any
 * other value, Strata's included, opens the 3D tree. Picking any other view removes it.
 */
const MAP_ARRANGEMENT_KEY = "atlas.appearance.map-arrangement";
const NEURAL_ARRANGEMENT = "coupling";

function readNeuralArrangement(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MAP_ARRANGEMENT_KEY) === NEURAL_ARRANGEMENT;
  } catch {
    return false;
  }
}

export function writeMapView(view: MapLayoutView): void {
  if (typeof window === "undefined") return;
  const neural = view === "neural";
  const writes: Array<[string, string]> = [
    [HEX_BOARD_KEY, view === "hex" ? "on" : "off"],
    [STRUCTURE_KEY, view === "structure" ? "on" : "off"],
    ...(neural ? [[MAP_ARRANGEMENT_KEY, NEURAL_ARRANGEMENT] as [string, string]] : []),
    [VIEW_3D_KEY, view === "3d" || neural ? "on" : "off"],
  ];
  for (const [key, value] of writes) {
    let unchanged = false;
    try {
      unchanged = window.localStorage.getItem(key) === value;
    } catch {}
    if (!unchanged) {
      try {
        window.localStorage.setItem(key, value);
      } catch {}
    }
  }
  const removed = neural ? [RETIRED_VIEW_KEY, RETIRED_TERRITORIES_KEY] : [RETIRED_VIEW_KEY, RETIRED_TERRITORIES_KEY, MAP_ARRANGEMENT_KEY];
  for (const key of removed) {
    try { window.localStorage.removeItem(key); } catch {}
  }
  notifyPreferenceChange();
}
