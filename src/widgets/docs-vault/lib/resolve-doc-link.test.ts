import { describe, expect, it } from 'vitest';
import {
  resolveDocLink,
  githubBlobUrl,
  ONTOLOGY_ATLAS_REPO_BLOB_BASE,
  DOCS_VAULT_REPO_ROOT,
} from './resolve-doc-link';

const vault = new Set(['README', 'ontology/project', 'ontology/README', 'guides/setup']);

const serverCfg = {
  repoBlobBase: ONTOLOGY_ATLAS_REPO_BLOB_BASE,
  vaultRepoRoot: DOCS_VAULT_REPO_ROOT,
};

describe('resolveDocLink', () => {
  it('resolves a relative link inside the vault to an internal route', () => {
    expect(
      resolveDocLink({
        href: './README.md',
        fromSlug: 'ontology/project',
        vaultSlugs: vault,
        ...serverCfg,
      }),
    ).toEqual({ kind: 'internal', slug: 'ontology/README', anchor: undefined });
    // Anchor preserved
    expect(
      resolveDocLink({
        href: '../guides/setup.md#install',
        fromSlug: 'ontology/project',
        vaultSlugs: vault,
        ...serverCfg,
      }),
    ).toEqual({ kind: 'internal', slug: 'guides/setup', anchor: 'install' });
  });

  it('sends a relative link that leaves the vault root to an external GitHub blob', () => {
    // `../mcp/README.md` in docs/README.md → mcp/README.md at the repo root
    expect(
      resolveDocLink({
        href: '../mcp/README.md',
        fromSlug: 'README',
        vaultSlugs: vault,
        ...serverCfg,
      }),
    ).toEqual({
      kind: 'external',
      url: 'https://github.com/wlsdks/ontology-atlas/blob/main/mcp/README.md',
    });
    // Anchors are kept on an external URL too
    expect(
      resolveDocLink({
        href: '../mcp/README.md#tools',
        fromSlug: 'README',
        vaultSlugs: vault,
        ...serverCfg,
      }),
    ).toEqual({
      kind: 'external',
      url: 'https://github.com/wlsdks/ontology-atlas/blob/main/mcp/README.md#tools',
    });
  });

  it('normalizes a vault-escaping link from a nested doc to the repo root', () => {
    // `../../cli/README.md` in docs/ontology/project.md → cli/README.md
    expect(
      resolveDocLink({
        href: '../../cli/README.md',
        fromSlug: 'ontology/project',
        vaultSlugs: vault,
        ...serverCfg,
      }),
    ).toEqual({
      kind: 'external',
      url: 'https://github.com/wlsdks/ontology-atlas/blob/main/cli/README.md',
    });
  });

  it('passes through absolute URLs, anchor-only links and non-md links', () => {
    expect(
      resolveDocLink({
        href: 'https://example.com/x.md',
        fromSlug: 'README',
        vaultSlugs: vault,
        ...serverCfg,
      }),
    ).toEqual({ kind: 'passthrough' });
    expect(
      resolveDocLink({
        href: '#section',
        fromSlug: 'README',
        vaultSlugs: vault,
        ...serverCfg,
      }),
    ).toEqual({ kind: 'passthrough' });
    expect(
      resolveDocLink({
        href: '../assets/logo.png',
        fromSlug: 'README',
        vaultSlugs: vault,
        ...serverCfg,
      }),
    ).toEqual({ kind: 'passthrough' });
  });

  it('marks a vault-external link unresolved when there is no repoBlobBase', () => {
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

  it('sends an unknown internal slug to external when repo info exists', () => {
    expect(
      resolveDocLink({
        href: './missing-doc.md',
        fromSlug: 'README',
        vaultSlugs: vault,
        ...serverCfg,
      }),
    ).toEqual({
      kind: 'external',
      url: 'https://github.com/wlsdks/ontology-atlas/blob/main/docs/missing-doc.md',
    });
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
