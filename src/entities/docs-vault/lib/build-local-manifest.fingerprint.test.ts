import { describe, expect, it } from 'vitest';
import {
  buildLocalManifest,
  buildLocalManifestWithEntries,
  rebuildLocalManifestIncremental,
  computeLocalVaultFingerprint,
  walkVault,
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
  // Flat directory; keys are 'foo.md' or 'sub/bar.md'.
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
  it('gives the same fingerprint for the same files and mtimes', async () => {
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

  it('changes the fingerprint when a file mtime changes', async () => {
    const root1 = makeRoot({ 'a.md': { text: 'x', lastModified: 1 } });
    const root2 = makeRoot({ 'a.md': { text: 'x', lastModified: 2 } });
    expect(await computeLocalVaultFingerprint(root1)).not.toBe(
      await computeLocalVaultFingerprint(root2),
    );
  });

  it('changes the fingerprint when a file is added', async () => {
    const root1 = makeRoot({ 'a.md': { text: 'x', lastModified: 1 } });
    const root2 = makeRoot({
      'a.md': { text: 'x', lastModified: 1 },
      'b.md': { text: 'y', lastModified: 1 },
    });
    expect(await computeLocalVaultFingerprint(root1)).not.toBe(
      await computeLocalVaultFingerprint(root2),
    );
  });

  it('gives an empty fingerprint for an empty directory', async () => {
    const root = makeRoot({});
    expect(await computeLocalVaultFingerprint(root)).toBe('');
  });

  it('matches the standalone fingerprint from buildLocalManifest', async () => {
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

it('bounds concurrent metadata reads while keeping every fingerprint entry', async () => {
  let active = 0;
  let peak = 0;
  const root = {
    kind: 'directory', name: 'Pooled',
    entries: async function* () {
      for (let i = 0; i < 96; i += 1) {
        const name = `n${i}.md`;
        yield [name, {
          kind: 'file', name,
          getFile: async () => {
            active += 1;
            peak = Math.max(peak, active);
            await Promise.resolve();
            active -= 1;
            return { lastModified: i };
          },
        }];
      }
    },
  } as unknown as FileSystemDirectoryHandle;
  const fingerprint = await computeLocalVaultFingerprint(root);
  expect(fingerprint.split('\n')).toHaveLength(96);
  expect(peak).toBeGreaterThan(1);
  expect(peak).toBeLessThanOrEqual(16);
});

it.each([100_000, 100_001])('keeps the first 100,000 entries and reports truncation for %i files', async (size) => {
  const root = {
    kind: 'directory', name: 'Large',
    entries: async function* () {
      for (let i = 0; i < size; i += 1) {
        const name = `n${i}.md`;
        yield [name, { kind: 'file', name }];
      }
    },
  } as unknown as FileSystemDirectoryHandle;
  const result = await walkVault(root);
  expect(result.entries).toHaveLength(100_000);
  expect(result.truncated).toBe(size > 100_000);
});

it('shares repeated metadata values without sharing mutable headings or adding node fields', async () => {
  const root = makeRoot({
    'a.md': { text: '---\ntitle: A\nkind: element\ndomain: shared\n---\n\n## Includes\n\nA.', lastModified: 1 },
    'b.md': { text: '---\ntitle: B\nkind: element\ndomain: shared\n---\n\n## Includes\n\nB.', lastModified: 1 },
    'wiki/plain.md': { text: '---\ntitle: Plain\n---\n\n## Includes\n\nPlain.', lastModified: 1 },
  });
  const { manifest } = await buildLocalManifest(root);
  const a = manifest.docs.find((doc) => doc.slug === 'a')!;
  const b = manifest.docs.find((doc) => doc.slug === 'b')!;
  const plain = manifest.docs.find((doc) => doc.slug === 'wiki/plain')!;
  expect(Object.keys(plain.frontmatter)).toEqual(['title']);
  expect(a.frontmatter.domain).toBe('shared');
  expect(b.frontmatter.domain).toBe('shared');
  expect(a.headings[0]).not.toBe(b.headings[0]);
  a.headings[0].text = 'Changed';
  expect(b.headings[0].text).toBe('Includes');
});

it('reuses frozen unchanged documents without mutating an earlier build', async () => {
  const root = makeRoot({ 'a.md': { text: '---\ntitle: A\nkind: element\ndomain: shared\n---\n\n## Includes\n\nA.', lastModified: 1 } });
  const first = await buildLocalManifestWithEntries(root);
  const doc = first.build.manifest.docs[0];
  Object.freeze(doc.frontmatter);
  for (const heading of doc.headings) Object.freeze(heading);
  Object.freeze(doc.headings);
  Object.freeze(doc);
  const next = await rebuildLocalManifestIncremental(root, first.entries);
  expect(next.entries[0].doc).toBe(doc);
  expect(next.build.manifest.docs[0]).toBe(doc);
});
