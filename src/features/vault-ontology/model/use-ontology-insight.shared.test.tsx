import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { VaultManifest } from '@/entities/docs-vault';

const mocks = vi.hoisted(() => ({
  locale: 'en',
  vault: {
    status: 'loaded',
    manifest: null as VaultManifest | null,
    isReloadingSameVault: false,
  },
}));

vi.mock('next-intl', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next-intl')>()),
  useLocale: () => mocks.locale,
}));
vi.mock('@/entities/vault-session/model/use-data-source-mode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/use-data-source-mode')>()),
  useDataSourceMode: () => 'local',
}));
vi.mock('@/entities/vault-session/model/use-sample-source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/use-sample-source')>()),
  useSampleSource: () => ['dogfood'],
}));
vi.mock('@/entities/vault-session/model/LocalVaultProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/LocalVaultProvider')>()),
  useLocalVault: () => mocks.vault,
}));

import { useOntologyInsight } from './use-ontology-insight';

function manifest(): VaultManifest {
  return {
    version: '1',
    generatedAt: '2026-09-27T00:00:00.000Z',
    docs: [
      {
        path: 'domains/payment.md',
        slug: 'domains/payment',
        title: '결제',
        tags: [],
        frontmatter: { kind: 'domain', title: '결제', display_en: 'Payments' },
        headings: [],
        excerpt: '',
        wordCount: 0,
        updatedAt: '2026-09-27T00:00:00.000Z',
        linksOut: [],
      },
    ],
    backlinksDetail: {},
    tags: {},
    tree: { name: 'root', path: '', type: 'dir', children: [] },
  } as unknown as VaultManifest;
}

const display = (insight: ReturnType<typeof useOntologyInsight>['insight']) =>
  insight?.nodes.find((node) => node.id === 'domain:payment')?.display;

describe('useOntologyInsight on a local vault', () => {
  it('gives every consumer of one vault and locale the same insight', () => {
    mocks.locale = 'en';
    mocks.vault.manifest = manifest();
    const first = renderHook(() => useOntologyInsight());
    const second = renderHook(() => useOntologyInsight());
    expect(second.result.current.insight).toBe(first.result.current.insight);
  });

  it('maps each locale on its own', () => {
    mocks.vault.manifest = manifest();
    mocks.locale = 'en';
    const en = renderHook(() => useOntologyInsight()).result.current.insight;
    mocks.locale = 'ko';
    const ko = renderHook(() => useOntologyInsight()).result.current.insight;
    expect(ko).not.toBe(en);
    expect(display(en)).toBe('Payments');
    expect(display(ko)).toBe('결제');
  });

  it('maps a reloaded vault anew', () => {
    mocks.locale = 'en';
    mocks.vault.manifest = manifest();
    const before = renderHook(() => useOntologyInsight()).result.current.insight;
    mocks.vault.manifest = manifest();
    const after = renderHook(() => useOntologyInsight()).result.current.insight;
    expect(after).not.toBe(before);
    expect(display(after)).toBe('Payments');
  });
});
