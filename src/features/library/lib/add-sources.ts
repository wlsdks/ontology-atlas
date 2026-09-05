import { VAULT_SOURCES_DIR } from "@/entities/docs-vault";
import {
  importTauriSourceFiles,
  pickTauriSourceFiles,
  type TauriSourceImportResult,
} from "@/shared/lib/tauri-vault-fs";

/**
 * Adding raw sources to the open folder — **one click on both surfaces**.
 *
 * The two surfaces do the same thing by different means, and the difference is entirely
 * about what each one is allowed to touch:
 *
 * - **App.** A native panel returns absolute paths, and Rust copies the bytes into
 *   `<vault>/sources/`. The WebView never holds a document: `read_vault_binary_file`
 *   hands JavaScript a JSON array of bytes, so routing a 20 MB scan through it to write
 *   it back out again would cost twice the file for nothing.
 * - **Web.** `showOpenFilePicker` returns file handles the person just granted, and the
 *   bytes are written through the vault's own directory handle. A browser has no
 *   absolute path and needs none — it was handed the file.
 *
 * **The copy is the artifact.** Nothing is written beside it: no index, no
 * `sources.jsonl`, no sidecar. A second store of what the folder already says is a
 * second canonical store, which `.claude/rules/forbidden.md` refuses, and where a
 * document came from is recorded later in the wiki page's frontmatter — in Git, where a
 * person can see it.
 *
 * **A duplicate is refused with a reason.** Sameness is decided by sha256 rather than by
 * name, so a file re-exported under a new name is still recognised, and the refusal
 * names the file that already holds those bytes instead of saying "duplicate".
 */

export interface AddSourcesOutcome {
  /** Rows in the order the person picked them. */
  results: TauriSourceImportResult[];
  /** True when the picker was dismissed without choosing anything. */
  cancelled: boolean;
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

function splitName(name: string): [string, string] {
  const at = name.lastIndexOf(".");
  return at > 0 ? [name.slice(0, at), name.slice(at)] : [name, ""];
}

/**
 * The browser half. Reads the chosen files, hashes them, refuses bytes already in
 * `sources/`, and writes the rest through the vault handle.
 */
export async function addSourcesInBrowser(
  root: FileSystemDirectoryHandle,
  picked: readonly File[],
): Promise<AddSourcesOutcome> {
  if (picked.length === 0) return EMPTY;
  const sources = await root.getDirectoryHandle(VAULT_SOURCES_DIR, { create: true });

  // Existing bytes, by hash. Reading the folder's own files is what makes "you already
  // have this" answerable at all; a browser has no index to consult instead.
  const existing = new Map<string, string>();
  const takenNames = new Set<string>();
  for await (const [name, handle] of sources.entries()) {
    if (handle.kind !== "file") continue;
    takenNames.add(name);
    try {
      const file = await (handle as FileSystemFileHandle).getFile();
      const hash = await sha256Hex(await file.arrayBuffer());
      if (hash) existing.set(hash, `${VAULT_SOURCES_DIR}/${name}`);
    } catch {
      /* An unreadable existing file cannot prove sameness; the import proceeds. */
    }
  }

  const results: TauriSourceImportResult[] = [];
  for (const file of picked) {
    const base = safeName(file.name);
    if (!base) {
      results.push({
        pickedName: file.name,
        status: "failed",
        relativePath: null,
        sha256: null,
        size: null,
        reason: "unusable-file-name",
      });
      continue;
    }
    let bytes: ArrayBuffer;
    try {
      bytes = await file.arrayBuffer();
    } catch (error) {
      results.push({
        pickedName: file.name,
        status: "failed",
        relativePath: null,
        sha256: null,
        size: null,
        reason: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    const hash = await sha256Hex(bytes);
    const already = hash ? existing.get(hash) : undefined;
    if (already) {
      results.push({
        pickedName: file.name,
        status: "duplicate",
        relativePath: already,
        sha256: hash,
        size: file.size,
        reason: null,
      });
      continue;
    }

    const [stem, extension] = splitName(base);
    let candidate = base;
    let suffix = 2;
    while (takenNames.has(candidate) && suffix <= 999) {
      candidate = `${stem} (${suffix})${extension}`;
      suffix += 1;
    }
    try {
      const target = await sources.getFileHandle(candidate, { create: true });
      const writable = await target.createWritable();
      await writable.write(bytes);
      await writable.close();
    } catch (error) {
      results.push({
        pickedName: file.name,
        status: "failed",
        relativePath: null,
        sha256: hash,
        size: file.size,
        reason: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    takenNames.add(candidate);
    if (hash) existing.set(hash, `${VAULT_SOURCES_DIR}/${candidate}`);
    results.push({
      pickedName: file.name,
      status: candidate === base ? "added" : "renamed",
      relativePath: `${VAULT_SOURCES_DIR}/${candidate}`,
      sha256: hash,
      size: file.size,
      reason: null,
    });
  }
  return { results, cancelled: false };
}

/** Whether this browser can open a file picker at all. */
function browserCanPickFiles(): boolean {
  return typeof window !== "undefined" && "showOpenFilePicker" in window;
}

/**
 * The one entry point the screen calls. Chooses the native path when there is an
 * absolute root, and the browser path otherwise.
 */
export async function addSources({
  root,
  vaultRootPath,
  dialogTitle,
}: {
  root: FileSystemDirectoryHandle;
  vaultRootPath: string | null;
  dialogTitle: string;
}): Promise<AddSourcesOutcome> {
  if (vaultRootPath) {
    const picked = await pickTauriSourceFiles(dialogTitle);
    if (!picked || picked.length === 0) return EMPTY;
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
