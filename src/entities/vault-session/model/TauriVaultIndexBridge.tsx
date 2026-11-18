"use client";

import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { getTauriVaultRootPath, isTauriVaultRuntime } from "@/shared/lib/vault-folder/tauri-vault-fs";
import { syncVaultIndex, vaultIndexPreference } from "@/shared/lib/vault-folder/tauri-vault-index";
import { useLocalVault } from "./local-vault-context";

/**
 * Under Tauri, keeps the search index in step with the folder: opening it, each `vault-changed`
 * from the watcher, and each re-read the slow poll triggers start a stamp pass on a background
 * thread. No changed-path list crosses the bridge; a pass finds what changed by itself.
 */
export function TauriVaultIndexBridge() {
  const { status, handle, lastLoadedAt } = useLocalVault();
  const rootPath = handle ? getTauriVaultRootPath(handle) ?? null : null;
  const indexSwitch = vaultIndexPreference.use();
  const active = isTauriVaultRuntime() && status === "loaded" && rootPath !== null;

  useEffect(() => {
    if (!active || rootPath === null) return;
    void syncVaultIndex(rootPath, true).catch(() => undefined);
  }, [active, rootPath, indexSwitch]);

  useEffect(() => {
    if (!active || rootPath === null || lastLoadedAt === null) return;
    void syncVaultIndex(rootPath, false).catch(() => undefined);
  }, [active, rootPath, lastLoadedAt]);

  useEffect(() => {
    if (!active || rootPath === null) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listen("vault-changed", () => {
      void syncVaultIndex(rootPath, false).catch(() => undefined);
    })
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [active, rootPath]);

  return null;
}
