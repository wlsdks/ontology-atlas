import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PINNED_DOCS_STORAGE_PREFIX } from '@/widgets/docs-vault';

import { useDocsVaultPersistence } from './use-docs-vault-persistence';

function folder(name: string): FileSystemDirectoryHandle {
  return { name } as FileSystemDirectoryHandle;
}

afterEach(() => window.localStorage.clear());

describe('useDocsVaultPersistence', () => {
  it('draws the pinned documents on its first render, so the tree under them never drops', () => {
    window.localStorage.setItem(`${PINNED_DOCS_STORAGE_PREFIX}local:vault`, JSON.stringify(['domains/orders', 'capabilities/checkout']));
    const { result } = renderHook(() => useDocsVaultPersistence({ source: 'local', localVault: { handle: folder('vault') } }));
    expect(result.current.pinnedSlugs).toEqual(['domains/orders', 'capabilities/checkout']);
  });

  it('reads the other folder once the open folder changes', async () => {
    window.localStorage.setItem(`${PINNED_DOCS_STORAGE_PREFIX}local:second`, JSON.stringify(['domains/catalog']));
    const { result, rerender } = renderHook(
      ({ name }) => useDocsVaultPersistence({ source: 'local', localVault: { handle: folder(name) } }),
      { initialProps: { name: 'first' } },
    );
    expect(result.current.pinnedSlugs).toEqual([]);
    rerender({ name: 'second' });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.pinnedSlugs).toEqual(['domains/catalog']);
  });
});
