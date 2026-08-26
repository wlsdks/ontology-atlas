// Blocks drift between the in-app agent's read executor and the MCP server's vault
// reads.
//
// Tool **names and arguments** are covered by
// `agent-tool-catalog.contract.test.ts`. What is covered here is **the answers**:
// asked the same question about the same vault, the in-screen agent and the
// terminal's MCP agent must receive the same facts. Both really read this
// repository's dogfood vault (`docs/ontology/`) — a real vault rather than a
// synthetic fixture, so subtle places like derived stubs and alias rules are
// genuinely compared.
//
// Changing one side breaks here: if MCP changes an alias rule the web derive must
// change with it (and vice versa), otherwise a person and an agent see different
// ontologies (exactly the defect #691 fixed).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import manifest from '@/entities/docs-vault/data/manifest.json';
import content from '@/entities/docs-vault/data/content.json';
import type { VaultManifest } from '@/entities/docs-vault';
import { deriveOntologyFromVault } from '@/entities/docs-vault/lib/derive-ontology-from-vault';
import { derivationToInsight } from '@/features/vault-ontology/model/use-ontology-insight';
import {
  GRAPH_FRONTMATTER_KEYS,
  createToolExecutor,
} from '@/features/vault-agent/model/tool-executor';
import type { VaultReadPort } from '@/features/vault-agent/model/vault-read-port';
import type { NormalizedToolCall } from '@/features/vault-agent/model/provider-adapter';

const VAULT_DIR = join(__dirname, '../../docs/ontology');

/**
 * The bundled dogfood manifest is built with `docs/` as its root, leaving an
 * `ontology/` segment in front of each slug. MCP reads with `docs/ontology/` as the
 * root, so that segment must be stripped for the names to match — the app uses
 * exactly this prefix rule
 * (`derivationToInsight({ agentSlugPrefix })`).
 */
const AGENT_SLUG_PREFIX = 'ontology/';

const bundled = manifest as unknown as VaultManifest;
const bodies = content as unknown as Record<string, string>;

const insight = derivationToInsight(deriveOntologyFromVault(bundled), undefined, {
  agentSlugPrefix: AGENT_SLUG_PREFIX,
});

function stripPrefix(slug: string): string {
  return slug.startsWith(AGENT_SLUG_PREFIX) ? slug.slice(AGENT_SLUG_PREFIX.length) : slug;
}

const port: VaultReadPort = {
  nodes: insight.nodes,
  edges: insight.edges,
  docs: bundled.docs
    .filter((doc) => typeof doc.frontmatter?.kind === 'string')
    .map((doc) => ({
      slug: stripPrefix(doc.slug),
      path: doc.path,
      title: doc.title,
      kind: String(doc.frontmatter.kind),
      domain:
        typeof doc.frontmatter.domain === 'string' ? doc.frontmatter.domain : undefined,
      frontmatter: doc.frontmatter,
      excerpt: doc.excerpt,
      mtime: doc.mtime,
    })),
  async readDocText(slug: string) {
    return bodies[`${AGENT_SLUG_PREFIX}${slug}`] ?? bodies[slug] ?? null;
  },
};

const execute = createToolExecutor(port);

function call(name: string, args: unknown = {}): NormalizedToolCall {
  return { id: 'c', name, args, argsInvalid: false };
}

async function run<T>(name: string, args: unknown = {}): Promise<T> {
  const result = await execute(call(name, args));
  return JSON.parse(result.content.split('\n…(truncated')[0]) as T;
}

// The MCP side reads the vault folder directly, never through our manifest.
const mcpVault = await import('../../mcp/src/vault.mjs');

function loadMcpOntologyDocs() {
  return (mcpVault.loadVaultDocs(VAULT_DIR) as Array<{
    slug: string;
    frontmatter: Record<string, unknown>;
  }>).filter((doc) => typeof doc.frontmatter.kind === 'string');
}

