"use client";

import { useEffect } from "react";
import { isTauriVaultRuntime } from "@/shared/lib/vault-folder/native-vault/tauri-vault-runtime";
import { forgetOldBrowserFolders } from "./forget-old-browser-folders";

/**
 * A plain browser that once opened a folder on an earlier website keeps that folder's record. No
 * page of the website reads it any more, so the first page it opens deletes it. Renders nothing.
 */
export function OldBrowserFolderCleanup() {
  useEffect(() => {
    if (!isTauriVaultRuntime()) void forgetOldBrowserFolders();
  }, []);
  return null;
}
