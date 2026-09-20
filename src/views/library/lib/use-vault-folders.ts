"use client";

import { useEffect, useState } from "react";

import { useLocalVault } from "@/entities/vault-session";
import { selectOpenVaultHandle } from "@/shared/lib/select-open-vault-handle";

/**
 * **The folders that actually exist in the open folder.**
 *
 * A round's vault place names folders, and spec §3.2 is explicit that a path is *picked from
 * the vault's real folder list, never typed*: a typed path that matches nothing produces a
 * round that checks zero pages and says nothing about why.
 *
 * One reader serves both builds. In the browser the handle is a File System Access directory
 * handle; in the app it is the Tauri shim over `list_vault_directory`, which implements the
 * same `entries()`. So this walks the handle rather than calling either one by name.
 *
 * It walks two levels, which is what a vault's shape is (`sources/planning`, `wiki/releases`),
 * and it is bounded: dot directories and `node_modules` are skipped — the local-first rule
 * forbids reading them — and the list stops at {@link MAX_FOLDERS} so a folder someone pointed
 * at a repository cannot turn the sheet into a file browser.
 */

const MAX_FOLDERS = 64;
const MAX_DEPTH = 2;

function isSkipped(name: string): boolean {
  return name.startsWith(".") || name === "node_modules";
}

async function collect(
  handle: FileSystemDirectoryHandle,
  prefix: string,
  depth: number,
  out: string[],
): Promise<void> {
  if (depth > MAX_DEPTH || out.length >= MAX_FOLDERS) return;
  const children: Array<{ path: string; handle: FileSystemDirectoryHandle }> = [];
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind !== "directory" || isSkipped(name)) continue;
    const path = prefix ? `${prefix}/${name}` : name;
    if (out.length >= MAX_FOLDERS) break;
    out.push(path);
    children.push({ path, handle: entry as FileSystemDirectoryHandle });
  }
  for (const child of children) {
    await collect(child.handle, child.path, depth + 1, out);
  }
}

/**
 * `enabled` is the guard the architecture rule asks for: the sheet is what needs this list, so
 * nothing is read from disk while the sheet is closed.
 */
export function useVaultFolders(enabled: boolean): string[] {
  const vault = useLocalVault();
  const handle = selectOpenVaultHandle(vault.status, vault.handle);
  const [folders, setFolders] = useState<string[]>([]);

  useEffect(() => {
    if (!enabled || !handle) return;
    let cancelled = false;
    void (async () => {
      const out: string[] = [];
      try {
        await collect(handle, "", 1, out);
      } catch {
        /* A folder that cannot be walked offers no chips; the round still watches everything. */
      }
      if (!cancelled) setFolders(out.sort((a, b) => a.localeCompare(b)));
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, handle]);

  return folders;
}