describe('에이전트 읽기 실행기 ↔ MCP 볼트 읽기 (dogfood 볼트 실물)', () => {
  it('종류별 개수와 "이름만 불린 개념" 수가 통째로 같다', async () => {
    // Even the field names match — the in-screen agent and the terminal agent must state
    // the inventory in the same words for a user to compare the two numbers.
    const mcpKinds = mcpVault.listKinds(VAULT_DIR) as {
      total: number;
      byKind: Record<string, number>;
      referencedOnlyTotal: number;
      conceptsIncludingReferenced: number;
    };
    const ours = await run<typeof mcpKinds>('list_kinds');
    expect(ours).toEqual(mcpKinds);
  });

  it('kind 별 문서 slug 집합이 같다', async () => {
    // Fetching everything at once hits the round-trip character limit and truncates
    // rows — that is the contract, not a defect (it protects the user's cost). So the
    // comparison narrows by kind and follows bounded pages, the same way real usage does.
    const mcpDocs = loadMcpOntologyDocs();
    const kinds = [...new Set(mcpDocs.map((doc) => String(doc.frontmatter.kind)))];
    for (const kind of kinds) {
      const expected = mcpDocs
        .filter((doc) => String(doc.frontmatter.kind) === kind)
        .map((doc) => doc.slug)
        .sort();
      const actual: string[] = [];
      let offset = 0;
      let pages = 0;
      do {
        const ours = await run<{
          rows: Array<{ slug: string }>;
          truncated?: boolean;
          pagination: { hasMore: boolean; nextOffset: number | null };
        }>('list_concepts', { kind, limit: 40, offset });
        expect(ours.truncated ?? false, `${kind} page ${pages + 1} exceeded the agent result cap`).toBe(false);
        actual.push(...ours.rows.map((row) => row.slug));
        pages += 1;
        if (!ours.pagination.hasMore) break;
        expect(ours.pagination.nextOffset, `${kind} says it has another page without a cursor`).toBeGreaterThan(offset);
        offset = ours.pagination.nextOffset!;
      } while (pages < 20);
      expect(pages, `${kind} pagination did not terminate`).toBeLessThan(20);
      expect(actual.sort()).toEqual(expected);
    }
  });

  it('같은 노드를 물으면 같은 kind 를 답한다', async () => {
    const mcpDocs = loadMcpOntologyDocs();
    // The first few only — a sample suffices for the contract, and an exhaustive run is merely slow.
    for (const doc of mcpDocs.slice(0, 12)) {
      const ours = await run<{ kind: string; hasDocument: boolean }>('get_concept', {
        slug: doc.slug,
      });
      expect(ours.hasDocument).toBe(true);
      expect(ours.kind).toBe(doc.frontmatter.kind);
    }
  });

  it('백링크 대상 집합이 같다', async () => {
    const mcpDocs = loadMcpOntologyDocs();
    // The contract means something only on a node that really has backlinks.
    const withBacklinks = mcpDocs
      .map((doc) => ({
        slug: doc.slug,
        backlinks:
          (mcpVault.findBacklinks(VAULT_DIR, doc.slug) as Array<{
            slug: string;
            matchedKeys?: string[];
          }>) ?? [],
      }))
      .filter((row) => row.backlinks.length > 0)
      .slice(0, 8);
    expect(withBacklinks.length).toBeGreaterThan(0);

    for (const row of withBacklinks) {
      const ours = await run<{ backlinks: Array<{ slug: string; matchedKeys: string[] }> }>(
        'find_backlinks',
        { slug: row.slug },
      );
      // Compares what is linked through frontmatter keys — MCP also counts body mentions
      // (which are evidence rather than relations), but the relation sets must match
      // exactly.
      const expected = row.backlinks
        .filter((entry) => (entry.matchedKeys?.length ?? 0) > 0)
        .map((entry) => entry.slug)
        .sort();
      expect(ours.backlinks.map((entry) => entry.slug).sort()).toEqual(expected);
    }
  });

  it('제목 검색이 같은 문서를 찾는다', async () => {
    const mcpDocs = loadMcpOntologyDocs();
    const sample = mcpDocs.find(
      (doc) => typeof doc.frontmatter.title === 'string' && doc.frontmatter.title.trim(),
    );
    expect(sample).toBeTruthy();
    const ours = await run<{ matches: Array<{ slug: string }> }>('find_evidence', {
      title: sample?.frontmatter.title as string,
    });
    expect(ours.matches.some((match) => match.slug === sample?.slug)).toBe(true);
  });

  it('볼트 본문은 신뢰할 수 없는 데이터로 감싸여 나간다', async () => {
    const mcpDocs = loadMcpOntologyDocs();
    const documented = mcpDocs.find((doc) => doc.slug !== 'README') as { slug: string };
    const result = await execute(call('get_concept', { slug: documented.slug }));
    expect(result.content).toContain('<untrusted_vault_content>');
  });

  it('관계가 적히는 frontmatter 키 목록이 MCP 와 같다', () => {
    // Backlinks are counted from this key list, not from map edges. Growing one side
    // creates relations the in-screen agent cannot see.
    expect([...GRAPH_FRONTMATTER_KEYS].sort()).toEqual(
      [...(mcpVault.GRAPH_ARRAY_KEYS as string[]), 'domain'].sort(),
    );
  });

  it('번들 매니페스트가 실제 볼트와 어긋나 있지 않다 (계약의 전제)', () => {
    // Without this test the comparisons above can pass silently while comparing a stale
    // manifest against the real vault. `docs-vault:check` keeps the committed manifest
    // current; this holds that premise once more.
    const readme = readFileSync(join(VAULT_DIR, 'README.md'), 'utf-8');
    expect(readme.length).toBeGreaterThan(0);
    const mcpDocs = loadMcpOntologyDocs();
    expect(port.docs.length).toBe(mcpDocs.length);
  });
});
