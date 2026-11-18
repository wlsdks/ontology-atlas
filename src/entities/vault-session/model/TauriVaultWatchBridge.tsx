"use client";

import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getTauriVaultRootPath, isTauriVaultRuntime } from "@/shared/lib/vault-folder/tauri-vault-fs";
import { parseVaultChangeBatch } from "@/shared/lib/vault-folder/vault-change-batch";
import { useLocalVault } from "./local-vault-context";

/**
 * Under Tauri, starts the Rust file watcher (`start_vault_watch`) and hands each `vault-changed`
 * batch of changed paths to `applyVaultChangeBatch`, so the screen follows an agent's writes at
 * the cost of the files that changed. A no-op on the web. The callback goes through a ref, so a
 * reload does not resubscribe.
 */
export function TauriVaultWatchBridge() {
  const { status, handle, applyVaultChangeBatch } = useLocalVault();
  const rootPath = handle ? getTauriVaultRootPath(handle) ?? null : null;
  const applyRef = useRef(applyVaultChangeBatch);
  useEffect(() => {
    applyRef.current = applyVaultChangeBatch;
  }, [applyVaultChangeBatch]);

  useEffect(() => {
    if (!isTauriVaultRuntime() || status !== "loaded" || !rootPath) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        await invoke("start_vault_watch", { rootPath });
        const un = await listen<unknown>("vault-changed", (event) => {
          void applyRef.current(parseVaultChangeBatch(event.payload));
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
