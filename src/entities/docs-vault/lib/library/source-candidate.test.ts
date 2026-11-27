import { describe, expect, it } from 'vitest';

import {
  candidateKey,
  discoveryExtension,
  withoutVaultOwnedMarkdown,
  type SourceCandidate,
} from './source-candidate';

describe('Markdown the vault owns is never offered', () => {
  const candidate = (rootPath: string, relativePath: string): SourceCandidate => {
    const name = relativePath.slice(relativePath.lastIndexOf('/') + 1);
    return { rootPath, rootLabel: 'x', relativePath, name, extension: discoveryExtension(name), size: 100, mtime: 1 };
  };

  it('keeps only open-folder Markdown the index holds without kind', () => {
    const kept = withoutVaultOwnedMarkdown(
      [
        candidate('/vault', 'meetings/weekly.md'),
        candidate('/vault', 'concepts/map.md'),
        candidate('/vault', 'unread/new.md'),
        candidate('/vault', 'notes/ideas.markdown'),
        candidate('/vault', 'contracts/lease.pdf'),
        candidate('/repo', 'docs/design.md'),
        candidate('/repo', 'docs/design.pdf'),
      ],
      {
        openRootPath: '/vault',
        docs: [
          { path: 'meetings/weekly.md', frontmatter: { title: 'Weekly' } },
          { path: 'concepts/map.md', frontmatter: { kind: 'capability' } },
        ],
      },
    );
    expect(kept.map((row) => `${row.rootPath}:${row.relativePath}`)).toEqual([
      '/vault:meetings/weekly.md',
      '/vault:notes/ideas.markdown',
      '/vault:contracts/lease.pdf',
      '/repo:docs/design.pdf',
    ]);
  });

});

describe('a candidate keeps a stable identity so a refusal can be remembered', () => {
  const candidate: SourceCandidate = {
    rootPath: '/Users/x/project',
    rootLabel: 'project',
    relativePath: 'docs/plan.pdf',
    name: 'plan.pdf',
    extension: 'pdf',
    size: 10,
    mtime: 1,
  };

  it('is the root plus the path inside it', () => {
    expect(candidateKey(candidate)).toBe('/Users/x/project\u0000docs/plan.pdf');
  });

  it('separates the same file name under two different roots', () => {
    expect(candidateKey({ ...candidate, rootPath: '/other' })).not.toBe(candidateKey(candidate));
  });
});
