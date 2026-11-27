import type { DiscoverySkipReason } from "@/entities/docs-vault";
import {
  importTauriOfferedSources,
  importTauriSourceFiles,
  pickTauriSourceFiles,
  stopTauriSourceImport,
  type TauriSourceImportResult,
} from "@/shared/lib/vault-folder/native-vault/tauri-library-sources";

/**
 * Raw originals copy into `sources/` through Rust, which refuses duplicate bytes by sha256;
 * no sidecar index (`.claude/rules/forbidden.md`).
 */

export interface AddSourcesOutcome {
  /** Rows in the order the person picked them. */
  results: TauriSourceImportResult[];
  /** True when the picker was dismissed without choosing anything. */
  cancelled: boolean;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const EMPTY: AddSourcesOutcome = { results: [], cancelled: true };

/** Picks files with the app's native dialog and copies them below `sources/`; nothing outside the app. */
export async function addSources({
  vaultRootPath,
  dialogTitle,
  onImportStart,
}: {
  vaultRootPath: string | null;
  dialogTitle: string;
  onImportStart?: () => void;
}): Promise<AddSourcesOutcome> {
  if (!vaultRootPath) return EMPTY;
  const picked = await pickTauriSourceFiles(dialogTitle);
  if (!picked || picked.length === 0) return EMPTY;
  try { onImportStart?.(); } catch { /* Feedback cannot change the file operation. */ }
  const results = await importTauriSourceFiles(vaultRootPath, picked);
  return { results: results ?? [], cancelled: false };
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

export interface SourceCopyPlan {
  rootPath: string;
  /** Absolute paths Rust copies below `sources/`. */
  paths: string[];
  skipped: SourceCopySkip[];
  skippedUnlisted?: SkippedUnlisted;
  /** A folder drop listed only its first files; the line says so. */
  truncatedAt?: number;
}

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
  const total = plan.paths.length;
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
    results = (await importTauriOfferedSources(plan.rootPath, plan.paths, id, ({ done }) => onProgress(done))) ?? [];
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
