import { createSourceCopyBatch, VAULT_SOURCES_DIR, type DiscoverySkipReason } from "@/entities/docs-vault";
import {
  importTauriOfferedSources,
  importTauriSourceFiles,
  pickTauriSourceFiles,
  stopTauriSourceImport,
  type TauriSourceImportResult,
} from "@/shared/lib/vault-folder/tauri-vault-fs";

/**
 * Raw originals copy into `sources/` through Rust or the granted browser folder handle.
 * Duplicate bytes are refused by sha256; no sidecar index (`.claude/rules/forbidden.md`).
 */

export interface AddSourcesOutcome {
  /** Rows in the order the person picked them. */
  results: TauriSourceImportResult[];
  /** True when the picker was dismissed without choosing anything. */
  cancelled: boolean;
}

/** A browser file and where it lands below `sources/`, `/`-joined (`meetings/weekly.md`). */
export interface BrowserSourcePick {
  file: File;
  relativePath: string;
}

export interface SourceCopyControl {
  onProgress?: (done: number, total: number) => void;
  /** Read between files, so a file is never cut in half. */
  shouldStop?: () => boolean;
}

const EMPTY: AddSourcesOutcome = { results: [], cancelled: true };

async function sha256Hex(bytes: ArrayBuffer): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A name that cannot escape `sources/`. Mirrors `safe_source_file_name` in Rust. */
function safeName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "." || trimmed === "..") return null;
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("\0")) return null;
  const withoutLeadingDots = trimmed.replace(/^\.+/, "");
  return withoutLeadingDots || null;
}

/** Folders and a file name, each passing the single-name rule; mirrors Rust `split_destination`. */
function splitDestination(relativePath: string): { folders: string[]; name: string } | null {
  const segments: string[] = [];
  for (const segment of relativePath.split("/")) {
    const safe = safeName(segment);
    if (!safe) return null;
    segments.push(safe);
  }
  const name = segments.pop();
  return name ? { folders: segments, name } : null;
}

function splitName(name: string): [string, string] {
  const at = name.lastIndexOf(".");
  return at > 0 ? [name.slice(0, at), name.slice(at)] : [name, ""];
}

