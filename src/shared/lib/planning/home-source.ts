import type { PlanningInventory } from './bridge';
import { planningDocumentFileName } from './document-name';

/** The home folder's name inside the opened ontology folder. */
export const PLANNING_HOME_FOLDER = 'planning';

/*
 * Mirrors `src-tauri/src/planning/scan.rs` and `confined.rs`, except that a Markdown name is never
 * refused for secret-looking words: the vault session already reads every Markdown file here.
 */
const MAX_DEPTH = 12;
const MAX_ENTRIES = 10_000;
const MAX_READ_BYTES = 16 * 1024 * 1024;
const DENIED_NAME_PARTS = ['credential', 'secret', 'password', 'passwd', 'token', 'apikey', 'api-key', 'api_key', 'id_rsa', 'id_ed25519', 'id_dsa', 'id_ecdsa', '.env', '.pem', '.key', '.p12', '.pfx', '.keystore', '.jks', '.htpasswd'];
const PRUNED_DIRECTORIES = new Set(['node_modules', 'target', 'dist', 'build', 'out', 'coverage', 'vendor', 'Pods', 'DerivedData', '__pycache__', 'venv']);
/** The image types the home folder lists beside Markdown (`.md`). */
export const PLANNING_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.avif'] as const;
const SUPPORTED_FILE = new RegExp(`(\\.md|${PLANNING_IMAGE_EXTENSIONS.map((extension) => `\\${extension}`).join('|')})$`, 'i');
const MARKDOWN_FILE = /\.md$/i;
const IDENTITY_HEX_LENGTH = 32;

function skippedEverywhere(name: string): boolean {
  return name.startsWith('.') || PRUNED_DIRECTORIES.has(name);
}

function deniedImageName(name: string): boolean {
  const lower = name.toLowerCase();
  return !MARKDOWN_FILE.test(name) && DENIED_NAME_PARTS.some((part) => lower.includes(part));
}

/** The first 32 hex characters of the SHA-256 of `bytes`, the same identity the native reader reports. */
export async function planningIdentity(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, IDENTITY_HEX_LENGTH);
}

/** Lists the home folder depth-first in name order; O(entries), stopping at `MAX_ENTRIES`. */
export async function scanPlanningHome(directory: FileSystemDirectoryHandle): Promise<PlanningInventory> {
  const inventory: PlanningInventory = {
    files: [], skipped: 0, partial: false, visited: 0, limit_reached: false, depth_limited: false, unknown_remainder: false,
    omitted: { excluded: 0, linked: 0, symlink: 0, unsupported: 0, unreadable: 0 },
  };
  const walk = async (folder: FileSystemDirectoryHandle, prefix: string, depth: number) => {
    if (depth > MAX_DEPTH) { inventory.partial = true; inventory.depth_limited = true; return; }
    const entries: [string, FileSystemHandle][] = [];
    try {
      for await (const entry of folder.entries()) entries.push(entry);
    } catch (error) {
      // A home folder that cannot be listed at all is gone, not empty.
      if (depth === 0) throw error;
      inventory.partial = true; inventory.omitted.unreadable += 1; return;
    }
    entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    for (const [name, handle] of entries) {
      if (inventory.visited >= MAX_ENTRIES) { inventory.partial = true; inventory.limit_reached = true; return; }
      inventory.visited += 1;
      if (skippedEverywhere(name)) { inventory.omitted.excluded += 1; continue; }
      const path = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === 'directory') await walk(handle as FileSystemDirectoryHandle, path, depth + 1);
      else if (!SUPPORTED_FILE.test(name)) inventory.omitted.unsupported += 1;
      else if (deniedImageName(name)) inventory.omitted.excluded += 1;
      else inventory.files.push({ path });
    }
  };
  await walk(directory, '', 0);
  inventory.files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  inventory.unknown_remainder = inventory.partial;
  inventory.skipped = inventory.omitted.excluded + inventory.omitted.linked + inventory.omitted.symlink + inventory.omitted.unsupported;
  return inventory;
}

/**
 * The name a picked file takes at the top of the home folder, or null when the home scan would
 * not list it. Leading dots are dropped and separators refused, as the native import does.
 */
export function planningHomeFileName(pickedName: string): string | null {
  const trimmed = pickedName.trim();
  if (/[/\\\0]/.test(trimmed)) return null;
  const name = trimmed.replace(/^\.+/, '');
  return name && !skippedEverywhere(name) && SUPPORTED_FILE.test(name) && !deniedImageName(name) ? name : null;
}

function pathParts(path: string): string[] {
  const parts = path.split('/');
  const name = parts[parts.length - 1];
  if (parts.some((part) => !part || skippedEverywhere(part)) || !SUPPORTED_FILE.test(name) || deniedImageName(name)) throw new Error('unsafe-path');
  return parts;
}

async function fileAt(directory: FileSystemDirectoryHandle, path: string): Promise<FileSystemFileHandle> {
  const parts = pathParts(path);
  let folder = directory;
  for (const part of parts.slice(0, -1)) folder = await folder.getDirectoryHandle(part);
  return folder.getFileHandle(parts[parts.length - 1]);
}

async function readBytes(directory: FileSystemDirectoryHandle, path: string): Promise<Uint8Array> {
  // On the web `getFile()` reads metadata only; the app's handle has already read the bytes here.
  const file = await (await fileAt(directory, path)).getFile();
  if (file.size > MAX_READ_BYTES) throw new Error('file-too-large');
  return new Uint8Array(await file.arrayBuffer());
}

export async function openPlanningHomeDocument(directory: FileSystemDirectoryHandle, path: string, expectedIdentity: string | null): Promise<{ identity: string; bytes: Uint8Array }> {
  const bytes = await readBytes(directory, path);
  const identity = await planningIdentity(bytes);
  if (expectedIdentity && identity !== expectedIdentity) throw new Error('file-changed');
  return { identity, bytes };
}

async function writeText(handle: FileSystemFileHandle, text: string): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

/** Saves Markdown over `path` only while its bytes still match the identity the editor opened. */
export async function savePlanningHomeDocument(directory: FileSystemDirectoryHandle, path: string, text: string, openedIdentity: string): Promise<string> {
  await openPlanningHomeDocument(directory, path, openedIdentity);
  await writeText(await fileAt(directory, path), text);
  return planningIdentity(new TextEncoder().encode(text));
}

async function exists(directory: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await directory.getFileHandle(name);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return false;
    throw error;
  }
}

/** Writes `planning/<name>.md` with the title as its heading, never over an existing file. */
export async function createPlanningHomeDocument(directory: FileSystemDirectoryHandle, title: string, beforeWrite?: (path: string) => void): Promise<{ path: string; text: string }> {
  const taken: string[] = [];
  // The app's folder handle implements `entries()` but not `keys()`.
  for await (const [name] of directory.entries()) taken.push(name);
  const path = planningDocumentFileName(title, taken);
  if (await exists(directory, path)) throw new Error('name-taken');
  const text = `# ${title.trim()}\n\n`;
  beforeWrite?.(path);
  await writeText(await directory.getFileHandle(path, { create: true }), text);
  return { path, text };
}

export function homePlanningSource(directory: FileSystemDirectoryHandle) {
  return {
    scan: () => scanPlanningHome(directory),
    openDocument: (path: string, expectedIdentity: string | null) => openPlanningHomeDocument(directory, path, expectedIdentity),
    readFile: (path: string) => readBytes(directory, path),
  };
}
