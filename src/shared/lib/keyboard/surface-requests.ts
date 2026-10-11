import { useEffect, useRef } from "react";

export const OPEN_SETTINGS_EVENT = "ontology-atlas:open-settings";
export const OPEN_SHORTCUTS_EVENT = "ontology-atlas:open-shortcuts";

export type SurfaceRequestEvent = typeof OPEN_SETTINGS_EVENT | typeof OPEN_SHORTCUTS_EVENT;

interface SurfaceRequestDetail {
  claimed: boolean;
}

function request(event: SurfaceRequestEvent): boolean {
  if (typeof window === "undefined") return false;
  const detail: SurfaceRequestDetail = { claimed: false };
  window.dispatchEvent(new CustomEvent<SurfaceRequestDetail>(event, { detail }));
  return detail.claimed;
}

export function requestSettingsOpen(): boolean {
  return request(OPEN_SETTINGS_EVENT);
}

export function requestShortcutSheet(): boolean {
  return request(OPEN_SHORTCUTS_EVENT);
}

export function useSurfaceRequest(event: SurfaceRequestEvent, onRequest: () => boolean): void {
  const handler = useRef(onRequest);
  useEffect(() => {
    handler.current = onRequest;
  });

  useEffect(() => {
    const listener = (raw: Event) => {
      const detail = (raw as CustomEvent<SurfaceRequestDetail | null>).detail;
      if (!detail || detail.claimed) return;
      if (handler.current()) detail.claimed = true;
    };
    window.addEventListener(event, listener);
    return () => window.removeEventListener(event, listener);
  }, [event]);
}
