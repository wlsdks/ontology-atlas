import { ensureSidecarIgnore, isNotFoundError, VAULT_SIDECAR_DIR } from '@/shared/lib/vault-folder/vault-sidecar';

const REMOVED_DIR = 'removed';

export function removedFolderPath(stamp: string): string {
  return `${VAULT_SIDECAR_DIR}/${REMOVED_DIR}/${stamp}`;
}

/** UTC `YYYYMMDD-HHMMSS`, taken once per reset so every copy of one reset shares a folder. */
export function resetStamp(now: Date): string {
  const iso = now.toISOString();
  return `${iso.slice(0, 10).replaceAll('-', '')}-${iso.slice(11, 19).replaceAll(':', '')}`;
}

export interface MoveOutcome {
  stamp: string;
  moved: string[];
  failure: unknown;
}

export interface RestoreOutcome {
  restored: string[];
  skipped: string[];
  failure: unknown;
}

function splitPath(path: string): { folders: string[]; name: string } {
  const segments = path.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..')) throw new Error(`Path leaves the folder: "${path}"`);
  const name = segments.pop();
  if (!name) throw new Error(`Empty path: "${path}"`);
  return { folders: segments, name };
}

async function walkTo(
  root: FileSystemDirectoryHandle,
  folders: readonly string[],
  create: boolean,
): Promise<FileSystemDirectoryHandle> {
  let cursor = root;
  for (const folder of folders) cursor = await cursor.getDirectoryHandle(folder, { create });
  return cursor;
}

/** Bytes, not text: a copy must be the file as it is on disk, whatever its encoding. */
async function readBytes(root: FileSystemDirectoryHandle, path: string): Promise<ArrayBuffer> {
  const { folders, name } = splitPath(path);
  const parent = await walkTo(root, folders, false);
  return (await (await parent.getFileHandle(name)).getFile()).arrayBuffer();
}

async function writeBytes(root: FileSystemDirectoryHandle, path: string, bytes: ArrayBuffer): Promise<void> {
  const { folders, name } = splitPath(path);
  const parent = await walkTo(root, folders, true);
  const writable = await (await parent.getFileHandle(name, { create: true })).createWritable();
  await writable.write(bytes);
  await writable.close();
}

async function removeFile(root: FileSystemDirectoryHandle, path: string): Promise<void> {
  const { folders, name } = splitPath(path);
  await (await walkTo(root, folders, false)).removeEntry(name);
}

async function fileExists(root: FileSystemDirectoryHandle, path: string): Promise<boolean> {
  const { folders, name } = splitPath(path);
  try {
    await (await walkTo(root, folders, false)).getFileHandle(name);
    return true;
  } catch (error) {
    if (isNotFoundError(error)) return false;
    throw error;
  }
}

async function ensureRemovedFolder(root: FileSystemDirectoryHandle): Promise<void> {
  await ensureSidecarIgnore(await root.getDirectoryHandle(VAULT_SIDECAR_DIR, { create: true }));
}

/**
 * Copies each file into the reset's folder and removes the original only after its copy was
 * written. The first failure stops the run, so no original goes without a copy.
 */
export async function moveConceptDocuments(
  root: FileSystemDirectoryHandle,
  paths: readonly string[],
  stamp: string,
): Promise<MoveOutcome> {
  const moved: string[] = [];
  const keptIn = removedFolderPath(stamp);
  try {
    await ensureRemovedFolder(root);
    for (const path of paths) {
      await writeBytes(root, `${keptIn}/${path}`, await readBytes(root, path));
      await removeFile(root, path);
      moved.push(path);
    }
  } catch (failure) {
    return { stamp, moved, failure };
  }
  return { stamp, moved, failure: null };
}

export async function restoreConceptDocuments(
  root: FileSystemDirectoryHandle,
  paths: readonly string[],
  stamp: string,
): Promise<RestoreOutcome> {
  const restored: string[] = [];
  const skipped: string[] = [];
  const keptIn = removedFolderPath(stamp);
  try {
    for (const path of paths) {
      if (await fileExists(root, path)) {
        skipped.push(path);
        continue;
      }
      const copy = `${keptIn}/${path}`;
      await writeBytes(root, path, await readBytes(root, copy));
      await removeFile(root, copy);
      restored.push(path);
    }
  } catch (failure) {
    return { restored, skipped, failure };
  }
  return { restored, skipped, failure: null };
}
