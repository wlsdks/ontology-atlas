"use client";

import { useCallback, useRef, useState } from "react";
import type { VaultDoc } from "@/entities/docs-vault";
import { readTauriVaultTextFile } from "@/shared/lib/vault-folder/native-vault/tauri-vault-files";

interface ReadPage {
  stamp: string;
  text: string | null;
}

/**
 * The current text of a wiki page an agent asks to edit, read when asked: `undefined` while the read
 * runs, `null` for a page the folder's walk did not list or could not read. Holds one page's text.
 */
export function useEditedPageText(vaultRoot: string | null, docs: readonly VaultDoc[]) {
  const [read, setRead] = useState<ReadPage | null>(null);
  const asked = useRef<string | null>(null);
  return useCallback((path: string): string | null | undefined => {
    const doc = vaultRoot ? docs.find((candidate) => candidate.path === path) : undefined;
    if (!vaultRoot || !doc) return null;
    const stamp = `${vaultRoot}\u0000${path}@${doc.mtime ?? 0}`;
    if (read?.stamp === stamp) return read.text;
    if (asked.current !== stamp) {
      asked.current = stamp;
      void readTauriVaultTextFile(vaultRoot, path)
        .then((file) => file?.text ?? null, () => null)
        .then((text) => {
          if (asked.current === stamp) setRead({ stamp, text });
        });
    }
    return undefined;
  }, [docs, read, vaultRoot]);
}
