import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VaultDoc } from '@/entities/docs-vault';
import type { BoundEvidenceDates } from '@/shared/lib/tauri-git';
import { useOntologyEvidence } from './use-ontology-evidence';

const mock = vi.hoisted(() => ({ read: vi.fn(), walk: vi.fn(), picker: vi.fn(), available: true }));
vi.mock('@/shared/lib/project-source-store', () => ({ createVaultFileProjectSourceStore: () => ({ read: mock.read }) }));
vi.mock('@/shared/lib/tauri-git', () => ({ isGitBridgeAvailable: () => mock.available, gitBoundEvidenceDates: mock.walk }));
vi.mock('@/shared/lib/tauri-vault-fs', () => ({ pickTauriSourceDirectory: mock.picker }));
const document = (path: string) => ({ slug: 'capabilities/pay', frontmatter: { path } }) as unknown as VaultDoc;
const nodes = [{ id: 'pay', docSlug: 'capabilities/pay' }];
const handle = { name: 'ontology' } as FileSystemDirectoryHandle;
const base = { nodes, handle, projectSlugs: ['store'], nativeRootPath: '/repo/docs/ontology', reloadToken: 1, enabled: true };
const rows = (path: string, codeDate: string): BoundEvidenceDates => ({
  status: 'measured', omittedVaultPaths: [], omittedSourcePaths: [],
  vaultChanges: [{ path: 'capabilities/pay.md', exists: true, isDir: false, dirty: false, lastChangedAt: '2026-01-02T00:00:00Z' }],
  sourceChanges: [{ path, exists: true, isDir: false, dirty: false, lastChangedAt: codeDate }],
});
const unavailable = (status: BoundEvidenceDates['status']): BoundEvidenceDates => ({ status, vaultChanges: [], sourceChanges: [], omittedVaultPaths: [], omittedSourcePaths: [] });

beforeEach(() => {
  vi.resetAllMocks(); mock.available = true;
  mock.read.mockResolvedValue({ status: 'ok', bindings: [{ projectSlug: 'store', rootPath: '/other-repo' }] });
  mock.walk.mockResolvedValue(rows('src/pay.ts', '2026-01-01T00:00:00Z'));
});

