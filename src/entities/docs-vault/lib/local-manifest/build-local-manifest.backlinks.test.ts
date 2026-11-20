import { describe, expect, it } from 'vitest';
import { buildLocalManifest } from './build-local-manifest';

/** Frontmatter relation refs count as backlinks, as `find_backlinks` counts them. */

interface FakeFile {
  text: string;
  lastModified: number;
}

function makeFileHandle(name: string, file: FakeFile): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    getFile: async () =>
      ({ text: async () => file.text, lastModified: file.lastModified }) as unknown as File,
  } as unknown as FileSystemFileHandle;
}

function makeRoot(files: Record<string, FakeFile>): FileSystemDirectoryHandle {
  const groups: Record<string, Record<string, FakeFile>> = {};
  for (const [path, file] of Object.entries(files)) {
    const parts = path.split('/');
    const dir = parts.slice(0, -1).join('/');
    const name = parts[parts.length - 1];
    if (!groups[dir]) groups[dir] = {};
    groups[dir][name] = file;
  }
  const buildHandle = (dirKey: string): FileSystemDirectoryHandle => {
    const myFiles = groups[dirKey] ?? {};
    const subDirs = new Set<string>();
    for (const k of Object.keys(groups)) {
      if (k === dirKey) continue;
      if (dirKey === '' && !k.includes('/')) subDirs.add(k);
      else if (dirKey !== '' && k.startsWith(dirKey + '/')) {
        const tail = k.slice(dirKey.length + 1);
        if (!tail.includes('/')) subDirs.add(k);
      }
    }
    return {
      kind: 'directory',
      name: dirKey || 'root',
      entries: async function* () {
        for (const [name, file] of Object.entries(myFiles)) {
          yield [name, makeFileHandle(name, file)] as const;
        }
        for (const sub of subDirs) {
          const subName = sub.includes('/') ? sub.slice(sub.lastIndexOf('/') + 1) : sub;
          yield [subName, buildHandle(sub)] as const;
        }
      },
    } as unknown as FileSystemDirectoryHandle;
  };
  return buildHandle('');
}

function md(frontmatter: string[], body = ''): FakeFile {
  return { text: ['---', ...frontmatter, '---', body].join('\n'), lastModified: 1000 };
}

