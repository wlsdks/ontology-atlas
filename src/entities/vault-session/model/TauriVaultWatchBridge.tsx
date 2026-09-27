"use client";

import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getTauriVaultRootPath, isTauriVaultRuntime } from "@/shared/lib/tauri-vault-fs";
import { useLocalVault } from "./local-vault-context";

/**
 * Under Tauri, starts the Rust file watcher (`start_vault_watch`) and checks the folder on each
 * `vault-changed`, so the screen follows an agent's writes at once. A no-op on the web.
 * `syncWithDisk` goes through a ref, so a reload does not resubscribe.
 */
export function TauriVaultWatchBridge() {
  const { status, handle, syncWithDisk } = useLocalVault();
  const rootPath = handle ? getTauriVaultRootPath(handle) ?? null : null;
  const syncRef = useRef(syncWithDisk);
  useEffect(() => {
    syncRef.current = syncWithDisk;
  }, [syncWithDisk]);

  useEffect(() => {
    if (!isTauriVaultRuntime() || status !== "loaded" || !rootPath) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        await invoke("start_vault_watch", { rootPath });
        const un = await listen("vault-changed", () => {
          void syncRef.current();
        });
        if (cancelled) un();
        else unlisten = un;
      } catch {
        /* The slow poll and focus checks still keep the folder current. */
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [status, rootPath]);

  return null;
}
