import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VaultDoc, VaultManifest } from '@/entities/docs-vault';

const mocks = vi.hoisted(() => ({
  vault: { status: 'loaded', manifest: null as VaultManifest | null },
}));

vi.mock('@/entities/vault-session/model/use-data-source-mode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/use-data-source-mode')>()),
  useDataSourceMode: () => 'local',
}));
vi.mock('@/entities/vault-session/model/LocalVaultProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/LocalVaultProvider')>()),
  useLocalVault: () => mocks.vault,
}));
vi.mock('@/shared/lib/vault-document/validate-vault-document', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/vault-document/validate-vault-document')>();
  return { ...actual, summarizeVaultValidation: vi.fn(actual.summarizeVaultValidation) };
});

import { summarizeVaultValidation } from '@/shared/lib/vault-document/validate-vault-document';
import { useVaultValidationSummary } from './use-vault-validation';

function doc(slug: string): VaultDoc {
  return {
    path: `${slug}.md`,
    slug,
    title: slug,
    tags: [],
    frontmatter: { kind: 'domain', title: slug },
    headings: [],
    excerpt: '',
    wordCount: 0,
    updatedAt: '2026-11-20T00:00:00.000Z',
    linksOut: [],
  };
}

function manifest(): VaultManifest {
  return {
    version: '1',
    generatedAt: '2026-11-20T00:00:00.000Z',
    docs: [doc('domains/a'), doc('domains/b')],
    backlinksDetail: {},
    tags: {},
    tree: { name: 'root', path: '', type: 'dir', children: [] },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useVaultValidationSummary on a newly loaded folder', () => {
  it('summarizes in the task after the opening render, once', () => {
    vi.useFakeTimers();
    mocks.vault = { status: 'loaded', manifest: manifest() };
    vi.mocked(summarizeVaultValidation).mockClear();
    const { result, rerender } = renderHook(() => useVaultValidationSummary());
    expect(summarizeVaultValidation).toHaveBeenCalledTimes(0);
    expect(result.current.total).toBe(0);

    act(() => {
      vi.runAllTimers();
    });
    rerender();
    expect(result.current.total).toBe(2);
    expect(summarizeVaultValidation).toHaveBeenCalledTimes(1);
  });
});
