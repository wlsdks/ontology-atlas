import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

interface TauriVaultEntry {
  name: string;
  kind: 'file' | 'directory';
}

interface TauriTextFile {
  text: string;
  lastModified: number;
}

interface TauriBinaryFile {
  bytes: number[];
  lastModified: number;
}

export interface ProjectSourceInspection {
  rootPath: string;
  sourceId: string;
  kind: 'git' | 'folder';
  revision: string;
  fingerprint: string;
  dirty: boolean | null;
  truncated: boolean;
  files: string[];
}

type WritableChunk = string | Blob | ArrayBuffer | ArrayBufferView;

function getInvoke(): TauriInvoke | null {
  if (typeof window === 'undefined') return null;
  if (!isTauri()) return null;
  return (command, args) => tauriInvoke(command, args);
}

function joinRelative(base: string, child: string): string {
  return [base, child].filter(Boolean).join('/');
}

function basename(path: string): string {
  const normalized = path.replace(/\/+$/, '');
  return normalized.slice(normalized.lastIndexOf('/') + 1) || normalized;
}

function mimeForPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.avif')) return 'image/avif';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  return 'application/octet-stream';
}

async function chunkToText(chunk: WritableChunk): Promise<string> {
  if (typeof chunk === 'string') return chunk;
  if (chunk instanceof Blob) return chunk.text();
  if (chunk instanceof ArrayBuffer) return new TextDecoder().decode(chunk);
  return new TextDecoder().decode(chunk);
}

class TauriWritableFileStream {
  private content = '';

  constructor(
    private readonly rootPath: string,
    private readonly relativePath: string,
    private readonly invoke: TauriInvoke,
  ) {}

  async write(chunk: WritableChunk): Promise<void> {
    this.content += await chunkToText(chunk);
  }

  async close(): Promise<void> {
    await this.invoke('write_vault_text_file', {
      rootPath: this.rootPath,
      relativePath: this.relativePath,
      content: this.content,
    });
  }
}

class TauriFileHandle {
  readonly kind = 'file';
  readonly name: string;

  constructor(
    private readonly rootPath: string,
    private readonly relativePath: string,
    private readonly invoke: TauriInvoke,
  ) {
    this.name = basename(relativePath);
  }

  async getFile(): Promise<File> {
    if (this.name.endsWith('.md')) {
      const file = await this.invoke<TauriTextFile>('read_vault_text_file', {
        rootPath: this.rootPath,
        relativePath: this.relativePath,
      });
      return new File([file.text], this.name, {
        type: 'text/markdown',
        lastModified: file.lastModified,
      });
    }
    const file = await this.invoke<TauriBinaryFile>('read_vault_binary_file', {
      rootPath: this.rootPath,
      relativePath: this.relativePath,
    });
    return new File([new Uint8Array(file.bytes)], this.name, {
      type: mimeForPath(this.relativePath),
      lastModified: file.lastModified,
    });
  }

  async createWritable(): Promise<TauriWritableFileStream> {
    return new TauriWritableFileStream(this.rootPath, this.relativePath, this.invoke);
  }

  async queryPermission(): Promise<PermissionState> {
    return 'granted';
  }

  async requestPermission(): Promise<PermissionState> {
    return 'granted';
  }
}

/**
 * The vault fingerprint — **paths and mtimes only**, fetched from the native side in
 * one call.
 *
 * The web has no equivalent (File System Access has no such batch API). Outside
 * `isTauri()` this returns `null` and the caller falls back to the existing path,
 * following the bridge convention in `.claude/rules/surfaces.md`: `getInvoke()`, else
 * `null`, else honest degradation on screen.
 */
export async function nativeVaultFingerprint(
  rootPath: string,
): Promise<{ entries: Array<{ relativePath: string; lastModified: number }>; truncated: boolean; prunedDirs: string[] } | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke('vault_fingerprint', { rootPath });
}

/** Classifies the chosen folder as a canonical Git worktree or a bounded folder source. */
export async function inspectTauriProjectSource(
  rootPath: string,
): Promise<ProjectSourceInspection | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<ProjectSourceInspection>('inspect_project_source', { rootPath });
}

