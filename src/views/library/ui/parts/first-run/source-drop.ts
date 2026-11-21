import { walkDroppedFolder, type DroppedEntry } from "@/entities/docs-vault";
import type { SourceCopyPlan, SourceCopySkip } from "@/features/library";
import type { TauriDropOffer } from "@/shared/lib/vault-folder/tauri-vault-fs";

/** What a drop or Copy all would copy, before the large-copy question. */
export interface CopyRequest {
  files: number;
  totalBytes: number;
  plan: SourceCopyPlan;
}

/** Rust already walked and offered the drop; the page holds only the strings to send back. */
export function requestFromNativeOffer(rootPath: string, offer: TauriDropOffer): CopyRequest {
  return {
    files: offer.files.length,
    totalBytes: offer.totalBytes,
    plan: {
      kind: "native",
      rootPath,
      paths: offer.files.map((file) => file.path),
      skipped: offer.skipped.map((row) => ({ name: row.relativePath, reason: row.reason })),
      ...(offer.truncated ? { truncatedAt: offer.files.length } : {}),
    },
  };
}

type FileSystemHandleItem = DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> };

function fromHandle(handle: FileSystemHandle): DroppedEntry {
  if (handle.kind === "file") {
    return { kind: "file", name: handle.name, getFile: () => (handle as FileSystemFileHandle).getFile() };
  }
  const directory = handle as FileSystemDirectoryHandle;
  return {
    kind: "directory",
    name: directory.name,
    async *children() {
      for await (const child of directory.values()) yield fromHandle(child);
    },
  };
}

function fromEntry(entry: FileSystemEntry): DroppedEntry {
  if (entry.isFile) {
    return {
      kind: "file",
      name: entry.name,
      getFile: () => new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject)),
    };
  }
  const directory = entry as FileSystemDirectoryEntry;
  return {
    kind: "directory",
    name: directory.name,
    async *children() {
      const reader = directory.createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (batch.length === 0) return;
        for (const child of batch) yield fromEntry(child);
      }
    },
  };
}

/**
 * Takes every dropped item while the drop event still holds them: both browser APIs hand their
 * handles out only synchronously. Chrome and Edge give a handle, others a `webkitGetAsEntry`.
 */
export function captureDroppedItems(dataTransfer: DataTransfer): Promise<DroppedEntry | null>[] {
  const captured: Promise<DroppedEntry | null>[] = [];
  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind !== "file") continue;
    const handle = (item as FileSystemHandleItem).getAsFileSystemHandle?.();
    const entry = handle ? null : item.webkitGetAsEntry?.();
    const file = item.getAsFile();
    captured.push(
      (async () => {
        const fromApi = handle ? await handle.catch(() => null) : null;
        if (fromApi) return fromHandle(fromApi);
        if (entry) return fromEntry(entry);
        return file ? { kind: "file", name: file.name, getFile: async () => file } : null;
      })(),
    );
  }
  return captured;
}

/** A dropped file is copied whatever its format; a dropped folder is walked under the discovery rules. */
export async function requestFromBrowserDrop(
  root: FileSystemDirectoryHandle,
  items: readonly Promise<DroppedEntry | null>[],
): Promise<CopyRequest> {
  const picks: { file: File; relativePath: string }[] = [];
  const skipped: SourceCopySkip[] = [];
  let totalBytes = 0;
  let truncatedAt: number | undefined;
  for (const entry of await Promise.all(items)) {
    if (!entry) continue;
    if (entry.kind === "file") {
      const file = await entry.getFile();
      picks.push({ file, relativePath: entry.name });
      totalBytes += file.size;
      continue;
    }
    const walk = await walkDroppedFolder(entry);
    picks.push(...walk.files);
    totalBytes += walk.totalBytes;
    skipped.push(...walk.skipped.map((row) => ({ name: row.relativePath, reason: row.reason })));
    if (walk.truncated) truncatedAt = walk.files.length;
  }
  return {
    files: picks.length,
    totalBytes,
    plan: { kind: "browser", root, picks, skipped, ...(truncatedAt ? { truncatedAt } : {}) },
  };
}