function failure(pickedName: string, reason: string, sha256: string | null = null, size: number | null = null): TauriSourceImportResult {
  return { pickedName, status: "failed", relativePath: null, sha256, size, reason };
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function domErrorName(error: unknown): string {
  return error instanceof DOMException ? error.name : "";
}

/** A browser error while reading a pick, as the import's reason code, never the browser's text. */
function readFailureCode(error: unknown): string {
  const name = domErrorName(error);
  if (name === "NotFoundError") return "source-missing";
  if (name === "NotAllowedError" || name === "SecurityError") return "permission-denied";
  return "source-unreadable";
}

/** A browser error while writing into `sources/`, as the import's reason code. */
function writeFailureCode(error: unknown): string {
  const name = domErrorName(error);
  if (name === "QuotaExceededError") return "disk-full";
  if (name === "NotAllowedError" || name === "SecurityError") return "permission-denied";
  if (name === "TypeMismatchError") return "import-destination-not-a-folder";
  return "import-destination-unwritable";
}

/** Whether `name` is taken in `directory`, asked without `create`; any answer but "not found" counts. */
async function entryExists(directory: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  for (const lookup of [() => directory.getFileHandle(name), () => directory.getDirectoryHandle(name)]) {
    try {
      await lookup();
      return true;
    } catch (error) {
      if (domErrorName(error) !== "NotFoundError") return true;
    }
  }
  return false;
}

/**
 * Every file already under `sources/`, by hash, and the names each folder holds in lower case: a
 * case-insensitive disk takes `Weekly.md` as `weekly.md`, so names are compared that way.
 */
async function indexExistingSources(sources: FileSystemDirectoryHandle) {
  const existing = new Map<string, string>();
  const takenNames = new Map<string, Set<string>>();
  /** Folder names below each folder, keyed by lower case, so `Meetings` joins `meetings`. */
  const folderNames = new Map<string, Map<string, string>>();
  const visit = async (directory: FileSystemDirectoryHandle, folder: string) => {
    const names = new Set<string>();
    const folders = new Map<string, string>();
    takenNames.set(folder, names);
    folderNames.set(folder, folders);
    for await (const [name, handle] of directory.entries()) {
      if (handle.kind === "directory") {
        names.add(name.toLowerCase());
        folders.set(name.toLowerCase(), name);
        await visit(handle as FileSystemDirectoryHandle, folder ? `${folder}/${name}` : name);
        continue;
      }
      if (handle.kind !== "file") continue;
      names.add(name.toLowerCase());
      try {
        const file = await (handle as FileSystemFileHandle).getFile();
        const hash = await sha256Hex(await file.arrayBuffer());
        if (hash) existing.set(hash, [VAULT_SOURCES_DIR, folder, name].filter(Boolean).join("/"));
      } catch {
        /* An unreadable existing file cannot prove sameness; the import proceeds. */
      }
    }
  };
  await visit(sources, "");
  return { existing, takenNames, folderNames };
}

/**
 * The browser half: hash the picks, refuse bytes already in `sources/`, write the rest, each
 * under its folders. One file's bytes are in memory at a time.
 */
export async function addSourcesInBrowser(
  root: FileSystemDirectoryHandle,
  picked: readonly (File | BrowserSourcePick)[],
  control: SourceCopyControl = {},
): Promise<AddSourcesOutcome> {
  if (picked.length === 0) return EMPTY;
  const sources = await root.getDirectoryHandle(VAULT_SOURCES_DIR, { create: true });
  // A browser has no index, so existing bytes are hashed to answer "you already have this".
  const { existing, takenNames, folderNames } = await indexExistingSources(sources);

  const results: TauriSourceImportResult[] = [];
  const publication = createSourceCopyBatch(root);
  try {
    for (const [index, pick] of picked.entries()) {
      if (control.shouldStop?.()) break;
      results.push(await copyOne(pick));
      control.onProgress?.(index + 1, picked.length);
    }
    return { results, cancelled: false };
  } finally { publication.finish(); }

  async function copyOne(pick: File | BrowserSourcePick): Promise<TauriSourceImportResult> {
    const file = pick instanceof File || !("file" in pick) ? pick : pick.file;
    const placed = splitDestination("relativePath" in pick ? pick.relativePath : file.name);
    if (!placed) return failure(file.name, "unusable-file-name");
    let bytes: ArrayBuffer;
    try {
      bytes = await file.arrayBuffer();
    } catch (error) {
      return failure(file.name, readFailureCode(error));
    }
    const hash = await sha256Hex(bytes);
    const already = hash ? existing.get(hash) : undefined;
    if (already) {
      return { pickedName: file.name, status: "duplicate", relativePath: already, sha256: hash, size: file.size, reason: null };
    }

    let directory = sources;
    const folders: string[] = [];
    try {
      for (const segment of placed.folders) {
        const parent = folders.join("/");
        const known = folderNames.get(parent) ?? new Map<string, string>();
        folderNames.set(parent, known);
        const name = known.get(segment.toLowerCase()) ?? segment;
        directory = await directory.getDirectoryHandle(name, { create: true });
        known.set(name.toLowerCase(), name);
        folders.push(name);
      }
    } catch (error) {
      return failure(file.name, writeFailureCode(error), hash, file.size);
    }
    const folder = folders.join("/");
    const names = takenNames.get(folder) ?? new Set<string>();
    takenNames.set(folder, names);
    // The index is a snapshot; the folder is asked again, so a file that appeared since is never replaced.
    const taken = async (name: string) => names.has(name.toLowerCase()) || (await entryExists(directory, name));
    const [stem, extension] = splitName(placed.name);
    let candidate = placed.name;
    let suffix = 2;
    while (await taken(candidate)) {
      if (suffix > 999) return failure(file.name, "file-name-conflict-limit", hash, file.size);
      candidate = `${stem} (${suffix})${extension}`;
      suffix += 1;
    }
    const below = folder ? `${folder}/${candidate}` : candidate;
    publication.hold(below, names.has(`${candidate}.crswap`.toLowerCase()) ? [] : [`${candidate}.crswap`]);
    let created = false;
    let writable: FileSystemWritableFileStream | null = null;
    try {
      const target = await directory.getFileHandle(candidate, { create: true });
      created = true;
      writable = await target.createWritable();
      await writable.write(bytes);
      await writable.close();
    } catch (error) {
      try { await writable?.abort(); } catch {}
      // Only the entry this copy created goes: the name was asked free just before.
      if (created) try { await directory.removeEntry(candidate); } catch {}
      return failure(file.name, writeFailureCode(error), hash, file.size);
    }
    names.add(candidate.toLowerCase());
    const relativePath = `${VAULT_SOURCES_DIR}/${below}`;
    if (hash) existing.set(hash, relativePath);
    return {
      pickedName: file.name,
      status: candidate === placed.name ? "added" : "renamed",
      relativePath,
      sha256: hash,
      size: file.size,
      reason: null,
    };
  }
}

/** Whether this browser can open a file picker at all. */
function browserCanPickFiles(): boolean {
  return typeof window !== "undefined" && "showOpenFilePicker" in window;
}

/** Native path with an absolute root, browser path otherwise. */
export async function addSources({
  root,
  vaultRootPath,
  dialogTitle,
  onImportStart,
}: {
  root: FileSystemDirectoryHandle;
  vaultRootPath: string | null;
  dialogTitle: string;
  onImportStart?: () => void;
}): Promise<AddSourcesOutcome> {
  const importing = () => {
    try { onImportStart?.(); } catch { /* Feedback cannot change the file operation. */ }
  };
  if (vaultRootPath) {
    const picked = await pickTauriSourceFiles(dialogTitle);
    if (!picked || picked.length === 0) return EMPTY;
    importing();
    const results = await importTauriSourceFiles(vaultRootPath, picked);
    return { results: results ?? [], cancelled: false };
  }

  if (!browserCanPickFiles()) return EMPTY;
  type PickerWindow = Window & {
    showOpenFilePicker: (options?: { multiple?: boolean }) => Promise<FileSystemFileHandle[]>;
  };
  let handles: FileSystemFileHandle[];
  try {
    handles = await (window as unknown as PickerWindow).showOpenFilePicker({ multiple: true });
  } catch {
    // A dismissed picker is not a failure and must not raise anything on screen.
    return EMPTY;
  }
  const files = await Promise.all(handles.map((handle) => handle.getFile()));
  if (files.length > 0) importing();
  return addSourcesInBrowser(root, files);
}

/** One sentence naming what happened, for the toast the person actually reads. */
export function summarizeAddSources(
  outcome: AddSourcesOutcome,
): { added: number; duplicate: number; failed: number } {
  let added = 0;
  let duplicate = 0;
  let failed = 0;
  for (const result of outcome.results) {
    if (result.status === "added" || result.status === "renamed") added += 1;
    else if (result.status === "duplicate") duplicate += 1;
    else failed += 1;
  }
  return { added, duplicate, failed };
}

/** Why a file was not copied, in the four reasons the skipped line names. */
export type SourceCopySkipReason = "same" | DiscoverySkipReason;

export interface SourceCopySkip {
  /** Where the file would have landed below `sources/`, or its name. */
  name: string;
  reason: SourceCopySkipReason;
}

/** A large copy asks first: at or above either bound. */
export const LARGE_COPY_FILES = 500;
export const LARGE_COPY_BYTES = 500 * 1024 * 1024;

export function copyNeedsConfirm(files: number, bytes: number): boolean {
  return files >= LARGE_COPY_FILES || bytes >= LARGE_COPY_BYTES;
}

/** Skipped files counted but not named, so a dropped home folder cannot fill memory with names. */
export type SkippedUnlisted = Partial<Record<DiscoverySkipReason, number>>;

export type SourceCopyPlan = {
  skipped: SourceCopySkip[];
  skippedUnlisted?: SkippedUnlisted;
  /** A folder drop listed only its first files; the line says so. */
  truncatedAt?: number;
} & (
  | { kind: "native"; rootPath: string; paths: string[] }
  | { kind: "browser"; root: FileSystemDirectoryHandle; picks: BrowserSourcePick[] }
);

export interface SourceCopyJob {
  id: string;
  phase: "copying" | "done" | "stopped";
  done: number;
  total: number;
  added: number;
  skipped: SourceCopySkip[];
  skippedUnlisted: SkippedUnlisted;
  failed: { name: string; reason: string }[];
  /** The first failure's reason, as the import reported it. */
  failureReason: string | null;
  truncatedAt: number | null;
}

/**
 * One copy per open folder, outside React, so leaving the Library neither stops the copy nor
 * loses its line: the stage and the Sources home read the same job.
 */
const jobs = new Map<string, SourceCopyJob>();
const stopRequests = new Set<string>();
const listeners = new Set<() => void>();
let nextJobNumber = 1;

function publish(scope: string, job: SourceCopyJob | null) {
  if (job) jobs.set(scope, job);
  else jobs.delete(scope);
  for (const listener of listeners) listener();
}

export function subscribeSourceCopy(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readSourceCopy(scope: string): SourceCopyJob | null {
  return jobs.get(scope) ?? null;
}

/** Clears a finished copy's line; a running copy stays. */
export function dismissSourceCopy(scope: string): void {
  if (jobs.get(scope)?.phase !== "copying") publish(scope, null);
}

export function stopSourceCopy(scope: string): void {
  const job = jobs.get(scope);
  if (!job || job.phase !== "copying") return;
  stopRequests.add(job.id);
  void stopTauriSourceImport(job.id);
}

/**
 * Copies a plan in the background, streaming `done` into the job; resolves with the final job, or
 * `null` without copying while another copy of the same folder runs: two would race for names.
 */
export async function startSourceCopy(scope: string, plan: SourceCopyPlan): Promise<SourceCopyJob | null> {
  if (jobs.get(scope)?.phase === "copying") return null;
  const id = `source-copy-${Date.now()}-${nextJobNumber++}`;
  const total = plan.kind === "native" ? plan.paths.length : plan.picks.length;
  let job: SourceCopyJob = {
    id, phase: "copying", done: 0, total, added: 0, skipped: plan.skipped, skippedUnlisted: plan.skippedUnlisted ?? {},
    failed: [], failureReason: null, truncatedAt: plan.truncatedAt ?? null,
  };
  publish(scope, job);
  const onProgress = (done: number) => {
    job = { ...job, done };
    publish(scope, job);
  };
  let results: TauriSourceImportResult[] = [];
  try {
    results = plan.kind === "native"
      ? (await importTauriOfferedSources(plan.rootPath, plan.paths, id, ({ done }) => onProgress(done))) ?? []
      : (await addSourcesInBrowser(plan.root, plan.picks, {
          onProgress,
          shouldStop: () => stopRequests.has(id),
        })).results;
  } catch (error) {
    job = { ...job, failed: [{ name: "", reason: reasonOf(error) }], failureReason: reasonOf(error) };
  }
  const stopped = stopRequests.delete(id) && results.length < total;
  const failed = [...job.failed];
  const skipped = [...plan.skipped];
  let added = 0;
  for (const row of results) {
    if (row.status === "added" || row.status === "renamed") added += 1;
    else if (row.status === "duplicate") skipped.push({ name: row.pickedName, reason: "same" });
    else failed.push({ name: row.pickedName, reason: row.reason ?? "" });
  }
  job = {
    ...job,
    phase: stopped ? "stopped" : "done",
    done: results.length,
    added,
    skipped,
    failed,
    failureReason: failed[0]?.reason ?? null,
  };
  publish(scope, job);
  return job;
}
