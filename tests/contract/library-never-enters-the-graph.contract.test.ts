import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { buildLocalManifest } from '@/entities/docs-vault/lib/build-local-manifest';
import { deriveOntologyFromVault } from '@/entities/docs-vault/lib/derive-ontology-from-vault';
import { walkMd } from '../../mcp/src/vault.mjs';

/**
 * **A vault holds three kinds of file and only one is the graph** (`docs/DECISIONS.md`,
 * 2026-09-05).
 *
 * The library exists so a person can keep project documents of every format in the
 * folder they already opened. That is only safe while the graph stays exactly what it
 * was: files with a frontmatter `kind:`. Two things could break it, and neither would
 * announce itself — a graph full of PDF stubs is not an error, only a map nobody trusts.
 *
 * 1. **A raw source becoming a node.** `sources/plan.pdf` has no frontmatter to parse,
 *    so a parser reaching it would either fail or invent. Both walks — this repository's
 *    `buildLocalManifest` and the MCP server's `listMarkdownFiles` — must keep it out of
 *    the document list entirely rather than filter it later.
 * 2. **A wiki page becoming a node.** `wiki/quarter-plan.md` *is* Markdown, and the
 *    parser reads it like any other document. What keeps it out of the graph is the
 *    absence of `kind:`, which `deriveDocNode` requires. That is a real property of the
 *    data rather than a folder-name rule, and this gate holds it: a wiki page must
 *    contribute no node even while it carries `sources`, `source_hash` and `created_by`.
 *
 * The two are checked together because they fail together: the moment either becomes a
 * node, `find_path` and the map start answering with material nobody reviewed.
 */

const fixtureRoot = mkdtempSync(join(tmpdir(), 'atlas-library-graph-'));

mkdirSync(join(fixtureRoot, 'sources'), { recursive: true });
mkdirSync(join(fixtureRoot, 'wiki'), { recursive: true });
mkdirSync(join(fixtureRoot, 'capabilities'), { recursive: true });

// Bytes that are not Markdown and not text. The point is that nothing reads them.
writeFileSync(join(fixtureRoot, 'sources/plan.pdf'), Buffer.from('%PDF-1.7\n%âãÏÓ\n'));
writeFileSync(join(fixtureRoot, 'sources/budget.xlsx'), Buffer.from([0x50, 0x4b, 0x03, 0x04]));
// Markdown filed beside a raw source: still Markdown, so still a document, and still no
// `kind:`, so still not a node. Named apart from `plan.pdf` on purpose — a shadow called
// `plan.pdf.md` would carry the slug `sources/plan.pdf`, which is the raw file's own path.
writeFileSync(
  join(fixtureRoot, 'sources/plan-notes.md'),
  '---\norigin: sources/plan.pdf\n---\n\n# Plan notes\n',
);
writeFileSync(
  join(fixtureRoot, 'wiki/quarter-plan.md'),
  [
    '---',
    'created_by: agent:claude',
    'sources: [sources/plan.pdf]',
    'source_hash:',
    '  sources/plan.pdf: abc123',
    'compiled_at: 2026-09-05T10:00:00Z',
    'domains: [ai-agent-partner]',
    '---',
    '',
    '# Quarter plan',
    '',
    'The plan names three deliverables (sources/plan.pdf, p. 2).',
    '',
  ].join('\n'),
);
writeFileSync(
  join(fixtureRoot, 'capabilities/mcp-server.md'),
  '---\nkind: capability\ntitle: MCP server\n---\n\n# MCP server\n',
);

afterAll(() => rmSync(fixtureRoot, { recursive: true, force: true }));

/**
 * A File System Access directory over a real temporary folder. The same fixture then
 * goes through the MCP walker, which reads the filesystem directly — one folder, both
 * parsers, which is what makes the two answers comparable.
 */
function nodeDirectoryHandle(path: string, name: string): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name,
    async *entries() {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        const child = join(path, entry.name);
        if (entry.isDirectory()) {
          yield [entry.name, nodeDirectoryHandle(child, entry.name)];
        } else {
          yield [
            entry.name,
            {
              kind: 'file',
              name: entry.name,
              getFile: async () => {
                const stat = statSync(child);
                const body = readFileSync(child);
                return {
                  size: stat.size,
                  lastModified: stat.mtimeMs,
                  text: async () => body.toString('utf8'),
                };
              },
            } as unknown as FileSystemFileHandle,
          ];
        }
      }
    },
  } as unknown as FileSystemDirectoryHandle;
}

describe('the library never enters the graph', () => {
  it('the manifest keeps raw sources out of docs and in their own list', async () => {
    const build = await buildLocalManifest(nodeDirectoryHandle(fixtureRoot, 'fixture'));
    const slugs = build.manifest.docs.map((doc) => doc.slug);

    expect(slugs).not.toContain('sources/plan.pdf');
    expect(slugs).not.toContain('sources/budget.xlsx');
    expect(build.manifest.sources?.map((source) => source.path).sort()).toEqual([
      'sources/budget.xlsx',
      'sources/plan.pdf',
    ]);
    // Markdown beside a source is a document, because it is Markdown.
    expect(slugs).toContain('sources/plan-notes');
  });

  it('the manifest lists a raw source by metadata only', async () => {
    const build = await buildLocalManifest(nodeDirectoryHandle(fixtureRoot, 'fixture'));
    const plan = build.manifest.sources?.find((source) => source.path === 'sources/plan.pdf');
    expect(plan).toMatchObject({ name: 'plan.pdf', format: 'pdf' });
    expect(plan!.bytes).toBeGreaterThan(0);
    // There is nowhere for content to be. `VaultSourceFile` has no field for it.
    expect(Object.keys(plan!).sort()).toEqual(['bytes', 'format', 'mtime', 'name', 'path']);
  });

  it("the MCP server's walker sees only Markdown in the same folder", () => {
    const files = walkMd(fixtureRoot).map((file: string) =>
      file.slice(resolve(fixtureRoot).length + 1),
    );
    expect(files.every((file: string) => file.endsWith('.md'))).toBe(true);
    expect(files).not.toContain('sources/plan.pdf');
    expect(files).not.toContain('sources/budget.xlsx');
    expect(files).toContain('wiki/quarter-plan.md');
  });

  it('a wiki page contributes no node, however much frontmatter it carries', async () => {
    const build = await buildLocalManifest(nodeDirectoryHandle(fixtureRoot, 'fixture'));
    const derived = deriveOntologyFromVault(build.manifest);

    expect(derived.nodes.some((node) => node.sourceSlug === 'wiki/quarter-plan')).toBe(false);
    expect(derived.nodes.some((node) => node.id.includes('quarter-plan'))).toBe(false);
    // The one document that does carry `kind:` is still drawn, so this proves absence
    // rather than an empty derivation.
    expect(derived.nodes.some((node) => node.id === 'capability:mcp-server')).toBe(true);
  });

  it('Markdown under sources/ contributes no node either', async () => {
    const build = await buildLocalManifest(nodeDirectoryHandle(fixtureRoot, 'fixture'));
    const derived = deriveOntologyFromVault(build.manifest);
    expect(derived.nodes.some((node) => node.sourceSlug === 'sources/plan-notes')).toBe(false);
  });
});
