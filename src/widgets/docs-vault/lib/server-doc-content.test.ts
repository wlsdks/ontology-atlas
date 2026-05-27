import { describe, expect, it, vi } from 'vitest';
import {
  buildDocsVaultAssetCandidates,
  fetchServerDocContent,
} from './server-doc-content';

describe('buildDocsVaultAssetCandidates', () => {
  it('includes root and relative static-export candidates for locale docs routes', () => {
    expect(
      buildDocsVaultAssetCandidates(
        'ontology/capabilities/desktop-app-distribution',
        'asset://localhost/ko/docs/?intent=local',
      ),
    ).toEqual([
      '/docs-vault/ontology/capabilities/desktop-app-distribution.md',
      'asset://localhost/docs-vault/ontology/capabilities/desktop-app-distribution.md',
      'asset://localhost/ko/docs/docs-vault/ontology/capabilities/desktop-app-distribution.md',
      'asset://localhost/ko/docs-vault/ontology/capabilities/desktop-app-distribution.md',
      'asset://localhost/docs-vault/ontology/capabilities/desktop-app-distribution.md',
      'asset://localhost/docs-vault/ontology/capabilities/desktop-app-distribution.md',
    ].filter((value, index, array) => array.indexOf(value) === index));
  });

  it('encodes path segments without flattening nested slugs', () => {
    expect(buildDocsVaultAssetCandidates('foo bar/baz#qux')[0]).toBe(
      '/docs-vault/foo%20bar/baz%23qux.md',
    );
  });
});

describe('fetchServerDocContent', () => {
  it('uses bundled markdown before trying runtime fetch candidates', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      fetchServerDocContent('archive/DATA-MODEL', {
        bundledContent: {
          'archive/DATA-MODEL': '# Data Model',
        },
        fetchImpl,
      }),
    ).resolves.toBe('# Data Model');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('falls back after a failed absolute URL candidate', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('missing', { status: 404 }))
      .mockResolvedValueOnce(new Response('# README', { status: 200 }));

    await expect(
      fetchServerDocContent('README', {
        locationHref: 'asset://localhost/ko/docs/?intent=local',
        fetchImpl,
      }),
    ).resolves.toBe('# README');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
