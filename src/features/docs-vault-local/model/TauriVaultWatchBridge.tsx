"use client";

import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getTauriVaultRootPath, isTauriVaultRuntime } from "@/shared/lib/tauri-vault-fs";
import { useLocalVault } from "./LocalVaultProvider";

/**
 * The JS side of the live desktop watch — once a vault loads under Tauri, it starts the Rust file
 * watcher (`start_vault_watch`) and listens for `vault-changed` to refresh immediately.
 *
 * That means the OS event lands *at once* rather than waiting out the 5s poll — the screen follows
 * the moment an agent writes to disk. On the web (`isTauriVaultRuntime` false) it is a no-op, where
 * the existing 5s polling fallback already covers it. Headless (renders nothing), mounted inside
 * LocalVaultProvider alongside VaultDiffToaster.
 *
 * It subscribes once per (status, rootPath) — `refresh` is called through a ref so it does not
 * resubscribe on every reload.
 */
export function TauriVaultWatchBridge() {
  const { status, handle, refresh } = useLocalVault();
  const rootPath = handle ? getTauriVaultRootPath(handle) ?? null : null;
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!isTauriVaultRuntime() || status !== "loaded" || !rootPath) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        await invoke("start_vault_watch", { rootPath });
        const un = await listen("vault-changed", () => {
          void refreshRef.current();
        });
        if (cancelled) un();
        else unlisten = un;
      } catch {
        /* Tauri unavailable or permission failure — the polling fallback covers it. */
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [status, rootPath]);

  return null;
}
