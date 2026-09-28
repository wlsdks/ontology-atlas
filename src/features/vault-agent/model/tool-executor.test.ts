// A model's write never reaches disk: checked at the type level and by zero fs calls.
import { describe, expect, it, vi } from 'vitest';

import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/entities/knowledge-graph';

import { createToolExecutor } from './tool-executor';
import type { VaultReadPort } from './vault-read-port';
import type { NormalizedToolCall } from './provider-adapter';
import { AGENT_TOOL_RESULT_CHAR_CAP } from './types';

function node(
  id: string,
  overrides: Partial<KnowledgeGraphNode> = {},
): KnowledgeGraphNode {
  return {
    id,
    title: id.split(':')[1] ?? id,
    kind: id.split(':')[0] ?? 'capability',
    projectIds: [],
    evidenceIds: [`capabilities/${id.split(':')[1]}`],
    hasOwnDocument: true,
    lastApprovedAt: new Date(0),
    lastApprovedBy: 'vault-frontmatter',
    ...overrides,
  };
}

function edge(from: string, to: string, type = 'depends_on'): KnowledgeGraphEdge {
  return {
    id: `${from}--${type}-->${to}`,
    from,
    to,
    type,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: 'vault-frontmatter',
  };
}

const readDocText = vi.fn(async (slug: string) => `# ${slug}\n\n본문입니다.`);

function makePort(overrides: Partial<VaultReadPort> = {}): VaultReadPort {
  return {
    nodes: [
      node('capability:payment'),
      node('capability:refund'),
      node('capability:ghost', {
        hasOwnDocument: false,
        evidenceIds: ['capabilities/payment'],
        ref: 'src/lib/ghost.ts',
      }),
    ],
    edges: [edge('capability:payment', 'capability:ghost')],
    docs: [
      {
        slug: 'capabilities/payment',
        path: 'capabilities/payment.md',
        title: 'payment',
        kind: 'capability',
        domain: 'billing',
        frontmatter: { kind: 'capability', domain: 'billing' },
        excerpt: '결제 처리',
        mtime: 1_700_000_000_000,
      },
      {
        slug: 'capabilities/refund',
        path: 'capabilities/refund.md',
        title: 'refund',
        kind: 'capability',
        frontmatter: { kind: 'capability' },
        excerpt: '환불',
        mtime: 1_700_000_001_000,
      },
    ],
    readDocText,
    ...overrides,
  };
}

function call(name: string, args: unknown = {}): NormalizedToolCall {
  return { id: 't1', name, args, argsInvalid: false };
}

describe('tool-executor never writes', () => {
  it('the port type has no write method', () => {
    // A write name in this port would let the executor reach disk.
    const port = makePort();
    expect(Object.keys(port).sort()).toEqual(['docs', 'edges', 'nodes', 'readDocText']);
    for (const key of Object.keys(port)) {
      expect(key).not.toMatch(/write|save|create|delete|patch|update|remove/i);
    }
  });

  it('a write tool call touches no file and returns only a proposal intent', async () => {
    const fsSpy = vi.fn();
    const execute = createToolExecutor(makePort({ readDocText: fsSpy as never }));
    for (const name of [
      'add_concept',
      'add_concepts',
      'add_relation',
      'add_relations',
      'patch_concept',
    ]) {
      const result = await execute(call(name, { slug: 'capabilities/payment' }));
      expect(result.outcome).toBe('blocked-write');
      expect(result.writeIntent?.name).toBe(name);
    // The screen's row must not say "wrote".
      expect(result.summary).toContain('아직 쓰지 않음');
    }
    expect(fsSpy).not.toHaveBeenCalled();
  });

  it('a vault-only agent cannot bypass competency qualification signing through a proposal', async () => {
    const execute = createToolExecutor(makePort());

    const result = await execute(call('patch_concept', {
      slug: 'sample-product',
      body: '## Competency answers\n\n### abilities — answered\n\nOnly one domain is covered.',
    }));

    expect(result.outcome).toBe('error');
    expect(result.isError).toBe(true);
    expect(result.writeIntent).toBeUndefined();
    expect(result.content).toBe(
      'Source-backed competency qualification must be created through the MCP builder.',
    );
  });

  it('returns an error without executing an unlisted tool', async () => {
    const execute = createToolExecutor(makePort());
    const result = await execute(call('delete_concept', { slug: 'x' }));
    expect(result.outcome).toBe('unknown-tool');
    expect(result.isError).toBe(true);
  });

  it('blocks tools that look outside the vault the same way', async () => {
    const execute = createToolExecutor(makePort());
    for (const name of ['analyze_repo_structure', 'index_project', 'infer_imports']) {
      expect((await execute(call(name))).outcome).toBe('unknown-tool');
    }
  });

  it('catches malformed arguments before execution and lets the model correct them', async () => {
    const execute = createToolExecutor(makePort());
    const result = await execute({
      id: 't1',
      name: 'get_concept',
      args: {},
      argsInvalid: true,
    });
    expect(result.outcome).toBe('args-invalid');
    expect(result.isError).toBe(true);
  });
});