class TauriDirectoryHandle {
  readonly kind = 'directory';
  readonly name: string;

  constructor(
    readonly rootPath: string,
    private readonly relativePath: string,
    private readonly invoke: TauriInvoke,
  ) {
    this.name = relativePath ? basename(relativePath) : basename(rootPath);
  }

  async *entries(): AsyncIterableIterator<
    [string, FileSystemFileHandle | FileSystemDirectoryHandle]
  > {
    const entries = await this.invoke<TauriVaultEntry[]>('list_vault_directory', {
      rootPath: this.rootPath,
      relativePath: this.relativePath,
    });
    for (const entry of entries) {
      const path = joinRelative(this.relativePath, entry.name);
      if (entry.kind === 'directory') {
        yield [
          entry.name,
          new TauriDirectoryHandle(this.rootPath, path, this.invoke) as unknown as FileSystemDirectoryHandle,
        ];
      } else {
        yield [
          entry.name,
          new TauriFileHandle(this.rootPath, path, this.invoke) as unknown as FileSystemFileHandle,
        ];
      }
    }
  }

  async *values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle> {
    for await (const [, handle] of this.entries()) {
      yield handle;
    }
  }

  async getFileHandle(
    name: string,
    options: { create?: boolean } = {},
  ): Promise<FileSystemFileHandle> {
    const relativePath = joinRelative(this.relativePath, name);
    if (options.create) {
      const exists = await this.invoke<boolean>('vault_path_exists', {
        rootPath: this.rootPath,
        relativePath,
        kind: 'file',
      });
      if (!exists) {
        await this.invoke('write_vault_text_file', {
          rootPath: this.rootPath,
          relativePath,
          content: '',
        });
      }
    } else {
      const exists = await this.invoke<boolean>('vault_path_exists', {
        rootPath: this.rootPath,
        relativePath,
        kind: 'file',
      });
      if (!exists) {
        throw new DOMException(`File not found: ${relativePath}`, 'NotFoundError');
      }
    }
    return new TauriFileHandle(
      this.rootPath,
      relativePath,
      this.invoke,
    ) as unknown as FileSystemFileHandle;
  }

  async getDirectoryHandle(
    name: string,
    options: { create?: boolean } = {},
  ): Promise<FileSystemDirectoryHandle> {
    const relativePath = joinRelative(this.relativePath, name);
    if (options.create) {
      await this.invoke('ensure_vault_directory', {
        rootPath: this.rootPath,
        relativePath,
      });
    } else {
      const exists = await this.invoke<boolean>('vault_path_exists', {
        rootPath: this.rootPath,
        relativePath,
        kind: 'directory',
      });
      if (!exists) {
        throw new DOMException(`Directory not found: ${relativePath}`, 'NotFoundError');
      }
    }
    return new TauriDirectoryHandle(
      this.rootPath,
      relativePath,
      this.invoke,
    ) as unknown as FileSystemDirectoryHandle;
  }

  async removeEntry(name: string, options: { recursive?: boolean } = {}): Promise<void> {
    await this.invoke('remove_vault_entry', {
      rootPath: this.rootPath,
      relativePath: joinRelative(this.relativePath, name),
      recursive: options.recursive ?? false,
    });
  }

  async queryPermission(): Promise<PermissionState> {
    return 'granted';
  }

  async requestPermission(): Promise<PermissionState> {
    return 'granted';
  }
}

export function isTauriVaultRuntime(): boolean {
  return getInvoke() !== null;
}

export function createTauriVaultHandle(rootPath: string): FileSystemDirectoryHandle {
  const invoke = getInvoke();
  if (!invoke) {
    throw new Error('Tauri vault runtime is not available.');
  }
  return new TauriDirectoryHandle(rootPath, '', invoke) as unknown as FileSystemDirectoryHandle;
}

