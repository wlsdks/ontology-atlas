import { BLOCK_MANIFEST_FILENAME } from './block-manifest';
import type { BlockImportFile } from './merge-plan';

/**
 * 블록 폴더 IO — File System Access API 의 구조적 최소 표면만 의존해
 * jsdom 테스트에서 메모리 fake 로 검증 가능하게 한다. 실제 호출부는
 * `showDirectoryPicker()` 가 준 진짜 FileSystemDirectoryHandle 을 그대로
 * 넘긴다 (TS DOM lib 의 iterator 선언 편차를 구조 타입으로 흡수).
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
  /** 루트의 block-manifest.json raw — 없으면 null (매니페스트는 명함일 뿐, 필수 아님). */
  manifestRaw: string | null;
}

/** 재귀 walk — dotfile 디렉터리/파일과 node_modules 는 CLI import 와 동일하게 skip. */
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

/** export — 원본 .md 를 slug 경로 그대로 복사 + 매니페스트 JSON 기록. */
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
