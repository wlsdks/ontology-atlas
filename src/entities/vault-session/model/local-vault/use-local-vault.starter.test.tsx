import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';

/**
 * The starter is part of the open: an empty folder asked for one gets it before its first manifest.
 * A folder with documents is never written into; a failed starter is returned and the folder opens.
 */

const tauri = vi.hoisted(() => ({
  isTauriVaultRuntime: vi.fn(() => true),
  tauriVaultPathExists: vi.fn(async () => true),
  listTauriDirectoryNames: vi.fn(async () => [] as string[]),
  createTauriVaultHandle: vi.fn(),
  getTauriVaultRootPath: vi.fn((h: { rootPath?: string }) => h?.rootPath),
  pickTauriVaultDirectory: vi.fn(),
}));

const store = vi.hoisted(() => ({
  getLocalFsHandle: vi.fn(async () => undefined),
  listRecentLocalFsHandles: vi.fn(async () => [] as LocalFsHandleRecord[]),
  putLocalFsHandle: vi.fn(async () => {}),
  touchLocalFsHandle: vi.fn(async () => {}),
  forgetRecentLocalFsHandle: vi.fn(async () => {}),
  deleteLocalFsHandle: vi.fn(async () => {}),
  verifyHandlePermission: vi.fn<() => Promise<PermissionState>>(async () => 'granted'),
}));

/** The folder on "disk": vault-relative path → content. */
const disk = vi.hoisted(() => ({ files: new Map<string, string>() }));

/** A manifest built from the disk as it is at the moment of the build, as the real builder does. */
function buildFromDisk() {
  const docs = [...disk.files.keys()]
    .filter((path) => path.endsWith('.md') && !path.startsWith('.'))
    .map((path) => ({ slug: path.replace(/\.md$/, ''), frontmatter: {} }));
  return {
    build: {
      manifest: {
        version: '1',
        generatedAt: '',
        docs,
        backlinksDetail: {},
        tags: {},
        tree: { name: 'root', path: '', type: 'dir' as const },
      },
      fileHandles: new Map(docs.map((doc) => [doc.slug, {}])),
      imageHandles: new Map(),
      sourceHandles: new Map(),
      fingerprint: `fp-${docs.length}`,
    },
    entries: [],
  };
}

const docsVault = vi.hoisted(() => ({
  buildLocalManifestWithEntries: vi.fn(),
  rebuildLocalManifestIncremental: vi.fn(),
  computeLocalVaultFingerprint: vi.fn(async () => 'fp'),
}));

vi.mock('@/shared/lib/vault-folder/tauri-vault-fs', () => tauri);
vi.mock('@/entities/local-fs-handle', () => ({ CURRENT_LOCAL_FS_HANDLE_ID: 'current', ...store }));
vi.mock('@/entities/docs-vault', () => docsVault);

import { useLocalVaultInternal } from './use-local-vault';

const ROOT = '/Users/dana/Ontology Atlas/my-ontology';

/** A directory handle over `disk.files`, answering like the Tauri handle (NotFoundError when absent). */
function folder(prefix = ''): FileSystemDirectoryHandle {
  const at = (child: string) => (prefix ? `${prefix}/${child}` : child);
  return {
    kind: 'directory',
    name: prefix ? prefix.split('/').pop() : 'my-ontology',
    rootPath: ROOT,
    async getDirectoryHandle(child: string, options: { create?: boolean } = {}) {
      const path = at(child);
      const known = disk.files.has(`${path}/`) || [...disk.files.keys()].some((f) => f.startsWith(`${path}/`));
      if (!known && !options.create) throw new DOMException(`Directory not found: ${path}`, 'NotFoundError');
      if (!known) disk.files.set(`${path}/`, '');
      return folder(path);
    },
    async getFileHandle(child: string, options: { create?: boolean } = {}) {
      const path = at(child);
      if (!disk.files.has(path)) {
        if (!options.create) throw new DOMException(`File not found: ${path}`, 'NotFoundError');
        disk.files.set(path, '');
      }
      return {
        kind: 'file',
        name: child,
        async getFile() {
          return new File([disk.files.get(path) ?? ''], child);
        },
        async createWritable() {
          let content = '';
          return {
            async write(chunk: string) {
              content += chunk;
            },
            async close() {
              disk.files.set(path, content);
            },
          };
        },
      };
    },
  } as unknown as FileSystemDirectoryHandle;
}

function record(): LocalFsHandleRecord {
  return { id: 'current', handle: folder(), desktopRootPath: ROOT, name: 'my-ontology', createdAt: 1, lastAccessedAt: 1 };
}

const written = () => [...disk.files.keys()].filter((path) => !path.endsWith('/')).sort();

async function mountHook() {
  /** Every committed (status, document count) pair, to prove what the screen could have drawn. */
  const frames: Array<[string, number | null]> = [];
  const hook = renderHook(() => {
    const vault = useLocalVaultInternal();
    frames.push([vault.status, vault.manifest ? vault.manifest.docs.length : null]);
    return vault;
  });
  await waitFor(() => expect(hook.result.current.restoreAttempted).toBe(true));
  return { hook, frames };
}

