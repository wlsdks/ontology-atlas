import { describe, expect, it } from 'vitest';

import {
  DISCOVERY_MIN_FILE_BYTES,
  candidateKey,
  discoveryAcceptsDirectory,
  discoveryAcceptsFile,
  discoveryExtension,
  walkDroppedFolder,
  withoutVaultOwnedMarkdown,
  type DroppedEntry,
  type SourceCandidate,
} from './source-discovery';
import discoveryCases from '../../../../../tests/fixtures/source-discovery-cases.json';

describe('discovery never proposes what local-first forbids reading', () => {
  it.each([
    '.env',
    '.env.local',
    'id_rsa',
    'id_ed25519',
    'credentials.json',
    'credentials.csv',
    'server.pem',
    'api_key.txt',
    'client secrets.xlsx',
    'db_password.txt',
    'store.p12',
  ])('refuses %s', (name) => {
    expect(discoveryAcceptsFile(name)).toBe(false);
  });

  it('refuses every dotfile whatever its extension', () => {
    expect(discoveryAcceptsFile('.hidden-plan.pdf')).toBe(false);
  });
});

describe('discovery proposes ordinary project documents', () => {
  it.each(['Requirements.pdf', 'quarter plan.docx', 'numbers.xlsx', 'deck.pptx', 'notes.txt'])(
    'accepts %s',
    (name) => {
      expect(discoveryAcceptsFile(name)).toBe(true);
    },
  );

  it('refuses code and repository guides', () => {
    for (const name of ['index.ts', 'README.md', 'README.ko.md', 'CLAUDE.md', 'Cargo.toml', 'data.json', 'server.log']) {
      expect(discoveryAcceptsFile(name)).toBe(false);
    }
  });

  it('accepts notes and pages a person keeps', () => {
    for (const name of ['weekly.md', 'ideas.markdown', 'export.html', 'page.htm', 'table.tsv', 'security-review.md']) {
      expect(discoveryAcceptsFile(name)).toBe(true);
    }
  });

  it('reads the extension case-insensitively', () => {
    expect(discoveryExtension('Plan.PDF')).toBe('pdf');
    expect(discoveryExtension('LICENSE')).toBe('');
    expect(discoveryAcceptsFile('Plan.PDF')).toBe(true);
  });
});

describe('the walk skips dependency and build directories', () => {
  it.each(['node_modules', 'target', 'dist', 'build', 'out', 'coverage', '.git'])(
    'never descends into %s',
    (name) => {
      expect(discoveryAcceptsDirectory(name)).toBe(false);
    },
  );

  it('descends into ordinary folders', () => {
    expect(discoveryAcceptsDirectory('specs')).toBe(true);
  });
});

describe('the shared discovery table (tests/fixtures/source-discovery-cases.json)', () => {
  it.each(discoveryCases.directories)(
    'judges the folder $path the same with either separator',
    ({ path, descends }) => {
      expect(discoveryAcceptsDirectory(path)).toBe(descends);
    },
  );

  /** What the walk offers: every folder on the way accepted, the name accepted, and big enough. */
  const offeredByTheRules = (row: { path: string; bytes: number }) => {
    const parts = row.path.split('/');
    const foldersAccepted = parts
      .slice(0, -1)
      .every((_, at) => discoveryAcceptsDirectory(parts.slice(0, at + 1).join('/')));
    return foldersAccepted && discoveryAcceptsFile(parts[parts.length - 1]!) && row.bytes >= DISCOVERY_MIN_FILE_BYTES;
  };

  it('offers exactly the rows the table keeps', () => {
    for (const row of discoveryCases.files) {
      expect(offeredByTheRules(row), row.path).toBe(row.offered);
    }
  });

  it("offers none of the owner's three junk files", () => {
    for (const row of discoveryCases.ownerReport) {
      expect(offeredByTheRules(row), row.path).toBe(false);
    }
  });
});

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

describe('a dropped folder keeps documents and counts what it skipped', () => {
  function droppedFolder(name: string, files: Record<string, number>): DroppedEntry & { kind: 'directory' } {
    const build = (dirName: string, prefix: string): DroppedEntry & { kind: 'directory' } => ({
      kind: 'directory',
      name: dirName,
      async *children() {
        const seen = new Set<string>();
        for (const [path, size] of Object.entries(files)) {
          if (prefix && !path.startsWith(`${prefix}/`)) continue;
          const rest = prefix ? path.slice(prefix.length + 1) : path;
          const slash = rest.indexOf('/');
          if (slash < 0) {
            yield { kind: 'file', name: rest, getFile: async () => new File(['x'.repeat(size)], rest) };
          } else if (!seen.has(rest.slice(0, slash))) {
            const child = rest.slice(0, slash);
            seen.add(child);
            yield build(child, prefix ? `${prefix}/${child}` : child);
          }
        }
      },
    });
    return build(name, '');
  }

  it('copies the two documents and names the secret and licence files it passed over', async () => {
    const walk = await walkDroppedFolder(
      droppedFolder('contracts', {
        '.env': 200,
        id_rsa: 400,
        'LICENSE.txt': 900,
        'node_modules/x.md': 300,
        '.DS_Store': 300,
        'lease.pdf': 500,
        'notes/renewal.md': 300,
      }),
    );
    expect(walk.files.map((row) => row.relativePath).sort()).toEqual([
      'contracts/lease.pdf',
      'contracts/notes/renewal.md',
    ]);
    expect(walk.skipped.map((row) => [row.relativePath, row.reason]).sort()).toEqual([
      ['contracts/.env', 'secretName'],
      ['contracts/LICENSE.txt', 'licence'],
      ['contracts/id_rsa', 'secretName'],
    ]);
    expect(walk.totalBytes).toBe(800);
  });

  it('names a thousand skipped files and counts every one', async () => {
    const files = Object.fromEntries(Array.from({ length: 1_005 }, (_, index) => [`secret-${index}.txt`, 80]));
    const walk = await walkDroppedFolder(droppedFolder('keys', files));
    expect(walk.skipped).toHaveLength(1_000);
    expect(walk.skippedCounts.secretName).toBe(1_005);
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
