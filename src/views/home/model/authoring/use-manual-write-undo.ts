import type { useTopologyVaultReadModel } from "../use-topology-vault-read-model";

import { useToast } from "@/shared/ui";
import { useCallback, useEffect, useRef } from "react";
import { type ManualWrite, planUndo } from "./manual-write-undo";

type Vault = Pick<
  ReturnType<typeof useTopologyVaultReadModel>["vault"],
  "fileHandles" | "saveDoc" | "createDoc" | "deleteDoc"
>;
type Translate = (key: string, values?: Record<string, string | number>) => string;

interface ManualWriteRequest {
  slug: string;
  write: () => Promise<unknown>;
  /** The toast line that names what happened. */
  message: string;
  /** The bytes the write leaves when they are known up front: the new file, or `null` for a delete. */
  written?: string | null;
}

/**
 * Keeps the bytes from before the most recent manual write beside the vault writer
 * (`useVaultDocWrites`), so its toast can offer Undo. Browser and app handles answer the same
 * `getFile()`, so both read and restore the same way.
 */
export function useManualWriteUndo({
  vault,
  folder,
  toast,
  t,
}: {
  vault: Vault;
  /** The open folder's identity (`vaultIdentity`). */
  folder: string | null;
  toast: ReturnType<typeof useToast>;
  t: Translate;
}) {
  const vaultRef = useRef(vault);
  const folderRef = useRef(folder);
  useEffect(() => {
    vaultRef.current = vault;
    folderRef.current = folder;
  });
  const lastWriteRef = useRef<ManualWrite | null>(null);
  const writeCountRef = useRef(0);

  const readText = useCallback(async (slug: string): Promise<string | null> => {
    const handle = vaultRef.current.fileHandles.get(slug);
    if (!handle) return null;
    try {
      return await (await handle.getFile()).text();
    } catch {
      return null;
    }
  }, []);

  const undo = useCallback(
    async (id: number) => {
      const write = lastWriteRef.current;
      if (!write || write.id !== id) {
        toast.show(t("manualWrite.undoNotLatest"), "info");
        return;
      }
      if (write.folder !== folderRef.current) {
        toast.show(t("manualWrite.undoOtherFolder"), "info");
        return;
      }
      const step = planUndo(write, await readText(write.slug));
      if (step === "changed") {
        toast.show(t("manualWrite.undoChanged"), "error");
        return;
      }
      const writer = vaultRef.current;
      try {
        if (step.action === "delete") await writer.deleteDoc(write.slug);
        else if (step.action === "create") await writer.createDoc(write.slug, step.content);
        else await writer.saveDoc(write.slug, step.content);
        lastWriteRef.current = null;
        toast.show(t("manualWrite.undone"), "info");
      } catch {
        toast.show(t("manualWrite.undoFailed"), "error");
      }
    },
    [readText, t, toast],
  );

  /** Runs one manual write and answers with a toast that names it and offers Undo; rethrows a failure. */
  const runManualWrite = useCallback(
    async ({ slug, write, message, written }: ManualWriteRequest) => {
      const handle = vaultRef.current.fileHandles.get(slug) ?? null;
      const before = handle ? await (await handle.getFile()).text() : null;
      await write();
      const after = written !== undefined ? written : handle ? await (await handle.getFile()).text() : null;
      writeCountRef.current += 1;
      const id = writeCountRef.current;
      lastWriteRef.current = { id, folder: folderRef.current, slug, before, after };
      toast.show(message, "success", { label: t("manualWrite.undo"), onClick: () => void undo(id) });
    },
    [t, toast, undo],
  );

  /** Undoes the most recent manual write, for the keyboard; answers whether there was one. */
  const undoLastManualWrite = useCallback(() => {
    const write = lastWriteRef.current;
    if (!write) return false;
    void undo(write.id);
    return true;
  }, [undo]);

  return { runManualWrite, undoLastManualWrite } as const;
}