beforeEach(() => {
  disk.files.clear();
  store.verifyHandlePermission.mockResolvedValue('granted');
  docsVault.buildLocalManifestWithEntries.mockImplementation(async () => buildFromDisk());
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useLocalVaultInternal: the starter files of a created vault are part of opening it', () => {
  it('shows an empty folder for the first time only after writing the starter files', async () => {
    const { hook, frames } = await mountHook();

    let result: Awaited<ReturnType<typeof hook.result.current.openRecent>> | undefined;
    await act(async () => {
      result = await hook.result.current.openRecent(record(), {
        starter: { locale: 'en', shape: { map: true, wiki: true } },
      });
    });

    expect(result).toMatchObject({ opened: true, starterError: null });
    expect(result?.starterWritten).toBeGreaterThan(0);
    expect(written()).toEqual(
      expect.arrayContaining([
        'AGENTS.md',
        'CLAUDE.md',
        'README.md',
        'capabilities/example-capability.md',
        'domains/example-domain.md',
        'elements/example-element.md',
        'project.md',
        'wiki/_template.md',
      ]),
    );
    expect(disk.files.has('sources/')).toBe(true);
    // The first manifest the screen receives already holds the starter: no empty map first.
    expect(hook.result.current.status).toBe('loaded');
    expect(hook.result.current.manifest?.docs.length).toBe(
      written().filter((path) => path.endsWith('.md') && !path.startsWith('.')).length,
    );
    expect(frames.filter(([status, docs]) => status === 'loaded' && docs === 0)).toEqual([]);
  });

  it('writes only the chosen shape; a wiki-only choice has no map starter node', async () => {
    const { hook } = await mountHook();

    await act(async () => {
      await hook.result.current.openRecent(record(), { starter: { locale: 'en', shape: { map: false, wiki: true } } });
    });

    expect(written()).toContain('wiki/_template.md');
    expect(written()).not.toContain('project.md');
  });

  it('writes the starter files in the screen language', async () => {
    const { hook } = await mountHook();

    await act(async () => {
      await hook.result.current.openRecent(record(), { starter: { locale: 'ko' } });
    });

    expect(disk.files.get('project.md')).toMatch(/\p{Script=Hangul}/u);
  });

  it('preserves a starter path created externally after the folder was read', async () => {
    const { hook } = await mountHook();
    await act(async () => { await hook.result.current.openRecent(record()); });
    disk.files.set('elements/example-element.md', '# Newly written outside Atlas\n');
    await act(async () => { await hook.result.current.scaffoldOntology('en'); });
    expect(disk.files.get('elements/example-element.md')).toBe('# Newly written outside Atlas\n');
    expect(hook.result.current.consumeSelfWrittenSlugs(new Set(['elements/example-element']))).toEqual(new Set());
  });

  it('reports only its newly saved starter files as app-owned writes', async () => {
    disk.files.set('project.md', '# Existing work\n');
    const { hook } = await mountHook();
    await act(async () => { await hook.result.current.openRecent(record()); });
    await act(async () => { await hook.result.current.scaffoldOntology('en'); });
    expect(disk.files.get('project.md')).toBe('# Existing work\n');
    const observed = new Set(['project', 'README', 'AGENTS', 'CLAUDE', 'wiki/_template', 'external']);
    expect(hook.result.current.consumeSelfWrittenSlugs(observed)).toEqual(
      new Set(['README', 'AGENTS', 'CLAUDE', 'wiki/_template']),
    );
    expect(hook.result.current.consumeSelfWrittenSlugs(observed)).toEqual(new Set());
  });

  it('writes nothing to a folder that already has documents', async () => {
    disk.files.set('notes.md', '# Notes\n');
    const { hook } = await mountHook();

    let result: Awaited<ReturnType<typeof hook.result.current.openRecent>> | undefined;
    await act(async () => {
      result = await hook.result.current.openRecent(record(), { starter: { locale: 'en' } });
    });

    expect(result).toEqual({ opened: true, starterWritten: 0, starterError: null });
    expect(written()).toEqual(['notes.md']);
  });

  it('writes nothing to an empty folder when not requested', async () => {
    const { hook } = await mountHook();

    await act(async () => {
      await hook.result.current.openRecent(record());
    });

    expect(hook.result.current.status).toBe('loaded');
    expect(written()).toEqual([]);
  });

  it('opens the folder when write permission is refused and returns why the starter files could not be written', async () => {
    store.verifyHandlePermission.mockResolvedValue('denied');
    const { hook } = await mountHook();

    let result: Awaited<ReturnType<typeof hook.result.current.openRecent>> | undefined;
    await act(async () => {
      result = await hook.result.current.openRecent(record(), { starter: { locale: 'en' } });
    });

    expect(result?.opened).toBe(true);
    expect(result?.starterError).toMatchObject({ code: 'permission-denied' });
    expect(hook.result.current.status).toBe('loaded');
    expect(written()).toEqual([]);
  });
});
