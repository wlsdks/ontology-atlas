import { describe, expect, it } from 'vitest';

import {
  candidateKey,
  discoverCandidatesInHandle,
  discoveryAcceptsDirectory,
  discoveryAcceptsFile,
  discoveryExtension,
  type SourceCandidate,
} from './source-discovery';

/**
 * A minimal File System Access directory, built from a path → contents map. Only the two
 * members the walk touches are implemented, so a test that starts reading files would
 * fail rather than quietly pass.
 */
function fakeDirectory(files: Record<string, string>, name = 'vault'): FileSystemDirectoryHandle {
  const build = (prefix: string, dirName: string): FileSystemDirectoryHandle => {
    const children = new Map<string, FileSystemHandle>();
    const subdirectories = new Set<string>();
    for (const path of Object.keys(files)) {
      if (prefix && !path.startsWith(`${prefix}/`)) continue;
      const rest = prefix ? path.slice(prefix.length + 1) : path;
      const slash = rest.indexOf('/');
      if (slash < 0) {
        const body = files[path]!;
        children.set(rest, {
          kind: 'file',
          name: rest,
          getFile: async () => ({ size: body.length, lastModified: 1_757_000_000_000 }),
        } as unknown as FileSystemFileHandle);
      } else {
        subdirectories.add(rest.slice(0, slash));
      }
    }
    for (const child of subdirectories) {
      children.set(child, build(prefix ? `${prefix}/${child}` : child, child));
    }
    return {
      kind: 'directory',
      name: dirName,
      async *entries() {
        for (const entry of children) yield entry;
      },
    } as unknown as FileSystemDirectoryHandle;
  };
  return build('', name);
}

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

  it('walks past a planted secret and never lists it as a candidate', async () => {
    const report = await discoverCandidatesInHandle(
      fakeDirectory({
        'Requirements.pdf': 'a',
        '.env': 'SECRET=1',
        'id_rsa': 'key',
        'credentials.json': '{}',
        'config/credentials.csv': 'user,password',
        'node_modules/pkg/manual.pdf': 'x',
        'sources/already.pdf': 'x',
      }),
      { rootLabel: 'my folder', skipRelative: ['sources'] },
    );
    expect(report.candidates.map((candidate) => candidate.relativePath)).toEqual([
      'Requirements.pdf',
    ]);
  });
});

describe('discovery proposes ordinary project documents', () => {
  it.each(['Requirements.pdf', 'quarter plan.docx', 'numbers.xlsx', 'deck.pptx', 'notes.txt'])(
    'accepts %s',
    (name) => {
      expect(discoveryAcceptsFile(name)).toBe(true);
    },
  );

  it('refuses code and Markdown, which are not raw sources', () => {
    for (const name of ['index.ts', 'README.md', 'Cargo.toml', 'data.json']) {
      expect(discoveryAcceptsFile(name)).toBe(false);
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
