import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { VaultManifest } from '@/entities/docs-vault';

const mocks = vi.hoisted(() => ({
  vault: {
    status: 'loading',
    manifest: null as VaultManifest | null,
    partialManifest: null as VaultManifest | null,
    isReloadingSameVault: false,
    restoreAttempted: true,
  },
}));

vi.mock('next-intl', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next-intl')>()),
  useLocale: () => 'en',
}));
vi.mock('@/entities/vault-session/model/use-sample-source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/use-sample-source')>()),
  useSampleSource: () => ['dogfood'],
}));
vi.mock('@/entities/vault-session/model/LocalVaultProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/LocalVaultProvider')>()),
  useLocalVault: () => mocks.vault,
}));

import { useArrivingOntologyInsight, useOntologyInsight } from './use-ontology-insight';
import { useVaultOntology } from './use-vault-ontology';

const manifest = {
  version: '1',
  generatedAt: '2026-10-02T00:00:00.000Z',
  docs: [
    {
      path: 'domains/arriving-only.md',
      slug: 'domains/arriving-only',
      title: 'Arriving only',
      tags: [],
      frontmatter: { kind: 'domain', title: 'Arriving only' },
      headings: [],
      excerpt: '',
      wordCount: 0,
      updatedAt: '2026-10-02T00:00:00.000Z',
      linksOut: [],
    },
  ],
  backlinksDetail: {},
  tags: {},
  tree: { name: 'root', path: '', type: 'dir', children: [] },
} as unknown as VaultManifest;

const holds = (nodes: ReadonlyArray<{ id: string }> | undefined) =>
  Boolean(nodes?.some((node) => node.id === 'domain:arriving-only'));

describe('a folder that is still arriving', () => {
  it('reaches only the map: insights and every other reader wait for the whole folder', () => {
    mocks.vault = { ...mocks.vault, status: 'loading', manifest: null, partialManifest: manifest };
    const arriving = renderHook(() => ({
      map: useArrivingOntologyInsight(),
      insights: useOntologyInsight().insight,
      ontology: useVaultOntology(),
    }));

    expect(holds(arriving.result.current.map?.nodes)).toBe(true);
    expect(holds(arriving.result.current.insights?.nodes)).toBe(false);
    expect(arriving.result.current.ontology.nodes).toEqual([]);

    mocks.vault = { ...mocks.vault, status: 'loaded', manifest, partialManifest: null };
    arriving.rerender();
    expect(arriving.result.current.map).toBeNull();
    expect(holds(arriving.result.current.insights?.nodes)).toBe(true);
  });
});
