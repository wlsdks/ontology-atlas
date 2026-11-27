import type { useTopologyVaultReadModel } from "../use-topology-vault-read-model";

import { readStrictUtf8Text } from "@/shared/lib/vault-folder/strict-utf8-text";
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
  message: string;
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

  /** The file's text, `null` when it is gone; one that is not UTF-8 rejects with `not-utf8`. */
  const readText = useCallback(async (slug: string): Promise<string | null> => {
    const handle = vaultRef.current.fileHandles.get(slug);
    if (!handle) return null;
    let file: File;
    try {
      file = await handle.getFile();
    } catch {
      return null;
    }
    return readStrictUtf8Text(file, `${slug}.md`);
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
      // What was written is UTF-8, so a file that no longer is has changed since.
      const step = await readText(write.slug).then((current) => planUndo(write, current), () => "changed" as const);
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

  const runManualWrite = useCallback(
    async ({ slug, write, message, written }: ManualWriteRequest) => {
      // A file that is not UTF-8 is refused here, before its write: Undo would put back replacement characters.
      const before = await readText(slug);
      await write();
      const after = written !== undefined ? written : await readText(slug);
      writeCountRef.current += 1;
      const id = writeCountRef.current;
      lastWriteRef.current = { id, folder: folderRef.current, slug, before, after };
      toast.show(message, "success", { label: t("manualWrite.undo"), onClick: () => void undo(id) });
    },
    [readText, t, toast, undo],
  );

  const undoLastManualWrite = useCallback(() => {
    const write = lastWriteRef.current;
    if (!write) return false;
    void undo(write.id);
    return true;
  }, [undo]);

  return { runManualWrite, undoLastManualWrite } as const;
}