describe('tool-executor reads', () => {
  it('get_concept returns the mtime for the concurrent edit guard', async () => {
    const execute = createToolExecutor(makePort());
    const result = await execute(call('get_concept', { slug: 'capabilities/payment' }));
    expect(result.outcome).toBe('ok');
    expect(result.readSlugs).toEqual(['capabilities/payment']);
    const payload = JSON.parse(result.content) as Record<string, unknown>;
    expect(payload.mtime).toBe(1_700_000_000_000);
  });

  it('wraps vault bodies as untrusted data', async () => {
    const execute = createToolExecutor(makePort());
    const result = await execute(call('get_concept', { slug: 'capabilities/payment' }));
    expect(result.content).toContain('<untrusted_vault_content>');
  });

  it('answers a name-only concept with guidance to create its document, not "missing"', async () => {
    // A concept the map showed must not answer "not found".
    const execute = createToolExecutor(makePort());
    const result = await execute(call('get_concept', { slug: 'src/lib/ghost.ts' }));
    const payload = JSON.parse(result.content) as Record<string, unknown>;
    expect(payload.hasDocument).toBe(false);
    expect(payload.referencedBy).toContain('capabilities/payment');
    expect(String(payload.hint)).toContain('add_concept');
  });

  it('answers an unknown name by pointing to the list without guessing typos', async () => {
    const execute = createToolExecutor(makePort());
    const result = await execute(call('get_concept', { slug: 'capabilities/nope' }));
    expect(result.content).toContain('list_concepts');
    expect(result.content).toContain('Do not guess');
  });

  it('list_kinds reports document counts alongside name-only counts', async () => {
    // The field names match MCP's `list_kinds` (a contract test compares them).
    const execute = createToolExecutor(makePort());
    const payload = JSON.parse((await execute(call('list_kinds'))).content) as Record<
      string,
      unknown
    >;
    expect(payload.total).toBe(2);
    expect(payload.referencedOnlyTotal).toBe(1);
    expect(payload.conceptsIncludingReferenced).toBe(3);
  });

  it('validate_vault pages the names referenced without a document', async () => {
    const execute = createToolExecutor(
      makePort({
        nodes: ['a', 'b', 'c'].map((name) =>
          node(`capability:${name}`, { hasOwnDocument: false, ref: `capabilities/${name}` }),
        ),
      }),
    );
    const payload = JSON.parse(
      (await execute(call('validate_vault', { offset: 1, limit: 1 }))).content,
    ) as { referencedWithoutDocument: string[]; referencedWithoutDocumentTotal: number };
    expect(payload.referencedWithoutDocument).toEqual(['capabilities/b']);
    expect(payload.referencedWithoutDocumentTotal).toBe(3);
  });

  it('list_concepts keeps deterministic slug order and offset pagination', async () => {
    const execute = createToolExecutor(
      makePort({
        docs: [
          { slug: 'capabilities/z', path: 'capabilities/z.md', title: 'Z', kind: 'capability', frontmatter: {}, excerpt: '', mtime: 1 },
          { slug: 'capabilities/a', path: 'capabilities/a.md', title: 'A', kind: 'capability', frontmatter: {}, excerpt: '', mtime: 1 },
          { slug: 'capabilities/m', path: 'capabilities/m.md', title: 'M', kind: 'capability', frontmatter: {}, excerpt: '', mtime: 1 },
        ],
      }),
    );
    const payload = JSON.parse(
      (await execute(call('list_concepts', { limit: 2, offset: 2 }))).content,
    ) as { rows: Array<{ slug: string }>; pagination: Record<string, unknown> };
    expect(payload.rows.map((row) => row.slug)).toEqual(['capabilities/z']);
    expect(payload.pagination).toEqual({
      offset: 2,
      limit: 2,
      total: 3,
      returned: 1,
      hasMore: false,
      nextOffset: null,
    });
  });

  it('find_backlinks counts from raw frontmatter, not map edges', async () => {
    // The map omits some relation types as edges, so backlinks come from frontmatter.
    const execute = createToolExecutor(
      makePort({
        docs: [
          {
            slug: 'documents/notes',
            path: 'documents/notes.md',
            title: 'notes',
            kind: 'document',
            frontmatter: { kind: 'document', describes: ['capabilities/payment'] },
            excerpt: '',
          },
          {
            slug: 'capabilities/payment',
            path: 'capabilities/payment.md',
            title: 'payment',
            kind: 'capability',
            frontmatter: { kind: 'capability' },
            excerpt: '',
          },
        ],
      }),
    );
    const payload = JSON.parse(
      (await execute(call('find_backlinks', { slug: 'capabilities/payment' }))).content,
    ) as { backlinks: Array<{ slug: string; matchedKeys: string[] }> };
    expect(payload.backlinks).toEqual([
      { slug: 'documents/notes', kind: 'document', matchedKeys: ['describes'] },
    ]);
  });

  it('truncates results over the cap and asks to narrow the query', async () => {
    // Carrying it whole would quietly grow the user's cost (BYOK billing).
    const many = Array.from({ length: 400 }, (_, index) => ({
      slug: `capabilities/c${index}`,
      path: `capabilities/c${index}.md`,
      title: `c${index}`,
      kind: 'capability',
      frontmatter: {},
      excerpt: 'x'.repeat(300),
      mtime: 1,
    }));
    const execute = createToolExecutor(makePort({ docs: many }));
    const result = await execute(call('list_concepts', { summary: true, limit: 400 }));
    expect(result.content).toContain('truncated');
    expect(result.content.length).toBeLessThan(7_000);
  });

  it('restores a large list through deterministic offset pages without gaps', async () => {
    const many = Array.from({ length: 503 }, (_, index) => ({
      slug: `capabilities/c${String(index).padStart(3, '0')}`,
      path: `capabilities/c${index}.md`,
      title: `c${index}`,
      kind: 'capability',
      frontmatter: {},
      excerpt: '',
      mtime: 1,
    }));
    const execute = createToolExecutor(makePort({ docs: many }));
    const pages: Array<{
      rows: Array<{ slug: string }>;
      total: number;
      returned: number;
      limited: boolean;
      pagination: { nextOffset: number | null; hasMore: boolean };
    }> = [];
    let offset = 0;
    do {
      const page = JSON.parse(
        (await execute(call('list_concepts', { limit: 40, offset }))).content,
      ) as (typeof pages)[number];
      pages.push(page);
      offset = page.pagination.nextOffset ?? 0;
      if (!page.pagination.hasMore) break;
    } while (pages.length < 20);

    expect(pages.length).toBe(13);
    expect(pages[0]).toMatchObject({ total: 503, returned: 40, limited: true });
    expect(pages.at(-1)).toMatchObject({ total: 503, returned: 23, limited: false });
    expect(pages.at(-1)?.pagination).toMatchObject({ hasMore: false, nextOffset: null });
    expect(new Set(pages.flatMap((page) => page.rows).map((row) => row.slug)).size).toBe(503);
    const outOfRange = await execute(call('list_concepts', { limit: 40, offset: 504 }));
    expect(outOfRange.outcome).toBe('args-invalid');
    expect(outOfRange.isError).toBe(true);
    expect(outOfRange.content).toContain('invalid_arguments');
  });

  it('get_concepts keeps requested evidence rows evenly within the cap', async () => {
    const parents = Array.from({ length: 8 }, (_, index) =>
      node(`domain:d${index}`, {
        kind: 'domain',
        agentSlug: `domains/d${index}`,
        evidenceIds: [`domains/d${index}`],
      }),
    );
    const children = parents.flatMap((_, parentIndex) =>
      Array.from({ length: 6 }, (_, childIndex) =>
        node(`capability:d${parentIndex}-c${childIndex}`, {
          agentSlug: `capabilities/d${parentIndex}-c${childIndex}`,
          evidenceIds: [`capabilities/d${parentIndex}-c${childIndex}`],
          hasOwnDocument: false,
        }),
      ),
    );
    const docs = parents.map((_, index) => ({
      slug: `domains/d${index}`,
      path: `domains/d${index}.md`,
      title: `Domain ${index}`,
      kind: 'domain',
      frontmatter: {
        kind: 'domain',
        description: `Domain ${index} behavior `.repeat(10),
        capabilities: Array.from(
          { length: 6 },
          (__, childIndex) => `capabilities/d${index}-c${childIndex}`,
        ),
      },
      excerpt: `Domain ${index} owns a distinct customer behavior. `.repeat(8),
      mtime: index + 1,
    }));
    const edges = parents.flatMap((parent, parentIndex) =>
      Array.from({ length: 6 }, (_, childIndex) =>
        edge(parent.id, `capability:d${parentIndex}-c${childIndex}`, 'contains'),
      ),
    );
    const execute = createToolExecutor(
      makePort({
        nodes: [...parents, ...children],
        edges,
        docs,
        readDocText: vi.fn(async (slug: string) => `${slug} meaning `.repeat(100)),
      }),
    );

    const result = await execute(
      call('get_concepts', {
        slugs: parents.map((_, index) => `domains/d${index}`),
        body: 'full',
      }),
    );
    const payload = JSON.parse(result.content) as {
      concepts: Array<{
        slug: string;
        body: string;
        bodyInfo: { returnedChars: number; truncated: boolean };
        neighborsInfo: { total: number; returned: number; truncated: boolean };
      }>;
      compacted: boolean;
      omitted: number;
    };

    expect(result.content.length).toBeLessThanOrEqual(AGENT_TOOL_RESULT_CHAR_CAP);
    expect(payload).toMatchObject({ compacted: true, omitted: 0 });
    expect(payload.concepts.map((row) => row.slug)).toEqual(
      parents.map((_, index) => `domains/d${index}`),
    );
    expect(result.readSlugs).toEqual(payload.concepts.map((row) => row.slug));
    expect(result.vaultChars).toBe(
      payload.concepts.reduce((sum, row) => sum + row.bodyInfo.returnedChars, 0),
    );
    for (const row of payload.concepts) {
      expect(row.body).toContain('<untrusted_vault_content>');
      expect(row.bodyInfo.truncated).toBe(true);
      expect(row.neighborsInfo.total).toBe(6);
      expect(row.neighborsInfo.returned).toBeGreaterThan(0);
      expect(row.neighborsInfo.truncated).toBe(true);
    }
  });

  it('find_path returns a connected path as real slugs', async () => {
    const execute = createToolExecutor(makePort());
    const result = await execute(
      call('find_path', { from: 'capabilities/payment', to: 'src/lib/ghost.ts' }),
    );
    const payload = JSON.parse(result.content) as { found: boolean; hops: string[] };
    expect(payload.found).toBe(true);
    expect(payload.hops).toEqual(['capabilities/payment', 'src/lib/ghost.ts']);
  });

  it('find_orphans counts only concepts that have a document', async () => {
    const execute = createToolExecutor(makePort());
    const payload = JSON.parse((await execute(call('find_orphans'))).content) as {
      orphans: Array<{ slug: string }>;
    };
    expect(payload.orphans.map((row) => row.slug)).toEqual(['capabilities/refund']);
  });
});
