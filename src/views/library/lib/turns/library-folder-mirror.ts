"use client";

import { useEffect } from "react";

import type { VaultDoc } from "@/entities/docs-vault";
import { useLocalVault } from "@/entities/vault-session";
import { useWikiWriteMode, type WikiWriteMode } from "@/shared/lib/preferences/library-preferences";
import { selectOpenVaultHandle } from "@/shared/lib/vault-folder/select-open-vault-handle";
import { getTauriVaultRootPath } from "@/shared/lib/vault-folder/tauri-vault-fs";

/**
 * The open folder as it is now, kept above every route. A Library turn outlives the Library page,
 * so its judge reads the write mode, documents and source list here at each request.
 */
export interface LiveLibraryFolder {
  vaultRoot: string | null;
  docs: readonly VaultDoc[];
  sources: readonly string[];
  writeMode: WikiWriteMode;
}

const NONE: readonly never[] = [];
let live: LiveLibraryFolder = { vaultRoot: null, docs: NONE, sources: NONE, writeMode: "ask" };

export function readLiveLibraryFolder(): LiveLibraryFolder {
  return live;
}

export function publishLiveLibraryFolder(next: LiveLibraryFolder) {
  live = next;
}

/** Mounted once in the shell; it only hands references on, so it costs no work per render. */
export function LibraryFolderMirror() {
  const vault = useLocalVault();
  const writeMode = useWikiWriteMode();
  const handle = selectOpenVaultHandle(vault.status, vault.handle);
  const vaultRoot = handle ? (getTauriVaultRootPath(handle) ?? null) : null;
  const docs = vault.manifest?.docs ?? NONE;
  const sources = vault.manifest?.sources;
  useEffect(() => {
    publishLiveLibraryFolder({ vaultRoot, docs, sources: sources?.map((source) => source.path) ?? NONE, writeMode });
  }, [docs, sources, vaultRoot, writeMode]);
  return null;
}