describe('ontology evidence scope', () => {
  it('compares a bound separate source through the native binding authority', async () => {
    const docs = [document('src/pay.ts')];
    const { result } = renderHook(() => useOntologyEvidence({ ...base, docs }));
    await waitFor(() => expect(result.current.status).toBe('measured'));
    expect(result.current.evidence?.current.has('pay')).toBe(true);
    expect(mock.walk).toHaveBeenCalledWith(base.nativeRootPath, 'store', ['capabilities/pay.md'], ['src/pay.ts'], undefined);
    expect(result.current.changes?.has('src/pay.ts')).toBe(false);
  });

  it.each([
    ['malformed', { status: 'malformed' }, 'unreadable'],
    ['unavailable', { status: 'unavailable' }, 'unreadable'],
    ['unbound', { status: 'ok', bindings: [] }, 'no-source'],
    ['ambiguous', { status: 'ok', bindings: [{ projectSlug: 'store', rootPath: '/repo' }, { projectSlug: 'store', rootPath: '/repo' }] }, 'ambiguous-source'],
  ])('does not inspect source when the binding is %s', async (_name, binding, status) => {
    mock.read.mockResolvedValue(binding);
    const docs = [document('src/pay.ts')];
    const { result } = renderHook(() => useOntologyEvidence({ ...base, docs }));
    await waitFor(() => expect(result.current.status).toBe(status));
    expect(result.current.evidence).toBeNull(); expect(mock.walk).not.toHaveBeenCalled();
  });

  it.each(['ungranted', 'binding-changed', 'no-history', 'unreadable'] as const)('keeps %s measurements unavailable', async status => {
    mock.walk.mockResolvedValue(unavailable(status));
    const docs = [document('src/pay.ts')];
    const { result } = renderHook(() => useOntologyEvidence({ ...base, docs }));
    await waitFor(() => expect(result.current.status).toBe(status));
    expect(result.current.evidence).toBeNull();
  });

  it('preserves selection on picker cancellation and validates a chosen folder natively', async () => {
    mock.walk.mockResolvedValueOnce(unavailable('ungranted')).mockResolvedValueOnce(unavailable('wrong-folder'))
      .mockResolvedValueOnce(rows('src/pay.ts', '2026-01-01T00:00:00Z'));
    const docs = [document('src/pay.ts')];
    const { result } = renderHook(() => useOntologyEvidence({ ...base, docs }));
    await waitFor(() => expect(result.current.status).toBe('ungranted'));
    mock.picker.mockResolvedValueOnce(null).mockResolvedValueOnce('/wrong').mockResolvedValueOnce('/other-repo');
    await act(() => result.current.chooseSourceFolder('Choose folder'));
    expect(result.current.status).toBe('ungranted'); expect(mock.walk).toHaveBeenCalledTimes(1);
    await act(() => result.current.chooseSourceFolder('Choose folder'));
    await waitFor(() => expect(result.current.status).toBe('wrong-folder'));
    expect(mock.walk.mock.lastCall?.[4]).toBe('/wrong');
    await act(() => result.current.chooseSourceFolder('Choose folder'));
    await waitFor(() => expect(result.current.evidence?.current.has('pay')).toBe(true));
    expect(mock.walk.mock.lastCall?.[4]).toBe('/other-repo');
  });

  it('retires delayed responses when document paths change', async () => {
    let resolveOld!: (value: BoundEvidenceDates) => void;
    mock.walk.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValueOnce(rows('src/new.ts', '2026-01-03T00:00:00Z'));
    const firstDocs = [document('src/old.ts')], nextDocs = [document('src/new.ts')];
    const { result, rerender } = renderHook(({ docs }) => useOntologyEvidence({ ...base, docs }), { initialProps: { docs: firstDocs } });
    await waitFor(() => expect(mock.walk).toHaveBeenCalledTimes(1));
    rerender({ docs: nextDocs }); expect(result.current.evidence).toBeNull();
    await waitFor(() => expect(result.current.evidence?.stale.has('pay')).toBe(true));
    await act(async () => resolveOld(rows('src/old.ts', '2026-01-01T00:00:00Z')));
    expect(result.current.evidence?.stale.has('pay')).toBe(true);
    expect(result.current.evidence?.current.has('pay')).toBe(false);
  });

  it.each(['project', 'vault'] as const)('retires delayed replies when only the %s scope changes', async changed => {
    let finish!: (value: BoundEvidenceDates) => void;
    mock.walk.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValueOnce(rows('src/pay.ts', '2026-01-03T00:00:00Z'));
    const docs = [document('src/pay.ts')];
    const initialProps = { projectSlugs: ['store'], nativeRootPath: base.nativeRootPath };
    const { result, rerender } = renderHook(props => useOntologyEvidence({ ...base, ...props, docs }), { initialProps });
    await waitFor(() => expect(mock.walk).toHaveBeenCalledTimes(1));
    const projectSlugs = changed === 'project' ? ['other'] : ['store'];
    mock.read.mockResolvedValue({ status: 'ok', bindings: [{ projectSlug: projectSlugs[0], rootPath: '/other-repo' }] });
    rerender({ projectSlugs, nativeRootPath: changed === 'vault' ? '/next-vault' : base.nativeRootPath });
    expect(result.current.evidence).toBeNull();
    await waitFor(() => expect(result.current.evidence?.stale.has('pay')).toBe(true));
    await act(async () => finish(rows('src/pay.ts', '2026-01-01T00:00:00Z')));
    expect(result.current.evidence?.stale.has('pay')).toBe(true);
    expect(result.current.evidence?.current.has('pay')).toBe(false);
  });

  it('discards a reply if the source binding changes while delivery is pending', async () => {
    let finish!: (value: BoundEvidenceDates) => void;
    mock.walk.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const docs = [document('src/pay.ts')];
    const { result } = renderHook(() => useOntologyEvidence({ ...base, docs }));
    await waitFor(() => expect(mock.walk).toHaveBeenCalledTimes(1));
    mock.read.mockResolvedValue({ status: 'ok', bindings: [{ projectSlug: 'store', rootPath: '/replacement' }] });
    await act(async () => finish(rows('src/pay.ts', '2026-01-01T00:00:00Z')));
    await waitFor(() => expect(result.current.status).toBe('binding-changed'));
    expect(result.current.evidence).toBeNull();
  });

  it('does not read dates on web, without anchors or with multiple project scopes', async () => {
    const docs = [document('')];
    const { result, rerender } = renderHook(({ projects }) => useOntologyEvidence({ ...base, docs, projectSlugs: projects }), { initialProps: { projects: ['store'] } });
    await waitFor(() => expect(result.current.status).toBe('no-anchors'));
    rerender({ projects: ['store', 'other'] });
    await waitFor(() => expect(result.current.status).toBe('ambiguous-source'));
    mock.available = false; rerender({ projects: ['store'] });
    expect(result.current.status).toBe('app-only'); expect(mock.walk).not.toHaveBeenCalled();
  });

  it('retries a stable scope and leaves omitted source paths unknown', async () => {
    mock.walk.mockResolvedValueOnce(unavailable('binding-changed')).mockResolvedValueOnce({ ...rows('src/pay.ts', '2026-01-01T00:00:00Z'), status: 'partial', sourceChanges: [], omittedSourcePaths: ['src/pay.ts'] });
    const docs = [document('src/pay.ts')];
    const { result } = renderHook(() => useOntologyEvidence({ ...base, docs }));
    await waitFor(() => expect(result.current.status).toBe('binding-changed'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('partial'));
    expect(result.current.evidence?.unknown.has('pay')).toBe(true);
  });
});
