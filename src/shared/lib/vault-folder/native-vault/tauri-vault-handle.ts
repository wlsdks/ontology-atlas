import type { TauriTextFile, TauriVaultEntry } from './tauri-vault-files';
import { getTauriInvoke, type TauriInvoke } from './tauri-vault-runtime';

/** Raw bytes follow a little-endian u64 mtime. */
const BINARY_FILE_STAMP_BYTES = 8;

type WritableChunk = string | Blob | ArrayBuffer | ArrayBufferView;

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
  return new TextDecoder().decode(chunk);
}

class TauriWritableFileStream {
  private content = '';
  private readonly rootPath: string;
  private readonly relativePath: string;
  private readonly invoke: TauriInvoke;

  constructor(rootPath: string, relativePath: string, invoke: TauriInvoke) {
    this.rootPath = rootPath;
    this.relativePath = relativePath;
    this.invoke = invoke;
  }

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
  private readonly rootPath: string;
  private readonly relativePath: string;
  private readonly invoke: TauriInvoke;

  constructor(rootPath: string, relativePath: string, invoke: TauriInvoke) {
    this.rootPath = rootPath;
    this.relativePath = relativePath;
    this.invoke = invoke;
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
    const stamped = await this.invoke<ArrayBuffer>('read_vault_binary_file', {
      rootPath: this.rootPath,
      relativePath: this.relativePath,
    });
    return new File([new Uint8Array(stamped, BINARY_FILE_STAMP_BYTES)], this.name, {
      type: mimeForPath(this.relativePath),
      lastModified: Number(new DataView(stamped).getBigUint64(0, true)),
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

class TauriDirectoryHandle {
  readonly kind = 'directory';
  readonly name: string;
  readonly rootPath: string;
  private readonly relativePath: string;
  private readonly invoke: TauriInvoke;

  constructor(rootPath: string, relativePath: string, invoke: TauriInvoke) {
    this.rootPath = rootPath;
    this.relativePath = relativePath;
    this.invoke = invoke;
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

  /** A file below this folder by path, without the per-folder existence checks `getFileHandle` makes. */
  fileAt(relativePath: string): FileSystemFileHandle {
    return new TauriFileHandle(
      this.rootPath,
      joinRelative(this.relativePath, relativePath),
      this.invoke,
    ) as unknown as FileSystemFileHandle;
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

export function createTauriVaultHandle(rootPath: string): FileSystemDirectoryHandle {
  const invoke = getTauriInvoke();
  if (!invoke) {
    throw new Error('Tauri vault runtime is not available.');
  }
  return new TauriDirectoryHandle(rootPath, '', invoke) as unknown as FileSystemDirectoryHandle;
}

/**
 * A handle for a path the native watcher reported, in one step instead of one existence round trip
 * per folder; `null` for a web handle. Reads and writes through it still pass Rust's scope checks.
 */
export function tauriVaultFileHandleAt(
  root: FileSystemDirectoryHandle,
  relativePath: string,
): FileSystemFileHandle | null {
  return root instanceof TauriDirectoryHandle ? root.fileAt(relativePath) : null;
}
