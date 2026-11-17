import { importTauriSourceFiles, pickTauriSourceFiles } from '@/shared/lib/vault-folder/tauri-vault-fs';
import { planningNameKey } from './document-name';
import { PLANNING_HOME_FOLDER, PLANNING_IMAGE_EXTENSIONS, planningHomeFileName, planningIdentity } from './home-source';

/** What one "Add files" did; `added` holds home-folder paths in the order the person picked. */
export type PlanningAddOutcome = { added: string[]; duplicates: number; unsupported: number; failed: number };

/** Names past this many ` (n)` suffixes are refused, as in the native import. */
const MAX_NAME_SUFFIX = 999;
/** The native picker's title; native dialogs are titled in English. */
const NATIVE_DIALOG_TITLE = 'Add planning files';

function splitName(name: string): [string, string] {
  const at = name.lastIndexOf('.');
  return at > 0 ? [name.slice(0, at), name.slice(at)] : [name, ''];
}

/** Whether any entry, file or folder, already holds `name`. */
async function nameInUse(directory: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await directory.getFileHandle(name);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TypeMismatchError') return true;
    if (error instanceof DOMException && error.name === 'NotFoundError') return false;
    throw error;
  }
}

/**
 * Identities of files already in the home folder whose size matches a picked file; O(entries)
 * listing, and only same-sized files are read. Dot entries are skipped, as the native index does.
 */
async function identitiesOfSize(directory: FileSystemDirectoryHandle, sizes: ReadonlySet<number>): Promise<Set<string>> {
  const identities = new Set<string>();
  const walk = async (folder: FileSystemDirectoryHandle) => {
    for await (const [name, handle] of folder.entries()) {
      if (name.startsWith('.')) continue;
      if (handle.kind === 'directory') { await walk(handle as FileSystemDirectoryHandle); continue; }
      try {
        const file = await (handle as FileSystemFileHandle).getFile();
        if (sizes.has(file.size)) identities.add(await planningIdentity(new Uint8Array(await file.arrayBuffer())));
      } catch { /* An unreadable file cannot prove sameness; the copy proceeds. */ }
    }
  };
  await walk(directory);
  return identities;
}

/**
 * Copies picked files flat into the home folder through its directory handle: unlisted types are
 * refused, bytes already present are not copied again, and a taken name (ignoring case and Unicode
 * composition) gains ` (2)`, ` (3)`, …. `beforeWrite` runs before each file is created.
 */
export async function addPlanningFilesInBrowser(
  directory: FileSystemDirectoryHandle,
  picked: readonly File[],
  beforeWrite?: (path: string) => void,
): Promise<PlanningAddOutcome> {
  const outcome: PlanningAddOutcome = { added: [], duplicates: 0, unsupported: 0, failed: 0 };
  const addable: [File, string][] = [];
  for (const file of picked) {
    const name = planningHomeFileName(file.name);
    if (name) addable.push([file, name]);
    else outcome.unsupported += 1;
  }
  if (addable.length === 0) return outcome;
  const taken = new Set<string>();
  // The app's folder handle implements `entries()` but not `keys()`.
  for await (const [name] of directory.entries()) taken.add(planningNameKey(name));
  const present = await identitiesOfSize(directory, new Set(addable.map(([file]) => file.size)));
  for (const [file, name] of addable) {
    let identity: string;
    try {
      identity = await planningIdentity(new Uint8Array(await file.arrayBuffer()));
    } catch { outcome.failed += 1; continue; }
    if (present.has(identity)) { outcome.duplicates += 1; continue; }
    const [stem, extension] = splitName(name);
    let candidate: string | null = null;
    for (let suffix = 1; suffix <= MAX_NAME_SUFFIX && candidate === null; suffix++) {
      const next = suffix === 1 ? name : `${stem} (${suffix})${extension}`;
      if (taken.has(planningNameKey(next))) continue;
      if (await nameInUse(directory, next)) { taken.add(planningNameKey(next)); continue; }
      candidate = next;
    }
    if (candidate === null) { outcome.failed += 1; continue; }
    let writable: FileSystemWritableFileStream | null = null;
    try {
      beforeWrite?.(candidate);
      writable = await (await directory.getFileHandle(candidate, { create: true })).createWritable();
      await writable.write(file);
      await writable.close();
    } catch {
      try { await writable?.abort(); } catch { /* The failed copy is already counted. */ }
      outcome.failed += 1;
      continue;
    }
    taken.add(planningNameKey(candidate));
    present.add(identity);
    outcome.added.push(candidate);
  }
  return outcome;
}

/** Copies paths the native picker offered into the home folder through the app's import command. */
async function addPlanningFilesInApp(rootPath: string, pickedPaths: readonly string[]): Promise<PlanningAddOutcome> {
  const outcome: PlanningAddOutcome = { added: [], duplicates: 0, unsupported: 0, failed: 0 };
  const addable = pickedPaths.filter((path) => planningHomeFileName(path.slice(path.lastIndexOf('/') + 1)) !== null);
  outcome.unsupported = pickedPaths.length - addable.length;
  if (addable.length === 0) return outcome;
  const prefix = `${PLANNING_HOME_FOLDER}/`;
  for (const result of (await importTauriSourceFiles(rootPath, addable, 'planning')) ?? []) {
    if ((result.status === 'added' || result.status === 'renamed') && result.relativePath?.startsWith(prefix)) outcome.added.push(result.relativePath.slice(prefix.length));
    else if (result.status === 'duplicate') outcome.duplicates += 1;
    else outcome.failed += 1;
  }
  return outcome;
}

type PickerWindow = Window & {
  showOpenFilePicker: (options: { multiple: boolean; types: { accept: Record<string, string[]> }[] }) => Promise<FileSystemFileHandle[]>;
};

function browserPicker(): PickerWindow['showOpenFilePicker'] | null {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window ? (window as PickerWindow).showOpenFilePicker.bind(window) : null;
}

/** Whether "Add files" can work here: the app's native import, or a browser file picker. */
export function planningAddAvailable(rootPath: string | null): boolean {
  return rootPath !== null || browserPicker() !== null;
}

/**
 * Lets the person pick files and copies them into the home folder: through the native import in
 * the app (its folder handle writes text only), through the directory handle on the web. Returns
 * null when the picker was dismissed. `beforeWrite` runs before each browser write.
 */
export async function pickPlanningFiles({ directory, rootPath, beforeWrite }: {
  directory: FileSystemDirectoryHandle;
  rootPath: string | null;
  beforeWrite?: (path: string) => void;
}): Promise<PlanningAddOutcome | null> {
  if (rootPath) {
    const picked = await pickTauriSourceFiles(NATIVE_DIALOG_TITLE);
    return picked && picked.length > 0 ? addPlanningFilesInApp(rootPath, picked) : null;
  }
  const pick = browserPicker();
  if (!pick) return null;
  let handles: FileSystemFileHandle[];
  try {
    handles = await pick({ multiple: true, types: [{ accept: { 'text/markdown': ['.md'], 'image/*': [...PLANNING_IMAGE_EXTENSIONS] } }] });
  } catch {
    // A dismissed picker is not a failure.
    return null;
  }
  if (handles.length === 0) return null;
  return addPlanningFilesInBrowser(directory, await Promise.all(handles.map((handle) => handle.getFile())), beforeWrite);
}
