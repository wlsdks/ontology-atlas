import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VaultDoc } from '@/entities/docs-vault';
import { useOntologyEvidence } from './use-ontology-evidence';

const mock = vi.hoisted(() => ({ read: vi.fn(), status: vi.fn(), walk: vi.fn() }));
vi.mock('@/shared/lib/project-source-store', () => ({ createVaultFileProjectSourceStore: () => ({ read: mock.read }) }));
vi.mock('@/shared/lib/tauri-git', () => ({ isGitBridgeAvailable: () => true, gitStatus: mock.status, gitPathsLastChange: mock.walk }));
const document = (path: string) => ({ slug: 'capabilities/pay', frontmatter: { path } }) as unknown as VaultDoc;
const nodes = [{ id: 'pay', docSlug: 'capabilities/pay' }];
const handle = { name: 'ontology' } as FileSystemDirectoryHandle;
const base = { nodes, handle, projectSlugs: ['store'], nativeRootPath: '/repo/docs/ontology', reloadToken: 1, enabled: true };
const rows = (path: string, codeDate: string) => [
  { path: 'capabilities/pay.md', exists: true, isDir: false, lastChangedAt: '2026-01-02T00:00:00Z' },
  { path, exists: true, isDir: false, lastChangedAt: codeDate },
];

beforeEach(() => {
  vi.clearAllMocks();
  mock.read.mockResolvedValue({ status: 'ok', bindings: [{ projectSlug: 'store', rootPath: '/repo' }] });
  mock.status.mockResolvedValue({ repoRoot: '/repo' });
});

describe('ontology evidence scope', () => {
  it('leaves evidence unknown when the bound source is outside the vault Git repository', async () => {
    mock.read.mockResolvedValue({ status: 'ok', bindings: [{ projectSlug: 'store', rootPath: '/other-repo' }] });
    const docs = [document('src/pay.ts')];
    const { result } = renderHook(() => useOntologyEvidence({ ...base, docs }));
    await waitFor(() => expect(result.current.status).toBe('different-source'));
    expect(result.current.evidence).toBeNull();
    expect(mock.walk).not.toHaveBeenCalled();
  });

  it.each([
    ['malformed', { status: 'malformed' }, 'unreadable'],
    ['unavailable', { status: 'unavailable' }, 'unreadable'],
    ['unbound', { status: 'ok', bindings: [] }, 'no-source'],
    ['ambiguous', { status: 'ok', bindings: [{ projectSlug: 'store', rootPath: '/repo' }, { projectSlug: 'store', rootPath: '/other' }] }, 'ambiguous-source'],
  ])('does not inspect source when the binding is %s', async (_name, binding, status) => {
    mock.read.mockResolvedValue(binding);
    const docs = [document('src/pay.ts')];
    const { result } = renderHook(() => useOntologyEvidence({ ...base, docs }));
    await waitFor(() => expect(result.current.status).toBe(status));
    expect(result.current.evidence).toBeNull();
    expect(mock.walk).not.toHaveBeenCalled();
  });

  it('retires a delayed inspection when the same slug changes its source paths in the same vault load', async () => {
    let resolveOld!: (value: ReturnType<typeof rows>) => void;
    mock.walk.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValueOnce(rows('src/new.ts', '2026-01-03T00:00:00Z'));
    const firstDocs = [document('src/old.ts')], nextDocs = [document('src/new.ts')];
    const { result, rerender } = renderHook(({ docs }) => useOntologyEvidence({ ...base, docs }), { initialProps: { docs: firstDocs } });
    await waitFor(() => expect(mock.walk).toHaveBeenCalledTimes(1));
    rerender({ docs: nextDocs });
    expect(result.current.evidence).toBeNull();
    await waitFor(() => expect(result.current.evidence?.stale.has('pay')).toBe(true));
    await act(async () => resolveOld(rows('src/old.ts', '2026-01-01T00:00:00Z')));
    expect(result.current.evidence?.stale.has('pay')).toBe(true);
    expect(result.current.evidence?.current.has('pay')).toBe(false);
  });
});
