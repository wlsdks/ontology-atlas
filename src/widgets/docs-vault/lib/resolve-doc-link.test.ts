import { describe, expect, it } from 'vitest';
import {
  resolveDocLink,
  githubBlobUrl,
} from './resolve-doc-link';

const vault = new Set(['README', 'ontology/project', 'ontology/README', 'guides/setup']);

describe('resolveDocLink', () => {
  it('resolves a relative link inside the vault to an internal route', () => {
    expect(
      resolveDocLink({
        href: './README.md',
        fromSlug: 'ontology/project',
        vaultSlugs: vault,
      }),
    ).toEqual({ kind: 'internal', slug: 'ontology/README', anchor: undefined });
    // Anchor preserved
    expect(
      resolveDocLink({
        href: '../guides/setup.md#install',
        fromSlug: 'ontology/project',
        vaultSlugs: vault,
      }),
    ).toEqual({ kind: 'internal', slug: 'guides/setup', anchor: 'install' });
  });

  it('passes through absolute URLs, anchor-only links and non-md links', () => {
    expect(
      resolveDocLink({
        href: 'https://example.com/x.md',
        fromSlug: 'README',
        vaultSlugs: vault,
      }),
    ).toEqual({ kind: 'passthrough' });
    expect(
      resolveDocLink({
        href: '#section',
        fromSlug: 'README',
        vaultSlugs: vault,
      }),
    ).toEqual({ kind: 'passthrough' });
    expect(
      resolveDocLink({
        href: '../assets/logo.png',
        fromSlug: 'README',
        vaultSlugs: vault,
      }),
    ).toEqual({ kind: 'passthrough' });
  });

  it('marks a link that leaves the vault, and a link to an unknown slug, unresolved', () => {
    expect(
      resolveDocLink({
        href: '../mcp/README.md',
        fromSlug: 'README',
        vaultSlugs: vault,
      }),
    ).toEqual({ kind: 'unresolved' });
    // Internal but unknown slugs are also unresolved locally
    expect(
      resolveDocLink({
        href: './missing-doc.md',
        fromSlug: 'README',
        vaultSlugs: vault,
      }),
    ).toEqual({ kind: 'unresolved' });
  });
});

describe('githubBlobUrl', () => {
  it('turns a repo-relative path into a blob URL', () => {
    expect(githubBlobUrl('mcp/README.md')).toBe(
      'https://github.com/wlsdks/ontology-atlas/blob/main/mcp/README.md',
    );
    expect(githubBlobUrl('/mcp/README.md')).toBe(
      'https://github.com/wlsdks/ontology-atlas/blob/main/mcp/README.md',
    );
  });
});
