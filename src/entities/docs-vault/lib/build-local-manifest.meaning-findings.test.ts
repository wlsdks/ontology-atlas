import { describe, expect, it } from 'vitest';
import { buildLocalManifest } from './build-local-manifest';

/** The local builder records the same meaning findings `validate_vault` reports for each body. */

interface FakeFile {
  text: string;
  lastModified: number;
}

function makeFileHandle(name: string, file: FakeFile): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    getFile: async () =>
      ({ text: async () => file.text, lastModified: file.lastModified }) as unknown as File,
  } as unknown as FileSystemFileHandle;
}

function makeRoot(files: Record<string, FakeFile>): FileSystemDirectoryHandle {
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
    for (const key of Object.keys(groups)) {
      if (key === dirKey) continue;
      if (dirKey === '' && !key.includes('/')) subDirs.add(key);
      else if (dirKey !== '' && key.startsWith(dirKey + '/')) {
        const tail = key.slice(dirKey.length + 1);
        if (!tail.includes('/')) subDirs.add(key);
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
          const subName = sub.includes('/') ? sub.slice(sub.lastIndexOf('/') + 1) : sub;
          yield [subName, buildHandle(sub)] as const;
        }
      },
    } as unknown as FileSystemDirectoryHandle;
  };
  return buildHandle('');
}

function file(text: string): FakeFile {
  return { text, lastModified: 1000 };
}

/** Answers every question: the negative baseline. */
const COMPLETE_CAPABILITY = [
  '---',
  'title: Vault Compiler',
  'kind: capability',
  '---',
  '# Vault Compiler',
  '',
  'Turns a reviewed folder of Markdown into a graph a reader can walk without opening code.',
  '',
  '## Includes',
  '',
  '- Reading frontmatter relations from every document in the folder',
  '',
  '## Excludes',
  '',
  '- Drawing the result on screen, which the map surface owns',
  '',
  '## Uncertainty',
  '',
  '- Whether a folder with symlinked subtrees behaves the same was never measured',
  '',
].join('\n');

/** The same node with nothing but its name. */
const BARE_CAPABILITY = [
  '---',
  'title: Vault Compiler',
  'kind: capability',
  '---',
  '# Vault Compiler',
  '',
].join('\n');

async function findingsFor(files: Record<string, string>) {
  const built = await buildLocalManifest(
    makeRoot(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, file(v)]))),
  );
  return new Map(built.manifest.docs.map((doc) => [doc.slug, doc.meaningFindings]));
}

describe('build-local-manifest — meaning findings', () => {
  it('a node that answers every question carries an empty list, not a missing key', async () => {
    const findings = await findingsFor({
      'capabilities/vault-compiler.md': COMPLETE_CAPABILITY,
    });
    expect(findings.get('capabilities/vault-compiler')).toEqual([]);
  });

  it('a body that is only its own name reports every body finding', async () => {
    const findings = await findingsFor({
      'capabilities/vault-compiler.md': BARE_CAPABILITY,
    });
    // Both boundary sides are reported, as the validator does.
    expect(findings.get('capabilities/vault-compiler')).toEqual([
      'definition-missing',
      'boundary-missing',
      'boundary-missing',
      'uncertainty-missing',
    ]);
  });

  it('a node at the vault root is told where its kind folder is', async () => {
    const findings = await findingsFor({
      'vault-compiler.md': COMPLETE_CAPABILITY,
    });
    expect(findings.get('vault-compiler')).toEqual(['slug-outside-kind-folder']);
  });

  it('a document with no kind is never asked — the key is absent, not empty', async () => {
    const findings = await findingsFor({
      'notes.md': ['---', 'title: Notes', '---', '# Notes', '', 'Loose prose.', ''].join('\n'),
    });
    expect(findings.has('notes')).toBe(true);
    expect(findings.get('notes')).toBeUndefined();
  });
});
