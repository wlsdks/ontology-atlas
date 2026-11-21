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

/** Every file already under `sources/`, by hash, and the names each folder holds. */
async function indexExistingSources(sources: FileSystemDirectoryHandle) {
  const existing = new Map<string, string>();
  const takenNames = new Map<string, Set<string>>();
  const visit = async (directory: FileSystemDirectoryHandle, folder: string) => {
    const names = new Set<string>();
    takenNames.set(folder, names);
    for await (const [name, handle] of directory.entries()) {
      if (handle.kind === "directory") {
        names.add(name);
        await visit(handle as FileSystemDirectoryHandle, folder ? `${folder}/${name}` : name);
        continue;
      }
      if (handle.kind !== "file") continue;
      names.add(name);
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
  return { existing, takenNames };
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
  const { existing, takenNames } = await indexExistingSources(sources);

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
      return failure(file.name, reasonOf(error));
    }
    const hash = await sha256Hex(bytes);
    const already = hash ? existing.get(hash) : undefined;
    if (already) {
      return { pickedName: file.name, status: "duplicate", relativePath: already, sha256: hash, size: file.size, reason: null };
    }

    const folder = placed.folders.join("/");
    let directory = sources;
    try {
      for (const segment of placed.folders) directory = await directory.getDirectoryHandle(segment, { create: true });
    } catch (error) {
      return failure(file.name, reasonOf(error), hash, file.size);
    }
    const names = takenNames.get(folder) ?? new Set<string>();
    takenNames.set(folder, names);
    const [stem, extension] = splitName(placed.name);
    let candidate = placed.name;
    let suffix = 2;
    while (names.has(candidate) && suffix <= 999) {
      candidate = `${stem} (${suffix})${extension}`;
      suffix += 1;
    }
    if (names.has(candidate)) return failure(file.name, "file-name-conflict-limit", hash, file.size);
    const below = folder ? `${folder}/${candidate}` : candidate;
    publication.hold(below, names.has(`${candidate}.crswap`) ? [] : [`${candidate}.crswap`]);
    let writable: FileSystemWritableFileStream | null = null;
    try {
      const target = await directory.getFileHandle(candidate, { create: true });
      writable = await target.createWritable();
      await writable.write(bytes);
      await writable.close();
    } catch (error) {
      try { await writable?.abort(); } catch {}
      // The name was free before this copy, so the empty file `create` made is this copy's own.
      try { await directory.removeEntry(candidate); } catch {}
      return failure(file.name, reasonOf(error), hash, file.size);
    }
    names.add(candidate);
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

export type SourceCopyPlan = {
  skipped: SourceCopySkip[];
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

/** Copies a plan in the background, streaming `done` into the job; resolves with the final job. */
export async function startSourceCopy(scope: string, plan: SourceCopyPlan): Promise<SourceCopyJob> {
  const id = `source-copy-${Date.now()}-${nextJobNumber++}`;
  const total = plan.kind === "native" ? plan.paths.length : plan.picks.length;
  let job: SourceCopyJob = {
    id, phase: "copying", done: 0, total, added: 0, skipped: plan.skipped, failed: [], failureReason: null,
    truncatedAt: plan.truncatedAt ?? null,
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
