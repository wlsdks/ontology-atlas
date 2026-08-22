import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildOntologyTree } from '@/shared/lib/ontology-tree';
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/entities/knowledge-graph';
import { RealmBlockExportAction } from './RealmBlockExportAction';

interface MockVault {
  status: string;
  manifest: { docs: { slug: string; frontmatter: Record<string, unknown>; title: string }[] } | null;
  fileHandles: Map<string, { getFile: () => Promise<{ text: () => Promise<string> }> }>;
  handle: { name: string } | null;
}

const mocks = vi.hoisted(() => ({ vault: null as unknown as MockVault }));
const tauriMocks = vi.hoisted(() => ({
  isTauriVaultRuntime: vi.fn(() => false),
  pickTauriVaultDirectory: vi.fn(),
}));

vi.mock('@/features/docs-vault-local', () => ({
  useLocalVault: () => mocks.vault,
}));

vi.mock('@/shared/lib/tauri-vault-fs', () => tauriMocks);

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function makeNode(id: string, kind: string, title?: string): KnowledgeGraphNode {
  return {
    id,
    title: title ?? id,
    kind,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date('2026-04-27'),
    lastApprovedBy: 'system',
  };
}
function makeEdge(from: string, to: string): KnowledgeGraphEdge {
  return {
    id: `${from}-${to}`,
    from,
    to,
    type: 'contains',
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date('2026-04-27'),
    lastApprovedBy: 'system',
  };
}

const nodes = [
  makeNode('project:atlas', 'project', 'Atlas'),
  makeNode('domain:views', 'domain', 'Views'),
  makeNode('capability:render', 'capability', 'Render'),
];
const edges = [makeEdge('project:atlas', 'domain:views'), makeEdge('domain:views', 'capability:render')];
const subtree = buildOntologyTree(nodes, edges).roots[0].children[0];
const census = { elementCount: 0, capabilityCount: 1, depth: 1 };
const UIDS = {
  project: '01890f3e-7b5d-4c0a-8f14-123456789abc',
  views: '11890f3e-7b5d-4c0a-8f14-123456789abc',
  render: '21890f3e-7b5d-4c0a-8f14-123456789abc',
  other: '31890f3e-7b5d-4c0a-8f14-123456789abc',
} as const;

function fileHandle(content: string) {
  return { getFile: async () => ({ text: async () => content }) };
}

function makeVault(): MockVault {
  return {
    status: 'loaded',
    manifest: {
      docs: [
        { slug: 'project', frontmatter: { uid: UIDS.project, kind: 'project', slug: 'atlas' }, title: 'Atlas' },
        { slug: 'domains/views', frontmatter: { uid: UIDS.views, kind: 'domain' }, title: 'Views' },
        { slug: 'capabilities/render', frontmatter: { uid: UIDS.render, kind: 'capability' }, title: 'Render' },
        { slug: 'capabilities/other', frontmatter: { uid: UIDS.other, kind: 'capability' }, title: 'Other' },
      ],
    },
    fileHandles: new Map([
      ['domains/views', fileHandle('VIEWS RAW')],
      ['capabilities/render', fileHandle('RENDER RAW')],
      ['capabilities/other', fileHandle('OTHER RAW')],
    ]),
    handle: { name: 'my-vault' },
  };
}

/** A write-tracking fake target folder (the block-fsa structural type). */
function fakeTargetDir() {
  const written = new Map<string, string>();
  function dir(prefix: string) {
    return {
      kind: 'directory' as const,
      name: prefix || 'target',
      async *values() {},
      getDirectoryHandle: async (name: string) => dir(`${prefix}${name}/`),
      getFileHandle: async (name: string) => ({
        kind: 'file' as const,
        name,
        getFile: async () => ({ text: async () => written.get(`${prefix}${name}`) ?? '' }),
        createWritable: async () => ({
          write: async (c: string) => {
            written.set(`${prefix}${name}`, c);
          },
          close: async () => undefined,
        }),
      }),
    };
  }
  return { written, handle: dir('') };
}

