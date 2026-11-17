import type { PlanningInventory } from './bridge';
import { planningDocumentFileName } from './document-name';

/** The home folder's name inside the opened ontology folder. */
export const PLANNING_HOME_FOLDER = 'planning';

/* The rules below mirror `src-tauri/src/planning/scan.rs` and `confined.rs`, so both sources list the same files. */
const MAX_DEPTH = 12;
const MAX_ENTRIES = 10_000;
const MAX_READ_BYTES = 16 * 1024 * 1024;
const DENIED_NAME_PARTS = ['credential', 'secret', 'password', 'passwd', 'token', 'apikey', 'api-key', 'api_key', 'id_rsa', 'id_ed25519', 'id_dsa', 'id_ecdsa', '.env', '.pem', '.key', '.p12', '.pfx', '.keystore', '.jks', '.htpasswd'];
const PRUNED_DIRECTORIES = new Set(['node_modules', 'target', 'dist', 'build', 'out', 'coverage', 'vendor', 'Pods', 'DerivedData', '__pycache__', 'venv']);
const SUPPORTED_FILE = /\.(md|png|jpe?g|webp|avif)$/i;
const IDENTITY_HEX_LENGTH = 32;

function allowedName(name: string): boolean {
  const lower = name.toLowerCase();
  return !name.startsWith('.') && !DENIED_NAME_PARTS.some((part) => lower.includes(part)) && !PRUNED_DIRECTORIES.has(name);
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
    } catch {
      inventory.partial = true; inventory.omitted.unreadable += 1; return;
    }
    entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    for (const [name, handle] of entries) {
      if (inventory.visited >= MAX_ENTRIES) { inventory.partial = true; inventory.limit_reached = true; return; }
      inventory.visited += 1;
      if (!allowedName(name)) { inventory.omitted.excluded += 1; continue; }
      const path = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === 'directory') await walk(handle as FileSystemDirectoryHandle, path, depth + 1);
      else if (SUPPORTED_FILE.test(name)) inventory.files.push({ path });
      else inventory.omitted.unsupported += 1;
    }
  };
  await walk(directory, '', 0);
  inventory.files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  inventory.unknown_remainder = inventory.partial;
  inventory.skipped = inventory.omitted.excluded + inventory.omitted.linked + inventory.omitted.symlink + inventory.omitted.unsupported;
  return inventory;
}

function pathParts(path: string): string[] {
  const parts = path.split('/');
  if (parts.some((part) => !part || !allowedName(part)) || !SUPPORTED_FILE.test(parts[parts.length - 1])) throw new Error('unsafe-path');
  return parts;
}

async function fileAt(directory: FileSystemDirectoryHandle, path: string): Promise<FileSystemFileHandle> {
  const parts = pathParts(path);
  let folder = directory;
  for (const part of parts.slice(0, -1)) folder = await folder.getDirectoryHandle(part);
  return folder.getFileHandle(parts[parts.length - 1]);
}

async function readBytes(directory: FileSystemDirectoryHandle, path: string): Promise<Uint8Array> {
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

/** Writes `planning/<name>.md` with the title as its heading, never over an existing file. */
export async function createPlanningHomeDocument(directory: FileSystemDirectoryHandle, title: string): Promise<{ path: string; text: string }> {
  const taken = new Set<string>();
  // The app's folder handle implements `entries()` but not `keys()`.
  for await (const [name] of directory.entries()) taken.add(name.toLowerCase());
  const path = planningDocumentFileName(title, taken);
  const text = `# ${title.trim()}\n\n`;
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