describe('build-local-manifest — D-1 frontmatter relation backlinks', () => {
  it('counts folder-prefixed frontmatter refs (dependencies/relates/describes) as backlinks to the target doc', async () => {
    const manifest = await buildLocalManifest(
      makeRoot({
        'capabilities/mcp-server.md': md(['title: MCP Server', 'kind: capability']),
        'capabilities/cli-entry.md': md([
          'title: CLI Entry',
          'kind: capability',
          'dependencies: [capabilities/mcp-server, capabilities/vault-validator]',
        ]),
        'capabilities/agent-brief.md': md([
          'title: Agent Brief',
          'kind: capability',
          'relates: [capabilities/mcp-server]',
        ]),
        'documents/research.md': md([
          'title: Research',
          'kind: document',
          'describes: [capabilities/mcp-server]',
        ]),
      }),
    );

    expect(manifest.manifest.backlinkSources['capabilities/mcp-server']).toEqual([
      'capabilities/agent-brief',
      'capabilities/cli-entry',
      'documents/research',
    ]);
  });

  it('does NOT mint phantom backlinks for element/file-path refs that match no doc slug', async () => {
    const manifest = await buildLocalManifest(
      makeRoot({
        'capabilities/mcp-server.md': md([
          'title: MCP Server',
          'kind: capability',
          'elements: [mcp/src/index.js, mcp/src/vault.mjs]',
        ]),
      }),
    );
    // A source-file ref, not a doc.
    expect(Object.keys(manifest.manifest.backlinkSources)).not.toContain('mcp/src/index.js');
  });

  it('resolves a bare inline `domain:` ref to the domain doc by its unique tail', async () => {
    const manifest = await buildLocalManifest(
      makeRoot({
        'domains/ai-agent-partner.md': md(['title: AI Agent Partner', 'kind: domain']),
        'capabilities/mcp-server.md': md([
          'title: MCP Server',
          'kind: capability',
          'domain: ai-agent-partner',
        ]),
      }),
    );
    expect(manifest.manifest.backlinkSources['domains/ai-agent-partner']).toEqual(['capabilities/mcp-server']);
  });

  it('does not create a self-backlink when a doc references its own slug', async () => {
    const manifest = await buildLocalManifest(
      makeRoot({
        'capabilities/self.md': md([
          'title: Self',
          'kind: capability',
          'relates: [capabilities/self]',
        ]),
      }),
    );
    expect(manifest.manifest.backlinkSources['capabilities/self']).toBeUndefined();
  });

  it('lists a document once when it references a target through both its body and its frontmatter', async () => {
    const manifest = await buildLocalManifest(
      makeRoot({
        'capabilities/mcp-server.md': md(['title: MCP Server', 'kind: capability']),
        'capabilities/cli-entry.md': {
          text: [
            '---',
            'title: CLI Entry',
            'kind: capability',
            'dependencies: [capabilities/mcp-server]',
            '---',
            'See [[capabilities/mcp-server]] for the server.',
          ].join('\n'),
          lastModified: 1000,
        },
      }),
    );
    expect(manifest.manifest.backlinkSources['capabilities/mcp-server']).toEqual(['capabilities/cli-entry']);
  });

  it('lists, per target, every document that links to it or names it in a relation', async () => {
    const { manifest } = await buildLocalManifest(
      makeRoot({
        'capabilities/mcp-server.md': md(['title: MCP Server', 'kind: capability'], 'See [[capabilities/cli-entry]] and [self](mcp-server.md).'),
        'capabilities/cli-entry.md': md(
          ['title: CLI Entry', 'kind: capability', 'dependencies: [capabilities/mcp-server]'],
          'See [[capabilities/mcp-server]], [the doc](../documents/research.md#part) and [[missing/page]] twice: [[missing/page|again]].',
        ),
        'documents/research.md': md(['title: Research'], '[up](../capabilities/cli-entry.md) [web](https://x.test/a.md) [[wiki/budget]]'),
        'wiki/budget.md': md(['title: Budget'], '[[quarter]] [[src:sources/plan.pdf#p2]] [[budget]]'),
        'wiki/quarter.md': md(['title: Quarter', 'relates: [budget, wiki/budget]'], '[[budget|the budget]]'),
        'drafts/x.md': md(['title: X one']),
        'notes/x.md': md(['title: X two'], 'relates [[x]]'),
        'refs/tail.md': md(['title: Tail', 'relates: [x, research, quarter.md]']),
      }),
    );
    expect(manifest.backlinkSources).toEqual({
      'capabilities/cli-entry': ['capabilities/mcp-server', 'documents/research'],
      'capabilities/mcp-server': ['capabilities/cli-entry'],
      'documents/research': ['capabilities/cli-entry', 'refs/tail'],
      'missing/page': ['capabilities/cli-entry'],
      'wiki/budget': ['documents/research', 'wiki/quarter'],
      'wiki/quarter': ['refs/tail', 'wiki/budget'],
      x: ['notes/x'],
    });
  });
});

describe('build-local-manifest — persisted competency evidence', () => {
  it('derives exact project competency evidence without exposing arbitrary body paths', async () => {
    const manifest = await buildLocalManifest(
      makeRoot({
        'project.md': md(
          ['slug: project', 'title: Project', 'kind: project'],
          [
            'Mention src/ghost.ts in ordinary prose.',
            '',
            '## Competency answers',
            '',
            '### scope — answered',
            '',
            'Question',
            '',
            'Answer',
            '',
            '- Evidence: `README.md`',
            '- Paths: `src/entry.ts`',
          ].join('\n'),
        ),
      }),
    );

    expect(manifest.manifest.docs[0].meaningEvidencePaths).toEqual([
      'README.md',
      'src/entry.ts',
    ]);
    expect(manifest.manifest.docs[0].meaningEvidencePaths).not.toContain('src/ghost.ts');
  });
});
