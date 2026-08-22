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
  it('vault 내부 상대 링크 → internal (앱 라우팅)', () => {
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

  it('vault root 를 벗어나는 상대 링크 → external GitHub blob (회귀: mcp/README 404)', () => {
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

  it('중첩 문서에서 vault 를 벗어나는 링크도 repo 루트로 정규화', () => {
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

  it('절대 URL / 앵커 only / 비-md → passthrough (기존 동작 유지)', () => {
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

  it('repoBlobBase 없음(로컬 vault) + vault 외부 → unresolved (죽은 404 금지)', () => {
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

  it('내부지만 알 수 없는 slug + repo 정보 있음 → external (repo 에는 있을 수 있음)', () => {
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
  it('repo 상대 경로 → blob URL', () => {
    expect(githubBlobUrl('mcp/README.md')).toBe(
      'https://github.com/wlsdks/ontology-atlas/blob/main/mcp/README.md',
    );
    expect(githubBlobUrl('/mcp/README.md')).toBe(
      'https://github.com/wlsdks/ontology-atlas/blob/main/mcp/README.md',
    );
  });
});
