import { BLOCK_MANIFEST_FILENAME } from './block-manifest';
import type { BlockImportFile } from './merge-plan';

/**
 * Block folder IO. It depends only on the structural minimum of the File System Access API,
 * so jsdom tests can verify it against an in-memory fake. Real call sites pass the genuine
 * `FileSystemDirectoryHandle` from `showDirectoryPicker()` straight through (structural
 * typing absorbs the iterator declaration differences across TS DOM libs).
 */

export interface BlockFileLike {
  text(): Promise<string>;
}

export interface BlockFileHandleLike {
  kind: 'file';
  name: string;
  getFile(): Promise<BlockFileLike>;
  createWritable?(): Promise<{
    write(content: string): Promise<void>;
    close(): Promise<void>;
  }>;
}

export type BlockDirEntryLike = BlockFileHandleLike | BlockDirectoryHandleLike;

export interface BlockDirectoryHandleLike {
  kind: 'directory';
  name: string;
  values(): AsyncIterableIterator<BlockDirEntryLike> | AsyncIterable<BlockDirEntryLike>;
  getDirectoryHandle(
    name: string,
    opts?: { create?: boolean },
  ): Promise<BlockDirectoryHandleLike>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<BlockFileHandleLike>;
}

export interface BlockDirectoryReadResult {
  files: BlockImportFile[];
  /** The root's raw block-manifest.json, or null — the manifest is a calling card, not a requirement. */
  manifestRaw: string | null;
}

/** Recursive walk. Dotfile directories and files, and node_modules, are skipped exactly as in the CLI import. */
export async function readBlockDirectory(
  dir: BlockDirectoryHandleLike,
): Promise<BlockDirectoryReadResult> {
  const files: BlockImportFile[] = [];
  let manifestRaw: string | null = null;

  async function walk(current: BlockDirectoryHandleLike, prefix: string): Promise<void> {
    for await (const entry of current.values()) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      if (entry.kind === 'directory') {
        await walk(entry, `${prefix}${entry.name}/`);
        continue;
      }
      if (prefix === '' && entry.name === BLOCK_MANIFEST_FILENAME) {
        manifestRaw = await (await entry.getFile()).text();
        continue;
      }
      if (!entry.name.endsWith('.md')) continue;
      files.push({ path: `${prefix}${entry.name}`, raw: await (await entry.getFile()).text() });
    }
  }

  await walk(dir, '');
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, manifestRaw };
}

async function writeFileAtPath(
  root: BlockDirectoryHandleLike,
  relPath: string,
  content: string,
): Promise<void> {
  const parts = relPath.split('/').filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) throw new Error(`Invalid block file path: "${relPath}"`);
  let parent = root;
  for (const part of parts) {
    parent = await parent.getDirectoryHandle(part, { create: true });
  }
  const fh = await parent.getFileHandle(fileName, { create: true });
  if (!fh.createWritable) throw new Error('Target directory is not writable');
  const writable = await fh.createWritable();
  await writable.write(content);
  await writable.close();
}

/** Export — copies the original `.md` at its slug path and writes the manifest JSON. */
export async function writeBlockToDirectory(
  target: BlockDirectoryHandleLike,
  docs: readonly { slug: string; content: string }[],
  manifestJson: string,
): Promise<void> {
  for (const doc of docs) {
    await writeFileAtPath(target, `${doc.slug}.md`, doc.content);
  }
  await writeFileAtPath(target, BLOCK_MANIFEST_FILENAME, manifestJson);
}
