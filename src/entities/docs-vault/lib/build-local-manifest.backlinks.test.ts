import { describe, expect, it } from 'vitest';
import { buildLocalManifest } from './build-local-manifest';

/**
 * D-1 — the doc reader's backlink strip showed a FALSE "no backlinks" for docs
 * referenced only through frontmatter relation keys (`dependencies`,
 * `relates`, `describes`, …). The backlink index used to scan BODY markdown
 * links ONLY, so `capabilities/mcp-server` — referenced by 13 docs via
 * frontmatter — read as unreferenced. These tests lock in that frontmatter
 * relation refs now contribute to `backlinksDetail`, matching the graph's
 * `find_backlinks` semantics.
 */

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

    const backlinks = manifest.manifest.backlinksDetail['capabilities/mcp-server'] ?? [];
    const fromSlugs = backlinks.map((b) => b.fromSlug).sort();
    expect(fromSlugs).toEqual([
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
    // `mcp/src/index.js` is a source-file ref, not a doc — no backlink target.
    expect(manifest.manifest.backlinksDetail['mcp/src/index.js']).toBeUndefined();
    expect(Object.keys(manifest.manifest.backlinksDetail)).not.toContain('mcp/src/index.js');
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
    const backlinks = manifest.manifest.backlinksDetail['domains/ai-agent-partner'] ?? [];
    expect(backlinks.map((b) => b.fromSlug)).toContain('capabilities/mcp-server');
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
    expect(manifest.manifest.backlinksDetail['capabilities/self']).toBeUndefined();
  });

  it('keeps the richer BODY-link context when a doc references a target through both body and frontmatter', async () => {
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
    const backlinks = manifest.manifest.backlinksDetail['capabilities/mcp-server'] ?? [];
    // one entry per fromSlug (deduped), and it's the body-link one (richer context)
    const fromCli = backlinks.filter((b) => b.fromSlug === 'capabilities/cli-entry');
    expect(fromCli).toHaveLength(1);
    expect(fromCli[0].context).not.toContain('frontmatter ·');
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