/**
 * Prefix Rust's `pick_vault_directory` uses when it refuses a location as a vault
 * root. Reason codes: `filesystem-root`, `home-directory`, `system-directory`.
 *
 * A **code** rather than a sentence: composing human-readable copy inside Rust traps
 * the translation there. The screen reads the code and picks its own language.
 */
export const VAULT_ROOT_REJECTED_PREFIX = 'vault-root-rejected:';

/** Returns the reason code when this error is a rejected-location refusal, else null. */
export function vaultRootRejectionReason(error: unknown): string | null {
  const text =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : null;
  if (!text) return null;
  const at = text.indexOf(VAULT_ROOT_REJECTED_PREFIX);
  if (at < 0) return null;
  return text.slice(at + VAULT_ROOT_REJECTED_PREFIX.length).trim() || null;
}

export async function pickTauriVaultDirectory(
  dialogTitle?: string,
): Promise<FileSystemDirectoryHandle | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  const rootPath = await invoke<string | null>(
    'pick_vault_directory',
    dialogTitle ? { dialogTitle } : undefined,
  );
  return rootPath ? createTauriVaultHandle(rootPath) : null;
}

export async function tauriVaultPathExists(
  rootPath: string,
  kind: 'file' | 'directory' = 'directory',
): Promise<boolean> {
  const invoke = getInvoke();
  if (!invoke) return false;
  return invoke<boolean>('vault_path_exists', {
    rootPath,
    relativePath: '',
    kind,
  });
}

export function getTauriVaultRootPath(handle: FileSystemDirectoryHandle): string | undefined {
  return (handle as unknown as { rootPath?: string }).rootPath;
}

export async function openTauriVaultInFinder(rootPath: string): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) {
    throw new Error('Tauri vault runtime is not available.');
  }
  await invoke('open_vault_in_finder', { rootPath });
}

/**
 * For the desktop first-run "just start" path: creates the `~/Documents/Ontology
 * Atlas` container folder if absent and returns its absolute path. JS cannot learn
 * the Documents path without an fs plugin, so the Rust command is the only source.
 * Returns null outside a Tauri runtime — the caller must already have passed a
 * desktop-only guard.
 */
export async function ensureDefaultVaultParentDir(): Promise<string | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<string>('ensure_default_vault_parent_dir');
}

/**
 * Lists the entries (files and directories) at any relative path under `rootPath`.
 *
 * Unlike `listTauriDirectoryNames` it **keeps files and works at any depth**. The
 * manifest walker filters out dot directories and therefore never sees trees such as
 * `.claude/skills`, so anything that must read one uses this. A missing path makes
 * Rust throw and the caller catches it — most vaults have no `.claude/`, and that is
 * not a defect.
 */
export async function listTauriVaultEntries(
  rootPath: string,
  relativePath: string,
): Promise<Array<{ name: string; kind: 'file' | 'directory' }>> {
  const invoke = getInvoke();
  if (!invoke) return [];
  return invoke<TauriVaultEntry[]>('list_vault_directory', { rootPath, relativePath });
}

/** Reads a text file at a relative path under `rootPath`; `null` when the bridge is absent. */
export async function readTauriVaultText(
  rootPath: string,
  relativePath: string,
): Promise<string | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  const file = await invoke<TauriTextFile>('read_vault_text_file', { rootPath, relativePath });
  return file.text;
}

/** Lists only the names of directories directly under `rootPath`, excluding files. */
export async function listTauriDirectoryNames(rootPath: string): Promise<string[]> {
  const invoke = getInvoke();
  if (!invoke) return [];
  const entries = await invoke<TauriVaultEntry[]>('list_vault_directory', {
    rootPath,
    relativePath: '',
  });
  return entries.filter((entry) => entry.kind === 'directory').map((entry) => entry.name);
}

/** Creates the `name` directory under `rootPath` if absent; a no-op when it exists. */
export async function ensureTauriChildDirectory(rootPath: string, name: string): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) {
    throw new Error('Tauri vault runtime is not available.');
  }
  await invoke('ensure_vault_directory', { rootPath, relativePath: name });
}
