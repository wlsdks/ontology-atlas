/**
 * A mutable in-memory vault behind the File System Access shapes the manifest builder reads
 * (`entries`, `getFile`, `getDirectoryHandle`, `getFileHandle`). Tests edit it the way an editor,
 * `git checkout` or a folder rename would, then ask `change()` what the native watcher reports for
 * a path: the same `file | directory | missing` judgement `vault::watch` makes with `lstat`.
 */

export interface MemoryFile {
  text: string;
  lastModified: number;
}

export interface MemoryPathChange {
  path: string;
  kind: 'file' | 'directory' | 'missing' | 'other';
  lastModified?: number;
  size?: number;
}

interface DirIndex {
  files: Map<string, MemoryFile>;
  dirs: Set<string>;
}

function parentOf(path: string): string {
  const at = path.lastIndexOf('/');
  return at < 0 ? '' : path.slice(0, at);
}

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function notFound(path: string): DOMException {
  return new DOMException(`Not found: ${path}`, 'NotFoundError');
}

export class MemoryVault {
  private readonly dirs = new Map<string, DirIndex>([['', { files: new Map(), dirs: new Set() }]]);
  private clock = 1_700_000_000_000;
  /** `getFile()` calls per path, to prove a change reads only what changed. */
  readonly opens = new Map<string, number>();

  constructor(files: Record<string, string> = {}) {
    for (const [path, text] of Object.entries(files)) this.write(path, text);
  }

  /** The next modification time; strictly increasing, as a save is. */
  tick(): number {
    this.clock += 1000;
    return this.clock;
  }

  has(path: string): boolean {
    return this.dirs.get(parentOf(path))?.files.has(nameOf(path)) ?? false;
  }

  isDir(path: string): boolean {
    return this.dirs.has(path);
  }

  /** Every file path, in no particular order. */
  paths(): string[] {
    const out: string[] = [];
    for (const [dir, index] of this.dirs) {
      for (const name of index.files.keys()) out.push(dir ? `${dir}/${name}` : name);
    }
    return out;
  }

  read(path: string): MemoryFile | undefined {
    return this.dirs.get(parentOf(path))?.files.get(nameOf(path));
  }

  mkdir(path: string): void {
    if (!path || this.dirs.has(path)) return;
    this.mkdir(parentOf(path));
    this.dirs.set(path, { files: new Map(), dirs: new Set() });
    this.dirs.get(parentOf(path))!.dirs.add(nameOf(path));
  }

  write(path: string, text: string, lastModified = this.tick()): void {
    const dir = parentOf(path);
    this.mkdir(dir);
    this.dirs.get(dir)!.files.set(nameOf(path), { text, lastModified });
  }

  remove(path: string): void {
    this.dirs.get(parentOf(path))?.files.delete(nameOf(path));
  }

  /** Same modification time, as `mv` keeps it. */
  rename(from: string, to: string): void {
    const file = this.read(from);
    if (!file) throw notFound(from);
    this.remove(from);
    this.write(to, file.text, file.lastModified);
  }

  removeDir(path: string): void {
    const index = this.dirs.get(path);
    if (!index) return;
    for (const child of [...index.dirs]) this.removeDir(`${path}/${child}`);
    this.dirs.delete(path);
    this.dirs.get(parentOf(path))?.dirs.delete(nameOf(path));
  }

  /** Moves a whole folder; on macOS the watcher sees only the two folder paths. */
  renameDir(from: string, to: string): void {
    const moved: Array<[string, MemoryFile]> = [];
    for (const path of this.paths()) {
      if (path.startsWith(`${from}/`)) moved.push([`${to}${path.slice(from.length)}`, this.read(path)!]);
    }
    this.removeDir(from);
    this.mkdir(to);
    for (const [path, file] of moved) this.write(path, file.text, file.lastModified);
  }

  /** What `vault::watch` reports for one path after the edit. */
  change(path: string): MemoryPathChange {
    const file = this.read(path);
    if (file) {
      return { path, kind: 'file', lastModified: file.lastModified, size: new TextEncoder().encode(file.text).length };
    }
    return { path, kind: this.dirs.has(path) ? 'directory' : 'missing' };
  }

  root(name = 'root'): FileSystemDirectoryHandle {
    return this.dirHandle('', name);
  }

  private fileHandle(path: string): FileSystemFileHandle {
    return {
      kind: 'file',
      name: nameOf(path),
      getFile: async () => {
        this.opens.set(path, (this.opens.get(path) ?? 0) + 1);
        const file = this.read(path);
        if (!file) throw notFound(path);
        return {
          text: async () => file.text,
          lastModified: file.lastModified,
          size: new TextEncoder().encode(file.text).length,
        } as unknown as File;
      },
    } as unknown as FileSystemFileHandle;
  }

  private async *list(path: string): AsyncGenerator<readonly [string, FileSystemHandle]> {
    const index = this.dirs.get(path);
    if (!index) throw notFound(path);
    const join = (child: string) => (path ? `${path}/${child}` : child);
    for (const child of [...index.files.keys()]) yield [child, this.fileHandle(join(child))] as const;
    for (const child of [...index.dirs]) yield [child, this.dirHandle(join(child), child)] as const;
  }

  private dirHandle(path: string, name: string): FileSystemDirectoryHandle {
    const join = (child: string) => (path ? `${path}/${child}` : child);
    return {
      kind: 'directory',
      name,
      entries: () => this.list(path),
      getDirectoryHandle: async (child: string) => {
        if (!this.dirs.has(join(child))) throw notFound(join(child));
        return this.dirHandle(join(child), child);
      },
      getFileHandle: async (child: string) => {
        if (!this.has(join(child))) throw notFound(join(child));
        return this.fileHandle(join(child));
      },
    } as unknown as FileSystemDirectoryHandle;
  }
}
