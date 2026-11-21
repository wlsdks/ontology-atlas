import { describe, expect, it } from 'vitest';
import { addSourcesInBrowser, readSourceCopy, startSourceCopy, stopSourceCopy } from './add-sources';

/** An in-memory folder handle with only what the import touches. */
function memoryFolder(name = 'vault') {
  const files = new Map<string, Uint8Array>();
  const folder = (prefix: string, dirName: string): FileSystemDirectoryHandle => ({
    kind: 'directory',
    name: dirName,
    async *entries() {
      const seen = new Set<string>();
      for (const path of files.keys()) {
        if (prefix && !path.startsWith(`${prefix}/`)) continue;
        const rest = prefix ? path.slice(prefix.length + 1) : path;
        const head = rest.split('/')[0]!;
        if (seen.has(head)) continue;
        seen.add(head);
        if (rest.includes('/')) yield [head, folder(prefix ? `${prefix}/${head}` : head, head)];
        else yield [head, { kind: 'file', name: head, getFile: async () => new File([files.get(path)! as BlobPart], head) }];
      }
    },
    async getDirectoryHandle(child: string) {
      return folder(prefix ? `${prefix}/${child}` : child, child);
    },
    async getFileHandle(child: string) {
      const path = prefix ? `${prefix}/${child}` : child;
      return {
        createWritable: async () => ({
          write: async (bytes: ArrayBuffer) => { files.set(path, new Uint8Array(bytes)); },
          close: async () => {},
          abort: async () => {},
        }),
      };
    },
  }) as unknown as FileSystemDirectoryHandle;
  return { root: folder('', name), files };
}

const pick = (relativePath: string, body: string) => ({
  file: new File([body], relativePath.slice(relativePath.lastIndexOf('/') + 1)),
  relativePath,
});

describe('a browser copy keeps the folders a file came from', () => {
  it('lands each file under its folder and renames only inside one folder', async () => {
    const { root, files } = memoryFolder();
    const outcome = await addSourcesInBrowser(root, [
      pick('meetings/weekly.md', 'monday notes'),
      pick('contracts/weekly.md', 'contract notes'),
      pick('meetings/weekly.md', 'tuesday notes'),
    ]);
    expect(outcome.results.map((row) => [row.status, row.relativePath])).toEqual([
      ['added', 'sources/meetings/weekly.md'],
      ['added', 'sources/contracts/weekly.md'],
      ['renamed', 'sources/meetings/weekly (2).md'],
    ]);
    expect([...files.keys()].sort()).toEqual([
      'sources/contracts/weekly.md',
      'sources/meetings/weekly (2).md',
      'sources/meetings/weekly.md',
    ]);
  });

  it('refuses a landing path that would climb out of the sources folder', async () => {
    const { root, files } = memoryFolder();
    const outcome = await addSourcesInBrowser(root, [pick('../escape.md', 'x'), pick('a/../../b.md', 'y')]);
    expect(outcome.results.map((row) => row.reason)).toEqual(['unusable-file-name', 'unusable-file-name']);
    expect(files.size).toBe(0);
  });

  it('stops between files and keeps what landed', async () => {
    const { root, files } = memoryFolder();
    let copied = 0;
    const outcome = await addSourcesInBrowser(
      root,
      [pick('a.txt', 'one'), pick('b.txt', 'two'), pick('c.txt', 'three')],
      { onProgress: (done) => { copied = done; }, shouldStop: () => copied >= 1 },
    );
    expect(outcome.results).toHaveLength(1);
    expect([...files.keys()]).toEqual(['sources/a.txt']);
  });
});

describe('a background copy reports into one job per folder', () => {
  it('counts the same bytes as skipped and the rest as added', async () => {
    const { root } = memoryFolder();
    await addSourcesInBrowser(root, [pick('old.txt', 'same bytes')]);
    const job = await startSourceCopy('scope-a', {
      kind: 'browser',
      root,
      picks: [pick('notes/again.txt', 'same bytes'), pick('notes/new.txt', 'new bytes')],
      skipped: [{ name: 'notes/.env', reason: 'secretName' }],
    });
    expect(job).toMatchObject({ phase: 'done', added: 1, done: 2, total: 2 });
    expect(job.skipped).toEqual([
      { name: 'notes/.env', reason: 'secretName' },
      { name: 'again.txt', reason: 'same' },
    ]);
    expect(readSourceCopy('scope-a')).toBe(job);
  });

  it('marks a stopped copy and keeps the count that landed', async () => {
    const { root } = memoryFolder();
    const running = startSourceCopy('scope-b', {
      kind: 'browser',
      root,
      picks: [pick('a.txt', 'one'), pick('b.txt', 'two'), pick('c.txt', 'three')],
      skipped: [],
    });
    stopSourceCopy('scope-b');
    const job = await running;
    expect(job.phase).toBe('stopped');
    expect(job.added).toBeLessThan(3);
  });
});
