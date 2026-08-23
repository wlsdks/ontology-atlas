import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mode: 'local',
  status: 'loaded',
  handle: null as FileSystemDirectoryHandle | null,
  sampleSource: 'dogfood',
}));

vi.mock('@/features/data-source-mode', () => ({
  useDataSourceMode: () => mocks.mode,
}));

vi.mock('@/features/docs-vault-local', () => ({
  useLocalVault: () => ({ status: mocks.status, handle: mocks.handle }),
}));

vi.mock('@/features/vault-sample-source', () => ({
  useSampleSource: () => [mocks.sampleSource],
}));

import {
  useVaultIdentityScope,
  useVaultSessionIdentityScope,
} from './use-vault-identity-scope';

function handle(name: string): FileSystemDirectoryHandle {
  return { kind: 'directory', name } as FileSystemDirectoryHandle;
}

describe('useVaultIdentityScope', () => {
  it('keeps the persisted scope stable for different handles with the same folder name', () => {
    mocks.handle = handle('ontology');
    const { result, rerender } = renderHook(() => useVaultIdentityScope());
    expect(result.current).toBe('local:ontology');

    mocks.handle = handle('ontology');
    rerender();
    expect(result.current).toBe('local:ontology');
  });

  it('distinguishes same-name handles for transient session state', () => {
    const firstHandle = handle('ontology');
    const secondHandle = handle('ontology');
    mocks.handle = firstHandle;
    const { result, rerender } = renderHook(() => useVaultSessionIdentityScope());
    const firstIdentity = result.current;

    rerender();
    expect(result.current).toBe(firstIdentity);

    mocks.handle = secondHandle;
    rerender();
    expect(result.current).not.toBe(firstIdentity);
    expect(firstIdentity).toMatch(/^local:ontology#\d+$/);
    expect(result.current).toMatch(/^local:ontology#\d+$/);
  });
});
