import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { readSourceCopy, subscribeSourceCopy, type SourceCopyJob } from "@/features/library";
import {
  armTauriSourceDrop,
  subscribeTauriSourceDrop,
} from "@/shared/lib/vault-folder/native-vault/tauri-library-sources";

import {
  requestFromNativeOffer,
  requestHasNews,
  type CopyRequest,
} from "./source-drop";

/** The running or last copy of this folder, from the store that outlives the stage. */
export function useSourceCopy(scope: string): SourceCopyJob | null {
  return useSyncExternalStore(
    subscribeSourceCopy,
    () => readSourceCopy(scope),
    () => null,
  );
}

/**
 * Drops anywhere on the window while the stage is on screen. Rust takes the paths from the native
 * drop and offers them; the page only hears what was offered. Without a native folder path there
 * is no Rust to offer, so nothing is armed and `over` stays false.
 */
export function useSourceDrop({
  nativeRootPath,
  onRequest,
}: {
  nativeRootPath: string | null;
  onRequest: (request: CopyRequest) => void;
}): { over: boolean } {
  const [over, setOver] = useState(false);
  const latest = useRef(onRequest);
  useEffect(() => {
    latest.current = onRequest;
  }, [onRequest]);

  useEffect(() => {
    if (!nativeRootPath) return;
    void armTauriSourceDrop(true).catch(() => undefined);
    const unsubscribe = subscribeTauriSourceDrop((event) => {
      if (event.phase === "over") setOver(true);
      else if (event.phase === "leave") setOver(false);
      else if (event.phase === "offered") {
        setOver(false);
        const request = requestFromNativeOffer(nativeRootPath, event.offer);
        if (requestHasNews(request)) latest.current(request);
      }
    });
    return () => {
      unsubscribe?.();
      void armTauriSourceDrop(false).catch(() => undefined);
    };
  }, [nativeRootPath]);

  return { over };
}
