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

  async getFileHandle(
    name: string,
    options: { create?: boolean } = {},
  ): Promise<FileSystemFileHandle> {
    const relativePath = joinRelative(this.relativePath, name);
    if (options.create) {
      await this.invoke('write_vault_text_file', {
        rootPath: this.rootPath,
        relativePath,
        content: '',
      });
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

export async function pickTauriVaultDirectory(): Promise<FileSystemDirectoryHandle | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  const rootPath = await invoke<string | null>('pick_vault_directory');
  return rootPath ? createTauriVaultHandle(rootPath) : null;
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
