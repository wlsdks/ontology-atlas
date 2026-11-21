import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { readSourceCopy, subscribeSourceCopy, type SourceCopyJob } from "@/features/library";
import {
  armTauriSourceDrop,
  subscribeTauriSourceDrop,
} from "@/shared/lib/vault-folder/tauri-vault-fs";

import {
  captureDroppedItems,
  requestFromBrowserDrop,
  requestFromNativeOffer,
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

function carriesFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

/**
 * Drops anywhere on the window while the stage is on screen. In the app Rust takes the paths from
 * the native drop and offers them; the page only hears what was offered. In a browser the page's
 * own drop events carry `File` objects and folder handles.
 */
export function useSourceDrop({
  root,
  nativeRootPath,
  onRequest,
}: {
  root: FileSystemDirectoryHandle;
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
        if (event.offer.files.length > 0 || event.offer.skipped.length > 0) {
          latest.current(requestFromNativeOffer(nativeRootPath, event.offer));
        }
      }
    });
    return () => {
      unsubscribe?.();
      void armTauriSourceDrop(false).catch(() => undefined);
    };
  }, [nativeRootPath]);

  useEffect(() => {
    if (nativeRootPath) return;
    let depth = 0;
    const enter = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth += 1;
      setOver(true);
    };
    const hover = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const leave = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const drop = (event: DragEvent) => {
      if (!event.dataTransfer || !carriesFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setOver(false);
      const items = captureDroppedItems(event.dataTransfer);
      void requestFromBrowserDrop(root, items).then((request) => {
        if (request.files > 0 || request.plan.skipped.length > 0) latest.current(request);
      });
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", hover);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", hover);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [nativeRootPath, root]);

  return { over };
}
