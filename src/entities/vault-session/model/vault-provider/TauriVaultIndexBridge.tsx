import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { getTauriVaultRootPath } from "@/shared/lib/vault-folder/native-vault/tauri-vault-runtime";
import { syncVaultIndex, vaultIndexPreference } from "@/shared/lib/vault-folder/vault-index/tauri-vault-index";
import { vectorStatus } from "@/shared/lib/vault-folder/vault-vectors/tauri-vault-vectors";
import { vaultVectorSource } from "@/shared/lib/vault-folder/vault-vectors/vault-vector-source";
import { useLocalVault } from "./local-vault-context";

/** Rust remembers a folder's source for the launch, so each folder is told once per page life. */
const armedVectorRoots = new Set<string>();

/**
 * Under Tauri, keeps the search index in step with the folder: opening it, each `vault-changed`
 * from the watcher, and each re-read the slow poll triggers start a stamp pass on a background
 * thread. No changed-path list crosses the bridge; a pass finds what changed by itself. A folder
 * with a stored search-by-meaning choice sends it once, so Rust updates its changed passages
 * without the Library being visited, and keeps a job the person stopped stopped.
 */
export function TauriVaultIndexBridge() {
  const { status, handle, lastLoadedAt } = useLocalVault();
  const rootPath = handle ? getTauriVaultRootPath(handle) ?? null : null;
  const indexSwitch = vaultIndexPreference.use();
  const active = status === "loaded" && rootPath !== null;

  useEffect(() => {
    if (!active || rootPath === null) return;
    void syncVaultIndex(rootPath, true).catch(() => undefined);
  }, [active, rootPath, indexSwitch]);

  useEffect(() => {
    if (!active || rootPath === null || armedVectorRoots.has(rootPath)) return;
    const choice = vaultVectorSource.read(rootPath);
    if (choice === null) return;
    armedVectorRoots.add(rootPath);
    void vectorStatus(rootPath, choice.source, choice.paused).catch(() => undefined);
  }, [active, rootPath]);

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
