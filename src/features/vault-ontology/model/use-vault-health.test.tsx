import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { VaultDoc, VaultManifest } from '@/entities/docs-vault';

const mocks = vi.hoisted(() => ({
  vault: {
    status: 'loaded',
    manifest: null as VaultManifest | null,
    isReloadingSameVault: false,
  },
}));

vi.mock('@/entities/vault-session/model/use-data-source-mode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/use-data-source-mode')>()),
  useDataSourceMode: () => 'local',
}));
vi.mock('@/entities/vault-session/model/use-sample-source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/use-sample-source')>()),
  useSampleSource: () => ['dogfood'],
}));
vi.mock('@/entities/knowledge-graph', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/knowledge-graph')>();
  return { ...actual, computeVaultHealth: vi.fn(actual.computeVaultHealth) };
});
vi.mock('@/entities/vault-session/model/LocalVaultProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/LocalVaultProvider')>()),
  useLocalVault: () => mocks.vault,
}));

import { computeVaultHealth } from '@/entities/knowledge-graph';
import { useVaultHealth } from './use-vault-health';

function doc(slug: string, frontmatter: Record<string, unknown>): VaultDoc {
  return {
    path: `${slug}.md`,
    slug,
    title: slug,
    tags: [],
    frontmatter: { slug, title: slug, ...frontmatter },
    headings: [],
    excerpt: '',
    wordCount: 0,
    updatedAt: '2026-08-30T00:00:00.000Z',
    linksOut: [],
  };
}

function matureManifest(): VaultManifest {
  return {
    version: '1',
    generatedAt: '2026-08-30T00:00:00.000Z',
    docs: [
      doc('project', { kind: 'project', domains: ['domains/core'] }),
      doc('domains/core', {
        kind: 'domain',
        capabilities: [
          'capabilities/one',
          'capabilities/two',
          'capabilities/three',
          'capabilities/four',
        ],
      }),
      ...['one', 'two', 'three', 'four'].map((name) =>
        doc(`capabilities/${name}`, {
          kind: 'capability',
          domain: 'domains/core',
          path: `src/${name}`,
        }),
      ),
    ],
    backlinksDetail: {},
    tags: {},
    tree: { name: 'root', path: '', type: 'dir', children: [] },
  };
}

describe('useVaultHealth same-vault refresh continuity', () => {
  it('keeps current health while the same vault reloads, but never leaks it into another vault', () => {
    const manifest = matureManifest();
    mocks.vault = { status: 'loaded', manifest, isReloadingSameVault: false };
    const { result, rerender } = renderHook(() => useVaultHealth(true));
    expect(result.current?.summary.nodes).toBe(6);
    const loadedHealth = result.current;

    mocks.vault = { status: 'loading', manifest, isReloadingSameVault: true };
    rerender();
    expect(result.current).toBe(loadedHealth);

    mocks.vault = { status: 'loading', manifest, isReloadingSameVault: false };
    rerender();
    expect(result.current?.summary.nodes).toBe(0);
  });
});

describe('useVaultHealth while nothing shows it', () => {
  it('runs no health pass until its surface is shown, then exactly one', () => {
    mocks.vault = { status: 'loaded', manifest: matureManifest(), isReloadingSameVault: false };
    vi.mocked(computeVaultHealth).mockClear();
    const { result, rerender } = renderHook(({ shown }) => useVaultHealth(shown), {
      initialProps: { shown: false },
    });
    rerender({ shown: false });
    expect(result.current).toBeNull();
    expect(computeVaultHealth).toHaveBeenCalledTimes(0);

    rerender({ shown: true });
    rerender({ shown: true });
    expect(result.current?.summary.nodes).toBe(6);
    expect(computeVaultHealth).toHaveBeenCalledTimes(1);
  });
});
