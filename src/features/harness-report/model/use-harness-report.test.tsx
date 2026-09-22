import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  scan: vi.fn(),
}));

vi.mock('@/shared/lib/project-source-store', () => ({
  createVaultFileProjectSourceStore: (handle: FileSystemDirectoryHandle) => ({
    list: (slug: string) => mocks.list(handle, slug),
  }),
}));

vi.mock('@/shared/lib/tauri-vault-fs', () => ({
  getTauriVaultRootPath: (handle: { root?: string } | null) => handle?.root ?? null,
  listTauriVaultEntries: vi.fn(),
  readTauriVaultTextFile: vi.fn(),
}));

vi.mock('@/entities/agent-files', () => ({ scanHarness: mocks.scan }));

import { useHarnessReport } from './use-harness-report';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function handle(root: string): FileSystemDirectoryHandle {
  return { root } as unknown as FileSystemDirectoryHandle;
}

const binding = (rootPath: string) => ({ status: 'ok', bindings: [{ rootPath }] });

describe('useHarnessReport request identity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders reading immediately for a supported request while its source binding resolves', () => {
    mocks.list.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useHarnessReport(handle('/vault'), ['project'], true, []));
    expect(result.current).toEqual({ status: 'loading', sourceRoot: '', progress: null });
  });

  it('hides a ready result immediately when scope or reload identity changes', async () => {
    mocks.list.mockResolvedValue(binding('/repo'));
    mocks.scan.mockResolvedValue({ files: [] });
    const source = handle('/vault');
    const { result, rerender } = renderHook(
      ({ paths, reload }) => useHarnessReport(source, ['project'], true, paths, reload),
      { initialProps: { paths: ['src/a'], reload: 0 } },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));

    rerender({ paths: ['src/b'], reload: 0 });
    expect(result.current.status).toBe('loading');
    rerender({ paths: ['src/b'], reload: 1 });
    expect(result.current.status).toBe('loading');
  });

  it('does not commit a source resolution from the previous handle', async () => {
    const oldBinding = deferred<ReturnType<typeof binding>>();
    mocks.list.mockImplementation((current: FileSystemDirectoryHandle) =>
      (current as unknown as { root: string }).root === '/old'
        ? oldBinding.promise
        : Promise.resolve(binding('/new-repo')),
    );
    mocks.scan.mockResolvedValue({ files: [] });
    const oldHandle = handle('/old');
    const newHandle = handle('/new');
    const { result, rerender } = renderHook(
      ({ current }) => useHarnessReport(current, ['project'], true, []),
      { initialProps: { current: oldHandle } },
    );
    rerender({ current: newHandle });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.status === 'ready' && result.current.sourceRoot).toBe('/new-repo');

    await act(async () => oldBinding.resolve(binding('/old-repo')));
    expect(result.current.status === 'ready' && result.current.sourceRoot).toBe('/new-repo');
  });

  it('keeps disabled and browser requests unsupported', () => {
    const native = handle('/vault');
    expect(renderHook(() => useHarnessReport(native, [], false, [])).result.current.status).toBe('unsupported');
    expect(renderHook(() => useHarnessReport(null, [], true, [])).result.current.status).toBe('unsupported');
  });
});