describe('RealmBlockExportAction', () => {
  beforeEach(() => {
    mocks.vault = makeVault();
    tauriMocks.isTauriVaultRuntime.mockReturnValue(false);
    tauriMocks.pickTauriVaultDirectory.mockReset();
    delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  });

  it('P1 결함② — is disabled with a "open your folder" hint (not hidden) when no vault is loaded', () => {
    // In static sample mode this action vanished without a trace, which read as hiding that
    // the feature exists (usability sweep). Instead of rendering null it stays in place, disabled with a hint.
    mocks.vault = { ...makeVault(), status: 'idle', manifest: null };
    render(<RealmBlockExportAction rootTitle="Views" census={census} subtree={subtree} />);
    const button = screen.getByTestId('realm-block-export');
    expect(button).toBeInTheDocument();
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'vaultRequiredHint');
    fireEvent.click(button);
    expect(mocks.vault.fileHandles).toBeDefined(); // no crash / no-op click
  });

  it('is disabled with a hint when the environment has no directory picker (G1 — 눌러야 실패 금지)', () => {
    render(<RealmBlockExportAction rootTitle="Views" census={census} subtree={subtree} />);
    const button = screen.getByTestId('realm-block-export');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'exportUnsupportedHint');
  });

  it('copies only the realm docs verbatim + writes block-manifest.json into the picked folder', async () => {
    const target = fakeTargetDir();
    (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker =
      vi.fn(async () => target.handle);

    render(<RealmBlockExportAction rootTitle="Views" census={census} subtree={subtree} />);
    fireEvent.click(screen.getByTestId('realm-block-export'));

    await waitFor(() => {
      expect(target.written.has('block-manifest.json')).toBe(true);
    });
    // Only originals from the realm (domain:views) subtree — no outside documents, no project root.
    expect(target.written.get('domains/views.md')).toBe('VIEWS RAW');
    expect(target.written.get('capabilities/render.md')).toBe('RENDER RAW');
    expect(target.written.has('capabilities/other.md')).toBe(false);
    expect(target.written.has('project.md')).toBe(false);

    const manifest = JSON.parse(target.written.get('block-manifest.json')!);
    expect(manifest.blockName).toBe('Views');
    expect(manifest.sourceProject).toBe('Atlas');
    expect(manifest.census).toEqual(census);
    expect(manifest.nodes.map((n: { slug: string }) => n.slug)).toEqual([
      'capabilities/render',
      'domains/views',
    ]);
    expect(manifest.nodes).toEqual([
      expect.objectContaining({
        uid: UIDS.render,
        urn: `urn:uuid:${UIDS.render}`,
        slug: 'capabilities/render',
      }),
      expect.objectContaining({
        uid: UIDS.views,
        urn: `urn:uuid:${UIDS.views}`,
        slug: 'domains/views',
      }),
    ]);
  });

  it('shows an export error and writes nothing when a selected node has no UID', async () => {
    const target = fakeTargetDir();
    const views = mocks.vault.manifest?.docs.find((doc) => doc.slug === 'domains/views');
    if (views) delete views.frontmatter.uid;
    (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker =
      vi.fn(async () => target.handle);

    render(<RealmBlockExportAction rootTitle="Views" census={census} subtree={subtree} />);
    fireEvent.click(screen.getByTestId('realm-block-export'));

    expect(await screen.findByTestId('realm-block-export-error')).toBeInTheDocument();
    expect(target.written.size).toBe(0);
  });

  it('exports through the native Tauri folder picker when the WebView has no browser picker', async () => {
    const target = fakeTargetDir();
    tauriMocks.isTauriVaultRuntime.mockReturnValue(true);
    tauriMocks.pickTauriVaultDirectory.mockResolvedValue(target.handle);

    render(<RealmBlockExportAction rootTitle="Views" census={census} subtree={subtree} />);
    const button = screen.getByTestId('realm-block-export');
    expect(button).toBeEnabled();
    fireEvent.click(button);

    await waitFor(() => {
      expect(target.written.has('block-manifest.json')).toBe(true);
    });
    expect(tauriMocks.pickTauriVaultDirectory).toHaveBeenCalledWith('exportAria');
  });
});
