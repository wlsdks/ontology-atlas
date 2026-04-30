import { describe, expect, it } from 'vitest';
import {
  buildLocalManifest,
  computeLocalVaultFingerprint,
} from './build-local-manifest';

interface FakeFile {
  text: string;
  lastModified: number;
}

function makeFileHandle(name: string, file: FakeFile): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    getFile: async () =>
      ({
        text: async () => file.text,
        lastModified: file.lastModified,
      }) as unknown as File,
  } as unknown as FileSystemFileHandle;
}

function makeRoot(files: Record<string, FakeFile>): FileSystemDirectoryHandle {
  // 가장 단순한 구조 — flat 디렉터리. 키 = 'foo.md' 또는 'sub/bar.md'.
  const groups: Record<string, Record<string, FakeFile>> = {};
  for (const [path, file] of Object.entries(files)) {
    const parts = path.split('/');
    const dir = parts.slice(0, -1).join('/');
    const name = parts[parts.length - 1];
    if (!groups[dir]) groups[dir] = {};
    groups[dir][name] = file;
  }

  const buildHandle = (dirKey: string): FileSystemDirectoryHandle => {
    const myFiles = groups[dirKey] ?? {};
    const subDirs = new Set<string>();
    for (const k of Object.keys(groups)) {
      if (k === dirKey) continue;
      if (dirKey === '' && !k.includes('/')) subDirs.add(k);
      else if (dirKey !== '' && k.startsWith(dirKey + '/')) {
        const tail = k.slice(dirKey.length + 1);
        if (!tail.includes('/')) subDirs.add(k);
      }
    }
    return {
      kind: 'directory',
      name: dirKey || 'root',
      entries: async function* () {
        for (const [name, file] of Object.entries(myFiles)) {
          yield [name, makeFileHandle(name, file)] as const;
        }
        for (const sub of subDirs) {
          const subName = sub.includes('/')
            ? sub.slice(sub.lastIndexOf('/') + 1)
            : sub;
          yield [subName, buildHandle(sub)] as const;
        }
      },
    } as unknown as FileSystemDirectoryHandle;
  };

  return buildHandle('');
}

describe('computeLocalVaultFingerprint', () => {
  it('동일 파일 / 동일 mtime → 같은 fingerprint', async () => {
    const files = {
      'a.md': { text: '# A', lastModified: 1000 },
      'b.md': { text: '# B', lastModified: 2000 },
    };
    const root1 = makeRoot(files);
    const root2 = makeRoot(files);
    const fp1 = await computeLocalVaultFingerprint(root1);
    const fp2 = await computeLocalVaultFingerprint(root2);
    expect(fp1).toBe(fp2);
    expect(fp1.length).toBeGreaterThan(0);
  });

  it('파일 mtime 변경 → 다른 fingerprint', async () => {
    const root1 = makeRoot({ 'a.md': { text: 'x', lastModified: 1 } });
    const root2 = makeRoot({ 'a.md': { text: 'x', lastModified: 2 } });
    expect(await computeLocalVaultFingerprint(root1)).not.toBe(
      await computeLocalVaultFingerprint(root2),
    );
  });

  it('파일 추가 → 다른 fingerprint', async () => {
    const root1 = makeRoot({ 'a.md': { text: 'x', lastModified: 1 } });
    const root2 = makeRoot({
      'a.md': { text: 'x', lastModified: 1 },
      'b.md': { text: 'y', lastModified: 1 },
    });
    expect(await computeLocalVaultFingerprint(root1)).not.toBe(
      await computeLocalVaultFingerprint(root2),
    );
  });

  it('빈 디렉터리는 빈 fingerprint', async () => {
    const root = makeRoot({});
    expect(await computeLocalVaultFingerprint(root)).toBe('');
  });

  it('buildLocalManifest 의 fingerprint 가 standalone 결과와 일치', async () => {
    const files = {
      'a.md': { text: '# A', lastModified: 100 },
      'b.md': { text: '# B', lastModified: 200 },
    };
    const root1 = makeRoot(files);
    const root2 = makeRoot(files);
    const built = await buildLocalManifest(root1);
    const standalone = await computeLocalVaultFingerprint(root2);
    expect(built.fingerprint).toBe(standalone);
  });
});
